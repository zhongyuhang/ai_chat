import { z } from 'zod';
import { EntityIdSchema, IsoTimestampSchema, SchemaVersion } from './common.js';

export const QualityModeSchema = z.enum(['serial', 'publication']);
export const QualityCategorySchema = z.enum(['plotLogic', 'character', 'prose', 'continuity', 'viewpoint', 'pacing', 'dialogue', 'serialHook', 'originality', 'mechanics']);
export const QualityIssueSchema = z.object({
  id: EntityIdSchema,
  code: z.string().trim().min(1).max(120),
  revisionId: EntityIdSchema,
  category: QualityCategorySchema,
  severity: z.enum(['info', 'warning', 'error', 'fatal']),
  start: z.number().int().min(0),
  end: z.number().int().min(0),
  excerpt: z.string().max(5000),
  message: z.string().trim().min(1).max(2000),
}).refine((issue) => issue.end >= issue.start, { path: ['end'], message: '问题范围结束位置不能早于开始位置' });

export const FatalDefectSchema = z.object({
  code: z.string().trim().min(1).max(120),
  message: z.string().trim().min(1).max(2000),
  issueIds: z.array(EntityIdSchema).default([]),
});

export const QualityWaiverSchema = z.object({
  author: z.string().trim().min(1).max(120),
  note: z.string().trim().min(1).max(5000),
  createdAt: IsoTimestampSchema,
});

export const QualityReportSchema = z.object({
  schemaVersion: SchemaVersion,
  id: EntityIdSchema,
  projectId: EntityIdSchema,
  chapterId: EntityIdSchema,
  revisionId: EntityIdSchema,
  mode: QualityModeSchema,
  total: z.number().min(0).max(100),
  threshold: z.number().min(0).max(100),
  categoryScores: z.record(QualityCategorySchema, z.number().min(0).max(10)),
  weightedScores: z.record(QualityCategorySchema, z.number().min(0)),
  issues: z.array(QualityIssueSchema),
  fatalDefects: z.array(FatalDefectSchema),
  waiver: QualityWaiverSchema.optional(),
  createdAt: IsoTimestampSchema,
});

export type QualityIssue = z.infer<typeof QualityIssueSchema>;
export type QualityReport = z.infer<typeof QualityReportSchema>;
export type QualityWaiver = z.infer<typeof QualityWaiverSchema>;
