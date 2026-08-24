import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { QualityReportSchema, QualityWaiverSchema, type QualityReport } from '../../shared/contracts/quality.js';
import type { CanonService } from '../canon/canon-service.js';
import type { ProjectRepository } from '../projects/project-repository.js';
import { lintChapter } from './deterministic-lint.js';
import { reviewContinuity } from './continuity-review.js';
import { canAccept, scoreQuality, type QualityCategoryScores } from './quality-scorer.js';

const ReportList = z.array(QualityReportSchema);
const baseline: QualityCategoryScores = { plotLogic: 7, character: 7, prose: 7, continuity: 7, viewpoint: 8, pacing: 8, dialogue: 7, serialHook: 7, originality: 8, mechanics: 10 };
const penalties = { info: 0.1, warning: 0.5, error: 2, fatal: 5 };

export function createQualityService(options: { repository: ProjectRepository; canon: CanonService; clock?: () => Date; idFactory?: () => string }) {
  const clock = options.clock ?? (() => new Date());
  const idFactory = options.idFactory ?? (() => `quality_${randomUUID().replaceAll('-', '').slice(0, 16)}`);
  async function list(projectId: string) { return ReportList.parse(await options.repository.readCanon(projectId, 'quality-reports') ?? []); }
  async function review(projectId: string, chapterId: string, mode: 'serial' | 'publication') {
    const revisions = await options.repository.listChapterRevisions(projectId, chapterId);
    const revision = revisions.at(-1);
    if (!revision) throw Object.assign(new Error('章节尚无正式修订，无法审校。'), { code: 'CHAPTER_REVISION_MISSING', statusCode: 404 });
    const content = await options.repository.readChapter(projectId, chapterId);
    const bundle = await options.canon.getBundle(projectId);
    const issues = [...lintChapter({ content, revisionId: revision.id, expectedCharacters: { min: 1000, max: 20_000 } }), ...reviewContinuity({ content, revisionId: revision.id, characters: bundle.characters })];
    const categoryScores = { ...baseline };
    for (const issue of issues) categoryScores[issue.category] = Math.max(0, categoryScores[issue.category] - penalties[issue.severity]);
    const score = scoreQuality(categoryScores);
    const report = QualityReportSchema.parse({
      schemaVersion: 1,
      id: idFactory(),
      projectId,
      chapterId,
      revisionId: revision.id,
      mode,
      total: score.total,
      threshold: mode === 'publication' ? 88 : 80,
      categoryScores,
      weightedScores: score.weighted,
      issues,
      fatalDefects: issues.filter((issue) => issue.severity === 'fatal').map((issue) => ({ code: issue.code, message: issue.message, issueIds: [issue.id] })),
      createdAt: clock().toISOString(),
    });
    const reports = await list(projectId);
    await options.repository.saveCanon(projectId, 'quality-reports', [...reports, report]);
    return { report, decision: canAccept(report, mode) };
  }
  async function waive(projectId: string, reportId: string, input: { author: string; note: string }) {
    const reports = await list(projectId);
    const index = reports.findIndex((report) => report.id === reportId);
    if (index < 0) throw Object.assign(new Error('审校报告不存在。'), { code: 'QUALITY_REPORT_NOT_FOUND', statusCode: 404 });
    reports[index] = QualityReportSchema.parse({ ...reports[index], waiver: QualityWaiverSchema.parse({ ...input, createdAt: clock().toISOString() }) });
    await options.repository.saveCanon(projectId, 'quality-reports', reports);
    return { report: reports[index], decision: canAccept(reports[index], reports[index].mode, reports[index].waiver) };
  }
  return { list, review, waive };
}

export type QualityService = ReturnType<typeof createQualityService>;
