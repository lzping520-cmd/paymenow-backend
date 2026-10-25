/**
 * 文书生成与下载接口
 * POST /api/document/generate    根据分析结果生成 PDF
 * GET  /api/document/download/:filename
 */
const express = require('express');
const router = express.Router();
const { generateArbitrationPdf, generateWinRateReport } = require('../services/pdfGenerator');

// 内存模拟"已购用户" —— 生产环境改查 DB
const PAID_USERS = new Set();

/**
 * 生成文书
 * Body: { analysis: {...}, type: 'arbitration' | 'report', paid: true/false }
 */
router.post('/generate', async (req, res, next) => {
  try {
    const { analysis, type = 'arbitration', paid = false } = req.body;
    if (!analysis) return res.status(400).json({ code: 400, msg: '缺少分析数据' });

    if (!paid && !process.env.WX_PAY_MCH_ID) {
      // 演示模式放行
    } else if (!paid && process.env.WX_PAY_MCH_ID) {
      return res.status(402).json({ code: 402, msg: '请先完成支付' });
    }

    let result;
    if (type === 'report') {
      result = await generateWinRateReport(analysis);
    } else {
      result = await generateArbitrationPdf(analysis);
    }

    res.json({
      code: 0,
      data: {
        filename: result.filename,
        url: `/api/document/download/${result.filename}`,
        note: '小程序端可通过 wx.downloadFile + wx.openDocument 打开'
      }
    });
  } catch (err) { next(err); }
});

router.get('/download/:filename', (req, res, next) => {
  try {
    const path = require('path');
    const fs = require('fs');
    const fp = path.join(__dirname, '../../uploads', req.params.filename);
    if (!fs.existsSync(fp)) return res.status(404).json({ code: 404, msg: '文件不存在' });
    res.download(fp);
  } catch (err) { next(err); }
});

module.exports = router;
