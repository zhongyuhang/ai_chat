import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createRunStore } from '../../src/server/generation/run-store.js';

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe('generation run store', () => {
  it('persists checkpoints and keeps interrupted runs resumable', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'novel-studio-runs-'));
    roots.push(dataRoot);
    let sequence = 0;
    const store = createRunStore({
      dataRoot,
      clock: () => new Date('2026-08-24T00:00:00.000Z'),
      idFactory: () => `run_${String(++sequence).padStart(4, '0')}`,
    });

    const run = await store.create({
      projectId: 'project_01',
      task: 'chapter-draft',
      target: { kind: 'chapter', id: 'chapter_01' },
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      promptManifest: [{ id: 'chapter-draft', version: 1 }],
      contextManifest: [],
    });
    await store.appendCheckpoint(run.id, { candidateId: 'candidate_01', content: '第一段。' });
    await store.appendCheckpoint(run.id, { candidateId: 'candidate_01', content: '第一段。第二段。' });
    await store.interrupt(run.id, { code: 'CLIENT_DISCONNECTED', message: '浏览器断开。', retryable: true });

    const restored = await store.get(run.id);
    expect(restored?.status).toBe('interrupted');
    expect(restored?.checkpoints).toHaveLength(2);
    expect(await store.readCheckpoint(run.id, 1)).toBe('第一段。第二段。');
  });
});
