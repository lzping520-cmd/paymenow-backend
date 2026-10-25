/**
 * AI 案情分析接口
 * POST /api/analyze
 * Body: { userName, companyName, hireDate, endDate, monthlySalary, description, unpaidWages, evidence }
 */
const express = require('express');
const router = express.Router();
const { analyzeCase } = require('../ai/legalAnalyzer');

router.post('/', async (req, res, next) => {
  try {
    const body = req.body;

    // 参数校验
    if (!body.companyName || !body.hireDate || !body.monthlySalary || !body.description) {
      return res.status(400).json({
        code: 400,
        msg: '请完整填写：公司名称、入职日期、月工资、案情描述'
      });
    }

    const result = await analyzeCase({
      userName: body.userName || '当事人',
      companyName: body.companyName,
      hireDate: body.hireDate,
      endDate: body.endDate || null,
      monthlySalary: Number(body.monthlySalary),
      description: body.description,
      unpaidWages: Number(body.unpaidWages || 0),
      evidence: body.evidence || [],
      ocrExtracts: body.ocrExtracts || []     // ✨ OCR 识别结果透传
    });

    res.json({ code: 0, data: result });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
