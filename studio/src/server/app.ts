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
import { createCanonService } from './canon/canon-service.js';
import { createProposalService } from './canon/proposal-service.js';
import { createChapterStateService } from './canon/chapter-state-service.js';
import { createOutlineService } from './outlines/outline-service.js';
import { registerCanonRoutes } from './canon/canon-routes.js';
import { createTheatreRepository } from './theatre/theatre-repository.js';
import { registerTheatreRoutes } from './theatre/theatre-routes.js';
import { createGenerationCoordinator } from './generation/generation-coordinator.js';
import { createMaterialConverter } from './material/material-converter.js';
import fastifyStatic from '@fastify/static';
import { createQualityService } from './quality/quality-service.js';
import { registerQualityRoutes } from './quality/quality-routes.js';

export interface AppOptions {
  logger?: boolean;
  dataRoot?: string;
  repository?: ProjectRepository;
  runStore?: RunStore;
  provider?: TextProvider;
  promptRegistry?: PromptRegistry;
  serveClient?: boolean;
  clientRoot?: string;
}

export async function buildApp(options: AppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false });
  app.addHook('onSend', async (_request, reply) => {
    reply.header('content-security-policy', "default-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'");
    reply.header('x-content-type-options', 'nosniff');
    reply.header('x-frame-options', 'DENY');
    reply.header('referrer-policy', 'no-referrer');
    reply.header('cross-origin-opener-policy', 'same-origin');
  });
  const dataRoot = options.dataRoot ?? resolve(process.cwd(), 'studio-data');
  const repository = options.repository ?? createProjectRepository({ dataRoot });
  const runStore = options.runStore ?? createRunStore({ dataRoot });
  const provider = options.provider ?? createDeepSeekProvider({
    apiUrl: process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1/chat/completions',
    apiKey: process.env.DEEPSEEK_API_KEY || '',
    timeoutMs: Number(process.env.UPSTREAM_TIMEOUT_MS || 120_000),
  });
  const promptRegistry = options.promptRegistry ?? new PromptRegistry(resolve(process.cwd(), 'src/server/prompts/modules'));
  const canon = createCanonService({ repository });
  const proposals = createProposalService({ repository, canon });
  const chapterStates = createChapterStateService({ repository });
  const outlines = createOutlineService({ repository });
  const theatre = createTheatreRepository({ dataRoot });
  const coordinator = createGenerationCoordinator({ repository, runStore, provider, promptRegistry });
  const materials = createMaterialConverter({ theatre, canon });
  const quality = createQualityService({ repository, canon });

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
  await registerGenerationRoutes(app, { repository, runStore, provider, promptRegistry, canon, outlines, theatre, coordinator });
  await registerCanonRoutes(app, { canon, proposals, chapterStates, outlines });
  await registerTheatreRoutes(app, theatre, { coordinator, materials });
  await registerQualityRoutes(app, quality);
  if (options.serveClient) {
    await app.register(fastifyStatic, {
      root: options.clientRoot ?? resolve(process.cwd(), 'dist/client'),
      prefix: '/',
    });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/')) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'API 路由不存在。', requestId: request.id, retryable: false } });
      return reply.type('text/html; charset=utf-8').sendFile('index.html');
    });
  }
  await app.ready();
  return app;
}
