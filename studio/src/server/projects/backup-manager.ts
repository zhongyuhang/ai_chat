import { cp, mkdir, readdir, rm, rename } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { basename, resolve, sep } from 'node:path';
import { assertEntityId, resolveProjectPath } from './project-paths.js';

export interface BackupRecord {
  id: string;
  createdAt: string;
  directory: string;
}

function dateKey(value: string): string {
  return value.slice(0, 10);
}

function monthKey(value: string): string {
  return value.slice(0, 7);
}

export function selectRetainedBackups(records: BackupRecord[], now = new Date()): Set<string> {
  const sorted = [...records].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const retained = new Set(sorted.slice(0, 20).map((record) => record.id));
  const daily = new Set<string>();
  const monthly = new Set<string>();
  const dailyCutoff = now.getTime() - 30 * 86_400_000;
  const monthlyCutoff = now.getTime() - 366 * 86_400_000;

  for (const record of sorted) {
    const time = new Date(record.createdAt).getTime();
    const day = dateKey(record.createdAt);
    const month = monthKey(record.createdAt);
    if (time >= dailyCutoff && !daily.has(day)) {
      daily.add(day);
      retained.add(record.id);
    }
    if (time >= monthlyCutoff && !monthly.has(month)) {
      monthly.add(month);
      retained.add(record.id);
    }
  }
  return retained;
}

export function createBackupManager(dataRoot: string, clock: () => Date = () => new Date()) {
  const backupRoot = (projectId: string) => resolve(dataRoot, 'backups', assertEntityId(projectId));

  async function list(projectId: string): Promise<BackupRecord[]> {
    const root = backupRoot(projectId);
    const entries = await readdir(root, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    });
    return entries.flatMap((entry) => {
      const match = entry.isDirectory() && entry.name.match(/^backup_(\d{8})t(\d{9})z_[a-f0-9]{8}$/);
      if (!match) return [];
      const [, date, time] = match;
      const createdAt = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${time.slice(0, 2)}:${time.slice(2, 4)}:${time.slice(4, 6)}.${time.slice(6, 9)}Z`;
      return [{ id: entry.name, createdAt, directory: resolve(root, entry.name) }];
    });
  }

  async function snapshot(projectId: string): Promise<BackupRecord> {
    const projectDirectory = resolveProjectPath(dataRoot, projectId);
    const root = backupRoot(projectId);
    await mkdir(root, { recursive: true });
    const createdAt = clock().toISOString();
    const compact = createdAt.replace(/[-:]/g, '').replace('.', '').toLowerCase();
    const id = `backup_${compact}_${randomUUID().slice(0, 8)}`;
    const temporary = resolve(root, `${id}.tmp`);
    const destination = resolve(root, id);
    await cp(projectDirectory, temporary, { recursive: true, errorOnExist: true });
    await rename(temporary, destination);

    const records = await list(projectId);
    const retained = selectRetainedBackups(records, clock());
    for (const record of records) {
      if (retained.has(record.id)) continue;
      const candidate = resolve(root, basename(record.directory));
      if (!candidate.startsWith(`${root}${sep}`)) throw new Error('非法备份路径');
      await rm(candidate, { recursive: true });
    }
    return { id, createdAt, directory: destination };
  }

  return { list, snapshot };
}
