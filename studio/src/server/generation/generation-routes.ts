import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { EntityIdSchema, GenerationRunSchema } from '../../shared/contracts/index.js';
import type { TextProvider, ProviderRequest } from '../providers/provider.js';
import type { ProjectRepository } from '../projects/project-repository.js';
import { PromptRegistry } from '../prompts/prompt-registry.js';
import type { RunStore } from './run-store.js';
import { WritingTaskSchema } from '../../shared/contracts/tasks.js';
import type { CanonService } from '../canon/canon-service.js';
import type { OutlineService } from '../outlines/outline-service.js';
import { assembleProjectContext } from '../context/project-context-service.js';
import { createGenerationCoordinator } from './generation-coordinator.js';
import { compileWritingTask } from './task-compiler.js';
import type { TheatreRepository } from '../theatre/theatre-repository.js';
import type { GenerationCoordinator } from './generation-coordinator.js';

const CreateRunBody = z.object({
  task: z.enum(['story-plan', 'volume-plan', 'chapter-plan', 'scene-plan', 'chapter-draft', 'continue', 'rewrite-selection', 'expand-selection', 'condense-selection', 'polish-selection', 'review', 'theatre-reply']),
  target: z.object({
    kind: z.enum(['project', 'volume', 'chapter', 'scene', 'selection', 'theatre-session']),
    id: EntityIdSchema,
  }),
  model: z.string().trim().min(1).max(120),
  messages: z.array(z.object({
    role: z.enum(['system', 'user', 'assistant']),
    content: z.string().min(1).max(20_000_000),
  })).min(1).max(10_000),
  maxOutputTokens: z.number().int().min(1).max(384_000),
  temperature: z.number().min(0).max(2).optional(),
  topP: z.number().min(0).max(1).optional(),
  reasoningEffort: z.enum(['low', 'medium', 'high']).optional(),
  promptSelection: z.array(z.object({ id: EntityIdSchema, version: z.number().int().min(1) })).min(1).max(64),
  contextManifest: GenerationRunSchema.shape.contextManifest,
});

const RunParams = z.object({ runId: EntityIdSchema });
const CandidateParams = RunParams.extend({ candidateId: EntityIdSchema });
const WritingTaskBody = WritingTaskSchema.omit({ projectId: true }).extend({
  contextWindow: z.number().int().min(4_000).max(200_000).default(128_000),
});

function notFound(message: string) {
  throw Object.assign(new Error(message), { statusCode: 404, code: 'NOT_FOUND', retryable: false });
}

