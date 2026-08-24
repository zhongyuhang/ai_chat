import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { EntityIdSchema } from '../../shared/contracts/common.js';
import type { CanonService } from '../canon/canon-service.js';
import type { OutlineService } from '../outlines/outline-service.js';
import type { ProjectRepository } from '../projects/project-repository.js';
import { analyzeProject } from './manuscript-analytics.js';

export async function registerDashboardRoutes(app: FastifyInstance, services: { repository: ProjectRepository; canon: CanonService; outlines: OutlineService }) {
  app.get('/api/projects/:id/dashboard', async (request) => analyzeProject(z.object({ id: EntityIdSchema }).parse(request.params).id, services));
}
