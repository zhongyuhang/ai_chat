import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createProjectRepository } from '../../src/server/projects/project-repository.js';
import { createCanonService } from '../../src/server/canon/canon-service.js';
import { createProposalService } from '../../src/server/canon/proposal-service.js';
import { createChapterStateService } from '../../src/server/canon/chapter-state-service.js';
import { createOutlineService } from '../../src/server/outlines/outline-service.js';

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

async function setup() {
  const dataRoot = await mkdtemp(join(tmpdir(), 'novel-studio-canon-'));
  roots.push(dataRoot);
  let sequence = 0;
  const repository = createProjectRepository({
    dataRoot,
    clock: () => new Date('2026-08-24T00:00:00.000Z'),
    idFactory: (prefix) => `${prefix}_${String(++sequence).padStart(4, '0')}`,
  });
  const project = await repository.createProject({ title: '设定测试', writingMode: 'both' });
  const canon = createCanonService({ repository });
  const proposals = createProposalService({ repository, canon, idFactory: () => `proposal_${String(++sequence).padStart(4, '0')}`, clock: () => new Date('2026-08-24T00:00:00.000Z') });
  const chapterStates = createChapterStateService({ repository, clock: () => new Date('2026-08-24T00:00:00.000Z') });
  const outlines = createOutlineService({ repository, clock: () => new Date('2026-08-24T00:00:00.000Z') });
  return { projectId: project.id, canon, proposals, chapterStates, outlines };
}

describe('confirmed canon services', () => {
  it('keeps AI-extracted character changes separate until explicit acceptance', async () => {
    const { projectId, canon, proposals } = await setup();
    await canon.saveCharacter(projectId, {
      schemaVersion: 1,
      id: 'character_lin',
      name: '林默',
      currentState: { physical: '健康', emotional: '', relational: '', knowledge: '' },
      createdAt: '2026-08-24T00:00:00.000Z',
      updatedAt: '2026-08-24T00:00:00.000Z',
    });
    const proposal = await proposals.create(projectId, {
      kind: 'character-update',
      targetId: 'character_lin',
      patch: { currentState: { physical: '左腿受伤' } },
      source: { kind: 'chapter', id: 'chapter_003' },
    });

    expect((await canon.getBundle(projectId)).characters[0].currentState.physical).toBe('健康');
    await proposals.accept(projectId, proposal.id);
    expect((await canon.getBundle(projectId)).characters[0].currentState.physical).toBe('左腿受伤');
  });

  it('rejects a timeline event whose dependency occurs later', async () => {
    const { projectId, canon } = await setup();
    await canon.saveTimelineEvent(projectId, {
      schemaVersion: 1,
      id: 'event_future',
      title: '未来会面',
      inWorldTime: '2026-09-10T00:00:00.000Z',
      sourceId: 'chapter_010',
      createdAt: '2026-08-24T00:00:00.000Z',
      updatedAt: '2026-08-24T00:00:00.000Z',
    });
    await expect(canon.saveTimelineEvent(projectId, {
      schemaVersion: 1,
      id: 'event_past',
      title: '此前行动',
      inWorldTime: '2026-09-01T00:00:00.000Z',
      dependencyIds: ['event_future'],
      sourceId: 'chapter_002',
      createdAt: '2026-08-24T00:00:00.000Z',
      updatedAt: '2026-08-24T00:00:00.000Z',
    })).rejects.toMatchObject({ code: 'TIMELINE_DEPENDENCY_INVALID' });
  });

  it('traces a cross-volume fact to its confirming chapter revision', async () => {
    const { projectId, chapterStates } = await setup();
    await chapterStates.capture(projectId, {
      chapterId: 'chapter_120',
      revisionId: 'revision_120a',
      characters: [{ id: 'character_lin', facts: { injuredLeg: true, location: '北境' } }],
      relationships: [],
      timelineEvents: [],
      revealedKnowledge: [],
      activeGoals: [],
      unresolvedHooks: [],
      foreshadowing: [],
    });
    expect(await chapterStates.traceFact(projectId, 'character:character_lin:injuredLeg')).toEqual({
      value: true,
      chapterId: 'chapter_120',
      revisionId: 'revision_120a',
    });
  });

  it('requires complete unique sibling IDs when reordering outline nodes', async () => {
    const { projectId, outlines } = await setup();
    await outlines.saveVolume(projectId, { id: 'volume_001', title: '第一卷' });
    await outlines.saveVolume(projectId, { id: 'volume_002', title: '第二卷' });
    await outlines.reorder(projectId, { kind: 'volumes', ids: ['volume_002', 'volume_001'] });
    expect((await outlines.getTree(projectId)).volumes.map((volume) => volume.id)).toEqual(['volume_002', 'volume_001']);
    await expect(outlines.reorder(projectId, { kind: 'volumes', ids: ['volume_001', 'volume_001'] }))
      .rejects.toMatchObject({ code: 'OUTLINE_ORDER_INVALID' });
  });
});
