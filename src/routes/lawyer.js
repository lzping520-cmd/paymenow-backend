/**
 * 律师线索流转接口
 * POST /api/lawyer/submit  提交线索（高价值案件）
 * GET  /api/lawyer/list    获取合作律所列表
 */
const express = require('express');
const router = express.Router();
const { nanoid } = require('nanoid');

const LEADS = [];

// 模拟合作律所
const LAW_FIRMS = [
  { id: 'LF001', name: '北京市XX律师事务所', city: '北京', specialties: ['劳动争议', '合同纠纷'], phone: '010-xxxxxxx' },
  { id: 'LF002', name: '上海市XX律师事务所', city: '上海', specialties: ['劳动争议'], phone: '021-xxxxxxx' },
  { id: 'LF003', name: '广州XX律师事务所', city: '广州', specialties: ['劳动争议', '公司法务'], phone: '020-xxxxxxx' }
];

router.get('/list', (req, res) => {
  res.json({ code: 0, data: LAW_FIRMS });
});

router.post('/submit', (req, res, next) => {
  try {
    const { contact, city, analysis, note } = req.body;
    const lead = {
      leadId: 'LD' + nanoid(8),
      contact, city, note,
      caseSummary: analysis ? {
        company: analysis.basicInfo?.companyName,
        claimAmount: analysis.compensation?.estimatedTotal,
        winRate: analysis.winRate,
        caseTypes: analysis.caseTypes?.map(t => t.name)
      } : null,
      status: 'pending',
      createdAt: Date.now()
    };
    LEADS.push(lead);
    console.log('[线索] 新提交：', lead.leadId, lead.caseSummary);
    res.json({ code: 0, data: lead });
  } catch (err) { next(err); }
});

module.exports = router;
