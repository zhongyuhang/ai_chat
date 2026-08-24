const path = require('path');
const { chromium } = require('playwright');
const { loadConfig } = require('../../src/legacy/config');
const { createApp } = require('../../src/legacy/app');
const { startTestServer } = require('./test-server');

async function openChatTestPage() {
  const root = path.resolve(__dirname, '..', '..');
  const config = loadConfig({ root, env: { DEEPSEEK_API_KEY: 'test-key' } });
  const running = await startTestServer(createApp(config));
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(running.baseUrl);

  return {
    browser,
    page,
    baseUrl: running.baseUrl,
    async close() {
      await browser.close();
      await running.close();
    },
  };
}

module.exports = { openChatTestPage };
