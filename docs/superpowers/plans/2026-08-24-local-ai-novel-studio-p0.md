# Local AI Novel Studio P0 Security And Data Protection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the current local DeepSeek writing app safe to run and incapable of silently destroying accepted writing before the modular studio migration begins.

**Architecture:** Keep the current native Node server and single-page client for this phase so the working app remains available. Extract security- and stream-sensitive behavior into focused CommonJS modules with injectable dependencies, then cover the real HTTP server and browser page with regression tests. P1 will build the TypeScript/Fastify studio on top of this safe baseline.

**Tech Stack:** Node.js 24, native `http`, browser JavaScript, Marked, DOMPurify, Playwright, Node `assert`.

**Spec:** `docs/superpowers/specs/2026-08-24-local-ai-novel-studio-design.md`

## Global Constraints

- The application remains local-only and binds to `127.0.0.1` by default.
- Text generation uses DeepSeek only.
- Existing sessions and the current summarize endpoint remain usable.
- API keys, `.env`, Git data, source files, tests, prompts, and project data are never served as static files.
- Accepted messages are never truncated or removed as a side effect of persistence.
- Every production behavior is preceded by a failing regression test.
- Existing user changes in `index.html`, `server.js`, `package.json`, and untracked tests must be preserved.

---

## File Map

- `server.js`: Thin process entry point and compatibility exports.
- `src/legacy/config.js`: Load `.env` before deriving validated runtime configuration.
- `src/legacy/security.js`: Origin/host checks, static allowlist, path containment, and security headers.
- `src/legacy/deepseek-client.js`: Upstream timeout, cancellation, request, and stream forwarding.
- `src/legacy/app.js`: Create the native HTTP application with injected configuration and client.
- `index.html`: Use local pinned Markdown dependencies, sanitize rendered output, and persist without mutating live sessions.
- `tests/helpers/test-server.js`: Start and stop an ephemeral real HTTP server.
- `tests/server-security-test.js`: Real HTTP tests for file disclosure, origin enforcement, and headers.
- `tests/server-config-test.js`: Configuration-order and loopback-default tests.
- `tests/server-stream-test.js`: Timeout, cancellation, and normalized upstream failure tests.
- `tests/chat-page-security.js`: Browser tests for sanitized Markdown and import rendering.
- `tests/chat-page-data-integrity.js`: Browser tests proving persistence does not truncate live or stored prose.

---

### Task 1: Lock Down Configuration And The Listening Interface

**Files:**
- Create: `src/legacy/config.js`
- Create: `tests/server-config-test.js`
- Modify: `server.js`
- Modify: `.env.example`
- Modify: `package.json`

**Interfaces:**
- Produces: `loadEnvFile(root, env)` and `loadConfig({ root, env })`.
- Produces: `RuntimeConfig = { root, host, port, deepseekUrl, apiKey, defaultPromptFile, upstreamTimeoutMs }`.
- Consumed by: Task 3 `createApp(config, dependencies)` and Task 4 `createDeepSeekClient(config)`.

- [ ] **Step 1: Write the failing configuration test**

```js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadConfig } = require('../src/legacy/config');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'novel-config-'));
fs.writeFileSync(path.join(root, '.env'), [
  'PORT=4312',
  'HOST=127.0.0.1',
  'DEEPSEEK_API_URL=https://example.invalid/chat',
  'DEFAULT_SYSTEM_PROMPT_FILE=prompts/custom.txt',
].join('\n'));

const config = loadConfig({ root, env: {} });
assert.strictEqual(config.port, 4312);
assert.strictEqual(config.host, '127.0.0.1');
assert.strictEqual(config.deepseekUrl, 'https://example.invalid/chat');
assert.strictEqual(config.defaultPromptFile, 'prompts/custom.txt');
assert.strictEqual(loadConfig({ root, env: { PORT: '4999' } }).port, 4999);
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node tests/server-config-test.js`

Expected: FAIL with `Cannot find module '../src/legacy/config'`.

- [ ] **Step 3: Implement environment loading before configuration derivation**

```js
const fs = require('fs');
const path = require('path');

function loadEnvFile(root, env) {
  const next = { ...env };
  const file = path.join(root, '.env');
  if (!fs.existsSync(file)) return next;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || next[match[1]] !== undefined) continue;
    next[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
  return next;
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
    defaultPromptFile: loaded.DEFAULT_SYSTEM_PROMPT_FILE || 'prompts/default-system-prompt.txt',
    upstreamTimeoutMs: integer(loaded.UPSTREAM_TIMEOUT_MS, 120000, 1000, 600000),
  });
}

module.exports = { loadEnvFile, loadConfig };
```

