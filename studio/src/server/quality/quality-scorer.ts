import { QualityWaiverSchema, type QualityWaiver } from '../../shared/contracts/quality.js';

export const QUALITY_WEIGHTS = {
  plotLogic: 15,
  character: 15,
  prose: 15,
  continuity: 10,
  viewpoint: 10,
  pacing: 10,
  dialogue: 10,
  serialHook: 5,
  originality: 5,
  mechanics: 5,
} as const;

export type QualityCategory = keyof typeof QUALITY_WEIGHTS;
export type QualityCategoryScores = Record<QualityCategory, number>;

export function scoreQuality(input: QualityCategoryScores) {
  const weighted = {} as Record<QualityCategory, number>;
  for (const category of Object.keys(QUALITY_WEIGHTS) as QualityCategory[]) {
    const score = input[category];
    if (!Number.isFinite(score) || score < 0 || score > 10) throw Object.assign(new Error(`质量分项 ${category} 必须位于 0..10。`), { code: 'QUALITY_SCORE_INVALID' });
    weighted[category] = Math.round((score / 10) * QUALITY_WEIGHTS[category] * 100) / 100;
  }
  return { weighted, total: Math.round(Object.values(weighted).reduce((sum, value) => sum + value, 0) * 100) / 100 };
}

export function canAccept(report: { total: number; fatalDefects: Array<{ code: string; message: string }> }, mode: 'serial' | 'publication', waiver?: QualityWaiver) {
  const threshold = mode === 'publication' ? 88 : 80;
  if (waiver) {
    const parsed = QualityWaiverSchema.parse(waiver);
    return { allowed: true as const, waived: true as const, waiver: parsed, threshold };
  }
  if (report.fatalDefects.length) return { allowed: false as const, reason: 'FATAL_DEFECTS' as const, threshold };
  if (report.total < threshold) return { allowed: false as const, reason: 'BELOW_THRESHOLD' as const, threshold };
  return { allowed: true as const, waived: false as const, threshold };
}
