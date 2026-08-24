import { z } from 'zod';
import { EntityIdSchema } from './common.js';

export const ContextManifestStatusSchema = z.enum(['included', 'omitted-budget', 'missing']);

export const ContextManifestEntrySchema = z.object({
  sourceId: EntityIdSchema,
  kind: z.string().trim().min(1).max(80),
  reason: z.string().trim().min(1).max(500),
  priority: z.number().int(),
  estimatedTokens: z.number().int().min(0),
  status: ContextManifestStatusSchema,
});

export const ContextComponentSchema = z.object({
  sourceId: EntityIdSchema,
  kind: z.string().trim().min(1).max(80),
  content: z.string().min(1).max(20_000_000),
  reason: z.string().trim().min(1).max(500),
  priority: z.number().int(),
  mandatory: z.boolean().default(false),
});

export type ContextManifestEntry = z.infer<typeof ContextManifestEntrySchema>;
export type ContextComponent = z.input<typeof ContextComponentSchema>;
