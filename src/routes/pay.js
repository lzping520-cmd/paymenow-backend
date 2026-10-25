/**
 * 微信支付接口（演示模式）
 * 真实接入需实现：统一下单 + 回调验签
 * 此处提供模拟支付流程
 */
const express = require('express');
const router = express.Router();
const { nanoid } = require('nanoid');

const ORDERS = new Map(); // 内存存储订单（生产环境用 DB）

// 价格配置
const PRODUCTS = {
  basic: { id: 'basic', name: 'AI 胜诉预测报告', price: 990 },   // ¥9.9
  standard: { id: 'standard', name: '一键生成仲裁申请书', price: 1990 }, // ¥19.9
  full: { id: 'full', name: '完整法律文书包', price: 2990 }       // ¥29.9
};

/**
 * 创建订单
 * POST /api/pay/create
 */
router.post('/create', (req, res, next) => {
  try {
    const { productId, reportId } = req.body;
    const product = PRODUCTS[productId] || PRODUCTS.standard;
    const orderId = 'ORD' + Date.now() + nanoid(6);

    const order = {
      orderId,
      product,
      reportId,
      status: 'pending',
      createdAt: Date.now(),
      paidAt: null
    };
    ORDERS.set(orderId, order);

    if (!process.env.WX_PAY_MCH_ID) {
      // 演示模式：直接返回 mock 参数，前端可直接"模拟支付"
      return res.json({
        code: 0,
        data: {
          orderId,
          mode: 'demo',
          product,
          payParams: {
            timeStamp: String(Math.floor(Date.now() / 1000)),
            nonceStr: nanoid(16),
            package: `prepay_id=wx_mock_${nanoid(12)}`,
            signType: 'RSA',
            paySign: 'MOCK_SIGN_' + nanoid(32)
          }
        }
      });
    }

    // TODO: 真实支付场景 - 调用微信统一下单 API
    res.json({ code: 0, data: { orderId, product, mode: 'live' } });
  } catch (err) {
    next(err);
  }
});

/**
 * 查询订单状态（支付后轮询）
 * GET /api/pay/status?orderId=xxx
 */
router.get('/status', (req, res) => {
  const order = ORDERS.get(req.query.orderId);
  if (!order) return res.status(404).json({ code: 404, msg: '订单不存在' });
  res.json({ code: 0, data: order });
});

/**
 * 模拟支付成功回调（演示用）
 * POST /api/pay/mock-success
 */
router.post('/mock-success', (req, res, next) => {
  try {
    const { orderId } = req.body;
    const order = ORDERS.get(orderId);
    if (!order) return res.status(404).json({ code: 404, msg: '订单不存在' });
    order.status = 'paid';
    order.paidAt = Date.now();
    ORDERS.set(orderId, order);
    res.json({ code: 0, data: order });
  } catch (err) { next(err); }
});

/**
 * 微信支付回调（真实环境使用）
 * POST /api/pay/notify
 */
router.post('/notify', (req, res) => {
  // TODO: 验签 + 更新订单状态
  res.json({ return_code: 'SUCCESS', return_msg: 'OK' });
});

module.exports = router;
