const assert = require('assert');
const { buildSummarizePayload } = require('../server');

// 1. 基本契约：stream=false、正确 model、结构化摘要指令
const payload = buildSummarizePayload(
  [
    { role: 'user', content: '第一章写了个悬疑开场' },
    { role: 'assistant', content: '好的，主角李默在废弃仓库发现了关键线索。' },
  ],
  '主角李默是刑警，正在追查连环失踪案。',
  'deepseek-v4-flash'
);

assert.strictEqual(payload.model, 'deepseek-v4-flash', 'model 应透传');
assert.strictEqual(payload.stream, false, '摘要请求必须非流式');
assert.strictEqual(payload.temperature, 0.3, '摘要应使用低温保证稳定');
assert.ok(payload.max_tokens <= 1000, '摘要输出应限制长度');

// 2. 摘要指令在 system，且不含创作系统提示词
const sys = payload.messages[0];
assert.strictEqual(sys.role, 'system');
assert.ok(sys.content.includes('# 剧情主线'), '摘要指令应要求结构化小节');
assert.ok(sys.content.includes('# 角色与状态'));
assert.ok(sys.content.includes('# 未解决事项与钩子'));
assert.ok(!sys.content.includes('三位一体'), '摘要请求不应注入创作系统提示词');

// 3. 已有摘要应作为 user 上下文的一部分
const userMsg = payload.messages[1].content;
assert.ok(userMsg.includes('已有摘要：'), '应包含已有摘要块');
assert.ok(userMsg.includes('主角李默是刑警'), '已有摘要内容应传入');
assert.ok(userMsg.includes('用户：第一章写了个悬疑开场'), '应包含对话记录');

// 4. 非法 / 空输入应返回安全 payload
const empty = buildSummarizePayload(undefined, '', 'deepseek-v4-flash');
assert.strictEqual(empty.messages.length, 2, '无 messages 也应返回可发请求的 payload');
assert.ok(!empty.messages[1].content.includes('用户：'), '空输入时不应有对话文本');

const filtered = buildSummarizePayload(
  [{ role: 'error', content: '不该进来' }, { role: 'user', content: '  ' }, { role: 'system', content: '系统' }],
  '',
  'deepseek-v4-flash'
);
assert.ok(!filtered.messages[1].content.includes('不该进来'), 'error 消息应被过滤');
assert.ok(!filtered.messages[1].content.includes('系统'), 'system 消息应被过滤');

console.log('server-summarize-test PASS：buildSummarizePayload 契约全部通过');
