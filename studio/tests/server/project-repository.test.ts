import { mkdtemp, readFile, rename, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { atomicWriteText } from '../../src/server/projects/atomic-file.js';
import { resolveProjectPath } from '../../src/server/projects/project-paths.js';
import { createProjectRepository } from '../../src/server/projects/project-repository.js';
import { createBackupManager, selectRetainedBackups } from '../../src/server/projects/backup-manager.js';

const temporaryRoots: string[] = [];

async function temporaryRoot() {
  const root = await mkdtemp(join(tmpdir(), 'novel-studio-repository-'));
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function testRepository(dataRoot: string) {
  let sequence = 0;
  return createProjectRepository({
    dataRoot,
    clock: () => new Date('2026-08-24T00:00:00.000Z'),
    idFactory: (prefix) => `${prefix}_${String(++sequence).padStart(4, '0')}`,
  });
}

describe('project repository', () => {
  it('preserves accepted chapters and restores any immutable revision', async () => {
    const root = await temporaryRoot();
    const repository = testRepository(root);
    const project = await repository.createProject({ title: '长夜', writingMode: 'both' });

    await repository.saveChapterRevision(project.id, 'chapter_001', '# 第一章\n\n旧正文', { reason: 'initial' });
    await repository.saveChapterRevision(project.id, 'chapter_001', '# 第一章\n\n新正文', { reason: 'accepted-candidate' });

    expect(await repository.readChapter(project.id, 'chapter_001')).toContain('新正文');
    const revisions = await repository.listChapterRevisions(project.id, 'chapter_001');
    expect(revisions).toHaveLength(2);
    expect(revisions.map((revision) => revision.reason)).toEqual(['initial', 'accepted-candidate']);

    await repository.restoreChapterRevision(project.id, 'chapter_001', revisions[0].id);
    expect(await repository.readChapter(project.id, 'chapter_001')).toContain('旧正文');
  });

  it('never resolves a project path outside dataRoot', async () => {
    const root = await temporaryRoot();
    expect(() => resolveProjectPath(root, '../escape', 'project.json')).toThrow(/非法项目路径/);
    expect(() => resolveProjectPath(root, 'project_01', '..', 'secret')).toThrow(/非法项目路径/);
    expect(() => resolveProjectPath(root, 'project_01', 'chapters/escape.md')).toThrow(/非法项目路径/);
  });

  it('leaves accepted content byte-for-byte intact when final rename fails', async () => {
    const root = await temporaryRoot();
    const accepted = join(root, 'accepted.md');
    await atomicWriteText(accepted, '原始正文');
    let recoveryFile = '';

    await expect(atomicWriteText(accepted, '不应覆盖', {
      async rename(from) {
        recoveryFile = String(from);
        throw new Error('simulated rename failure');
      },
    })).rejects.toMatchObject({ code: 'ATOMIC_RENAME_FAILED' });

    expect(await readFile(accepted, 'utf8')).toBe('原始正文');
    expect(await readFile(recoveryFile, 'utf8')).toBe('不应覆盖');
  });

  it('retries transient atomic rename failures before preserving the recovery file', async () => {
    const root = await temporaryRoot();
    const accepted = join(root, 'accepted.md');
    await atomicWriteText(accepted, '原始正文');
    let attempts = 0;

    await atomicWriteText(accepted, '最终正文', {
      async rename(from, to) {
        attempts += 1;
        if (attempts < 3) throw Object.assign(new Error('temporary Windows file lock'), { code: 'EPERM' });
        await rename(from, to);
      },
    });

    expect(attempts).toBe(3);
    expect(await readFile(accepted, 'utf8')).toBe('最终正文');
  });

  it('round-trips a one-million-character accepted chapter without loss', async () => {
    const root = await temporaryRoot();
    const repository = testRepository(root);
    const project = await repository.createProject({ title: '百万字校验', writingMode: 'publication' });
    const manuscript = `${'长'.repeat(999_999)}终`;

    const revision = await repository.saveChapterRevision(
      project.id,
      'chapter_million',
      manuscript,
      { reason: 'million-character-integrity' },
    );

    expect(revision.characterCount).toBe(1_000_000);
    expect(await repository.readChapter(project.id, 'chapter_million')).toBe(manuscript);
  }, 15_000);

  it('creates a complete project snapshot before applying retention', async () => {
    const root = await temporaryRoot();
    const repository = testRepository(root);
    const project = await repository.createProject({ title: '备份校验', writingMode: 'both' });
    await repository.saveChapterRevision(project.id, 'chapter_001', '备份正文', { reason: 'initial' });
    const backups = createBackupManager(root, () => new Date('2026-08-24T01:02:03.004Z'));

    const snapshot = await backups.snapshot(project.id);
    expect((await stat(snapshot.directory)).isDirectory()).toBe(true);
    expect(await readFile(join(snapshot.directory, 'chapters', 'chapter_001.md'), 'utf8')).toBe('备份正文');
    expect(await backups.list(project.id)).toHaveLength(1);
  });

  it('retains newest operations plus daily and monthly recovery points', () => {
    const records = Array.from({ length: 50 }, (_, index) => {
      const date = new Date(Date.UTC(2026, 7, 24 - index * 8));
      return { id: `backup_${index}`, createdAt: date.toISOString(), directory: `x/${index}` };
    });
    const retained = selectRetainedBackups(records, new Date('2026-08-24T00:00:00.000Z'));
    expect(records.slice(0, 20).every((record) => retained.has(record.id))).toBe(true);
    expect(retained.size).toBeGreaterThan(20);
  });
});
