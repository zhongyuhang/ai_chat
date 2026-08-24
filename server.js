const { loadConfig } = require('./src/legacy/config');
const {
  createApp,
  injectDefaultPrompt: injectPrompt,
  readDefaultPrompt: readPrompt,
  buildSummarizePayload,
} = require('./src/legacy/app');

const config = loadConfig({ root: __dirname });
const server = createApp(config);

function injectDefaultPrompt(body) {
  return injectPrompt(body, config);
}

function readDefaultPrompt() {
  return readPrompt(config);
}

if (require.main === module) {
  server.listen(config.port, config.host, () => {
    console.log(`DeepSeek Chat 已启动：http://${config.host}:${config.port}`);
  });
}

module.exports = {
  server,
  config,
  createApp,
  injectDefaultPrompt,
  readDefaultPrompt,
  buildSummarizePayload,
};
