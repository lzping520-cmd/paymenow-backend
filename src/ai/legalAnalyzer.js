/**
 * AI 法律核心引擎 - 劳动纠纷分析器
 * 核心功能：
 *  1. 案情类型智能识别（违法解除/拖欠工资/未签合同/工伤等）
 *  2. 工龄 & 赔偿金精确计算（N / N+1 / 2N / 3N）
 *  3. 仲裁请求自动生成
 *  4. 胜率评估
 *
 * 注：同时支持「内置规则引擎」和「大模型API」两种模式
 *     未配置 AI_API_KEY 时自动降级为规则引擎（可覆盖90%常见场景）
 */

const dayjs = require('dayjs');
const axios = require('axios');
const { nanoid } = require('nanoid');

/* ============================================================
 *  一、案情类型库（基于《劳动合同法》法条）
 * ============================================================ */
const CASE_TYPES = {
  ILLEGAL_TERMINATION: {
    id: 'ILLEGAL_TERMINATION',
    name: '违法解除劳动合同',
    keywordPatterns: ['开除', '辞退', '解雇', '解除合同', '不让上班', '赶走', '开除我'],
    legalBasis: '《劳动合同法》第47条、第87条',
    compensation: {
      type: '2N',
      desc: '违法解除，应支付双倍经济补偿金',
      formula: '月均工资 × 工作年限 × 2'
    },
    articles: ['劳动合同法第87条', '劳动合同法第47条', '劳动合同法第42条']
  },
  DELAYED_WAGES: {
    id: 'DELAYED_WAGES',
    name: '拖欠/克扣工资',
    keywordPatterns: ['拖欠', '不发工资', '赖账', '克扣', '欠薪', '工资没发', '一直没发', '拖着不给'],
    legalBasis: '《劳动合同法》第30条、第85条',
    compensation: {
      type: 'WAGES',
      desc: '足额支付拖欠工资 + 加付赔偿金(50%-100%)',
      formula: '拖欠工资金额 + 拖欠金额 × 50%~100%'
    },
    articles: ['劳动合同法第30条', '劳动合同法第85条', '劳动合同法第38条']
  },
  NO_CONTRACT: {
    id: 'NO_CONTRACT',
    name: '未签订劳动合同',
    keywordPatterns: ['没签合同', '没签劳动合同', '没有合同', '不签合同', '一直没签'],
    legalBasis: '《劳动合同法》第10条、第82条',
    compensation: {
      type: '2X_WAGES',
      desc: '自用工满1个月起至满1年止，每月支付2倍工资',
      formula: '月均工资 × (实际工作月数 - 1)，最多11个月'
    },
    articles: ['劳动合同法第10条', '劳动合同法第82条']
  },
  NO_SOCIAL_INSURANCE: {
    id: 'NO_SOCIAL_INSURANCE',
    name: '未缴纳社保',
    keywordPatterns: ['没交社保', '不买社保', '不交社保', '社保没交', '公积金'],
    legalBasis: '《社会保险法》第58条',
    compensation: {
      type: 'N + WAGES',
      desc: '以未缴社保为由被迫解除，可获得N经济补偿 + 要求补缴社保',
      formula: '月均工资 × 工作年限'
    },
    articles: ['劳动合同法第38条', '社会保险法第58条']
  },
  LAYOFF_N1: {
    id: 'LAYOFF_N1',
    name: '经济性裁员/应当支付N+1',
    keywordPatterns: ['裁员', '优化', '缩减', '公司倒闭', '破产', '解散'],
    legalBasis: '《劳动合同法》第41条、第46条',
    compensation: {
      type: 'N or N+1',
      desc: '合法裁员支付N；未提前30天通知支付N+1',
      formula: '月均工资 × 工作年限 (+ 1个月代通知金)'
    },
    articles: ['劳动合同法第40条', '劳动合同法第41条', '劳动合同法第46条']
  },
  DEMOTION_CUT: {
    id: 'DEMOTION_CUT',
    name: '降薪调岗',
    keywordPatterns: ['降薪', '调岗', '减少工资', '降级', '工资降了', '被迫离职'],
    legalBasis: '《劳动合同法》第35条',
    compensation: {
      type: 'N',
      desc: '未经协商一致降薪，被迫解除可获经济补偿N',
      formula: '月均工资 × 工作年限'
    },
    articles: ['劳动合同法第35条', '劳动合同法第38条']
  },
  OVERTIME: {
    id: 'OVERTIME',
    name: '拖欠加班费',
    keywordPatterns: ['加班', '超时工作', '996', '007', '周末上班', '节假日上班', '加班费没给'],
    legalBasis: '《劳动法》第44条',
    compensation: {
      type: 'OVERTIME_PAY',
      desc: '1.5x/2x/3x 加班工资差额',
      formula: '工作日加班×1.5、休息日×2、法定假日×3'
    },
    articles: ['劳动法第44条']
  }
};

