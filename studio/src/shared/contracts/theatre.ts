import { z } from 'zod';
import { EntityIdSchema, IsoTimestampSchema, SchemaVersion } from './common.js';

export const TheatreMessageNodeSchema = z.object({
  id: EntityIdSchema,
  parentId: EntityIdSchema.nullable(),
  children: z.array(EntityIdSchema),
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().max(20_000_000),
  createdAt: IsoTimestampSchema,
  runId: EntityIdSchema.optional(),
  revision: z.object({ editedFromId: EntityIdSchema.optional(), retriedFromId: EntityIdSchema.optional() }).optional(),
});

export const TheatreMessageGraphSchema = z.object({
  schemaVersion: SchemaVersion,
  rootId: EntityIdSchema,
  activeLeafId: EntityIdSchema,
  nodes: z.record(EntityIdSchema, TheatreMessageNodeSchema),
  selectedChildren: z.record(EntityIdSchema, EntityIdSchema),
});

export const TheatreSessionSchema = z.object({
  schemaVersion: SchemaVersion,
  id: EntityIdSchema,
  projectId: EntityIdSchema,
  title: z.string().trim().min(1).max(300),
  participantIds: z.array(EntityIdSchema).min(1).max(32),
  userPersona: z.string().max(20_000).default(''),
  narratorMode: z.enum(['none', 'light', 'cinematic', 'omniscient']).default('light'),
  graph: TheatreMessageGraphSchema,
  pinnedMemory: z.array(z.string().min(1).max(5000)).max(256).default([]),
  state: z.record(z.string(), z.unknown()).default({}),
  proposalIds: z.array(EntityIdSchema).default([]),
  createdAt: IsoTimestampSchema,
  updatedAt: IsoTimestampSchema,
});

export type TheatreMessageNode = z.infer<typeof TheatreMessageNodeSchema>;
export type TheatreMessageGraph = z.infer<typeof TheatreMessageGraphSchema>;
export type TheatreSession = z.infer<typeof TheatreSessionSchema>;