- [ ] **Step 4: Make `server.js` derive configuration through `loadConfig` and listen on `config.host`**

```js
const { loadConfig } = require('./src/legacy/config');
const { createApp } = require('./src/legacy/app');

const config = loadConfig({ root: __dirname });
const server = createApp(config);

if (require.main === module) {
  server.listen(config.port, config.host, () => {
    console.log(`AI 小说工作台已启动：http://${config.host}:${config.port}`);
  });
}
```

Add `HOST=127.0.0.1`, `DEEPSEEK_API_URL`, and `UPSTREAM_TIMEOUT_MS=120000` to `.env.example` without adding a real key.

- [ ] **Step 5: Verify GREEN and the complete syntax suite**

Run: `node tests/server-config-test.js && npm run check`

Expected: PASS with exit code 0.

- [ ] **Step 6: Commit only Task 1 files**

```powershell
git add -- src/legacy/config.js tests/server-config-test.js server.js .env.example package.json
git commit -m "fix: load local server config before startup"
```

---

### Task 2: Add Static-File And Browser-Origin Security

**Files:**
- Create: `src/legacy/security.js`
- Create: `tests/helpers/test-server.js`
- Create: `tests/server-security-test.js`
- Modify: `src/legacy/app.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: `RuntimeConfig` from Task 1.
- Produces: `securityHeaders()`, `isAllowedOrigin(req, config)`, and `resolveStaticAsset(urlPath, config)`.
- Produces: `startTestServer(server)` returning `{ baseUrl, close }`.

- [ ] **Step 1: Write the failing real-server disclosure test**

```js
const assert = require('assert');
const { loadConfig } = require('../src/legacy/config');
const { createApp } = require('../src/legacy/app');
const { startTestServer } = require('./helpers/test-server');

(async () => {
  const config = loadConfig({ root: require('path').resolve(__dirname, '..'), env: {} });
  const running = await startTestServer(createApp(config));
  try {
    for (const target of ['/.env', '/.git/config', '/server.js', '/package.json', '/prompts/default-system-prompt.txt']) {
      const response = await fetch(running.baseUrl + target);
      assert.strictEqual(response.status, 404, target);
    }
    const page = await fetch(running.baseUrl + '/');
    assert.strictEqual(page.status, 200);
    assert.strictEqual(page.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(page.headers.get('content-security-policy').includes("default-src 'self'"));

    const hostile = await fetch(running.baseUrl + '/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'x' }] }),
    });
    assert.strictEqual(hostile.status, 403);
  } finally {
    await running.close();
  }
})();
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node tests/server-security-test.js`

Expected: FAIL because `/.env` returns 200 or because `src/legacy/app.js` does not exist.

- [ ] **Step 3: Implement an explicit static allowlist and security headers**

```js
const path = require('path');

const PUBLIC_FILES = new Map([
  ['/', 'index.html'],
  ['/index.html', 'index.html'],
  ['/vendor/marked.min.js', 'node_modules/marked/marked.min.js'],
  ['/vendor/purify.min.js', 'node_modules/dompurify/dist/purify.min.js'],
]);

function resolveStaticAsset(urlPath, config) {
  const relative = PUBLIC_FILES.get(urlPath);
  if (!relative) return null;
  const file = path.resolve(config.root, relative);
  const rootWithSeparator = path.resolve(config.root) + path.sep;
  return file.startsWith(rootWithSeparator) ? file : null;
}

function securityHeaders() {
  return {
    'Content-Security-Policy': "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  };
}

function isAllowedOrigin(req, config) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    return parsed.hostname === config.host && Number(parsed.port || 80) === config.port;
  } catch {
    return false;
  }
}

module.exports = { resolveStaticAsset, securityHeaders, isAllowedOrigin };
```

- [ ] **Step 4: Create the injectable HTTP app and ephemeral-server helper**

