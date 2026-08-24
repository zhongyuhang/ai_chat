import Fastify, { type FastifyInstance } from 'fastify';

export interface AppOptions {
  logger?: boolean;
}

export async function buildApp(options: AppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false });
  app.get('/api/health', async () => ({ ok: true as const, version: 1 as const }));
  await app.ready();
  return app;
}
