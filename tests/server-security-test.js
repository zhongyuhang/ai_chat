const assert = require('assert');
const path = require('path');
const { loadConfig } = require('../src/legacy/config');
const { createApp } = require('../src/legacy/app');
const { startTestServer } = require('./helpers/test-server');

(async () => {
  const root = path.resolve(__dirname, '..');
  const config = loadConfig({ root, env: {} });
  const running = await startTestServer(createApp(config));

  try {
    for (const target of [
      '/.env',
      '/.git/config',
      '/server.js',
      '/package.json',
      '/prompts/default-system-prompt.txt',
      '/tests/server-security-test.js',
    ]) {
      const response = await fetch(running.baseUrl + target);
      assert.strictEqual(response.status, 404, `${target} must not be public`);
    }

    const page = await fetch(running.baseUrl + '/');
    assert.strictEqual(page.status, 200);
    assert.strictEqual(page.headers.get('x-content-type-options'), 'nosniff');
    assert.strictEqual(page.headers.get('x-frame-options'), 'DENY');
    assert.ok(page.headers.get('content-security-policy').includes("default-src 'self'"));

    const hostile = await fetch(running.baseUrl + '/api/chat', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://evil.example',
      },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'x' }] }),
    });
    assert.strictEqual(hostile.status, 403);
    assert.strictEqual((await hostile.json()).error.code, 'ORIGIN_FORBIDDEN');

    const wrongType = await fetch(running.baseUrl + '/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: '{}',
    });
    assert.strictEqual(wrongType.status, 415);
  } finally {
    await running.close();
  }

  console.log('server-security-test PASS');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
