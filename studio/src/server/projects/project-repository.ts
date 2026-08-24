import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  CreateProjectInputSchema,
  ProjectSchema,
  type CreateProjectInput,
  type Project,
} from '../../shared/contracts/project.js';
import { EntityIdSchema } from '../../shared/contracts/common.js';
import { atomicWriteJson, atomicWriteText } from './atomic-file.js';
import { assertEntityId, resolveProjectPath } from './project-paths.js';

export interface RevisionMetadata {
  schemaVersion: 1;
  id: string;
  chapterId: string;
  reason: string;
  characterCount: number;
  createdAt: string;
}

export interface RepositoryOptions {
  dataRoot: string;
  clock?: () => Date;
  idFactory?: (prefix: string) => string;
}

const CanonKind = /^(characters|relationships|worldbook|timeline|foreshadowing|outline|proposals|chapter-states|fact-index|quality-reports)$/;

function defaultIdFactory(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
}

async function readJson(file: string): Promise<unknown> {
  return JSON.parse(await readFile(file, 'utf8'));
}

export function createProjectRepository(options: RepositoryOptions) {
  const clock = options.clock ?? (() => new Date());
  const idFactory = options.idFactory ?? defaultIdFactory;

  async function createProject(input: CreateProjectInput): Promise<Project> {
    const parsed = CreateProjectInputSchema.parse(input);
    const now = clock().toISOString();
    const project = ProjectSchema.parse({
      schemaVersion: 1,
      id: idFactory('project'),
      ...parsed,
      createdAt: now,
      updatedAt: now,
    });
    await atomicWriteJson(resolveProjectPath(options.dataRoot, project.id, 'project.json'), project);
    return project;
  }

  async function listProjects(): Promise<Project[]> {
    const root = resolve(options.dataRoot, 'projects');
    const entries = await readdir(root, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    });
    const projects: Project[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || !EntityIdSchema.safeParse(entry.name).success) continue;
      try {
        projects.push(ProjectSchema.parse(await readJson(resolveProjectPath(options.dataRoot, entry.name, 'project.json'))));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
  }

  async function getProject(projectId: string): Promise<Project | null> {
    try {
      return ProjectSchema.parse(await readJson(resolveProjectPath(options.dataRoot, projectId, 'project.json')));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async function updateProject(projectId: string, changes: { status?: Project['status'] }): Promise<Project> {
    const current = await getProject(projectId);
    if (!current) throw Object.assign(new Error('项目不存在。'), { code: 'NOT_FOUND', statusCode: 404 });
    const revisionId = idFactory('revision');
    await atomicWriteJson(resolveProjectPath(options.dataRoot, projectId, 'metadata', '.revisions', `${revisionId}.json`), current);
    const updated = ProjectSchema.parse({ ...current, ...changes, updatedAt: clock().toISOString() });
    await atomicWriteJson(resolveProjectPath(options.dataRoot, projectId, 'project.json'), updated);
    return updated;
  }

  async function saveCanon(projectId: string, kind: string, value: unknown): Promise<void> {
    if (!CanonKind.test(kind)) throw new Error('非法设定类型');
    const revisionId = idFactory('revision');
    const revision = resolveProjectPath(options.dataRoot, projectId, 'canon', '.revisions', kind, `${revisionId}.json`);
    await atomicWriteJson(revision, value);
    await atomicWriteJson(resolveProjectPath(options.dataRoot, projectId, 'canon', `${kind}.json`), value);
  }

  async function readCanon(projectId: string, kind: string): Promise<unknown | null> {
    if (!CanonKind.test(kind)) throw new Error('非法设定类型');
    try {
      return await readJson(resolveProjectPath(options.dataRoot, projectId, 'canon', `${kind}.json`));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async function readChapter(projectId: string, chapterId: string): Promise<string> {
    assertEntityId(chapterId);
    return readFile(resolveProjectPath(options.dataRoot, projectId, 'chapters', `${chapterId}.md`), 'utf8');
  }

  async function listChapterIds(projectId: string): Promise<string[]> {
    const directory = resolveProjectPath(options.dataRoot, projectId, 'chapters');
    const entries = await readdir(directory, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    });
    return entries.filter((entry) => entry.isFile() && entry.name.endsWith('.md')).map((entry) => entry.name.slice(0, -3)).filter((id) => EntityIdSchema.safeParse(id).success).sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true }));
  }

  async function saveChapterRevision(
    projectId: string,
    chapterId: string,
    content: string,
    metadata: { reason: string },
  ): Promise<RevisionMetadata> {
    assertEntityId(chapterId);
    if (!metadata.reason.trim()) throw new Error('修订原因不能为空');
    const revision: RevisionMetadata = {
      schemaVersion: 1,
      id: idFactory('revision'),
      chapterId,
      reason: metadata.reason.trim(),
      characterCount: [...content].length,
      createdAt: clock().toISOString(),
    };
    const revisionDirectory = ['chapters', '.revisions', chapterId];
    await atomicWriteText(resolveProjectPath(options.dataRoot, projectId, ...revisionDirectory, `${revision.id}.md`), content);
    await atomicWriteJson(resolveProjectPath(options.dataRoot, projectId, ...revisionDirectory, `${revision.id}.json`), revision);
    await atomicWriteText(resolveProjectPath(options.dataRoot, projectId, 'chapters', `${chapterId}.md`), content);
    return revision;
  }

  async function listChapterRevisions(projectId: string, chapterId: string): Promise<RevisionMetadata[]> {
    assertEntityId(chapterId);
    const directory = resolveProjectPath(options.dataRoot, projectId, 'chapters', '.revisions', chapterId);
    const entries = await readdir(directory).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    });
    const revisions = await Promise.all(entries.filter((entry) => entry.endsWith('.json')).map(async (entry) => (
      await readJson(resolveProjectPath(options.dataRoot, projectId, 'chapters', '.revisions', chapterId, entry)) as RevisionMetadata
    )));
    return revisions.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  }

  async function restoreChapterRevision(projectId: string, chapterId: string, revisionId: string): Promise<RevisionMetadata> {
    assertEntityId(revisionId);
    const content = await readFile(resolveProjectPath(
      options.dataRoot,
      projectId,
      'chapters',
      '.revisions',
      chapterId,
      `${revisionId}.md`,
    ), 'utf8');
    return saveChapterRevision(projectId, chapterId, content, { reason: `restore:${revisionId}` });
  }

  return {
    createProject,
    listProjects,
    getProject,
    updateProject,
    saveCanon,
    readCanon,
    readChapter,
    listChapterIds,
    saveChapterRevision,
    listChapterRevisions,
    restoreChapterRevision,
  };
}

export type ProjectRepository = ReturnType<typeof createProjectRepository>;
