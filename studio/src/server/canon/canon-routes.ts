import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  CharacterSchema,
  EntityIdSchema,
  ForeshadowingSchema,
  RelationshipSchema,
  TimelineEventSchema,
  WorldBookEntrySchema,
} from '../../shared/contracts/index.js';
import { ChapterOutlineSchema, SceneCardSchema, VolumeOutlineSchema } from '../../shared/contracts/outline.js';
import { retrieveWorldBook } from '../context/worldbook-retriever.js';
import type { OutlineService } from '../outlines/outline-service.js';
import type { CanonService } from './canon-service.js';
import type { ChapterStateService } from './chapter-state-service.js';
import type { ProposalService } from './proposal-service.js';

const ProjectParams = z.object({ id: EntityIdSchema });

export async function registerCanonRoutes(app: FastifyInstance, services: {
  canon: CanonService;
  proposals: ProposalService;
  chapterStates: ChapterStateService;
  outlines: OutlineService;
}) {
  app.get('/api/projects/:id/canon', async (request) => services.canon.getBundle(ProjectParams.parse(request.params).id));
  app.put('/api/projects/:id/canon/characters/:entityId', async (request) => {
    const { id, entityId } = z.object({ id: EntityIdSchema, entityId: EntityIdSchema }).parse(request.params);
    return services.canon.saveCharacter(id, CharacterSchema.parse({ ...request.body as object, id: entityId }));
  });
  app.put('/api/projects/:id/canon/relationships/:entityId', async (request) => {
    const { id, entityId } = z.object({ id: EntityIdSchema, entityId: EntityIdSchema }).parse(request.params);
    return services.canon.saveRelationship(id, RelationshipSchema.parse({ ...request.body as object, id: entityId }));
  });
  app.put('/api/projects/:id/canon/worldbook/:entityId', async (request) => {
    const { id, entityId } = z.object({ id: EntityIdSchema, entityId: EntityIdSchema }).parse(request.params);
    return services.canon.saveWorldBookEntry(id, WorldBookEntrySchema.parse({ ...request.body as object, id: entityId }));
  });
  app.put('/api/projects/:id/canon/timeline/:entityId', async (request) => {
    const { id, entityId } = z.object({ id: EntityIdSchema, entityId: EntityIdSchema }).parse(request.params);
    return services.canon.saveTimelineEvent(id, TimelineEventSchema.parse({ ...request.body as object, id: entityId }));
  });
  app.put('/api/projects/:id/canon/foreshadowing/:entityId', async (request) => {
    const { id, entityId } = z.object({ id: EntityIdSchema, entityId: EntityIdSchema }).parse(request.params);
    return services.canon.saveForeshadowing(id, ForeshadowingSchema.parse({ ...request.body as object, id: entityId }));
  });
  app.post('/api/projects/:id/canon/worldbook/preview', async (request) => {
    const id = ProjectParams.parse(request.params).id;
    const body = z.object({ text: z.string().max(1_000_000), stage: z.string().optional() }).parse(request.body);
    const bundle = await services.canon.getBundle(id);
    return { hits: retrieveWorldBook({ entries: bundle.worldBook, text: body.text, stage: body.stage }) };
  });

  app.get('/api/projects/:id/proposals', async (request) => ({ proposals: await services.proposals.list(ProjectParams.parse(request.params).id) }));
  app.post('/api/projects/:id/proposals', async (request, reply) => {
    const id = ProjectParams.parse(request.params).id;
    const body = z.object({
      kind: z.enum(['character-update', 'relationship-update', 'worldbook-entry', 'timeline-event', 'foreshadowing']),
      targetId: EntityIdSchema.optional(),
      patch: z.record(z.string(), z.unknown()),
      source: z.object({ kind: z.enum(['chapter', 'theatre', 'manual']), id: EntityIdSchema }),
    }).parse(request.body);
    return reply.status(201).send(await services.proposals.create(id, body));
  });
  app.post('/api/projects/:id/proposals/:proposalId/accept', async (request) => {
    const { id, proposalId } = z.object({ id: EntityIdSchema, proposalId: EntityIdSchema }).parse(request.params);
    return services.proposals.accept(id, proposalId);
  });
  app.post('/api/projects/:id/proposals/:proposalId/reject', async (request) => {
    const { id, proposalId } = z.object({ id: EntityIdSchema, proposalId: EntityIdSchema }).parse(request.params);
    return services.proposals.reject(id, proposalId);
  });

  app.get('/api/projects/:id/outline', async (request) => services.outlines.getTree(ProjectParams.parse(request.params).id));
  app.put('/api/projects/:id/outline/story-bible', async (request) => {
    const id = ProjectParams.parse(request.params).id;
    const patch = z.object({ premise: z.string().optional(), themes: z.array(z.string()).optional(), coreConflict: z.string().optional(), endingContract: z.string().optional(), setting: z.string().optional(), style: z.string().optional() }).parse(request.body);
    return services.outlines.saveStoryBible(id, patch);
  });
  app.put('/api/projects/:id/outline/volumes/:volumeId', async (request) => {
    const { id, volumeId } = z.object({ id: EntityIdSchema, volumeId: EntityIdSchema }).parse(request.params);
    return services.outlines.saveVolume(id, VolumeOutlineSchema.parse({ ...request.body as object, id: volumeId }));
  });
  app.put('/api/projects/:id/outline/volumes/:volumeId/chapters/:chapterId', async (request) => {
    const { id, volumeId, chapterId } = z.object({ id: EntityIdSchema, volumeId: EntityIdSchema, chapterId: EntityIdSchema }).parse(request.params);
    return services.outlines.saveChapterOutline(id, volumeId, ChapterOutlineSchema.parse({ ...request.body as object, id: chapterId }));
  });
  app.put('/api/projects/:id/outline/volumes/:volumeId/chapters/:chapterId/scenes/:sceneId', async (request) => {
    const { id, volumeId, chapterId, sceneId } = z.object({ id: EntityIdSchema, volumeId: EntityIdSchema, chapterId: EntityIdSchema, sceneId: EntityIdSchema }).parse(request.params);
    return services.outlines.saveSceneCard(id, volumeId, chapterId, SceneCardSchema.parse({ ...request.body as object, id: sceneId }));
  });
  app.post('/api/projects/:id/outline/reorder', async (request) => {
    const id = ProjectParams.parse(request.params).id;
    const body = z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('volumes'), ids: z.array(EntityIdSchema) }),
      z.object({ kind: z.literal('chapters'), volumeId: EntityIdSchema, ids: z.array(EntityIdSchema) }),
      z.object({ kind: z.literal('scenes'), volumeId: EntityIdSchema, chapterId: EntityIdSchema, ids: z.array(EntityIdSchema) }),
    ]).parse(request.body);
    return services.outlines.reorder(id, body);
  });
}
