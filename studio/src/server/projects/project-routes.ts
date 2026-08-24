import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CreateProjectInputSchema, EntityIdSchema } from '../../shared/contracts/index.js';
import { LegacyMigrationApplySchema } from '../../shared/contracts/migration.js';
import { applyLegacyMigration, previewLegacyMigration } from '../migration/legacy-migration.js';
import type { ProjectRepository } from './project-repository.js';

const ProjectParams = z.object({ id: EntityIdSchema });
const ChapterParams = z.object({ id: EntityIdSchema, chapterId: EntityIdSchema });
const CanonParams = z.object({ id: EntityIdSchema, kind: z.enum(['characters', 'relationships', 'worldbook', 'timeline', 'foreshadowing', 'outline']) });
const ChapterBody = z.object({
  content: z.string().max(20_000_000),
  reason: z.string().trim().min(1).max(500),
});

function notFound(message: string) {
  throw Object.assign(new Error(message), { statusCode: 404, code: 'NOT_FOUND', retryable: false });
}

export async function registerProjectRoutes(app: FastifyInstance, repository: ProjectRepository): Promise<void> {
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
      return { content: await repository.readChapter(id, chapterId) };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return notFound('章节不存在。');
      throw error;
    }
  });

  app.put('/api/projects/:id/chapters/:chapterId', async (request) => {
    const { id, chapterId } = ChapterParams.parse(request.params);
    const body = ChapterBody.parse(request.body);
    if (!await repository.getProject(id)) notFound('项目不存在。');
    const revision = await repository.saveChapterRevision(id, chapterId, body.content, { reason: body.reason });
    return { ok: true, revision };
  });

  app.post('/api/migrations/legacy/preview', async (request) => previewLegacyMigration(request.body));
  app.post('/api/migrations/legacy/apply', async (request, reply) => {
    const input = LegacyMigrationApplySchema.parse(request.body);
    const result = await applyLegacyMigration(input, repository);
    return reply.status(201).send(result);
  });
}
