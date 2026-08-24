const path = require('path');
const { chromium } = require('playwright');
const { loadConfig } = require('../src/legacy/config');
const { createApp } = require('../src/legacy/app');
const { startTestServer } = require('./helpers/test-server');

(async () => {
  const config = loadConfig({ root: path.resolve(__dirname, '..'), env: {} });
  const running = await startTestServer(createApp(config));
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();
    await page.goto(running.baseUrl);
    await page.waitForFunction(() => Boolean(window.__chatAppDebug));

    const html = await page.evaluate(() => window.__chatAppDebug.renderMarkdownForTest([
      '# 标题',
      '<img src=x onerror="window.__xss=1">',
      '<script>window.__xss=2</script>',
      '[危险链接](javascript:window.__xss=3)',
    ].join('\n')));

    if (!html.includes('<h1>标题</h1>')) throw new Error(`Markdown 标题未渲染：${html}`);
    if (await page.evaluate(() => window.__xss)) throw new Error('XSS 已执行');

    const danger = await page.evaluate((safeHtml) => {
      const container = document.createElement('div');
      container.innerHTML = safeHtml;
      return {
        scripts: container.querySelectorAll('script').length,
        eventAttributes: [...container.querySelectorAll('*')]
          .flatMap((node) => [...node.attributes])
          .filter((attribute) => attribute.name.toLowerCase().startsWith('on')).length,
        javascriptLinks: [...container.querySelectorAll('a[href]')]
          .filter((link) => link.getAttribute('href').trim().toLowerCase().startsWith('javascript:')).length,
      };
    }, html);
    if (danger.scripts || danger.eventAttributes || danger.javascriptLinks) {
      throw new Error(`危险 HTML 未清理：${JSON.stringify(danger)} ${html}`);
    }

    const sources = await page.locator('script[src]').evaluateAll((scripts) => scripts.map((script) => script.src));
    if (sources.some((source) => !source.startsWith(running.baseUrl))) {
      throw new Error(`存在外部脚本：${sources.join(', ')}`);
    }
  } finally {
    await browser.close();
    await running.close();
  }

  console.log('chat-page-security PASS');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
