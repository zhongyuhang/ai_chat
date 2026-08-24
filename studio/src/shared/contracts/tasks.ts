import { z } from 'zod';
import { EntityIdSchema } from './common.js';

export const WritingTaskSchema = z.object({
  kind: z.enum(['story-plan', 'volume-plan', 'chapter-plan', 'scene-plan', 'chapter-draft', 'continue', 'rewrite-selection', 'expand-selection', 'condense-selection', 'polish-selection', 'theatre-reply']),
  projectId: EntityIdSchema,
  target: z.object({
    kind: z.enum(['project', 'volume', 'chapter', 'scene', 'selection', 'theatre-session']),
    id: EntityIdSchema,
  }),
  instruction: z.string().trim().min(1).max(100_000),
  candidateCount: z.number().int().min(1).max(3).default(1),
  model: z.string().trim().min(1).default('deepseek-v4-flash'),
  requestedOutputTokens: z.number().int().min(256).max(384_000).default(8192),
  sourceRevisionId: EntityIdSchema.optional(),
  selection: z.object({
    start: z.number().int().min(0),
    end: z.number().int().min(0),
    textHash: z.string().regex(/^[a-f0-9]{64}$/),
  }).optional(),
});

export type WritingTask = z.input<typeof WritingTaskSchema>;
