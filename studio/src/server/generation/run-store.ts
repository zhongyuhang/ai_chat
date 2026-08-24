import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import {
  GenerationRunSchema,
  type GenerationRun,
} from '../../shared/contracts/generation.js';
import { EntityIdSchema } from '../../shared/contracts/common.js';
import { atomicWriteJson, atomicWriteText } from '../projects/atomic-file.js';

type RunError = { code: string; message: string; retryable: boolean };

interface CreateRunInput {
  projectId: string;
  task: GenerationRun['task'];
  target: GenerationRun['target'];
  provider: string;
  model: string;
  promptManifest: GenerationRun['promptManifest'];
  contextManifest: GenerationRun['contextManifest'];
}

interface RunStoreOptions {
  dataRoot: string;
  clock?: () => Date;
  idFactory?: () => string;
}

function defaultIdFactory(): string {
  return `run_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
}

export function createRunStore(options: RunStoreOptions) {
  const clock = options.clock ?? (() => new Date());
  const idFactory = options.idFactory ?? defaultIdFactory;
  const runsRoot = resolve(options.dataRoot, 'runs');

  function runPath(runId: string, ...segments: string[]): string {
    if (!EntityIdSchema.safeParse(runId).success) throw new Error('非法生成任务路径');
    if (segments.some((segment) => !segment || segment.includes('..') || /[\\/\0]/.test(segment))) {
      throw new Error('非法生成任务路径');
    }
    const target = resolve(runsRoot, ...segments.length ? [runId, ...segments] : [`${runId}.json`]);
    if (!target.startsWith(`${runsRoot}${sep}`)) throw new Error('非法生成任务路径');
    return target;
  }

  async function write(run: GenerationRun): Promise<void> {
    await atomicWriteJson(runPath(run.id), GenerationRunSchema.parse(run));
  }

  async function get(runId: string): Promise<GenerationRun | null> {
    try {
      return GenerationRunSchema.parse(JSON.parse(await readFile(runPath(runId), 'utf8')));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async function requireRun(runId: string): Promise<GenerationRun> {
    const run = await get(runId);
    if (!run) throw Object.assign(new Error('生成任务不存在。'), { code: 'RUN_NOT_FOUND', statusCode: 404 });
    return run;
  }

  async function create(input: CreateRunInput): Promise<GenerationRun> {
    const now = clock().toISOString();
    const run = GenerationRunSchema.parse({
      schemaVersion: 1,
      id: idFactory(),
      ...input,
      status: 'queued',
      candidates: [],
      checkpoints: [],
      createdAt: now,
      updatedAt: now,
    });
    await write(run);
    return run;
  }

  async function appendCheckpoint(runId: string, input: { candidateId: string; content: string }): Promise<GenerationRun> {
    EntityIdSchema.parse(input.candidateId);
    const run = await requireRun(runId);
    const sequence = run.checkpoints.length;
    const filename = `${String(sequence).padStart(8, '0')}.md`;
    const artifact = `runs/${runId}/checkpoints/${filename}`;
    await atomicWriteText(runPath(runId, 'checkpoints', filename), input.content);
    run.checkpoints.push({ sequence, artifact, characterCount: [...input.content].length, createdAt: clock().toISOString() });
    const candidate = run.candidates.find((item) => item.id === input.candidateId);
    if (candidate) candidate.artifact = artifact;
    else run.candidates.push({ id: input.candidateId, artifact, accepted: false });
    run.updatedAt = clock().toISOString();
    await write(run);
    return run;
  }

  async function readCheckpoint(runId: string, sequence: number): Promise<string> {
    const run = await requireRun(runId);
    const checkpoint = run.checkpoints.find((item) => item.sequence === sequence);
    if (!checkpoint) throw Object.assign(new Error('生成检查点不存在。'), { code: 'CHECKPOINT_NOT_FOUND', statusCode: 404 });
    return readFile(runPath(runId, 'checkpoints', `${String(sequence).padStart(8, '0')}.md`), 'utf8');
  }

  async function updateStatus(runId: string, status: GenerationRun['status'], error?: RunError): Promise<GenerationRun> {
    const run = await requireRun(runId);
    run.status = status;
    run.updatedAt = clock().toISOString();
    if (error) run.error = error;
    else delete run.error;
    await write(run);
    return run;
  }

  async function complete(runId: string) {
    return updateStatus(runId, 'completed');
  }

  async function interrupt(runId: string, error: RunError) {
    return updateStatus(runId, 'interrupted', error);
  }

  async function fail(runId: string, error: RunError) {
    return updateStatus(runId, 'failed', error);
  }

  async function acceptCandidate(runId: string, candidateId: string): Promise<GenerationRun> {
    const run = await requireRun(runId);
    const candidate = run.candidates.find((item) => item.id === candidateId);
    if (!candidate) throw Object.assign(new Error('候选稿不存在。'), { code: 'CANDIDATE_NOT_FOUND', statusCode: 404 });
    for (const item of run.candidates) item.accepted = item.id === candidateId;
    run.updatedAt = clock().toISOString();
    await write(run);
    return run;
  }

  async function saveRequest(runId: string, request: unknown): Promise<void> {
    await requireRun(runId);
    await atomicWriteJson(runPath(runId, 'request.json'), request);
  }

  async function readRequest(runId: string): Promise<unknown> {
    await requireRun(runId);
    return JSON.parse(await readFile(runPath(runId, 'request.json'), 'utf8'));
  }

  return { create, get, appendCheckpoint, readCheckpoint, updateStatus, complete, interrupt, fail, acceptCandidate, saveRequest, readRequest };
}

export type RunStore = ReturnType<typeof createRunStore>;
