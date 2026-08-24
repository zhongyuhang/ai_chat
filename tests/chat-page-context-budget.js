const path = require('path');
const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const fileUrl = 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');

  await page.goto(fileUrl);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('[data-testid="model-label"]');

  // ---- 1. token 估算器 ----
  const est = await page.evaluate(() => {
    const zh = window.__chatAppDebug.getState() ? estimateTokens('好'.repeat(1000)) : -1;
    const ascii = estimateTokens('abc '.repeat(250));
    return { zh, ascii };
  });
  if (est.zh !== 1000) throw new Error(`中文估算应为 1000 tokens，got ${est.zh}`);
  if (est.ascii < 180 || est.ascii > 260) throw new Error(`英文估算应约 214 tokens，got ${est.ascii}`);

  // ---- 2. 分层上下文构建（含 pinnedPrompt、摘要、较早对话截断、最近消息）----
  const layered = await page.evaluate(() => {
    const s = sessions[0];
    s.messages = [];
    for (let i = 0; i < 30; i++) {
      s.messages.push({ role: i % 2 ? 'assistant' : 'user', content: `消息${i} 内容测试`, createdAt: '' });
    }
    settings.pinnedPrompt = '长期设定：保持中文输出。';
    settings.summary = '主角李默追查失踪案。';
    settings.contextLimit = 24;
    settings.recentLimit = 12;
    const msgs = buildContextMessages(s);
    return {
      count: msgs.length,
      roles: msgs.map((m) => m.role),
      firstSystem: msgs[0].content,
      lastIsRecentUser: msgs[msgs.length - 1].role === 'user',
    };
  });
  if (layered.count > 15) throw new Error(`分层构建应 ≤15 条消息，got ${layered.count}`);
  if (!layered.firstSystem.includes('长期设定')) throw new Error('首条应为 pinnedPrompt system 消息');
  if (layered.lastIsRecentUser) throw new Error('最近消息应以 user 结尾');

  // ---- 3. token 预算裁剪 ----
  const budget = await page.evaluate(() => {
    const s = sessions[0];
    s.messages = [];
    for (let i = 0; i < 20; i++) {
      s.messages.push({ role: i % 2 ? 'assistant' : 'user', content: '长内容'.repeat(400), createdAt: '' });
    }
    settings.contextLimit = 20;
    settings.recentLimit = 10;
    settings.pinnedPrompt = '';
    settings.summary = '';
    const msgs = buildContextMessages(s);
    const total = msgs.reduce((a, m) => a + estimateTokens(m.content), 0);
    return { count: msgs.length, total };
  });
  if (budget.total <= 0) throw new Error('token 预算应产出正数');
  console.log('  预算测试：messages=' + budget.count + '，估算 tokens=' + budget.total);

  // ---- 4. 自动压缩路径：mock /api/summarize 返回摘要 ----
  const autoCompacted = await page.evaluate(async () => {
    // 拦截 summarize
    window.__origFetch = window.fetch;
    window.fetch = async (url, opts) => {
      if (String(url).includes('/api/summarize')) {
        return { ok: true, json: async () => ({ summary: '自动压缩摘要：剧情主线+角色状态。' }) };
      }
      return window.__origFetch(url, opts);
    };
    const s = sessions[0];
    s.messages = [];
    for (let i = 0; i < 40; i++) {
      s.messages.push({ role: i % 2 ? 'assistant' : 'user', content: `消息${i} 内容测试`, createdAt: '' });
    }
    settings.pinnedPrompt = '';
    settings.summary = '';
    settings.contextLimit = 30;
    settings.recentLimit = 10;
    settings.autoCompact = true;
    settings.contextTokens = 3000; // 强制触发
    const res = await summarizeRemote(s.messages.slice(0, -10), s.summary);
    return { res, summary: s.summary };
  });
  if (autoCompacted.res !== '自动压缩摘要：剧情主线+角色状态。') {
    throw new Error(`自动压缩应返回 mock 摘要，got ${autoCompacted.res}`);
  }

  await browser.close();
  console.log('chat-page-context-budget PASS：token 估算 / 分层构建 / 预算 / 自动压缩全部通过');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
