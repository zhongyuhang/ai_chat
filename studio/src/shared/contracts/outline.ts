import { z } from 'zod';
import { EntityIdSchema, IsoTimestampSchema, SchemaVersion } from './common.js';

const TextList = z.array(z.string().trim().min(1).max(2000)).max(256).default([]);

export const SceneCardSchema = z.object({
  id: EntityIdSchema,
  title: z.string().trim().min(1).max(300),
  participantIds: z.array(EntityIdSchema).max(128).default([]),
  entryState: z.string().trim().max(10_000).default(''),
  beats: TextList,
  exitState: z.string().trim().max(10_000).default(''),
  requiredCanonIds: z.array(EntityIdSchema).max(256).default([]),
  prohibitedOutcomes: TextList,
});

export const ChapterOutlineSchema = z.object({
  id: EntityIdSchema,
  title: z.string().trim().min(1).max(300),
  purpose: z.string().trim().max(5000).default(''),
  viewpointCharacterId: EntityIdSchema.optional(),
  locationIds: z.array(EntityIdSchema).max(64).default([]),
  inWorldTime: z.string().trim().max(300).default(''),
  conflict: z.string().trim().max(5000).default(''),
  reveal: z.string().trim().max(5000).default(''),
  emotionalChange: z.string().trim().max(5000).default(''),
  foreshadowingIds: z.array(EntityIdSchema).max(128).default([]),
  payoffIds: z.array(EntityIdSchema).max(128).default([]),
  endingHook: z.string().trim().max(5000).default(''),
  scenes: z.array(SceneCardSchema).max(256).default([]),
});

export const VolumeOutlineSchema = z.object({
  id: EntityIdSchema,
  title: z.string().trim().min(1).max(300),
  goal: z.string().trim().max(10_000).default(''),
  turningPoints: TextList,
  characterChanges: TextList,
  unresolvedHooks: TextList,
  chapters: z.array(ChapterOutlineSchema).max(1000).default([]),
});

export const OutlineSchema = z.object({
  schemaVersion: SchemaVersion,
  premise: z.string().trim().max(20_000).default(''),
  themes: TextList,
  coreConflict: z.string().trim().max(20_000).default(''),
  endingContract: z.string().trim().max(20_000).default(''),
  setting: z.string().trim().max(50_000).default(''),
  style: z.string().trim().max(20_000).default(''),
  volumes: z.array(VolumeOutlineSchema).max(256).default([]),
  updatedAt: IsoTimestampSchema,
});

export const ChapterMetaSchema = z.object({
  schemaVersion: SchemaVersion,
  id: EntityIdSchema,
  volumeId: EntityIdSchema,
  title: z.string().trim().min(1).max(300),
  order: z.number().int().min(0),
  status: z.enum(['planned', 'drafting', 'candidate', 'accepted', 'locked']).default('planned'),
  characterCount: z.number().int().min(0).default(0),
  acceptedRevisionId: EntityIdSchema.optional(),
  createdAt: IsoTimestampSchema,
  updatedAt: IsoTimestampSchema,
});

export type Outline = z.infer<typeof OutlineSchema>;
export type ChapterMeta = z.infer<typeof ChapterMetaSchema>;
