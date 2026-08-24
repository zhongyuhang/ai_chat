import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CreateProjectInputSchema, EntityIdSchema } from '../../shared/contracts/index.js';
import { LegacyMigrationApplySchema } from '../../shared/contracts/migration.js';
import { applyLegacyMigration, previewLegacyMigration } from '../migration/legacy-migration.js';
import type { ProjectRepository } from './project-repository.js';
import type { createBackupManager } from './backup-manager.js';

const ProjectParams = z.object({ id: EntityIdSchema });
const ChapterParams = z.object({ id: EntityIdSchema, chapterId: EntityIdSchema });
const RevisionParams = ChapterParams.extend({ revisionId: EntityIdSchema });
const CanonParams = z.object({ id: EntityIdSchema, kind: z.enum(['characters', 'relationships', 'worldbook', 'timeline', 'foreshadowing', 'outline']) });
const ChapterBody = z.object({
  content: z.string().max(20_000_000),
  reason: z.string().trim().min(1).max(500),
  baseRevisionId: z.union([EntityIdSchema, z.literal('chapter_new')]).optional(),
});

function notFound(message: string) {
  throw Object.assign(new Error(message), { statusCode: 404, code: 'NOT_FOUND', retryable: false });
}

export async function registerProjectRoutes(app: FastifyInstance, repository: ProjectRepository, hooks: { onChapterAccepted?: (projectId: string, chapterId: string, revisionId: string) => Promise<unknown>; backups?: ReturnType<typeof createBackupManager> } = {}): Promise<void> {
  app.get('/api/projects', async () => ({ projects: await repository.listProjects() }));

  app.post('/api/projects', async (request, reply) => {
    const input = CreateProjectInputSchema.parse(request.body);
    const project = await repository.createProject(input);
    return reply.status(201).send(project);
  });

  app.get('/api/projects/:id', async (request) => {
    const { id } = ProjectParams.parse(request.params);
    const project = await repository.getProject(id);
    return project ?? notFound('项目不存在。');
  });

  app.patch('/api/projects/:id', async (request) => {
    const { id } = ProjectParams.parse(request.params);
    const changes = z.object({ status: z.enum(['draft', 'active', 'archived', 'completed']) }).parse(request.body);
    return dependenciesSafeUpdate(repository, id, changes);
  });

  app.put('/api/projects/:id/canon/:kind', async (request) => {
    const { id, kind } = CanonParams.parse(request.params);
    const body = z.object({ value: z.unknown() }).parse(request.body);
    if (!await repository.getProject(id)) notFound('项目不存在。');
    await repository.saveCanon(id, kind, body.value);
    return { ok: true };
  });

  app.get('/api/projects/:id/chapters/:chapterId', async (request) => {
    const { id, chapterId } = ChapterParams.parse(request.params);
    if (!await repository.getProject(id)) notFound('项目不存在。');
    try {
      const [content, revisions] = await Promise.all([repository.readChapter(id, chapterId), repository.listChapterRevisions(id, chapterId)]);
      return { content, revision: revisions.at(-1) };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return notFound('章节不存在。');
      throw error;
    }
  });

  app.put('/api/projects/:id/chapters/:chapterId', async (request) => {
    const { id, chapterId } = ChapterParams.parse(request.params);
    const body = ChapterBody.parse(request.body);
    if (!await repository.getProject(id)) notFound('项目不存在。');
    if (body.baseRevisionId) {
      const currentRevisionId = (await repository.listChapterRevisions(id, chapterId)).at(-1)?.id ?? 'chapter_new';
      if (currentRevisionId !== body.baseRevisionId) throw Object.assign(new Error('正式稿已在其他位置更新，请刷新后比较版本。'), { code: 'SOURCE_REVISION_CHANGED', statusCode: 409, retryable: false });
    }
    const revision = await repository.saveChapterRevision(id, chapterId, body.content, { reason: body.reason });
    await hooks.onChapterAccepted?.(id, chapterId, revision.id);
    return { ok: true, revision };
  });

  app.get('/api/projects/:id/chapters/:chapterId/revisions', async (request) => {
    const { id, chapterId } = ChapterParams.parse(request.params);
    if (!await repository.getProject(id)) notFound('项目不存在。');
    return { revisions: await repository.listChapterRevisions(id, chapterId) };
  });

  app.post('/api/projects/:id/chapters/:chapterId/revisions/:revisionId/restore', async (request) => {
    const { id, chapterId, revisionId } = RevisionParams.parse(request.params);
    if (!await repository.getProject(id)) notFound('项目不存在。');
    try {
      return { ok: true, revision: await repository.restoreChapterRevision(id, chapterId, revisionId) };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return notFound('修订版本不存在。');
      throw error;
    }
  });

  app.post('/api/migrations/legacy/preview', async (request) => previewLegacyMigration(request.body));
  app.post('/api/migrations/legacy/apply', async (request, reply) => {
    const input = LegacyMigrationApplySchema.parse(request.body);
    const result = await applyLegacyMigration(input, repository);
    return reply.status(201).send(result);
  });
  if (hooks.backups) {
    app.get('/api/projects/:id/backups', async (request) => ({ backups: await hooks.backups!.list(ProjectParams.parse(request.params).id) }));
    app.post('/api/projects/:id/backups', async (request, reply) => {
      const { id } = ProjectParams.parse(request.params);
      if (!await repository.getProject(id)) notFound('项目不存在。');
      return reply.status(201).send(await hooks.backups!.snapshot(id));
    });
  }
}

async function dependenciesSafeUpdate(repository: ProjectRepository, id: string, changes: { status: 'draft' | 'active' | 'archived' | 'completed' }) {
  if (!await repository.getProject(id)) notFound('项目不存在。');
  return repository.updateProject(id, changes);
}
