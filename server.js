const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);
const DEEPSEEK_URL = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1/chat/completions';
const DEFAULT_PROMPT_FILE = process.env.DEFAULT_SYSTEM_PROMPT_FILE || path.join('prompts', 'default-system-prompt.txt');

loadEnv();

function loadEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'POST' && req.url === '/api/chat') return proxyChat(req, res);
    if (req.method === 'GET' && req.url === '/api/status') return sendJson(res, 200, getStatus());
    if (req.method === 'GET') return serveStatic(req, res);
    sendJson(res, 405, { error: { message: 'Method not allowed' } });
  } catch (err) {
    sendJson(res, err.statusCode || 500, { error: { message: err.message } });
  }
});

async function proxyChat(req, res) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return sendJson(res, 500, { error: { message: '缺少 DEEPSEEK_API_KEY，请在 .env 中配置。' } });

  const body = await readBody(req);
  const payload = injectDefaultPrompt(body);
  const upstream = await fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(payload),
  });

  res.writeHead(upstream.status, {
    'Content-Type': upstream.headers.get('content-type') || 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  if (!upstream.body) return res.end();
  const reader = upstream.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    res.write(Buffer.from(value));
  }
  res.end();
}

function injectDefaultPrompt(body) {
  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    const err = new Error('请求体不是合法 JSON。');
    err.statusCode = 400;
    throw err;
  }

  if (!Array.isArray(payload.messages)) payload.messages = [];
  const prompt = readDefaultPrompt();
  if (prompt) {
    payload.messages = [{ role: 'system', content: prompt }, ...payload.messages];
  }
  return payload;
}

function readDefaultPrompt() {
  return readTextInsideRoot(DEFAULT_PROMPT_FILE);
}

function readTextInsideRoot(relativePath) {
  const file = path.resolve(ROOT, relativePath);
  if (!file.startsWith(ROOT) || !fs.existsSync(file)) return '';
  return fs.readFileSync(file, 'utf8').trim();
}

function getStatus() {
  const prompt = readDefaultPrompt();
  return {
    modelProxy: true,
    defaultSystemPrompt: {
      enabled: Boolean(prompt),
      chars: prompt.length,
      file: DEFAULT_PROMPT_FILE,
    },
  };
}

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
  const safePath = urlPath === '/' ? '/index.html' : urlPath;
  const file = path.normalize(path.join(ROOT, safePath));
  if (!file.startsWith(ROOT)) return sendJson(res, 403, { error: { message: 'Forbidden' } });
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return sendJson(res, 404, { error: { message: 'Not found' } });
  res.writeHead(200, { 'Content-Type': contentType(file) });
  fs.createReadStream(file).pipe(res);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 2_000_000) reject(new Error('Request body too large'));
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function contentType(file) {
  const ext = path.extname(file).toLowerCase();
  return {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
  }[ext] || 'application/octet-stream';
}

if (require.main === module) {
  server.listen(PORT, () => console.log(`DeepSeek Chat 已启动：http://localhost:${PORT}`));
}

module.exports = { server, injectDefaultPrompt, readDefaultPrompt };