export async function registerGenerationRoutes(app: FastifyInstance, dependencies: {
  repository: ProjectRepository;
  runStore: RunStore;
  provider: TextProvider;
  promptRegistry: PromptRegistry;
  canon: CanonService;
  outlines: OutlineService;
  theatre?: TheatreRepository;
  coordinator?: GenerationCoordinator;
}): Promise<void> {
  const coordinator = dependencies.coordinator ?? createGenerationCoordinator(dependencies);

  async function prepare(projectId: string, body: unknown) {
    if (!await dependencies.repository.getProject(projectId)) notFound('项目不存在。');
    const parsed = WritingTaskBody.parse(body);
    const task = WritingTaskSchema.parse({ ...parsed, projectId });
    const context = await assembleProjectContext({
      repository: dependencies.repository,
      canon: dependencies.canon,
      outlines: dependencies.outlines,
      theatre: dependencies.theatre,
      task,
      contextWindow: parsed.contextWindow,
    });
    return { task, context };
  }

  app.post('/api/projects/:id/generation/preview', async (request) => {
    const projectId = z.object({ id: EntityIdSchema }).parse(request.params).id;
    const { task, context } = await prepare(projectId, request.body);
    const compiled = compileWritingTask(task, dependencies.promptRegistry, context.messages);
    return { ...context, promptManifest: compiled.promptManifest, target: task.target, candidateCount: task.candidateCount };
  });

  app.post('/api/projects/:id/generation/tasks', async (request, reply) => {
    const projectId = z.object({ id: EntityIdSchema }).parse(request.params).id;
    const { task, context } = await prepare(projectId, request.body);
    return reply.status(201).send(await coordinator.start(task, context));
  });

  app.get('/api/runs/:runId/detail', async (request) => {
    const { runId } = RunParams.parse(request.params);
    return await coordinator.getRun(runId) ?? notFound('生成任务不存在。');
  });

  app.post('/api/runs/:runId/cancel', async (request) => {
    const { runId } = RunParams.parse(request.params);
    return await coordinator.cancel(runId) ?? notFound('生成任务不存在。');
  });

  app.post('/api/runs/:runId/resume', async (request) => coordinator.resume(RunParams.parse(request.params).runId));

  app.post('/api/runs/:runId/candidates/:candidateId/accept', async (request) => {
    const { runId, candidateId } = CandidateParams.parse(request.params);
    return coordinator.acceptCandidate(runId, candidateId);
  });

  app.post('/api/projects/:id/runs', async (request, reply) => {
    const projectId = z.object({ id: EntityIdSchema }).parse(request.params).id;
    if (!await dependencies.repository.getProject(projectId)) notFound('项目不存在。');
    const body = CreateRunBody.parse(request.body);
    const prompt = dependencies.promptRegistry.compose(body.promptSelection);
    const providerRequest: ProviderRequest = {
      model: body.model,
      messages: [{ role: 'system', content: prompt.text }, ...body.messages],
      maxOutputTokens: body.maxOutputTokens,
      temperature: body.temperature,
      topP: body.topP,
      reasoningEffort: body.reasoningEffort,
    };
    const run = await dependencies.runStore.create({
      projectId,
      task: body.task,
      target: body.target,
      provider: 'deepseek',
      model: body.model,
      promptManifest: prompt.manifest,
      contextManifest: body.contextManifest,
    });
    await dependencies.runStore.saveRequest(run.id, providerRequest);
    return reply.status(201).send(run);
  });

  app.get('/api/runs/:runId', async (request) => {
    const { runId } = RunParams.parse(request.params);
    return await dependencies.runStore.get(runId) ?? notFound('生成任务不存在。');
  });

  app.get('/api/runs/:runId/events', async (request, reply) => {
    const { runId } = RunParams.parse(request.params);
    const run = await dependencies.runStore.get(runId);
    if (!run) return notFound('生成任务不存在。');
    const providerRequest = await dependencies.runStore.readRequest(runId) as ProviderRequest;
    const controller = new AbortController();
    const cancel = () => controller.abort();
    const cancelOnClose = () => {
      if (!reply.raw.writableEnded) cancel();
    };
    request.raw.once('aborted', cancel);
    reply.raw.once('close', cancelOnClose);
    reply.hijack();
    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });

    let candidate = '';
    try {
      await dependencies.runStore.updateStatus(runId, 'generating');
      for await (const event of dependencies.provider.stream(providerRequest, { signal: controller.signal })) {
        if (event.type === 'content-delta') {
          candidate += event.text;
          await dependencies.runStore.appendCheckpoint(runId, { candidateId: 'candidate_01', content: candidate });
        }
        if (!reply.raw.destroyed) reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
      }
      await dependencies.runStore.complete(runId);
    } catch (error) {
      const failure = error && typeof error === 'object' ? error as Record<string, unknown> : {};
      const normalized = {
        code: typeof failure.code === 'string' ? failure.code : 'GENERATION_FAILED',
        message: error instanceof Error ? error.message : '生成失败。',
        retryable: failure.retryable === true,
      };
      if (controller.signal.aborted) await dependencies.runStore.interrupt(runId, normalized);
      else await dependencies.runStore.fail(runId, normalized);
      if (!reply.raw.destroyed) reply.raw.write(`data: ${JSON.stringify({ type: 'error', ...normalized })}\n\n`);
    } finally {
      request.raw.removeListener('aborted', cancel);
      reply.raw.removeListener('close', cancelOnClose);
      if (!reply.raw.destroyed) reply.raw.end();
    }
  });
}
