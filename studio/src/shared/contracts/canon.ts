import { z } from 'zod';
import { EntityIdSchema, IsoTimestampSchema, SchemaVersion } from './common.js';

const StringList = z.array(z.string().trim().min(1).max(500)).max(256).default([]);
const CurrentStateSchema = z.object({
  physical: z.string().trim().max(5000).default(''),
  emotional: z.string().trim().max(5000).default(''),
  relational: z.string().trim().max(5000).default(''),
  knowledge: z.string().trim().max(5000).default(''),
}).default({ physical: '', emotional: '', relational: '', knowledge: '' });

export const CanonFactSchema = z.object({
  fact: z.string().trim().min(1).max(2000),
  sourceId: EntityIdSchema,
  immutable: z.boolean().default(true),
  confirmedAt: IsoTimestampSchema.optional(),
});

export const CharacterSchema = z.object({
  schemaVersion: SchemaVersion,
  id: EntityIdSchema,
  name: z.string().trim().min(1).max(120),
  aliases: z.array(z.string().trim().min(1).max(120)).max(64).default([]),
  age: z.string().trim().max(120).default(''),
  identity: z.string().trim().max(2000).default(''),
  appearance: z.string().trim().max(10_000).default(''),
  background: z.string().trim().max(30_000).default(''),
  goals: StringList,
  fears: StringList,
  secrets: StringList,
  values: StringList,
  abilities: StringList,
  limitations: StringList,
  speechPatterns: StringList,
  currentState: CurrentStateSchema,
  arcMilestones: z.array(z.object({
    id: EntityIdSchema,
    stage: z.string().trim().min(1).max(120),
    change: z.string().trim().min(1).max(5000),
    sourceId: EntityIdSchema.optional(),
  })).max(256).default([]),
  canonFacts: z.array(CanonFactSchema).max(1024).default([]),
  exampleDialogue: StringList,
  roleplayBoundaries: StringList,
  createdAt: IsoTimestampSchema,
  updatedAt: IsoTimestampSchema,
});

export const RelationshipSchema = z.object({
  schemaVersion: SchemaVersion,
  id: EntityIdSchema,
  fromCharacterId: EntityIdSchema,
  toCharacterId: EntityIdSchema,
  publicRelationship: z.string().trim().max(3000).default(''),
  privateFeelings: z.string().trim().max(5000).default(''),
  trust: z.number().min(-100).max(100).default(0),
  conflict: z.string().trim().max(5000).default(''),
  leverage: z.string().trim().max(5000).default(''),
  sharedSecrets: StringList,
  history: z.array(z.object({
    id: EntityIdSchema,
    at: IsoTimestampSchema,
    change: z.string().trim().min(1).max(5000),
    sourceId: EntityIdSchema,
  })).max(2048).default([]),
  createdAt: IsoTimestampSchema,
  updatedAt: IsoTimestampSchema,
}).refine((relationship) => relationship.fromCharacterId !== relationship.toCharacterId, {
  message: '关系两端不能是同一角色',
  path: ['toCharacterId'],
});

const KeywordActivationSchema = z.object({
  type: z.literal('keyword'),
  keywords: z.array(z.string().trim().min(1).max(80)).min(1).max(64),
  synonyms: z.array(z.string().trim().min(1).max(80)).max(128).default([]),
});
const ConstantActivationSchema = z.object({ type: z.literal('constant') });
const StageActivationSchema = z.object({
  type: z.literal('stage'),
  stages: z.array(z.string().trim().min(1).max(80)).min(1).max(32),
});

export const WorldBookActivationSchema = z.discriminatedUnion('type', [
  KeywordActivationSchema,
  ConstantActivationSchema,
  StageActivationSchema,
]);

export const WorldBookScopeSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('global') }),
  z.object({ type: z.literal('volume'), id: EntityIdSchema }),
  z.object({ type: z.literal('chapter'), id: EntityIdSchema }),
  z.object({ type: z.literal('character'), id: EntityIdSchema }),
  z.object({ type: z.literal('theatre'), id: EntityIdSchema }),
]);

export const WorldBookEntrySchema = z.object({
  schemaVersion: SchemaVersion,
  id: EntityIdSchema,
  name: z.string().trim().min(1).max(160),
  category: z.string().trim().min(1).max(120),
  aliases: z.array(z.string().trim().min(1).max(120)).max(64).default([]),
  content: z.string().trim().min(1).max(100_000),
  scope: WorldBookScopeSchema,
  activation: WorldBookActivationSchema,
  priority: z.number().int().min(0).max(1000).default(50),
  insertion: z.enum(['before-outline', 'before-recent', 'after-recent']).default('before-outline'),
  enabled: z.boolean().default(true),
  tokenLimit: z.number().int().min(32).max(32_000).default(2000),
  status: z.enum(['proposal', 'confirmed', 'rejected']).default('proposal'),
  sourceId: EntityIdSchema.optional(),
  lastConfirmedId: EntityIdSchema.optional(),
  createdAt: IsoTimestampSchema,
  updatedAt: IsoTimestampSchema,
});

export const TimelineEventSchema = z.object({
  schemaVersion: SchemaVersion,
  id: EntityIdSchema,
  title: z.string().trim().min(1).max(300),
  inWorldTime: z.string().trim().min(1).max(300),
  duration: z.string().trim().max(300).default(''),
  locationId: EntityIdSchema.optional(),
  participantIds: z.array(EntityIdSchema).max(128).default([]),
  dependencyIds: z.array(EntityIdSchema).max(128).default([]),
  sourceId: EntityIdSchema,
  confidence: z.number().min(0).max(1).default(1),
  createdAt: IsoTimestampSchema,
  updatedAt: IsoTimestampSchema,
});

export const ForeshadowingSchema = z.object({
  schemaVersion: SchemaVersion,
  id: EntityIdSchema,
  setup: z.string().trim().min(1).max(10_000),
  intendedPayoff: z.string().trim().min(1).max(10_000),
  status: z.enum(['planned', 'planted', 'partially-paid', 'paid', 'abandoned']),
  deadlineStartId: EntityIdSchema.optional(),
  deadlineEndId: EntityIdSchema.optional(),
  involvedCharacterIds: z.array(EntityIdSchema).max(128).default([]),
  setupSourceId: EntityIdSchema,
  actualPayoffId: EntityIdSchema.optional(),
  createdAt: IsoTimestampSchema,
  updatedAt: IsoTimestampSchema,
});

export type Character = z.infer<typeof CharacterSchema>;
export type Relationship = z.infer<typeof RelationshipSchema>;
export type WorldBookEntry = z.infer<typeof WorldBookEntrySchema>;
export type TimelineEvent = z.infer<typeof TimelineEventSchema>;
export type Foreshadowing = z.infer<typeof ForeshadowingSchema>;
