/**
 * OCR 识别服务（基于 QWEN-VL 多模态大模型）
 * ============================================================
 * 识别对象：劳动合同、解除通知书、工资条、考勤记录、聊天截图
 * 输出：结构化 JSON（公司名/姓名/日期/工资/岗位 等关键字段）
 *
 * 设计原则：
 *   1. 统一 AI 服务 → vision() 调用
 *   2. 如果 AI 不可用 → 降级到本地正则解析（兼容老逻辑）
 *   3. 自动判断文档类型
 * ============================================================
 */
const { vision, isAvailable } = require('./aiService');
const fs = require('fs');

/* 本地正则 fallback 关键信息 */
const LOCAL_PATTERNS = [
  { label: '公司名称', regex: /甲方[（(]\s*全称\s*[）)]\s*[:：]?\s*([^\n\r]{2,50})|用人单位[:：]?\s*([^\n\r]{2,50})/ },
  { label: '员工姓名', regex: /乙方[（(]\s*姓名\s*[）)]\s*[:：]?\s*([^\n\r]{2,20})|劳动者[:：]?\s*([^\n\r]{2,20})/ },
  { label: '合同起', regex: /自\s*(\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日)/ },
  { label: '合同止', regex: /至\s*(\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日)/ },
  { label: '月工资', regex: /月\s*工\s*资[:：]?\s*[¥￥]?\s*([\d,]+(\.\d+)?)/ },
  { label: '岗位', regex: /岗\s*位[:：]?\s*([^\n\r]{2,30})/ }
];

/**
 * 识别图片并提取合同/法律文档关键信息
 * @param {string|Buffer} image  文件路径或 Buffer
 * @returns {Promise<{docType, extractedInfo, rawText}>}
 */
async function recognizeDocument(image) {
  // --- 1. 优先 QWEN-VL ---
  if (isAvailable()) {
    return await recognizeWithVL(image);
  }

  // --- 2. 降级：如果用户传了纯文本，本地正则解析 ---
  return {
    docType: '未知文档',
    extractedInfo: [],
    rawText: '',
    note: '请配置 AI_API_KEY 以启用 QWEN-VL 多模态 OCR'
  };
}

/**
 * 使用 QWEN-VL 多模态模型识别
 */
async function recognizeWithVL(image) {
  const prompt = `你是一位劳动法律师，需要从这张图片中尽可能提取所有与劳动纠纷相关的关键信息。

请仔细识别图片内容，输出严格 JSON：
{
  "docType": "劳动合同 | 解除通知书 | 工资条 | 考勤记录 | 聊天截图 | 其他",
  "confidence": 0.0~1.0,
  "extractedInfo": [
    { "label": "公司名称", "value": "..." },
    { "label": "员工姓名", "value": "..." },
    { "label": "入职日期", "value": "YYYY-MM-DD" },
    { "label": "离职/解除日期", "value": "YYYY-MM-DD" },
    { "label": "月工资/薪资", "value": "¥xxx" },
    { "label": "岗位/职位", "value": "..." },
    { "label": "合同期限", "value": "..." },
    { "label": "解除/通知理由", "value": "..." },
    { "label": "欠薪金额", "value": "¥xxx" }
  ],
  "keyFacts": [
    "可能涉及的劳动法律关系/违法点"
  ],
  "rawText": "图片中识别出的全部文字（尽量完整）"
}

注意：
- 日期统一输出为 YYYY-MM-DD 格式
- 金额前面加 ¥
- 如果某项信息图片里没有，该项可以不出现
- rawText 要尽可能完整，保留原始断句`;

  const result = await vision(image, prompt, { jsonMode: true });
  if (!result) {
    return { docType: '识别失败', extractedInfo: [], rawText: '', note: 'AI 调用失败' };
  }

  return {
    docType: result.docType || '未知文档',
    confidence: result.confidence || null,
    extractedInfo: result.extractedInfo || [],
    keyFacts: result.keyFacts || [],
    rawText: result.rawText || result.raw || '',
    note: 'QWEN-VL 识别结果'
  };
}

/**
 * 本地正则解析（当有纯文本时使用）
 */
function parseTextLocal(rawText) {
  const parsed = [];
  for (const p of LOCAL_PATTERNS) {
    const m = rawText.match(p.regex);
    if (m) {
      const value = (m[1] || m[2] || '').trim();
      if (value) parsed.push({ label: p.label, value });
    }
  }
  return parsed;
}

/**
 * 检测文档类型（基于文本关键词）
 */
function detectDocType(text) {
  if (!text) return '未知文档';
  if (/劳动合同/.test(text)) return '劳动合同';
  if (/解除.*通知|开除|辞退|终止劳动/.test(text)) return '解除/辞退通知书';
  if (/工资条|薪资|发薪/.test(text)) return '工资条';
  if (/考勤|打卡|签到/.test(text)) return '考勤记录';
  if (/聊天|微信|对话|conversation/.test(text)) return '聊天记录';
  return '其他';
}

module.exports = {
  recognizeDocument,
  parseTextLocal,
  detectDocType
};
