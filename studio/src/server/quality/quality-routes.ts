import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { EntityIdSchema } from '../../shared/contracts/common.js';
import type { QualityService } from './quality-service.js';

const ChapterParams = z.object({ id: EntityIdSchema, chapterId: EntityIdSchema });
const ReportParams = ChapterParams.extend({ reportId: EntityIdSchema });

export async function registerQualityRoutes(app: FastifyInstance, quality: QualityService) {
  app.get('/api/projects/:id/quality', async (request) => ({ reports: await quality.list(z.object({ id: EntityIdSchema }).parse(request.params).id) }));
  app.post('/api/projects/:id/chapters/:chapterId/quality', async (request, reply) => {
    const { id, chapterId } = ChapterParams.parse(request.params);
    const { mode } = z.object({ mode: z.enum(['serial', 'publication']) }).parse(request.body);
    return reply.status(201).send(await quality.review(id, chapterId, mode));
  });
  app.post('/api/projects/:id/chapters/:chapterId/quality/:reportId/waive', async (request) => {
    const { id, reportId } = ReportParams.parse(request.params);
    const input = z.object({ author: z.string().trim().min(1).max(120), note: z.string().trim().min(1).max(5000) }).parse(request.body);
    return quality.waive(id, reportId, input);
  });
}