```js
function startTestServer(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({
        baseUrl: `http://127.0.0.1:${address.port}`,
        close: () => new Promise((done, fail) => server.close((error) => error ? fail(error) : done())),
      });
    });
  });
}
```

In `createApp`, apply `securityHeaders()` to every response, reject hostile origins before any `/api/` handler, require JSON for POST APIs, and serve only `resolveStaticAsset()` results.

- [ ] **Step 5: Verify GREEN and prove the process is loopback-only**

Run: `node tests/server-security-test.js && npm test`

Expected: All listed private paths return 404, hostile origin returns 403, and the regression suite passes.

- [ ] **Step 6: Commit Task 2**

```powershell
git add -- src/legacy/security.js src/legacy/app.js tests/helpers/test-server.js tests/server-security-test.js package.json
git commit -m "fix: restrict local server files and origins"
```

---

### Task 3: Sanitize All Rendered Assistant Markdown

**Files:**
- Modify: `package.json`
- Modify: `index.html`
- Create: `tests/chat-page-security.js`
- Modify: `tests/chat-page-smoke.js`

**Interfaces:**
- Consumes: exact vendor routes from Task 2.
- Produces: `renderMarkdown(message)` that returns DOMPurify-sanitized HTML.
- Produces: `window.__chatAppDebug.renderMarkdownForTest(source)` for browser regression tests.

- [ ] **Step 1: Add local runtime dependencies and write the failing browser test**

Add pinned runtime dependencies `marked` and `dompurify` to `package.json`, then write:

```js
const { chromium } = require('playwright');
const { loadConfig } = require('../src/legacy/config');
const { createApp } = require('../src/legacy/app');
const { startTestServer } = require('./helpers/test-server');

(async () => {
  const running = await startTestServer(createApp(loadConfig({ root: require('path').resolve(__dirname, '..'), env: {} })));
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(running.baseUrl);
    const html = await page.evaluate(() => window.__chatAppDebug.renderMarkdownForTest([
      '# 标题',
      '<img src=x onerror="window.__xss=1">',
      '<script>window.__xss=2</script>',
      '[危险链接](javascript:window.__xss=3)',
    ].join('\n')));
    if (/<script|onerror|javascript:/i.test(html)) throw new Error(html);
    if (!html.includes('<h1>标题</h1>')) throw new Error('Markdown heading was lost');
    if (await page.evaluate(() => window.__xss)) throw new Error('XSS executed');
  } finally {
    await browser.close();
    await running.close();
  }
})();
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node tests/chat-page-security.js`

Expected: FAIL because `renderMarkdownForTest` is missing or dangerous attributes remain.

- [ ] **Step 3: Replace the mutable CDN script with local Marked and DOMPurify assets**

```html
<script src="/vendor/marked.min.js"></script>
<script src="/vendor/purify.min.js"></script>
```

Implement:

```js
function markdownToSafeHtml(source) {
  const parsed = window.marked
    ? marked.parse(source || '正在生成...', { breaks: true, gfm: true })
    : escapeHtml(source || '正在生成...');
  return window.DOMPurify
    ? DOMPurify.sanitize(parsed, {
        USE_PROFILES: { html: true },
        FORBID_TAGS: ['style', 'iframe', 'object', 'embed', 'form'],
        FORBID_ATTR: ['style'],
      })
    : escapeHtml(source || '正在生成...');
}

function renderMarkdown(message) {
  const cached = mdCache.get(message);
  if (cached && cached.source === message.content) return cached.html;
  const html = markdownToSafeHtml(message.content);
  mdCache.set(message, { source: message.content, html });
  return html;
}
```

- [ ] **Step 4: Move all Playwright page tests from `file://` to the real test server**

Replace each `page.goto(fileUrl)` setup with `startTestServer(createApp(testConfig))` and close the server in `finally`. This proves local vendor scripts, CSP, status routes, and the actual origin work together.

- [ ] **Step 5: Verify GREEN**

Run: `npm install && node tests/chat-page-security.js && npm test`

Expected: Sanitization test and all browser tests pass without external CDN access.

- [ ] **Step 6: Commit Task 3**

```powershell
git add -- package.json package-lock.json index.html tests/chat-page-security.js tests/chat-page-smoke.js tests/chat-page-long-session.js tests/chat-page-many-sessions.js tests/chat-page-indexeddb.js tests/chat-page-context-budget.js
git commit -m "fix: sanitize assistant markdown rendering"
```

---

### Task 4: Remove Silent Message And Manuscript Truncation

**Files:**
- Modify: `index.html`
- Create: `tests/chat-page-data-integrity.js`
- Modify: `package.json`

**Interfaces:**
- Produces: `snapshotSessionForStorage(session)` returning a deep storage copy without changing the live session.
- Changes: `persist()` stores full accepted message content in IndexedDB and compact metadata only in localStorage.
- Consumed by: P1 migration, which relies on preserved legacy records.

- [ ] **Step 1: Write the failing integrity test**

