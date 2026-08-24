import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { applyLegacyMigration, previewLegacyMigration } from '../../src/server/migration/legacy-migration.js';
import { createProjectRepository } from '../../src/server/projects/project-repository.js';

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

const payload = {
  settings: { temperature: 0.7, pinnedPrompt: '保持第三人称限知' },
  sessions: [
    {
      id: 'old1',
      title: '旧会话',
      summary: '主角进入雨城。',
      messages: [
        { role: 'user', content: '写一个开篇' },
        { role: 'assistant', content: '雨落在旧城的黑瓦上。' },
      ],
    },
  ],
};

describe('legacy migration', () => {
  it('previews browser exports without touching disk', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-studio-migration-'));
    roots.push(root);
    const preview = previewLegacyMigration(payload);

    expect(preview.sessions).toEqual([
      { sourceId: 'old1', title: '旧会话', messageCount: 2, valid: true, issues: [] },
    ]);
    expect(preview.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(preview.estimatedBytes).toBeGreaterThan(0);
    expect(await readdir(root)).toEqual([]);
  });

  it('requires the exact preview fingerprint and preserves every message on apply', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-studio-migration-'));
    roots.push(root);
    const repository = createProjectRepository({ dataRoot: root });
    const preview = previewLegacyMigration(payload);

    await expect(applyLegacyMigration({ payload, fingerprint: '0'.repeat(64) }, repository))
      .rejects.toMatchObject({ code: 'MIGRATION_PREVIEW_STALE' });

    const result = await applyLegacyMigration({ payload, fingerprint: preview.fingerprint }, repository);
    expect(result.importedSessions).toBe(1);
    const chapter = await repository.readChapter(result.project.id, result.chapterIds[0]);
    expect(chapter).toContain('写一个开篇');
    expect(chapter).toContain('雨落在旧城的黑瓦上。');
  });
});
