import Fastify, { type FastifyInstance } from 'fastify';
import { resolve } from 'node:path';
import { ZodError } from 'zod';
import { createProjectRepository, type ProjectRepository } from './projects/project-repository.js';
import { registerProjectRoutes } from './projects/project-routes.js';
import { createRunStore, type RunStore } from './generation/run-store.js';
import { registerGenerationRoutes } from './generation/generation-routes.js';
import { createDeepSeekProvider } from './providers/deepseek-provider.js';
import type { TextProvider } from './providers/provider.js';
import { PromptRegistry } from './prompts/prompt-registry.js';

export interface AppOptions {
  logger?: boolean;
  dataRoot?: string;
  repository?: ProjectRepository;
  runStore?: RunStore;
  provider?: TextProvider;
  promptRegistry?: PromptRegistry;
}

export async function buildApp(options: AppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false });
  const dataRoot = options.dataRoot ?? resolve(process.cwd(), 'studio-data');
  const repository = options.repository ?? createProjectRepository({ dataRoot });
  const runStore = options.runStore ?? createRunStore({ dataRoot });
  const provider = options.provider ?? createDeepSeekProvider({
    apiUrl: process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1/chat/completions',
    apiKey: process.env.DEEPSEEK_API_KEY || '',
    timeoutMs: Number(process.env.UPSTREAM_TIMEOUT_MS || 120_000),
  });
  const promptRegistry = options.promptRegistry ?? new PromptRegistry(resolve(process.cwd(), 'src/server/prompts/modules'));

  app.setErrorHandler((error, request, reply) => {
    const validation = error instanceof ZodError;
    const failure = error && typeof error === 'object' ? error as Record<string, unknown> : {};
    const statusCode = validation ? 400 : (typeof failure.statusCode === 'number' ? failure.statusCode : 500);
    const code = validation ? 'VALIDATION_ERROR' : (typeof failure.code === 'string' ? failure.code : 'INTERNAL_ERROR');
    const fields = validation
      ? Object.fromEntries(error.issues.map((issue) => [issue.path.join('.') || 'body', issue.message]))
      : undefined;
    return reply.status(statusCode).send({
      error: {
        code,
        message: validation ? '请求数据不符合要求。' : (error instanceof Error ? error.message : '服务器内部错误。'),
        requestId: request.id,
        retryable: validation ? false : failure.retryable === true,
        ...(fields ? { fields } : {}),
      },
    });
  });
  app.get('/api/health', async () => ({ ok: true as const, version: 1 as const }));
  await registerProjectRoutes(app, repository);
  await registerGenerationRoutes(app, { repository, runStore, provider, promptRegistry });
  await app.ready();
  return app;
}
