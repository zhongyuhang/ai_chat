import type { ProjectRepository } from '../projects/project-repository.js';
import type { TextProvider } from '../providers/provider.js';
import type { PromptRegistry } from '../prompts/prompt-registry.js';
import type { RunStore } from './run-store.js';
import { compileWritingTask } from './task-compiler.js';
import type { WritingTask } from '../../shared/contracts/tasks.js';
import type { ContextManifestEntry } from '../../shared/contracts/context.js';
import type { ProviderMessage } from '../providers/provider.js';

export function createGenerationCoordinator(options: {
  repository: ProjectRepository;
  runStore: RunStore;
  provider: TextProvider;
  promptRegistry: PromptRegistry;
  idFactory?: (prefix: string) => string;
}) {
  const idFactory = options.idFactory ?? ((prefix: string) => `${prefix}_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`);
  const pending = new Map<string, Promise<void>>();
  const controllers = new Map<string, AbortController>();

  async function execute(runId: string, compiled: ReturnType<typeof compileWritingTask>): Promise<void> {
    const controller = new AbortController();
    controllers.set(runId, controller);
    try {
      await options.runStore.updateStatus(runId, 'generating');
      for (let index = 0; index < compiled.task.candidateCount; index += 1) {
        const candidateId = idFactory('candidate');
        let content = '';
        for await (const event of options.provider.stream(compiled.providerRequest, { signal: controller.signal })) {
          if (event.type !== 'content-delta') continue;
          content += event.text;
          await options.runStore.appendCheckpoint(runId, { candidateId, content });
        }
      }
      await options.runStore.complete(runId);
    } catch (error) {
      const failure = error && typeof error === 'object' ? error as Record<string, unknown> : {};
      const normalized = {
        code: typeof failure.code === 'string' ? failure.code : 'GENERATION_FAILED',
        message: error instanceof Error ? error.message : '生成失败。',
        retryable: failure.retryable === true,
      };
      if (controller.signal.aborted) await options.runStore.interrupt(runId, normalized);
      else await options.runStore.fail(runId, normalized);
    } finally {
      controllers.delete(runId);
    }
  }

  async function start(input: WritingTask, context?: { messages: ProviderMessage[]; manifest: ContextManifestEntry[] }) {
    const compiled = compileWritingTask(input, options.promptRegistry, context?.messages);
    if (!await options.repository.getProject(compiled.task.projectId)) {
      throw Object.assign(new Error('项目不存在。'), { code: 'PROJECT_NOT_FOUND', statusCode: 404 });
    }
    const run = await options.runStore.create({
      projectId: compiled.task.projectId,
      task: compiled.task.kind,
      target: compiled.task.target,
      provider: 'deepseek',
      model: compiled.task.model,
      promptManifest: compiled.promptManifest,
      contextManifest: context?.manifest ?? [],
    });
    await options.runStore.saveRequest(run.id, { compiled });
    const work = execute(run.id, compiled);
    pending.set(run.id, work.finally(() => pending.delete(run.id)));
    return run;
  }

  async function wait(runId: string) {
    await pending.get(runId);
  }

  async function getRun(runId: string) {
    const run = await options.runStore.get(runId);
    if (!run) return null;
    const candidates = await Promise.all(run.candidates.map(async (candidate) => {
      const checkpoint = [...run.checkpoints].reverse().find((item) => item.artifact === candidate.artifact);
      return { ...candidate, content: checkpoint ? await options.runStore.readCheckpoint(run.id, checkpoint.sequence) : '' };
    }));
    return { ...run, candidates };
  }

  async function cancel(runId: string) {
    controllers.get(runId)?.abort();
    await wait(runId);
    return getRun(runId);
  }

  async function resume(runId: string) {
    const run = await options.runStore.get(runId);
    if (!run || run.status !== 'interrupted') throw Object.assign(new Error('生成任务不可恢复。'), { code: 'RUN_NOT_RESUMABLE', statusCode: 409 });
    const saved = await options.runStore.readRequest(runId) as { compiled: ReturnType<typeof compileWritingTask> };
    const work = execute(runId, saved.compiled);
    pending.set(runId, work.finally(() => pending.delete(runId)));
    return run;
  }

  async function acceptCandidate(runId: string, candidateId: string) {
    const run = await getRun(runId);
    if (!run || run.status !== 'completed') throw Object.assign(new Error('生成任务尚未完成。'), { code: 'RUN_NOT_COMPLETED', statusCode: 409 });
    if (run.target.kind !== 'chapter') throw Object.assign(new Error('此候选稿目标不是章节。'), { code: 'CANDIDATE_TARGET_INVALID', statusCode: 422 });
    const candidate = run.candidates.find((item) => item.id === candidateId);
    if (!candidate) throw Object.assign(new Error('候选稿不存在。'), { code: 'CANDIDATE_NOT_FOUND', statusCode: 404 });
    await options.repository.saveChapterRevision(run.projectId, run.target.id, candidate.content, { reason: `accepted-run:${runId}:${candidateId}` });
    await options.runStore.acceptCandidate(runId, candidateId);
    return options.runStore.get(runId);
  }

  async function getCompletedCandidate(runId: string, candidateId: string) {
    const run = await getRun(runId);
    if (!run || run.status !== 'completed') throw Object.assign(new Error('生成任务尚未完成。'), { code: 'RUN_NOT_COMPLETED', statusCode: 409 });
    const candidate = run.candidates.find((item) => item.id === candidateId);
    if (!candidate) throw Object.assign(new Error('候选稿不存在。'), { code: 'CANDIDATE_NOT_FOUND', statusCode: 404 });
    return { run, candidate };
  }

  async function markCandidateAccepted(runId: string, candidateId: string) {
    await getCompletedCandidate(runId, candidateId);
    return options.runStore.acceptCandidate(runId, candidateId);
  }

  return { start, wait, getRun, cancel, resume, acceptCandidate, getCompletedCandidate, markCandidateAccepted };
}

export type GenerationCoordinator = ReturnType<typeof createGenerationCoordinator>;
