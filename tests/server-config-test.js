const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { loadConfig } = require('../src/legacy/config');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'novel-config-'));

try {
  fs.mkdirSync(path.join(root, 'prompts'), { recursive: true });
  fs.writeFileSync(path.join(root, '.env'), [
    'PORT=4312',
    'HOST=127.0.0.1',
    'DEEPSEEK_API_URL=https://example.invalid/chat',
    'DEFAULT_SYSTEM_PROMPT_FILE=prompts/custom.txt',
    'UPSTREAM_TIMEOUT_MS=45000',
  ].join('\n'));

  const config = loadConfig({ root, env: {} });
  assert.strictEqual(config.port, 4312);
  assert.strictEqual(config.host, '127.0.0.1');
  assert.strictEqual(config.deepseekUrl, 'https://example.invalid/chat');
  assert.strictEqual(config.defaultPromptFile, 'prompts/custom.txt');
  assert.strictEqual(config.upstreamTimeoutMs, 45000);

  const overridden = loadConfig({
    root,
    env: {
      PORT: '4999',
      HOST: '127.0.0.2',
      DEEPSEEK_API_URL: 'https://override.invalid/chat',
    },
  });
  assert.strictEqual(overridden.port, 4999);
  assert.strictEqual(overridden.host, '127.0.0.2');
  assert.strictEqual(overridden.deepseekUrl, 'https://override.invalid/chat');

  const invalidNumbers = loadConfig({
    root,
    env: { PORT: '70000', UPSTREAM_TIMEOUT_MS: '20' },
  });
  assert.strictEqual(invalidNumbers.port, 3000);
  assert.strictEqual(invalidNumbers.upstreamTimeoutMs, 120000);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

console.log('server-config-test PASS');
