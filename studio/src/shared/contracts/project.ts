import { z } from 'zod';
import {
  ContentRatingSchema,
  EntityIdSchema,
  IsoTimestampSchema,
  SchemaVersion,
  WritingModeSchema,
} from './common.js';

export const QualityThresholdsSchema = z.object({
  serial: z.number().min(0).max(100).default(80),
  publication: z.number().min(0).max(100).default(88),
}).refine((quality) => quality.publication >= quality.serial, {
  message: '出版门槛不得低于连载门槛',
  path: ['publication'],
});

export const NarrativeDefaultsSchema = z.object({
  pointOfView: z.string().trim().max(120).default('第三人称限知'),
  tense: z.string().trim().max(80).default('过去时'),
  tone: z.array(z.string().trim().min(1).max(80)).max(24).default([]),
  styleProfile: z.string().trim().max(500).default(''),
  chapterCharacters: z.number().int().min(500).max(100_000).default(4000),
  languageRules: z.array(z.string().trim().min(1).max(300)).max(64).default([]),
});

export const ProjectSchema = z.object({
  schemaVersion: SchemaVersion,
  id: EntityIdSchema,
  title: z.string().trim().min(1).max(160),
  synopsis: z.string().trim().max(20_000).default(''),
  genres: z.array(z.string().trim().min(1).max(80)).max(24).default([]),
  audience: z.string().trim().max(300).default(''),
  targetCharacters: z.number().int().min(1_000).max(20_000_000).default(1_000_000),
  status: z.enum(['draft', 'active', 'archived', 'completed']).default('draft'),
  contentRating: ContentRatingSchema.default('teen'),
  prohibitedElements: z.array(z.string().trim().min(1).max(300)).max(128).default([]),
  writingMode: WritingModeSchema,
  narrative: NarrativeDefaultsSchema.default({
    pointOfView: '第三人称限知',
    tense: '过去时',
    tone: [],
    styleProfile: '',
    chapterCharacters: 4000,
    languageRules: [],
  }),
  model: z.object({
    provider: z.literal('deepseek').default('deepseek'),
    model: z.string().trim().min(1).max(120).default('deepseek-v4-flash'),
    contextWindow: z.number().int().min(4_000).max(2_000_000).default(128_000),
  }).default({ provider: 'deepseek', model: 'deepseek-v4-flash', contextWindow: 128_000 }),
  quality: QualityThresholdsSchema.default({ serial: 80, publication: 88 }),
  createdAt: IsoTimestampSchema,
  updatedAt: IsoTimestampSchema,
  lastBackedUpAt: IsoTimestampSchema.optional(),
});

export const CreateProjectInputSchema = ProjectSchema.pick({
  title: true,
  synopsis: true,
  genres: true,
  audience: true,
  targetCharacters: true,
  contentRating: true,
  prohibitedElements: true,
  writingMode: true,
  narrative: true,
  quality: true,
}).partial().required({ title: true, writingMode: true });

export type Project = z.infer<typeof ProjectSchema>;
export type CreateProjectInput = z.input<typeof CreateProjectInputSchema>;
