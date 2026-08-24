const { openChatTestPage } = require('./helpers/chat-test-page');

async function main() {
  const running = await openChatTestPage();
  const { page } = running;
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('[data-testid="model-label"]');

  const result = await page.evaluate(() => {
    const metrics = window.__chatAppDebug.measureLongSession(120, 120);
    return {
      elapsed: metrics.renderAllMs,
      renderedMessages: metrics.domMessages,
      savedBytes: metrics.savedBytes,
      contextMessages: window.__chatAppDebug.getState().requestBody.messages.length,
      metrics,
    };
  });

  if (result.elapsed > 250) {
    throw new Error(`Expected long-session render under 250ms, got ${result.elapsed.toFixed(1)}ms: ${JSON.stringify(result.metrics)}`);
  }
  if (result.renderedMessages > 45) {
    throw new Error(`Expected DOM window to cap rendered messages, got ${result.renderedMessages}`);
  }
  if (result.savedBytes > 4_500_000) {
    throw new Error(`Expected storage footprint under 4.5MB, got ${result.savedBytes}`);
  }
  if (result.contextMessages > 26) {
    throw new Error(`Expected context message cap, got ${result.contextMessages}`);
  }

  await running.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
