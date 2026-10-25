/**
 * 劳动维权AI小程序 - 后端入口
 * Express 服务，提供 AI 法律分析、支付、PDF文书生成等 API
 */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// 限流（防止滥用）
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { code: 429, msg: '请求过于频繁，请稍后再试' }
});
app.use('/api/', limiter);

// 路由
const analyzeRouter = require('./routes/analyze');
const payRouter = require('./routes/pay');
const documentRouter = require('./routes/document');
const ocrRouter = require('./routes/ocr');
const loginRouter = require('./routes/login');
const lawyerRouter = require('./routes/lawyer');

app.use('/api/login', loginRouter);
app.use('/api/analyze', analyzeRouter);
app.use('/api/ocr', ocrRouter);
app.use('/api/pay', payRouter);
app.use('/api/document', documentRouter);
app.use('/api/lawyer', lawyerRouter);

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({
    code: 0,
    data: {
      status: 'ok',
      timestamp: Date.now(),
      version: '1.0.0',
      services: {
        ai: process.env.AI_API_KEY ? 'configured' : 'demo-mode',
        pay: process.env.WX_PAY_MCH_ID ? 'configured' : 'demo-mode'
      }
    }
  });
});

// 全局错误处理
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  res.status(err.status || 500).json({
    code: err.status || 500,
    msg: err.message || '服务器内部错误'
  });
});

// 404
app.use((req, res) => {
  res.status(404).json({ code: 404, msg: '接口不存在' });
});

app.listen(PORT, () => {
  const aiKey = process.env.AI_API_KEY || '';
  const aiOk = aiKey.length > 5;
  const aiProvider = process.env.AI_PROVIDER || 'qwen';
  const textModel = process.env.AI_TEXT_MODEL || 'qwen-plus';
  const vlModel = process.env.AI_VL_MODEL || 'qwen-vl-plus';
  const payOk = !!(process.env.WX_PAY_MCH_ID && process.env.WX_PAY_API_KEY);

  console.log(`
╔══════════════════════════════════════════════════════════╗
║          劳动维权 AI 后端服务 v2.0                        ║
╠══════════════════════════════════════════════════════════╣
║  📡 服务地址 : http://localhost:${PORT}
║
║  🧠 AI 文本  : ${aiOk ? `${textModel} ✅` : '未配置（规则引擎降级）'}
║  👁️ AI OCR   : ${aiOk ? `${vlModel} ✅` : '未配置（需 QWEN-VL）'}
║  🤖 供应商   : ${aiProvider.toUpperCase()} / DashScope
║
║  💳 微信支付 : ${payOk ? '✅ 已配置' : '⏸ 演示模式'}
║  📄 文书生成 : ✅ PDFKit 已启用
║
║  📋 主要接口 :
║     POST /api/analyze     — AI 案情分析
║     POST /api/ocr/file    — 图片 OCR（劳动合同/工资条）
║     POST /api/ocr/analyze — OCR + 分析 一站式
║     POST /api/pay/create  — 微信支付下单
║     POST /api/document/generate — 生成仲裁申请书 PDF
╚══════════════════════════════════════════════════════════╝
${!aiOk ? '\n💡 想启用真实 AI？在 .env 中填 AI_API_KEY (DashScope)' : ''}
  `);
});

module.exports = app;