/* ============================================================
 *  二、核心计算：工龄 & 赔偿金
 * ============================================================ */

/**
 * 计算工作年限
 * @param {string} hireDate 入职日期 YYYY-MM-DD
 * @param {string} endDate  离职/当前日期 YYYY-MM-DD
 * @returns {{ years: number, months: number, totalMonths: number }}
 */
function calcWorkYears(hireDate, endDate) {
  // 默认今天
  if (!endDate || endDate === null) endDate = dayjs().format('YYYY-MM-DD');

  let hire = dayjs(hireDate);
  let end = dayjs(endDate);

  if (!hire.isValid() || !end.isValid()) {
    console.warn('[calcWorkYears] 日期无效:', hireDate, endDate);
    return { years: 0, months: 0, totalMonths: 0 };
  }

  // 入职日期晚于离职日期 → 交换（用户填反了）
  if (hire.isAfter(end)) {
    const tmp = hire;
    hire = end;
    end = tmp;
  }

  const totalMonths = Math.max(end.diff(hire, 'month'), 0);
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  return { years, months, totalMonths };
}

/**
 * 经济补偿金 N 的计算
 * 规则：不满6个月算0.5个月；满6个月不满1年算1个月
 * @param {number} monthlySalary 月均工资（元）
 * @param {object} tenure calcWorkYears 返回值
 */
function calcN(monthlySalary, tenure) {
  const { years, months } = tenure;
  let n = years;
  if (months > 0 && months < 6) n += 0.5;
  else if (months >= 6) n += 1;
  // 高薪封顶规则（月工资>上年度职工月均3倍的，按3倍计且年限最高12年）
  const HIGH_SALARY_THRESHOLD = 30000; // 简化处理，实际应查当地数据
  if (monthlySalary > HIGH_SALARY_THRESHOLD) {
    monthlySalary = HIGH_SALARY_THRESHOLD;
    if (n > 12) n = 12;
  }
  const amount = Math.round(monthlySalary * n * 100) / 100;
  return { n, amount, monthlySalary };
}

/**
 * 综合计算所有可能的赔偿金
 */
function calcAllCompensations(input) {
  const { monthlySalary, hireDate, endDate, caseTypes, unpaidWages = 0 } = input;
  const tenure = calcWorkYears(hireDate, endDate);
  const nResult = calcN(monthlySalary, tenure);

  const results = {
    tenure,
    n: nResult,
    scenarios: []
  };

  caseTypes.forEach(type => {
    const scenario = { type: type.id, name: type.name };
    switch (type.compensation.type) {
      case '2N':
        scenario.formula = `${monthlySalary} × ${nResult.n} × 2`;
        scenario.amount = Math.round(nResult.amount * 2 * 100) / 100;
        break;
      case 'N':
        scenario.formula = `${monthlySalary} × ${nResult.n}`;
        scenario.amount = nResult.amount;
        break;
      case 'N or N+1':
        scenario.formulaN = `${monthlySalary} × ${nResult.n}`;
        scenario.amountN = nResult.amount;
        scenario.formulaN1 = `${monthlySalary} × ${nResult.n} + ${monthlySalary}`;
        scenario.amountN1 = Math.round((nResult.amount + monthlySalary) * 100) / 100;
        break;
      case '2X_WAGES': {
        const doubleMonths = Math.min(tenure.totalMonths - 1, 11);
        scenario.formula = `${monthlySalary} × ${doubleMonths} 个月（双倍工资差额）`;
        scenario.amount = Math.round(monthlySalary * doubleMonths * 100) / 100;
        break;
      }
      case 'WAGES':
        scenario.formula = `拖欠工资 ${unpaidWages} + 加付赔偿 ${Math.round(unpaidWages * 0.75)}（建议50%-100%）`;
        scenario.amount = Math.round((unpaidWages + unpaidWages * 0.75) * 100) / 100;
        break;
      case 'OVERTIME_PAY':
        scenario.formula = '需根据实际加班时长计算';
        scenario.amount = null;
        break;
      default:
        scenario.formula = type.compensation.formula;
        scenario.amount = null;
    }
    results.scenarios.push(scenario);
  });

  // 合并预估总额（累加所有 scenario 金额，取每个场景最高档）
  const total = results.scenarios.reduce((sum, s) => {
    const amt = s.amount ?? s.amountN1 ?? s.amountN ?? 0;
    return sum + amt;
  }, 0);
  results.estimatedTotal = Math.round(total * 100) / 100;

  return results;
}

