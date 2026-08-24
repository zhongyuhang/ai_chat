import { z } from 'zod';
import { EntityIdSchema, IsoTimestampSchema, SchemaVersion } from './common.js';

export const GenerationStatusSchema = z.enum([
  'queued',
  'planning',
  'generating',
  'reviewing',
  'revising',
  'completed',
  'cancelled',
  'failed',
  'interrupted',
]);

export const GenerationRunSchema = z.object({
  schemaVersion: SchemaVersion,
  id: EntityIdSchema,
  projectId: EntityIdSchema,
  task: z.enum(['story-plan', 'volume-plan', 'chapter-plan', 'scene-plan', 'chapter-draft', 'continue', 'rewrite-selection', 'expand-selection', 'condense-selection', 'polish-selection', 'review', 'theatre-reply']),
  status: GenerationStatusSchema,
  provider: z.string().trim().min(1).max(80),
  model: z.string().trim().min(1).max(120),
  target: z.object({
    kind: z.enum(['project', 'volume', 'chapter', 'scene', 'selection', 'theatre-session']),
    id: EntityIdSchema,
  }),
  promptManifest: z.array(z.object({ id: EntityIdSchema, version: z.number().int().min(1) })).max(64),
  contextManifest: z.array(z.object({
    sourceId: EntityIdSchema,
    kind: z.string().trim().min(1).max(80),
    reason: z.string().trim().min(1).max(500),
    priority: z.number().int(),
    estimatedTokens: z.number().int().min(0),
    status: z.enum(['included', 'omitted-budget', 'missing']),
  })).max(4096),
  candidates: z.array(z.object({
    id: EntityIdSchema,
    artifact: z.string().trim().min(1).max(500),
    accepted: z.boolean().default(false),
  })).max(16),
  checkpoints: z.array(z.object({
    sequence: z.number().int().min(0),
    artifact: z.string().trim().min(1).max(500),
    characterCount: z.number().int().min(0),
    createdAt: IsoTimestampSchema,
  })).max(100_000),
  error: z.object({ code: z.string().trim().min(1), message: z.string().trim().min(1), retryable: z.boolean() }).optional(),
  createdAt: IsoTimestampSchema,
  updatedAt: IsoTimestampSchema,
});

export type GenerationRun = z.infer<typeof GenerationRunSchema>;
