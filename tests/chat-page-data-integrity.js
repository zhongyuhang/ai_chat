const { openChatTestPage } = require('./helpers/chat-test-page');

async function main() {
  const running = await openChatTestPage();

  try {
    const { page } = running;
    await page.evaluate(async () => {
      localStorage.clear();
      await idbClearSessions();
    });
    await page.reload();
    await page.waitForFunction(() => window.__chatAppDebug?.ready);

    const storage = await page.evaluate(async () => {
      const content = `${'不可丢失的正文。'.repeat(4000)}末尾校验标记`;
      await window.__chatAppDebug.seedMessages(165, content);
      const state = window.__chatAppDebug.getState();
      const active = state.sessions.find((session) => session.id === state.activeSessionId);
      const stored = (await idbGetAll()).find((session) => session.id === state.activeSessionId);
      const expectedLast = `164: ${content}`;
      return {
        liveCount: active.messages.length,
        storedCount: stored.messages.length,
        liveLastExact: active.messages.at(-1).content === expectedLast,
        storedLastExact: stored.messages.at(-1).content === expectedLast,
      };
    });

    if (storage.liveCount !== 165 || storage.storedCount !== 165) {
      throw new Error(`保存不得静默删除消息：${JSON.stringify(storage)}`);
    }
    if (!storage.liveLastExact || !storage.storedLastExact) {
      throw new Error(`保存不得静默截断正文：${JSON.stringify(storage)}`);
    }

    const compaction = await page.evaluate(async () => {
      const session = sessions.find((item) => item.id === activeSessionId);
      const before = session.messages.length;
      settings.recentLimit = 4;
      window.fetch = async (url, options) => {
        if (String(url).includes('/api/summarize')) {
          return { ok: true, json: async () => ({ summary: '可检索的上下文摘要' }) };
        }
        return fetch(url, options);
      };
      await summarizeContext();
      return { before, after: session.messages.length, summary: session.summary };
    });

    if (compaction.after !== compaction.before) {
      throw new Error(`压缩上下文只能改变发送视图，不能删除原始记录：${JSON.stringify(compaction)}`);
    }
    if (compaction.summary !== '可检索的上下文摘要') {
      throw new Error(`上下文摘要未保存：${JSON.stringify(compaction)}`);
    }
  } finally {
    await running.close();
  }

  console.log('chat-page-data-integrity PASS');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
