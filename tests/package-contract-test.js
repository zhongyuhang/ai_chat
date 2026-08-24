const assert = require('assert');
const pkg = require('../package.json');

assert.ok(pkg.scripts['test:security'], '应提供 test:security 安全门禁');
assert.ok(pkg.scripts['test:security'].includes('server-security-test.js'));
assert.ok(pkg.scripts['test:security'].includes('server-stream-test.js'));
assert.ok(pkg.scripts['test:security'].includes('chat-page-security.js'));
assert.ok(pkg.scripts['test:security'].includes('chat-page-data-integrity.js'));
assert.ok(pkg.scripts.test.includes('npm run test:security'));
assert.ok(pkg.scripts.check.includes('src/legacy/deepseek-client.js'));
assert.strictEqual(pkg.scripts.start, 'node scripts/start-studio.js');
assert.strictEqual(pkg.scripts['legacy:start'], 'node server.js');
assert.strictEqual(pkg.scripts.build, 'npm run studio:build');

console.log('package-contract-test PASS');
