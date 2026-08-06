const { injectDefaultPrompt, readDefaultPrompt } = require('../server');

const prompt = readDefaultPrompt();
if (!prompt || prompt.length < 1000) {
  throw new Error(`Expected default system prompt to be loaded, got ${prompt.length} chars`);
}

const payload = injectDefaultPrompt(JSON.stringify({
  model: 'deepseek-v4-flash',
  messages: [{ role: 'user', content: 'hello' }],
}));

if (payload.messages[0].role !== 'system') {
  throw new Error('Expected first message to be system');
}
if (payload.messages[0].content !== prompt) {
  throw new Error('Expected injected prompt to match default prompt file');
}
if (payload.messages[1].role !== 'user' || payload.messages[1].content !== 'hello') {
  throw new Error('Expected original user message after default prompt');
}
