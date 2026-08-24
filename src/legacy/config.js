const fs = require('fs');
const path = require('path');

function loadEnvFile(root, env) {
  const loaded = { ...env };
  const file = path.join(root, '.env');
  if (!fs.existsSync(file)) return loaded;

  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || loaded[match[1]] !== undefined) continue;
    loaded[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
  return loaded;
}

function integer(value, fallback, min, max) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function loadConfig({ root, env = process.env }) {
  const loaded = loadEnvFile(root, env);
  return Object.freeze({
    root,
    host: loaded.HOST || '127.0.0.1',
    port: integer(loaded.PORT, 3000, 1, 65535),
    deepseekUrl: loaded.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1/chat/completions',
    apiKey: loaded.DEEPSEEK_API_KEY || '',
    defaultPromptFile: loaded.DEFAULT_SYSTEM_PROMPT_FILE || path.join('prompts', 'default-system-prompt.txt'),
    upstreamTimeoutMs: integer(loaded.UPSTREAM_TIMEOUT_MS, 120000, 1000, 600000),
  });
}

module.exports = { loadEnvFile, loadConfig };
