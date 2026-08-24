import { z } from 'zod';

export const SchemaVersion = z.literal(1);
export const EntityIdSchema = z.string().regex(/^[a-z][a-z0-9_-]{2,63}$/, 'ID 格式不合法');
export const IsoTimestampSchema = z.string().datetime({ offset: true });
export const NonEmptyTextSchema = z.string().trim().min(1);
export const SourceReferenceSchema = z.object({
  sourceId: EntityIdSchema,
  note: z.string().trim().max(500).default(''),
});

export const ContentRatingSchema = z.enum(['general', 'teen', 'mature', 'adult']);
export const WritingModeSchema = z.enum(['serial', 'publication', 'both']);
