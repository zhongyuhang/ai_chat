import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createTheatreRepository } from '../../src/server/theatre/theatre-repository.js';

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe('theatre repository', () => {
  it('persists branch selection and pinned memory independently from canon', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'novel-studio-theatre-'));
    roots.push(dataRoot);
    let sequence = 0;
    const repository = createTheatreRepository({
      dataRoot,
      clock: () => new Date('2026-08-24T00:00:00.000Z'),
      idFactory: (prefix) => `${prefix}_${String(++sequence).padStart(4, '0')}`,
    });
    const session = await repository.create({
      projectId: 'project_001',
      title: '雨夜试演',
      participantIds: ['character_lin'],
      opening: { role: 'user', content: '你为什么来王都？' },
    });
    const first = await repository.append(session.projectId, session.id, session.graph.rootId, { role: 'assistant', content: '为了找一个人。' });
    const branched = await repository.retry(first.projectId, first.id, first.graph.rootId, { role: 'assistant', content: '与你无关。' });
    await repository.pinMemory(branched.projectId, branched.id, '林默不愿透露真实目的。');

    const restored = await repository.get(session.projectId, session.id);
    expect(restored?.pinnedMemory).toEqual(['林默不愿透露真实目的。']);
    expect(Object.values(restored!.graph.nodes).map((node) => node.content)).toEqual(expect.arrayContaining(['为了找一个人。', '与你无关。']));
  });
});