```js
const longText = '不可截断的正文。'.repeat(7000);
const result = await page.evaluate(async (text) => {
  await window.__chatAppDebug.seedMessages(200, text);
  await window.__chatAppDebug.flush();
  const state = window.__chatAppDebug.getState();
  const stored = await window.__chatAppDebug.getIndexedDbSession(state.activeSessionId);
  return {
    liveCount: state.sessions[0].messages.length,
    liveLast: state.sessions[0].messages.at(-1).content,
    storedCount: stored.messages.length,
    storedLast: stored.messages.at(-1).content,
  };
}, longText);

if (result.liveCount !== 200 || result.storedCount !== 200) throw new Error(JSON.stringify(result));
if (result.liveLast !== longText || result.storedLast !== longText) throw new Error('正文被截断');
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node tests/chat-page-data-integrity.js`

Expected: FAIL because live or stored messages are capped at 160 and content is capped at 30,000 characters.

- [ ] **Step 3: Replace destructive trimming with non-mutating snapshots**

```js
function snapshotSessionForStorage(session) {
  return {
    ...session,
    messages: session.messages.map((message) => ({ ...message })),
  };
}

function persist() {
  const dirty = [...dirtySessions]
    .map((id) => sessions.find((session) => session.id === id))
    .filter(Boolean)
    .map(snapshotSessionForStorage);
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessionIndex(sessions)));
  localStorage.setItem(ACTIVE_KEY, activeSessionId);
  dirtySessions.clear();
  lastPersistPromise = idbPutSessions(dirty).catch((error) => {
    for (const session of dirty) dirtySessions.add(session.id);
    throw error;
  });
}
```

Remove `trimForStorage`, `MAX_SESSION_MESSAGES`, `MAX_MESSAGE_CHARS`, and every catch block that mutates `s.messages` or `m.content` to recover from quota errors. Quota failure must show a blocking status and retain the live state.

- [ ] **Step 4: Add test access to a single IndexedDB session without exposing it in production builds later**

```js
getIndexedDbSession: async (id) => {
  const items = await idbGetAll();
  return items.find((item) => item.id === id) || null;
}
```

- [ ] **Step 5: Verify GREEN and performance**

Run: `node tests/chat-page-data-integrity.js && node tests/chat-page-long-session.js && node tests/chat-page-many-sessions.js`

Expected: Full content is preserved; DOM windowing and compact localStorage metadata remain within their current performance thresholds.

- [ ] **Step 6: Commit Task 4**

```powershell
git add -- index.html tests/chat-page-data-integrity.js package.json
git commit -m "fix: preserve complete local writing history"
```

---

### Task 5: Enforce Upstream Timeout And Client Cancellation

**Files:**
- Create: `src/legacy/deepseek-client.js`
- Create: `tests/server-stream-test.js`
- Modify: `src/legacy/app.js`
- Modify: `server.js`

**Interfaces:**
- Consumes: `RuntimeConfig.deepseekUrl`, `apiKey`, and `upstreamTimeoutMs`.
- Produces: `createDeepSeekClient({ config, fetchImpl })` with `request(payload, clientSignal)`.
- Produces normalized errors with `{ statusCode, code, message, retryable }`.

- [ ] **Step 1: Write failing timeout and cancellation tests**

```js
const assert = require('assert');
const { createDeepSeekClient } = require('../src/legacy/deepseek-client');

(async () => {
  const hangingFetch = (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  });
  const client = createDeepSeekClient({
    config: { deepseekUrl: 'https://example.invalid', apiKey: 'test', upstreamTimeoutMs: 20 },
    fetchImpl: hangingFetch,
  });
  await assert.rejects(client.request({ messages: [] }), (error) => error.code === 'UPSTREAM_TIMEOUT');

  const controller = new AbortController();
  const pending = client.request({ messages: [] }, controller.signal);
  controller.abort();
  await assert.rejects(pending, (error) => error.code === 'CLIENT_CANCELLED');
})();
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node tests/server-stream-test.js`

Expected: FAIL with missing `src/legacy/deepseek-client.js`.

- [ ] **Step 3: Implement composed timeout and caller cancellation**

```js
function createDeepSeekClient({ config, fetchImpl = fetch }) {
  async function request(payload, clientSignal) {
    const timeoutController = new AbortController();
    const timeout = setTimeout(() => timeoutController.abort('timeout'), config.upstreamTimeoutMs);
    const onClientAbort = () => timeoutController.abort('client');
    clientSignal?.addEventListener('abort', onClientAbort, { once: true });
    try {
      return await fetchImpl(config.deepseekUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify(payload),
        signal: timeoutController.signal,
      });
    } catch (error) {
      if (timeoutController.signal.aborted) {
        const cancelled = clientSignal?.aborted;
        throw Object.assign(new Error(cancelled ? '请求已取消' : 'DeepSeek 请求超时'), {
          statusCode: cancelled ? 499 : 504,
          code: cancelled ? 'CLIENT_CANCELLED' : 'UPSTREAM_TIMEOUT',
          retryable: !cancelled,
        });
      }
      throw Object.assign(new Error('无法连接 DeepSeek'), { statusCode: 502, code: 'UPSTREAM_NETWORK', retryable: true });
    } finally {
      clearTimeout(timeout);
      clientSignal?.removeEventListener('abort', onClientAbort);
    }
  }
  return { request };
}

module.exports = { createDeepSeekClient };
```

