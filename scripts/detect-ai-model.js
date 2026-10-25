/**
 * 一键测试 + 自动探测 AI 模型名
 * 运行：node scripts/detect-ai-model.js
 */
const axios = require('axios');
require('dotenv').config();

const API_KEY = process.env.AI_API_KEY;
const ENDPOINT = process.env.AI_ENDPOINT || 'http://43.136.83.81:10088/v1/chat/completions';

if (!API_KEY) {
  console.log('❌ 没配 AI_API_KEY，请先在 .env 里填');
  process.exit(1);
}

console.log('═══════════════════════════════════════════');
console.log('  AI 模型名探测工具');
console.log('═══════════════════════════════════════════');
console.log('Endpoint:', ENDPOINT);
console.log('API Key :', API_KEY.slice(0, 8) + '...');
console.log();

// 候选模型清单（按热门度排序）
const CANDIDATES = [
  // Qwen 家族
  'qwen-max', 'qwen-plus', 'qwen-turbo',
  'qwen2.5-max', 'qwen2.5-72b', 'qwen2.5-32b', 'qwen2.5-14b', 'qwen2.5-7b',
  'qwen3-max', 'qwen3-8b',
  'qwen3.8-max', 'qwen3.8-72b', 'qwen3.8-32b', 'qwen3.8-14b',
  'qwen-3.8-max', 'qwen-3-max',
  // QWQ 推理模型
  'qwq-32b', 'qwq-preview',
  // 多模态
  'qwen-vl-max', 'qwen-vl-plus', 'qwen2.5-vl-max',
  // 其他热门
  'deepseek-chat', 'deepseek-v3', 'deepseek-r1',
  'glm-4', 'glm-4-plus', 'glm-4-air',
  'doubao-pro-32k', 'doubao-pro-128k',
  'gpt-4o', 'gpt-4o-mini',
  'moonshot-v1-8k', 'moonshot-v1-32k',
  'yi-large'
];

async function probe(model) {
  try {
    const resp = await axios.post(ENDPOINT, {
      model,
      messages: [{ role: 'user', content: '说一个字：好' }],
      max_tokens: 10
    }, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 8000
    });
    const content = resp.data?.choices?.[0]?.message?.content?.trim() || '(无内容)';
    return { ok: true, content };
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    if (msg.includes('未知模型') || msg.includes('unknown model') || msg.includes('Not Found')) {
      return { ok: false, reason: 'unknown' };
    }
    return { ok: false, reason: msg.slice(0, 60) };
  }
}

(async () => {
  console.log('开始探测 ' + CANDIDATES.length + ' 个候选模型...\n');

  const found = [];
  for (let i = 0; i < CANDIDATES.length; i++) {
    const m = CANDIDATES[i];
    const result = await probe(m);
    if (result.ok) {
      console.log(`  ✅ [${i+1}] ${m} → "${result.content}"`);
      found.push(m);
    } else {
      // 只打印失败的第一个错误（最后统一汇总失败数）
    }
    process.stdout.write(`\r  进度: ${i+1}/${CANDIDATES.length}`);
  }
  console.log('\n');

  if (found.length === 0) {
    console.log('═══════════════════════════════════════════');
    console.log('❌ 自动扫描未命中任何模型');
    console.log('');
    console.log('👉 需要手动查模型名：');
    console.log('   1. 打开面板: http://43.136.83.81:10088/');
    console.log('   2. 管理员登录（账号密码问搭建方）');
    console.log('   3. 左侧菜单找「渠道管理」或「模型管理」');
    console.log('   4. 看你绑定的 Qwen3.8 Max 对应的名字，复制下来');
    console.log('   5. 改 .env 里 AI_TEXT_MODEL=那个名字');
    console.log('');
    console.log('常见面板显示位置：');
    console.log('   - New API / One API: 渠道管理 → 编辑 → 模型名 / 模型ID');
    console.log('   - Lobe Chat Gateway: 设置 → 模型供应商 → Base URL / API Key / 模型');
    console.log('═══════════════════════════════════════════');
    process.exit(0);
  }

  console.log('═══════════════════════════════════════════');
  console.log(`🎉 找到 ${found.length} 个可用模型：`);
  found.forEach(m => console.log(`     - ${m}`));
  console.log('');
  console.log('👉 建议用法：');
  console.log(`   AI_TEXT_MODEL=${found[0]}`);
  console.log(`   AI_VL_MODEL=${found[found.length - 1] || found[0]}`);
  console.log('');
  console.log('👉 一键写入 .env：');
  console.log(`   sed -i "s/AI_TEXT_MODEL=.*/AI_TEXT_MODEL=${found[0]}/" .env`);
  console.log(`   sed -i "s/AI_VL_MODEL=.*/AI_VL_MODEL=${found[found.length - 1] || found[0]}/" .env`);
  console.log('═══════════════════════════════════════════');
})();
