/**
 * 微信小程序登录（code2session）
 * 简化版：未配置 WX_APPID 时返回 mock openid，方便本地调试
 */
const express = require('express');
const axios = require('axios');
const { nanoid } = require('nanoid');
const router = express.Router();

router.post('/', async (req, res, next) => {
  try {
    const { code } = req.body;

    if (!process.env.WX_APPID || !process.env.WX_SECRET) {
      // 演示模式
      return res.json({
        code: 0,
        data: { openid: 'mock_' + nanoid(8), session_key: 'demo', demo: true }
      });
    }

    const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${process.env.WX_APPID}&secret=${process.env.WX_SECRET}&js_code=${code}&grant_type=authorization_code`;
    const resp = await axios.get(url, { timeout: 8000 });

    if (resp.data.errcode) {
      return res.status(400).json({ code: resp.data.errcode, msg: resp.data.errmsg });
    }

    res.json({ code: 0, data: resp.data });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