- [ ] **Step 4: Connect request lifecycle to the upstream signal**

Create an `AbortController` per incoming API request. Abort it on `req.aborted` and only on premature `res.close`; do not treat a normally completed response as cancellation. Reuse the same client for chat and summarize routes.

- [ ] **Step 5: Verify GREEN and all API tests**

Run: `node tests/server-stream-test.js && node tests/server-prompt-test.js && node tests/server-summarize-test.js && npm test`

Expected: timeout maps to 504, cancellation maps to 499 internally without writing after close, and all existing prompt/summary contracts pass.

- [ ] **Step 6: Commit Task 5**

```powershell
git add -- src/legacy/deepseek-client.js src/legacy/app.js tests/server-stream-test.js server.js
git commit -m "fix: bound and cancel DeepSeek requests"
```

---

### Task 6: Close P0 With Real-Server Regression Coverage

**Files:**
- Modify: `package.json`
- Modify: `README.md`
- Modify: `.env.example`
- Test: all `tests/server-*.js` and `tests/chat-page-*.js`

**Interfaces:**
- Consumes all P0 modules.
- Produces the stable commands `npm run check`, `npm run test:security`, and `npm test`.

- [ ] **Step 1: Add the final P0 command contract to a failing package-script assertion**

In `tests/package-contract-test.js`, assert:

```js
const assert = require('assert');
const pkg = require('../package.json');
assert.ok(pkg.scripts['test:security'].includes('server-security-test.js'));
assert.ok(pkg.scripts.test.includes('chat-page-data-integrity.js'));
assert.ok(pkg.scripts.check.includes('src/legacy/app.js'));
```

- [ ] **Step 2: Run the contract test and verify RED**

Run: `node tests/package-contract-test.js`

Expected: FAIL because the scripts are not registered.

- [ ] **Step 3: Register complete scripts and document local startup**

```json
{
  "scripts": {
    "start": "node server.js",
    "test:security": "node tests/server-config-test.js && node tests/server-security-test.js && node tests/server-stream-test.js && node tests/chat-page-security.js && node tests/chat-page-data-integrity.js",
    "test": "node tests/package-contract-test.js && npm run test:security && node tests/server-prompt-test.js && node tests/server-summarize-test.js && node tests/chat-page-smoke.js && node tests/chat-page-context-budget.js && node tests/chat-page-long-session.js && node tests/chat-page-many-sessions.js && node tests/chat-page-indexeddb.js",
    "check": "node --check server.js && node --check src/legacy/config.js && node --check src/legacy/security.js && node --check src/legacy/deepseek-client.js && node --check src/legacy/app.js"
  }
}
```

Document `npm install`, `.env` keys, `npm start`, loopback-only behavior, backup expectations, and the security-test command in `README.md`.

- [ ] **Step 4: Run the complete P0 gate**

Run: `npm run check && npm run test:security && npm test && npm audit --omit=dev`

Expected: Every command exits 0; audit reports zero known production vulnerabilities.

- [ ] **Step 5: Manually verify the listening address without making a model request**

Run the server, then run:

```powershell
netstat -ano | Select-String '127.0.0.1:3000.*LISTENING'
```

Expected: a loopback listener exists and there is no `0.0.0.0:3000` or `[::]:3000` listener for the process.

- [ ] **Step 6: Commit P0 completion**

```powershell
git add -- package.json package-lock.json README.md .env.example tests/package-contract-test.js
git commit -m "test: enforce P0 local security gate"
```

## P0 Completion Gate

P0 is complete only when:

- `/.env`, `/.git/config`, `/server.js`, `/package.json`, and prompt paths return 404.
- Hostile browser origins cannot call APIs.
- Markdown payloads cannot retain scripts, event attributes, or JavaScript URLs.
- 200 messages and messages exceeding 30,000 characters remain byte-for-byte intact in live and IndexedDB state.
- DeepSeek calls time out and cancel deterministically.
- The server listens on loopback only.
- The existing summarize, context, session, long-session, many-session, and IndexedDB suites still pass.

