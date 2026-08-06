const path = require('path');
const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const fileUrl = 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');

  await page.goto(fileUrl);
  await page.evaluate(async () => {
    localStorage.clear();
    if (indexedDB.databases) {
      const dbs = await indexedDB.databases();
      await Promise.all(dbs.map((db) => db.name && new Promise((resolve) => {
        const req = indexedDB.deleteDatabase(db.name);
        req.onsuccess = req.onerror = req.onblocked = resolve;
      })));
    }
  });
  await page.reload();
  await page.waitForFunction(() => window.__chatAppDebug?.ready);

  const beforeReload = await page.evaluate(async () => {
    await window.__chatAppDebug.seedManySessions(8, 35, 60);
    await window.__chatAppDebug.flush();
    return {
      state: window.__chatAppDebug.getState(),
      localBytes: window.__chatAppDebug.getSavedBytes(),
      indexedDbCount: await window.__chatAppDebug.getIndexedDbSessionCount(),
    };
  });

  if (beforeReload.indexedDbCount !== 8) {
    throw new Error(`Expected 8 IndexedDB sessions before reload, got ${beforeReload.indexedDbCount}`);
  }
  if (beforeReload.localBytes > 180_000) {
    throw new Error(`Expected localStorage to keep only compact metadata, got ${beforeReload.localBytes} bytes`);
  }

  await page.reload();
  await page.waitForFunction(() => window.__chatAppDebug?.ready);

  const afterReload = await page.evaluate(() => {
    const state = window.__chatAppDebug.getState();
    return {
      sessionCount: state.sessions.length,
      activeMessages: state.sessions.find((s) => s.id === state.activeSessionId).messages.length,
      requestMessages: state.requestBody.messages.length,
    };
  });

  if (afterReload.sessionCount !== 8) {
    throw new Error(`Expected 8 sessions after reload, got ${afterReload.sessionCount}`);
  }
  if (afterReload.activeMessages !== 35) {
    throw new Error(`Expected active session messages after reload, got ${afterReload.activeMessages}`);
  }
  if (afterReload.requestMessages > 26) {
    throw new Error(`Expected context cap after IndexedDB reload, got ${afterReload.requestMessages}`);
  }

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