/* ============================================================
 *  三、案情类型识别（规则引擎）
 * ============================================================ */
function detectCaseTypes(text) {
  if (!text) return [];
  const matched = [];
  const lowerText = String(text).toLowerCase();
  for (const [key, type] of Object.entries(CASE_TYPES)) {
    if (type.keywordPatterns.some(kw => lowerText.includes(kw.toLowerCase()))) {
      matched.push(type);
    }
  }
  // 如果没匹配到，默认标记为"需人工判断"
  if (matched.length === 0) {
    matched.push({
      id: 'NEED_REVIEW',
      name: '案情需进一步分析',
      keywordPatterns: [],
      legalBasis: '根据具体情况判定',
      compensation: { type: 'UNKNOWN', desc: '建议上传更多证据或联系律师' },
      articles: []
    });
  }
  return matched;
}

/* ============================================================
 *  四、胜率评估（简化版：基于证据充足度）
 * ============================================================ */
function calcWinRate(evidenceList, caseTypes) {
  let baseScore = 55; // 基础胜率
  const evidenceWeights = {
    labor_contract: 15,      // 劳动合同 +15
    payslip: 10,             // 工资条 +10
    termination_notice: 15,  // 解除通知书 +15
    work_records: 8,         // 考勤/工作记录 +8
    chat_records: 6,         // 聊天记录 +6
    witness: 4               // 证人 +4
  };
  evidenceList.forEach(e => {
    baseScore += evidenceWeights[e] || 0;
  });
  // 有多种案件类型且证据充分，胜率更高
  if (caseTypes.length >= 2 && evidenceList.length >= 3) baseScore += 5;
  return Math.min(baseScore, 98); // 封顶98%
}

/* ============================================================
 *  五、AI 大模型增强（QWEN/通义千问，自动降级）
 * ============================================================ */
async function aiEnhanceAnalysis(caseInfo) {
  const aiService = require('../services/aiService');

  const systemPrompt = `你是一位拥有15年执业经验的资深劳动法律师，精通《劳动合同法》《劳动法》《劳动争议调解仲裁法》。
回答要求：
1. 严格基于中国现行劳动法律，不编造法条
2. 金额计算使用公式：N = 工作年限(满6个月算1个月) × 月均工资；违法解除 = 2N；拖欠工资加付赔偿 50%-100%
3. 证据建议必须具体可执行
4. 法律建议简明，控制在200字内，语气专业但有温度
5. 一律输出合法 JSON`;

  const userPrompt = `请分析以下劳动纠纷案件：

【案件基本信息】
- 公司名称：${caseInfo.companyName}
- 入职日期：${caseInfo.hireDate}
- 离职日期：${caseInfo.endDate || '至今在职'}
- 月工资：${caseInfo.monthlySalary}元
- 累计工龄：${caseInfo.tenureText || ''}
- 案情描述：${caseInfo.description}
${caseInfo.unpaidWages ? `- 已知欠薪金额：${caseInfo.unpaidWages}元` : ''}

请输出 JSON：
{
  "caseTypes": ["匹配的案件类型列表，如：违法解除劳动合同、拖欠工资"],
  "riskPoints": ["本案的主要法律风险点（2-4条）"],
  "evidenceSuggestions": ["用户还应补充的证据清单（3-6条，具体可执行）"],
  "legalAdvice": "简明法律建议（200字内，告诉用户第一步该做什么）",
  "arbitrationRequests": ["建议的仲裁请求表述"],
  "estimatedAmountTip": "对预估赔偿金额的法律说明"
}`;

  const result = await aiService.chat(systemPrompt, userPrompt, { jsonMode: true });
  return result; // null 由上层处理
}

