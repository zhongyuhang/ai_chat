import { buildApp } from './app.js';

const host = process.env.STUDIO_HOST || '127.0.0.1';
const parsedPort = Number(process.env.STUDIO_PORT || 3100);
const port = Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort < 65_536 ? parsedPort : 3100;
const app = await buildApp({ logger: true });

try {
  await app.listen({ host, port });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
