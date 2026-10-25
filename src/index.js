require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// 【核心跨域护甲】直接允许你的前端域名通信
app.use(cors({
  origin: [
    'https://vercel.app',
    'http://localhost:5173',
    'http://localhost:3000'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Locale']
}));

// 标准中间件
app.use(express.json({ limit: '50mb' })); // 顺便把大模型体积限制放大
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// 基础健康检查接口
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

/**
 * 核心提示：下方如果还有你原先的路由接口（例如 app.use('/api', router) 等），
 * 请把它们原封不动地接在下面。
 */

// 启动服务器
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server is perfectly running on port ${PORT}`);
});
