import { buildApp } from './app.js';
import type { TextProvider } from './providers/provider.js';

const host = process.env.STUDIO_HOST || '127.0.0.1';
const parsedPort = Number(process.env.STUDIO_PORT || 3411);
const port = Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort < 65_536 ? parsedPort : 3411;
let testInvocation = 0;
const e2eProvider: TextProvider | undefined = process.env.STUDIO_E2E_FAKE_PROVIDER === '1' ? {
  async *stream() {
    testInvocation += 1;
    yield { type: 'content-delta', text: testInvocation % 2 === 1 ? 'E2E 候选一正文' : 'E2E 候选二正文' };
    yield { type: 'finish', reason: 'stop' };
  },
} : undefined;
const app = await buildApp({ logger: true, dataRoot: process.env.STUDIO_DATA_ROOT, provider: e2eProvider, serveClient: process.env.STUDIO_SERVE_CLIENT === '1' });

try {
  await app.listen({ host, port });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
