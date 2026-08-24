const http = require('http');
const fs = require('fs');
const path = require('path');
const { resolveStaticAsset, securityHeaders, isAllowedOrigin, isJsonRequest } = require('./security');
const { createDeepSeekClient } = require('./deepseek-client');

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

function createApp(config, dependencies = {}) {
  const fetchImpl = dependencies.fetchImpl || fetch;
  const deepSeekClient = dependencies.deepSeekClient || createDeepSeekClient({ config, fetchImpl });
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || `${config.host}:${config.port}`}`);
      const pathname = decodeURIComponent(url.pathname);

      if (pathname.startsWith('/api/')) {
        if (!isAllowedOrigin(req)) {
          return sendJson(res, 403, { error: { code: 'ORIGIN_FORBIDDEN', message: '请求来源不受信任。', retryable: false } });
        }
        if (req.method === 'POST' && !isJsonRequest(req)) {
          return sendJson(res, 415, { error: { code: 'JSON_REQUIRED', message: '接口只接受 application/json。', retryable: false } });
        }
      }

      if (req.method === 'POST' && pathname === '/api/chat') {
        await withClientCancellation(req, res, (signal) => proxyChat(req, res, config, deepSeekClient, signal));
        return;
      }
      if (req.method === 'POST' && pathname === '/api/summarize') {
        await withClientCancellation(req, res, (signal) => proxySummarize(req, res, config, deepSeekClient, signal));
        return;
      }
      if (req.method === 'GET' && pathname === '/api/status') return sendJson(res, 200, getStatus(config));
      if (req.method === 'GET') return serveStatic(pathname, res, config);
      return sendJson(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed', retryable: false } });
    } catch (error) {
      if (res.destroyed || res.headersSent || res.writableEnded) return res.destroy(error);
      return sendJson(res, error.statusCode || 500, {
        error: { code: error.code || 'INTERNAL_ERROR', message: error.message, retryable: Boolean(error.retryable) },
      });
    }
  });
}

async function proxyChat(req, res, config, deepSeekClient, clientSignal) {
  if (!config.apiKey) return sendJson(res, 500, { error: { code: 'API_KEY_MISSING', message: '缺少 DEEPSEEK_API_KEY，请在 .env 中配置。', retryable: false } });
  const body = await readBody(req);
  const payload = injectDefaultPrompt(body, config);
  const upstream = await deepSeekClient.request(payload, clientSignal);
  if (!upstream.ok) {
    throw httpError(upstream.status, 'UPSTREAM_HTTP', `DeepSeek 请求失败：HTTP ${upstream.status}`, upstream.status >= 500 || upstream.status === 429);
  }
  writeHead(res, upstream.status, {
    'Content-Type': upstream.headers.get('content-type') || 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  if (!upstream.body) return res.end();
  const reader = upstream.body.getReader();
  const cancelReader = () => reader.cancel().catch(() => {});
  clientSignal?.addEventListener('abort', cancelReader, { once: true });
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done || clientSignal?.aborted) break;
      res.write(Buffer.from(value));
    }
  } finally {
    clientSignal?.removeEventListener('abort', cancelReader);
  }
  if (!res.destroyed) res.end();
}

function injectDefaultPrompt(body, config) {
  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    throw httpError(400, 'INVALID_JSON', '请求体不是合法 JSON。');
  }
  if (!Array.isArray(payload.messages)) payload.messages = [];
  const prompt = readDefaultPrompt(config);
  if (prompt) payload.messages = [{ role: 'system', content: prompt }, ...payload.messages];
  return payload;
}

function buildSummarizePayload(messages, existingSummary, model) {
  const valid = Array.isArray(messages)
    ? messages.filter((message) => message && (message.role === 'user' || message.role === 'assistant') && typeof message.content === 'string' && message.content.trim())
    : [];
  const transcript = valid.map((message) => `${message.role === 'user' ? '用户' : '助手'}：${message.content.trim()}`).join('\n\n');
  const context = [existingSummary ? `已有摘要：\n${existingSummary}` : '', transcript].filter(Boolean).join('\n\n');
  return {
    model,
    stream: false,
    temperature: 0.3,
    max_tokens: 1000,
    messages: [
      { role: 'system', content: SUMMARIZE_INSTRUCTION },
      { role: 'user', content: `请压缩以下对话记录：\n\n${context.slice(0, 60000)}` },
    ],
  };
}

async function proxySummarize(req, res, config, deepSeekClient, clientSignal) {
  if (!config.apiKey) return sendJson(res, 500, { error: { code: 'API_KEY_MISSING', message: '缺少 DEEPSEEK_API_KEY，请在 .env 中配置。', retryable: false } });
  const body = await readBody(req);
  let json;
  try {
    json = JSON.parse(body);
  } catch {
    return sendJson(res, 400, { error: { code: 'INVALID_JSON', message: '请求体不合法或缺少 messages。', retryable: false } });
  }
  if (!Array.isArray(json.messages) || json.messages.length === 0) {
    return sendJson(res, 400, { error: { code: 'MESSAGES_REQUIRED', message: '缺少 messages 数组。', retryable: false } });
  }
  const payload = buildSummarizePayload(json.messages, json.summary, json.model || 'deepseek-v4-flash');
  const upstream = await deepSeekClient.request(payload, clientSignal);
  if (!upstream.ok) {
    return sendJson(res, upstream.status, { error: { code: 'UPSTREAM_HTTP', message: `DeepSeek 摘要请求失败：HTTP ${upstream.status}`, retryable: upstream.status >= 500 } });
  }
  const data = await upstream.json().catch(() => null);
  const summary = data?.choices?.[0]?.message?.content;
  if (typeof summary !== 'string' || !summary.trim()) {
    return sendJson(res, 502, { error: { code: 'UPSTREAM_INVALID_RESPONSE', message: 'DeepSeek 未返回可用的摘要内容。', retryable: true } });
  }
  return sendJson(res, 200, { summary: summary.trim() });
}

async function withClientCancellation(req, res, handler) {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  const cancelOnPrematureClose = () => {
    if (!res.writableEnded) cancel();
  };
  req.once('aborted', cancel);
  res.once('close', cancelOnPrematureClose);
  try {
    return await handler(controller.signal);
  } finally {
    req.removeListener('aborted', cancel);
    res.removeListener('close', cancelOnPrematureClose);
  }
}

function readDefaultPrompt(config) {
  return readTextInsideRoot(config.defaultPromptFile, config);
}

function readTextInsideRoot(relativePath, config) {
  const root = path.resolve(config.root);
  const file = path.resolve(root, relativePath);
  const rootWithSeparator = root.endsWith(path.sep) ? root : root + path.sep;
  if (!file.startsWith(rootWithSeparator) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return '';
  return fs.readFileSync(file, 'utf8').trim();
}

function getStatus(config) {
  const prompt = readDefaultPrompt(config);
  return { modelProxy: true, defaultSystemPrompt: { enabled: Boolean(prompt), chars: prompt.length, file: config.defaultPromptFile } };
}

function serveStatic(pathname, res, config) {
  const file = resolveStaticAsset(pathname, config);
  if (!file) return sendJson(res, 404, { error: { code: 'NOT_FOUND', message: 'Not found', retryable: false } });
  writeHead(res, 200, { 'Content-Type': contentType(file), 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    let settled = false;
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      if (settled) return;
      data += chunk;
      if (Buffer.byteLength(data, 'utf8') > 2_000_000) {
        settled = true;
        reject(httpError(413, 'BODY_TOO_LARGE', 'Request body too large'));
      }
    });
    req.on('end', () => {
      if (!settled) resolve(data);
    });
    req.on('error', (error) => {
      if (!settled) reject(error);
    });
  });
}

function httpError(statusCode, code, message, retryable = false) {
  return Object.assign(new Error(message), { statusCode, code, retryable });
}

function writeHead(res, status, headers = {}) {
  res.writeHead(status, { ...securityHeaders(), ...headers });
}

function sendJson(res, status, data) {
  writeHead(res, status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

function contentType(file) {
  const ext = path.extname(file).toLowerCase();
  return { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8' }[ext] || 'application/octet-stream';
}

module.exports = { createApp, injectDefaultPrompt, readDefaultPrompt, buildSummarizePayload };
