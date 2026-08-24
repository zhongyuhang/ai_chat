import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { EntityIdSchema } from '../../shared/contracts/common.js';
import type { ProjectRepository } from '../projects/project-repository.js';
import { renderDocx } from './docx-export.js';
import { renderPortableJson } from './json-export.js';
import { buildManuscript } from './manuscript-model.js';
import { renderMarkdown } from './markdown-export.js';
import { renderText } from './text-export.js';

export async function registerExportRoutes(app: FastifyInstance, repository: ProjectRepository) {
  app.get('/api/projects/:id/export', async (request, reply) => {
    const { id } = z.object({ id: EntityIdSchema }).parse(request.params);
    const { format, includePlaceholders } = z.object({ format: z.enum(['markdown', 'txt', 'json', 'docx']), includePlaceholders: z.enum(['true', 'false']).default('false').transform((value) => value === 'true') }).parse(request.query);
    const manuscript = await buildManuscript(id, repository, { includePlaceholders });
    const extension = format === 'markdown' ? 'md' : format;
    const filename = `${manuscript.project.title}.${extension}`;
    reply.header('content-disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    if (format === 'docx') return reply.type('application/vnd.openxmlformats-officedocument.wordprocessingml.document').send(await renderDocx(manuscript));
    if (format === 'json') return reply.type('application/json; charset=utf-8').send(renderPortableJson(manuscript));
    if (format === 'txt') return reply.type('text/plain; charset=utf-8').send(renderText(manuscript));
    return reply.type('text/markdown; charset=utf-8').send(renderMarkdown(manuscript));
  });
}
