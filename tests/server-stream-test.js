const assert = require('assert');
const path = require('path');
const { createDeepSeekClient } = require('../src/legacy/deepseek-client');
const { loadConfig } = require('../src/legacy/config');
const { createApp } = require('../src/legacy/app');
const { startTestServer } = require('./helpers/test-server');

function hangingFetch(_url, { signal }) {
  return new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => {
      reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    }, { once: true });
  });
}

async function testClientErrors() {
  const config = { deepseekUrl: 'https://example.invalid', apiKey: 'test', upstreamTimeoutMs: 20 };
  const client = createDeepSeekClient({ config, fetchImpl: hangingFetch });

  await assert.rejects(client.request({ messages: [] }), (error) => (
    error.code === 'UPSTREAM_TIMEOUT' && error.statusCode === 504 && error.retryable === true
  ));

  const controller = new AbortController();
  const pending = client.request({ messages: [] }, controller.signal);
  controller.abort();
  await assert.rejects(pending, (error) => (
    error.code === 'CLIENT_CANCELLED' && error.statusCode === 499 && error.retryable === false
  ));

  const failed = createDeepSeekClient({
    config,
    fetchImpl: async () => { throw new Error('socket failed'); },
  });
  await assert.rejects(failed.request({ messages: [] }), (error) => (
    error.code === 'UPSTREAM_NETWORK' && error.statusCode === 502 && error.retryable === true
  ));
}

async function testHttpTimeout() {
  const root = path.resolve(__dirname, '..');
  const base = loadConfig({ root, env: { DEEPSEEK_API_KEY: 'test-key', UPSTREAM_TIMEOUT_MS: '1000' } });
  const config = { ...base, upstreamTimeoutMs: 20 };
  const running = await startTestServer(createApp(config, { fetchImpl: hangingFetch }));

  try {
    const response = await fetch(`${running.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: '测试超时' }] }),
    });
    const data = await response.json();
    assert.strictEqual(response.status, 504);
    assert.deepStrictEqual(data.error, {
      code: 'UPSTREAM_TIMEOUT',
      message: 'DeepSeek 请求超时。',
      retryable: true,
    });
  } finally {
    await running.close();
  }
}

(async () => {
  await testClientErrors();
  await testHttpTimeout();
  console.log('server-stream-test PASS');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
