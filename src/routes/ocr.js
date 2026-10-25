/**
 * OCR 接口 - 合同/通知书/工资条图片智能识别
 * 优先 QWEN-VL 多模态大模型，自动降级
 *
 * POST /api/ocr/file       上传文件 → 识别
 *   multipart/form-data: file=图片
 *   可选：type=contract|notice|payslip|auto
 *
 * POST /api/ocr/analyze    图片 + 已有案情 → 合并分析
 *   { fileBase64, analysisId, description }
 */
const express = require('express');
const multer = require('multer');
const router = express.Router();
const path = require('path');
const fs = require('fs');

const { recognizeDocument, parseTextLocal, detectDocType } = require('../services/ocrService');
const { isAvailable } = require('../services/aiService');
const { analyzeCase } = require('../ai/legalAnalyzer');

const upload = multer({
  dest: path.join(__dirname, '../../uploads/ocr/'),
  limits: { fileSize: 15 * 1024 * 1024 } // 15MB
});

// 确保目录存在
const OCR_DIR = path.join(__dirname, '../../uploads/ocr/');
if (!fs.existsSync(OCR_DIR)) fs.mkdirSync(OCR_DIR, { recursive: true });

/**
 * 识别单个文件
 */
router.post('/file', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ code: 400, msg: '请上传图片文件（file字段）' });

    const filePath = req.file.path;
    const fileSize = req.file.size;
    const typeHint = req.body.type || 'auto';

    if (!isAvailable()) {
      fs.unlinkSync(filePath);
      return res.status(501).json({
        code: 501,
        msg: 'AI 服务未配置',
        hint: '请在 .env 中配置 AI_API_KEY（QWEN DashScope）',
        demo: true
      });
    }

    // 实际识别
    const result = await recognizeDocument(filePath);

    // 清理临时文件
    fs.unlinkSync(filePath);

    res.json({
      code: 0,
      data: {
        ...result,
        fileInfo: { size: fileSize },
        poweredBy: 'QWEN-VL-Plus'
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * 纯文本解析（当用户把合同文字粘贴进来时）
 */
router.post('/text', (req, res, next) => {
  try {
    const text = (req.body.text || '').trim();
    if (!text) return res.status(400).json({ code: 400, msg: '缺少 text' });
    res.json({
      code: 0,
      data: {
        docType: detectDocType(text),
        extractedInfo: parseTextLocal(text),
        rawText: text.slice(0, 2000),
        note: '本地正则解析（建议配置 QWEN-VL 大模型获得更精准识别）'
      }
    });
  } catch (err) { next(err); }
});

/**
 * 组合接口：上传图片 + 已有案情 → 一次性完成 OCR + AI 分析
 */
router.post('/analyze', upload.array('files', 5), async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ code: 400, msg: '请至少上传一张图片' });
    }

    const form = JSON.parse(req.body.form || '{}');
    if (!form.companyName || !form.hireDate || !form.monthlySalary) {
      return res.status(400).json({ code: 400, msg: '请在 form 参数中提供完整案情表单' });
    }

    // 逐张 OCR
    const ocrResults = [];
    for (const f of req.files) {
      if (isAvailable()) {
        const r = await recognizeDocument(f.path);
        ocrResults.push(r);
      } else {
        ocrResults.push({ docType: '未识别', rawText: '', extractedInfo: [] });
      }
      try { fs.unlinkSync(f.path); } catch {}
    }

    // 合并到法律分析
    const analysis = await analyzeCase({
      userName: form.userName,
      companyName: form.companyName,
      hireDate: form.hireDate,
      endDate: form.endDate || null,
      monthlySalary: Number(form.monthlySalary),
      description: form.description || '',
      unpaidWages: Number(form.unpaidWages || 0),
      evidence: form.evidence || [],
      ocrExtracts: ocrResults
    });

    res.json({
      code: 0,
      data: {
        ocrResults,
        analysis,
        note: `已识别 ${ocrResults.length} 个文件并合并入法律分析`
      }
    });
  } catch (err) { next(err); }
});

module.exports = router;
