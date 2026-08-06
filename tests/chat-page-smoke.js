const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const indexPath = path.resolve(__dirname, '..', 'index.html');
  const fileUrl = 'file:///' + indexPath.replace(/\\/g, '/');
  const html = fs.readFileSync(indexPath, 'utf8');

  if (/sk-[A-Za-z0-9]/.test(html)) {
    throw new Error('index.html must not contain a plaintext API key');
  }
  if (!html.includes('API_URL="/api/chat"')) {
    throw new Error('Frontend must call the local /api/chat proxy');
  }

  await page.goto(fileUrl);
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await page.waitForSelector('[data-testid="model-label"]');
  const model = await page.textContent('[data-testid="model-label"]');
  if (!model.includes('deepseek-v4-flash')) {
    throw new Error(`Expected model label to mention deepseek-v4-flash, got: ${model}`);
  }

  await page.fill('#temperature', '0.70');
  await page.fill('[data-testid="context-limit"]', '8');
  await page.fill('#pinnedPrompt', '长期设定：保持中文输出。');
  await page.click('[data-testid="save-settings"]');
  await page.click('[data-testid="new-session"]');
  await page.fill('#input', '请帮我构思一个悬疑开场');
  await page.fill('[data-testid="session-search"]', '新聊天');

  const stateBefore = await page.evaluate(() => window.__chatAppDebug.getState());
  if (stateBefore.settings.temperature !== 0.7) {
    throw new Error(`Expected saved temperature 0.7, got ${stateBefore.settings.temperature}`);
  }
  if (stateBefore.settings.contextLimit !== 8) {
    throw new Error(`Expected context limit 8, got ${stateBefore.settings.contextLimit}`);
  }
  if ('promptProfile' in stateBefore.requestBody) {
    throw new Error('Plain chat request should not include promptProfile');
  }
  if (stateBefore.apiUrl !== '/api/chat') {
    throw new Error(`Expected local proxy api url, got ${stateBefore.apiUrl}`);
  }
  if (!stateBefore.requestBody.messages.some((m) => m.role === 'system' && m.content.includes('长期设定'))) {
    throw new Error('Expected pinned prompt in request body');
  }
  if (stateBefore.sessions.length < 2) {
    throw new Error(`Expected at least 2 sessions, got ${stateBefore.sessions.length}`);
  }

  await page.reload();
  await page.waitForSelector('[data-testid="model-label"]');
  const stateAfter = await page.evaluate(() => window.__chatAppDebug.getState());
  if (stateAfter.settings.temperature !== 0.7) {
    throw new Error(`Expected persisted temperature 0.7, got ${stateAfter.settings.temperature}`);
  }
  if (stateAfter.settings.contextLimit !== 8) {
    throw new Error(`Expected persisted context limit 8, got ${stateAfter.settings.contextLimit}`);
  }
  if (!stateAfter.activeSessionId) {
    throw new Error('Expected active session id after reload');
  }

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
