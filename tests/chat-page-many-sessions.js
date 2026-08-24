const { openChatTestPage } = require('./helpers/chat-test-page');

async function main() {
  const running = await openChatTestPage();
  const { page } = running;
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('[data-testid="model-label"]');

  const metrics = await page.evaluate(() => window.__chatAppDebug.measureManySessions(60, 80, 40));
  if (metrics.persistMs > 35) {
    throw new Error(`Expected many-session persist under 35ms, got ${metrics.persistMs.toFixed(1)}ms`);
  }
  if (metrics.indexBytes > 160_000) {
    throw new Error(`Expected compact session index under 160KB, got ${metrics.indexBytes}`);
  }
  if (metrics.renderSessionsMs > 35) {
    throw new Error(`Expected many-session render under 35ms, got ${metrics.renderSessionsMs.toFixed(1)}ms`);
  }
  if (metrics.sessionCount !== 60) {
    throw new Error(`Expected 60 sessions, got ${metrics.sessionCount}`);
  }

  await running.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
