import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { EntityIdSchema } from '../../shared/contracts/common.js';
import type { TheatreRepository } from './theatre-repository.js';
import type { GenerationCoordinator } from '../generation/generation-coordinator.js';
import type { MaterialConverter } from '../material/material-converter.js';

const ProjectParams = z.object({ id: EntityIdSchema });
const SessionParams = z.object({ id: EntityIdSchema, sessionId: EntityIdSchema });
const NodeParams = z.object({ id: EntityIdSchema, sessionId: EntityIdSchema, nodeId: EntityIdSchema });
const CandidateParams = z.object({ id: EntityIdSchema, sessionId: EntityIdSchema, runId: EntityIdSchema, candidateId: EntityIdSchema });
const MessageInput = z.object({ role: z.enum(['user', 'assistant', 'system']), content: z.string().max(20_000_000), runId: EntityIdSchema.optional() });

function missing(): never {
  throw Object.assign(new Error('剧场会话不存在。'), { code: 'THEATRE_SESSION_NOT_FOUND', statusCode: 404, retryable: false });
}

export async function registerTheatreRoutes(app: FastifyInstance, theatre: TheatreRepository, services?: { coordinator: GenerationCoordinator; materials: MaterialConverter }) {
  app.get('/api/projects/:id/theatre', async (request) => ({ sessions: await theatre.list(ProjectParams.parse(request.params).id) }));
  app.post('/api/projects/:id/theatre', async (request, reply) => {
    const projectId = ProjectParams.parse(request.params).id;
    const body = z.object({
      title: z.string().trim().min(1).max(300),
      participantIds: z.array(EntityIdSchema).min(1).max(32),
      opening: MessageInput.omit({ runId: true }),
      userPersona: z.string().max(20_000).optional(),
      narratorMode: z.enum(['none', 'light', 'cinematic', 'omniscient']).optional(),
    }).parse(request.body);
    return reply.status(201).send(await theatre.create({ projectId, ...body }));
  });
  app.get('/api/projects/:id/theatre/:sessionId', async (request) => {
    const { id, sessionId } = SessionParams.parse(request.params);
    return await theatre.get(id, sessionId) ?? missing();
  });
  app.post('/api/projects/:id/theatre/:sessionId/nodes/:nodeId/append', async (request) => {
    const { id, sessionId, nodeId } = NodeParams.parse(request.params);
    return theatre.append(id, sessionId, nodeId, MessageInput.parse(request.body));
  });
  app.post('/api/projects/:id/theatre/:sessionId/nodes/:nodeId/edit-branch', async (request) => {
    const { id, sessionId, nodeId } = NodeParams.parse(request.params);
    return theatre.edit(id, sessionId, nodeId, MessageInput.omit({ runId: true }).parse(request.body));
  });
  app.post('/api/projects/:id/theatre/:sessionId/nodes/:nodeId/retry', async (request) => {
    const { id, sessionId, nodeId } = NodeParams.parse(request.params);
    return theatre.retry(id, sessionId, nodeId, MessageInput.parse(request.body));
  });
  app.post('/api/projects/:id/theatre/:sessionId/nodes/:nodeId/select', async (request) => {
    const { id, sessionId, nodeId } = NodeParams.parse(request.params);
    const { childId } = z.object({ childId: EntityIdSchema }).parse(request.body);
    return theatre.select(id, sessionId, nodeId, childId);
  });
  app.delete('/api/projects/:id/theatre/:sessionId/nodes/:nodeId', async (request) => {
    const { id, sessionId, nodeId } = NodeParams.parse(request.params);
    return theatre.removeLeaf(id, sessionId, nodeId);
  });
  app.post('/api/projects/:id/theatre/:sessionId/pinned-memory', async (request) => {
    const { id, sessionId } = SessionParams.parse(request.params);
    const { memory } = z.object({ memory: z.string().trim().min(1).max(5000) }).parse(request.body);
    return theatre.pinMemory(id, sessionId, memory);
  });
  if (services) {
    app.post('/api/projects/:id/theatre/:sessionId/runs/:runId/candidates/:candidateId/accept', async (request) => {
      const { id, sessionId, runId, candidateId } = CandidateParams.parse(request.params);
      const { parentId } = z.object({ parentId: EntityIdSchema }).parse(request.body);
      const { run, candidate } = await services.coordinator.getCompletedCandidate(runId, candidateId);
      if (run.projectId !== id || run.target.kind !== 'theatre-session' || run.target.id !== sessionId) {
        throw Object.assign(new Error('候选稿不属于当前剧场会话。'), { code: 'CANDIDATE_TARGET_INVALID', statusCode: 422 });
      }
      const session = await theatre.append(id, sessionId, parentId, { role: 'assistant', content: candidate.content, runId });
      await services.coordinator.markCandidateAccepted(runId, candidateId);
      return session;
    });
    app.post('/api/projects/:id/theatre/:sessionId/materials', async (request) => {
      const { id, sessionId } = SessionParams.parse(request.params);
      const body = z.object({ nodeId: EntityIdSchema, kind: z.literal('branch-to-scene-card'), title: z.string().trim().min(1).max(300) }).parse(request.body);
      return services.materials.convert({ projectId: id, sessionId, ...body });
    });
  }
}
