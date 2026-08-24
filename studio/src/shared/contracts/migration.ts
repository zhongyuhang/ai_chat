import { z } from 'zod';

export const LegacyMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system', 'error']),
  content: z.string().max(20_000_000),
  createdAt: z.string().optional(),
}).passthrough();

export const LegacySessionSchema = z.object({
  id: z.string().min(1).max(500),
  title: z.string().min(1).max(500),
  summary: z.string().max(1_000_000).optional().default(''),
  messages: z.array(LegacyMessageSchema).max(1_000_000),
}).passthrough();

export const LegacyExportSchema = z.object({
  settings: z.record(z.string(), z.unknown()).optional().default({}),
  sessions: z.array(z.unknown()).max(100_000),
}).passthrough();

export const LegacyMigrationApplySchema = z.object({
  payload: z.unknown(),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
});

export type LegacySession = z.infer<typeof LegacySessionSchema>;
