require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// 【核心修复：高阶安全跨域中间件】
app.use(cors({
  origin: [
    'https://paymenow-frontend.vercel.app/', // 允许你当前专属的前端域名
    'http://localhost:5173',               // 预留给你在本地用电脑真机调试的前端端口
    'http://localhost:3000'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Locale']
}));

// 其他标准中间件
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

/**
 * 劳动维权AI小程序 - 后端入口
 * Express 服务，提供 AI 法律分析、支付、PDF文书生成等 API
 */

// [下方保持你原先文件的其它路由和 app.listen 逻辑不变...]
