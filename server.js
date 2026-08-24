const http = require('http');
const fs = require('fs');
const path = require('path');
const { loadConfig } = require('./src/legacy/config');

const ROOT = __dirname;
const config = loadConfig({ root: ROOT });
const PORT = config.port;
const DEEPSEEK_URL = config.deepseekUrl;
const DEFAULT_PROMPT_FILE = config.defaultPromptFile;

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'POST' && req.url === '/api/chat') return proxyChat(req, res);
    if (req.method === 'POST' && req.url === '/api/summarize') return proxySummarize(req, res);
    if (req.method === 'GET' && req.url === '/api/status') return sendJson(res, 200, getStatus());
    if (req.method === 'GET') return serveStatic(req, res);
    sendJson(res, 405, { error: { message: 'Method not allowed' } });
  } catch (err) {
    sendJson(res, err.statusCode || 500, { error: { message: err.message } });
  }
});

async function proxyChat(req, res) {
  const apiKey = config.apiKey;
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

const SUMMARIZE_INSTRUCTION = `你是小说创作辅助工具中的上下文压缩模块。
请阅读下面的对话记录，整理成一份简洁、结构化、可继续创作的中文摘要。
要求：
1. 用简体中文输出，直接给摘要正文，不要任何开场白或解释。
2. 按以下五个小节组织（每节用“# 小节名”开头）：
# 剧情主线
# 角色与状态
# 已确定的设定
# 未解决事项与钩子
# 最新进展
3. 保留关键人名、地名、目标、已发生的决定；省略重复和客套话。
4. 若某小节无内容，写“无”或整节省略。
5. 总长度控制在 500 字以内。`;

function buildSummarizePayload(messages, existingSummary, model) {
  const msgs = Array.isArray(messages) ? messages.filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim()) : [];
  const text = msgs.map((m) => `${m.role === 'user' ? '用户' : '助手'}：${m.content.trim()}`).join('\n\n');
  const context = [existingSummary ? `已有摘要：\n${existingSummary}` : '', text].filter(Boolean).join('\n\n');
  return {
    model,
    stream: false,
    temperature: 0.3,
    max_tokens: 1000,
    messages: [
      { role: 'system', content: SUMMARIZE_INSTRUCTION },
      { role: 'user', content: `请压缩以下对话记录：\n\n${context.slice(0, 60000)}` },
    ],
  };}

async function proxySummarize(req, res) {
  const apiKey = config.apiKey;
  if (!apiKey) return sendJson(res, 500, { error: { message: '缺少 DEEPSEEK_API_KEY，请在 .env 中配置。' } });

  const body = await readBody(req);
  let payload;
  try {
    const json = JSON.parse(body);
    if (!Array.isArray(json.messages) || json.messages.length === 0) {
      return sendJson(res, 400, { error: { message: '缺少 messages 数组。' } });
    }
    payload = buildSummarizePayload(json.messages, json.summary, json.model || 'deepseek-v4-flash');
  } catch (err) {
    return sendJson(res, 400, { error: { message: '请求体不合法或缺少 messages。' } });
  }

  let upstream;
  try {
    upstream = await fetch(DEEPSEEK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    return sendJson(res, 502, { error: { message: `上游请求失败：${err.message}` } });
  }

  if (!upstream.ok) {
    return sendJson(res, upstream.status, { error: { message: `DeepSeek 摘要请求失败：HTTP ${upstream.status}` } });
  }

  const data = await upstream.json().catch(() => null);
  const summary = data?.choices?.[0]?.message?.content;
  if (typeof summary !== 'string' || !summary.trim()) {
    return sendJson(res, 502, { error: { message: 'DeepSeek 未返回可用的摘要内容。' } });
  }
  sendJson(res, 200, { summary: summary.trim() });
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
  server.listen(PORT, config.host, () => console.log(`DeepSeek Chat 已启动：http://${config.host}:${PORT}`));
}

module.exports = { server, config, injectDefaultPrompt, readDefaultPrompt, buildSummarizePayload };