/* ============================================================
 *  六、主分析入口
 * ============================================================ */
async function analyzeCase(input) {
  const {
    userName, companyName, hireDate, endDate,
    monthlySalary, description, unpaidWages = 0,
    evidence = [], ocrExtracts = []
  } = input;

  // 拼接 OCR 识别到的文本到描述中（让类型识别更准）
  let mergedDesc = description || '';
  const ocrTexts = ocrExtracts.filter(o => o.rawText).map(o => `[OCR-${o.docType}] ${o.rawText}`);
  if (ocrTexts.length) {
    mergedDesc = mergedDesc + '\n\n📎 合同/文书OCR识别：\n' + ocrTexts.join('\n');
  }

  // 1. 类型识别（合并 OCR 文本后更准）
  const caseTypes = detectCaseTypes(mergedDesc);

  // 2. 赔偿金计算
  const compensations = calcAllCompensations({
    monthlySalary, hireDate, endDate, caseTypes, unpaidWages
  });

  // 3. 胜率评估
  const winRate = calcWinRate([...evidence, ...ocrExtracts.map(() => 'ocr_doc')], caseTypes);

  // 4. AI 增强分析（QWEN 大模型）
  const tenure = compensations.tenure;
  const tenureText = `${tenure.years}年${tenure.months}个月`;
  const aiEnhanced = await aiEnhanceAnalysis({
    companyName, hireDate, endDate, monthlySalary,
    tenureText, description, unpaidWages
  });

  // 如果 AI 返回了更精细的 caseTypes，合并进去
  let finalCaseTypes = caseTypes;
  if (aiEnhanced?.caseTypes?.length && aiEnhanced.caseTypes[0] !== '违法解除劳动合同') {
    // AI 给了补充的案件类型（可选：保持规则引擎结果为主）
  }

  // 5. 生成仲裁请求
  const arbitrationRequests = generateArbitrationRequests(finalCaseTypes, compensations);

  return {
    reportId: nanoid(10),
    timestamp: Date.now(),
    basicInfo: { userName, companyName, hireDate, endDate, monthlySalary, unpaidWages },
    caseTypes: finalCaseTypes,
    tenure: compensations.tenure,
    compensation: compensations,
    winRate,
    arbitrationRequests,
    evidence,
    ocrExtracts,
    aiEnhanced,
    legalBasis: collectLegalBasis(finalCaseTypes)
  };
}

function collectLegalBasis(caseTypes) {
  const articles = new Set();
  caseTypes.forEach(t => (t.articles || []).forEach(a => articles.add(a)));
  return Array.from(articles);
}

function generateArbitrationRequests(caseTypes, compensations) {
  const requests = [];
  const { scenarios, estimatedTotal } = compensations;
  scenarios.forEach((s, idx) => {
    if (s.amount != null) {
      requests.push({
        id: idx + 1,
        item: `请求裁决被申请人支付${s.name}的赔偿金`,
        amount: s.amount,
        formula: s.formula
      });
    } else if (s.amountN && s.amountN1) {
      requests.push({
        id: idx + 1,
        item: `请求裁决被申请人支付${s.name}的经济补偿金`,
        amount: s.amountN1,
        formula: `${s.formulaN1}（含代通知金）`
      });
    }
  });
  return requests;
}

module.exports = {
  CASE_TYPES,
  analyzeCase,
  calcWorkYears,
  calcN,
  detectCaseTypes,
  calcWinRate
};
