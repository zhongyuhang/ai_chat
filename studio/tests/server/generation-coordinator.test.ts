import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createProjectRepository } from '../../src/server/projects/project-repository.js';
import { createRunStore } from '../../src/server/generation/run-store.js';
import { createGenerationCoordinator } from '../../src/server/generation/generation-coordinator.js';
import { PromptRegistry } from '../../src/server/prompts/prompt-registry.js';
import type { TextProvider } from '../../src/server/providers/provider.js';

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

async function setup() {
  const dataRoot = await mkdtemp(join(tmpdir(), 'novel-studio-coordinator-'));
  roots.push(dataRoot);
  let sequence = 0;
  const idFactory = (prefix: string) => `${prefix}_${String(++sequence).padStart(4, '0')}`;
  const repository = createProjectRepository({ dataRoot, idFactory });
  const runStore = createRunStore({ dataRoot, idFactory: () => idFactory('run') });
  const provider: TextProvider = {
    async *stream() {
      yield { type: 'content-delta', text: '候选' };
      yield { type: 'content-delta', text: '正文' };
      yield { type: 'finish', reason: 'stop' };
    },
  };
  const coordinator = createGenerationCoordinator({
    repository,
    runStore,
    provider,
    promptRegistry: new PromptRegistry(resolve(process.cwd(), 'src/server/prompts/modules')),
    idFactory,
  });
  const project = await repository.createProject({ title: '协调器测试', writingMode: 'both' });
  await repository.saveChapterRevision(project.id, 'chapter_001', '原正文', { reason: 'initial' });
  return { project, repository, coordinator };
}

describe('generation coordinator', () => {
  it('owns deltas by immutable run target and never follows visible UI state', async () => {
    const { project, repository, coordinator } = await setup();
    const run = await coordinator.start({
      kind: 'chapter-draft',
      projectId: project.id,
      target: { kind: 'chapter', id: 'chapter_001' },
      instruction: '重写第一章',
      candidateCount: 1,
    });
    const visibleUiChapter = 'chapter_002';
    expect(visibleUiChapter).toBe('chapter_002');
    await coordinator.wait(run.id);
    const completed = await coordinator.getRun(run.id);
    expect(completed?.candidates[0].content).toBe('候选正文');
    await expect(repository.readChapter(project.id, 'chapter_002')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('does not replace accepted prose before explicit candidate acceptance', async () => {
    const { project, repository, coordinator } = await setup();
    const run = await coordinator.start({
      kind: 'chapter-draft',
      projectId: project.id,
      target: { kind: 'chapter', id: 'chapter_001' },
      instruction: '生成第一章候选',
      candidateCount: 1,
    });
    await coordinator.wait(run.id);
    expect(await repository.readChapter(project.id, 'chapter_001')).toBe('原正文');
    const completed = await coordinator.getRun(run.id);
    await coordinator.acceptCandidate(run.id, completed!.candidates[0].id);
    expect(await repository.readChapter(project.id, 'chapter_001')).toBe('候选正文');
  });

  it('rejects candidate acceptance when the accepted chapter changed during generation', async () => {
    const { project, repository, coordinator } = await setup();
    const sourceRevisionId = (await repository.listChapterRevisions(project.id, 'chapter_001')).at(-1)!.id;
    const run = await coordinator.start({ kind: 'chapter-draft', projectId: project.id, target: { kind: 'chapter', id: 'chapter_001' }, instruction: '生成候选', candidateCount: 1, sourceRevisionId });
    await coordinator.wait(run.id);
    await repository.saveChapterRevision(project.id, 'chapter_001', '生成期间保存的新正式稿', { reason: 'concurrent-save' });
    const completed = await coordinator.getRun(run.id);
    await expect(coordinator.acceptCandidate(run.id, completed!.candidates[0].id)).rejects.toMatchObject({ code: 'SOURCE_REVISION_CHANGED' });
    expect(await repository.readChapter(project.id, 'chapter_001')).toBe('生成期间保存的新正式稿');
  });
});
