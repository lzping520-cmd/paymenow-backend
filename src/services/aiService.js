/**
 * 通用 AI 服务层（QWEN / DashScope 通义千问）
 * -----------------------------------------------------
 * 阿里云百炼 DashScope 完全兼容 OpenAI 格式，一套 Key 搞定：
 *   - 纯文本模型：qwen-plus / qwen-turbo / qwen-max
 *   - 多模态(VL/OCR)：qwen-vl-plus / qwen-vl-max
 *
 * 特性：
 *   ✅ 纯文本 chat (法律分析)
 *   ✅ 多模态 OCR (合同/解除通知书/工资条图片识别)
 *   ✅ 结构化 JSON 输出（自动 JSON.parse）
 *   ✅ 自动降级（未配置 Key 时返回 null 让规则引擎兜底）
 *   ✅ 超时控制 + 错误分类
 *
 * 配置（.env）:
 *   AI_PROVIDER=qwen
 *   AI_API_KEY=sk-xxxxxxxxxxxx
 *   AI_TEXT_MODEL=qwen-plus
 *   AI_VL_MODEL=qwen-vl-plus
 * -----------------------------------------------------
 */
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// DashScope 兼容端点（OpenAI 格式）
const DASHSCOPE_ENDPOINT = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';

const config = {
  provider: process.env.AI_PROVIDER || 'qwen',
  apiKey: process.env.AI_API_KEY || '',
  endpoint: process.env.AI_ENDPOINT || DASHSCOPE_ENDPOINT,
  textModel: process.env.AI_TEXT_MODEL || 'qwen-plus',
  vlModel: process.env.AI_VL_MODEL || 'qwen-vl-plus',
  timeout: Number(process.env.AI_TIMEOUT) || 60000,
  maxRetries: 2
};

/**
 * 检查 AI 是否可用（有 Key 且不为 demo）
 */
function isAvailable() {
  return !!(config.apiKey && config.apiKey.length > 5);
}

/**
 * 通用 chat 调用（纯文本）
 * @param {string} systemPrompt  系统提示词
 * @param {string} userPrompt    用户提示词
 * @param {object} opts          { temperature, jsonMode, model, maxTokens }
 * @returns {Promise<string|object|null>}
 */
async function chat(systemPrompt, userPrompt, opts = {}) {
  if (!isAvailable()) return null;

  const {
    temperature = 0.3,
    jsonMode = false,
    model = config.textModel,
    maxTokens = 2000
  } = opts;

  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: userPrompt });

  try {
    const resp = await axios.post(config.endpoint, {
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      response_format: jsonMode ? { type: 'json_object' } : undefined
    }, {
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: config.timeout
    });

    const content = resp.data?.choices?.[0]?.message?.content || '';
    if (!content) return null;

    if (jsonMode) {
      // 直接返回 JSON
      try { return JSON.parse(content); }
      catch {
        // QWEN 有时返回带代码块的 JSON，尝试提取
        const m = content.match(/```(?:json)?\s*([\s\S]*?)```/) || content.match(/\{[\s\S]*\}/);
        if (m) {
          try { return JSON.parse(m[1] || m[0]); } catch {}
        }
        return { raw: content };
      }
    }
    return content;
  } catch (err) {
    const status = err.response?.status;
    const msg = err.response?.data?.error?.message || err.message;
    console.warn(`[AI chat] 调用失败 (model=${model}):`, status, msg);
    if (status === 401) console.error('  → AI_API_KEY 无效，请检查 DashScope API Key');
    if (status === 404) console.error('  → AI endpoint 或模型名错误');
    if (status === 429) console.error('  → 触发限流，请稍后重试');
    return null;
  }
}

/**
 * 多模态：图片 + 文本提问（用于 OCR / 合同识别）
 * @param {string|Buffer|Array<string>} image  图片路径、Buffer 或 base64 字符串
 * @param {string} question                     要问的问题 / 提示词
 * @param {object} opts                          { model, jsonMode }
 */
async function vision(image, question, opts = {}) {
  if (!isAvailable()) return null;

  const {
    model = config.vlModel,
    jsonMode = false
  } = opts;

  // 处理图片 → base64 data URL
  let imageUrl;
  try {
    imageUrl = await toImageDataUrl(image);
  } catch (err) {
    console.warn('[AI vision] 图片处理失败:', err.message);
    return null;
  }

  const messages = [{
    role: 'user',
    content: [
      { type: 'image_url', image_url: { url: imageUrl } },
      { type: 'text', text: question }
    ]
  }];

  try {
    const resp = await axios.post(config.endpoint, {
      model,
      messages,
      temperature: 0.1,
      max_tokens: 1500,
      response_format: jsonMode ? { type: 'json_object' } : undefined
    }, {
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: config.timeout
    });

    const content = resp.data?.choices?.[0]?.message?.content || '';
    if (!content) return null;

    if (jsonMode) {
      try { return JSON.parse(content); }
      catch {
        const m = content.match(/```(?:json)?\s*([\s\S]*?)```/) || content.match(/\{[\s\S]*\}/);
        if (m) { try { return JSON.parse(m[1] || m[0]); } catch {} }
        return { raw: content };
      }
    }
    return content;
  } catch (err) {
    const status = err.response?.status;
    const msg = err.response?.data?.error?.message || err.message;
    console.warn(`[AI vision] 调用失败 (model=${model}):`, status, msg);
    if (status === 401) console.error('  → AI_API_KEY 无效');
    if (status === 404) console.error('  → 请确认你开通了 qwen-vl-plus 模型权限');
    return null;
  }
}

/**
 * 把各种图片输入转 base64 data URL
 */
async function toImageDataUrl(input) {
  if (!input) throw new Error('空输入');

  // 已经是 data URL
  if (typeof input === 'string' && input.startsWith('data:image/')) return input;

  // 本地文件路径
  if (typeof input === 'string' && fs.existsSync(input)) {
    const ext = path.extname(input).toLowerCase().replace('.', '');
    const mimeMap = { jpg: 'jpeg', jpeg: 'jpeg', png: 'png', webp: 'webp', bmp: 'bmp' };
    const mime = mimeMap[ext] || 'jpeg';
    const buf = fs.readFileSync(input);
    return `data:image/${mime};base64,${buf.toString('base64')}`;
  }

  // Buffer
  if (Buffer.isBuffer(input)) {
    return `data:image/png;base64,${input.toString('base64')}`;
  }

  // 纯 base64 字符串（不带前缀）
  if (typeof input === 'string' && /^[A-Za-z0-9+/=\s]+$/.test(input)) {
    return `data:image/png;base64,${input.replace(/\s/g, '')}`;
  }

  throw new Error('无法识别的图片输入格式');
}

module.exports = {
  chat,
  vision,
  isAvailable,
  config
};
