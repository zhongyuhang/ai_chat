# Chat Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build persistent settings and multi-session chat history into the local DeepSeek writing page.

**Architecture:** Replace the existing HTML with a single-file app whose JavaScript owns settings, sessions, rendering, streaming requests, and import/export. Add a Playwright smoke test for local behavior.

**Tech Stack:** HTML, CSS, browser JavaScript, localStorage, Fetch streaming, marked.js, Playwright.

## Global Constraints

- Model must be `deepseek-v4-flash`.
- No backend is added.
- Settings and sessions persist in browser localStorage.
- Remote API is not called by tests.

---

### Task 1: Page Shell And State

**Files:**
- Modify: `index.html`
- Create: `tests/chat-page-smoke.js`

**Interfaces:**
- Produces `window.__chatAppDebug` with `getState()` for smoke tests.
- Produces localStorage keys `deepseek_writer_settings_v2`, `deepseek_writer_sessions_v2`, and `deepseek_writer_active_session_v2`.

- [ ] Write Playwright smoke test that opens `index.html`, checks the model label, saves temperature `0.70`, creates a session, and verifies state is persisted after reload.
- [ ] Run `node tests/chat-page-smoke.js` and confirm it fails before implementation.
- [ ] Replace the page shell with readable Chinese UI, sidebar sessions, settings controls, composer, and action buttons.
- [ ] Implement settings/session localStorage helpers and rendering.
- [ ] Run the smoke test and confirm it passes.

### Task 2: Chat Request Flow

**Files:**
- Modify: `index.html`

**Interfaces:**
- `buildRequestBody(messages)` returns `{ model, messages, stream, temperature, top_p, max_tokens, reasoning_effort, user? }`.
- `sendMessage()` appends the user message, streams assistant text, updates the active session, and persists it.

- [ ] Add request payload construction from saved settings and active session history.
- [ ] Add streaming reader with stop generation via `AbortController`.
- [ ] Add error display, disabled states, and auto session title from first user message.
- [ ] Re-run smoke test and syntax checks.

### Task 3: Session Utilities

**Files:**
- Modify: `index.html`

**Interfaces:**
- `newSession()`, `renameSession()`, `deleteSession()`, `clearSession()`, `exportSession()`, `importSessionFile(file)`.

- [ ] Add session management commands and buttons.
- [ ] Add JSON import/export for the active session.
- [ ] Add clear chat behavior that preserves the session.
- [ ] Re-run smoke test.
