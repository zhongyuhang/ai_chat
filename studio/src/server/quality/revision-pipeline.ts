import { canAccept } from './quality-scorer.js';
import { applyPatches, type TextPatch, type TextRange } from './patch-applier.js';

interface ReviewResult {
  total: number;
  fatalDefects: Array<{ code: string; message: string }>;
  patches: TextPatch[];
}

export async function runRevisionPipeline(options: {
  source: string;
  sourceRevisionId: string;
  mode: 'serial' | 'publication';
  maxPasses?: number;
  frozenRanges?: TextRange[];
  signal?: AbortSignal;
  review: (content: string, pass: number) => Promise<ReviewResult>;
}) {
  const maxPasses = options.maxPasses ?? 3;
  if (!Number.isInteger(maxPasses) || maxPasses < 1 || maxPasses > 5) throw Object.assign(new Error('自动修订轮数必须位于 1..5。'), { code: 'REVISION_PASS_LIMIT_INVALID' });
  let content = options.source;
  const passes: Array<{ index: number; input: string; report: ReviewResult; changes: ReturnType<typeof applyPatches>['changes'] }> = [];
  let status: 'accepted' | 'below-threshold' | 'no-applicable-patches' | 'cancelled' = 'below-threshold';

  for (let pass = 0; pass < maxPasses; pass += 1) {
    if (options.signal?.aborted) { status = 'cancelled'; break; }
    const report = await options.review(content, pass);
    if (canAccept(report, options.mode).allowed) {
      passes.push({ index: pass + 1, input: content, report, changes: [] });
      status = 'accepted';
      break;
    }
    if (!report.patches.length) {
      passes.push({ index: pass + 1, input: content, report, changes: [] });
      status = 'no-applicable-patches';
      break;
    }
    const patched = applyPatches({ source: content, sourceRevisionId: options.sourceRevisionId, currentRevisionId: options.sourceRevisionId, frozenRanges: options.frozenRanges ?? [], patches: report.patches });
    passes.push({ index: pass + 1, input: content, report, changes: patched.changes });
    content = patched.content;
  }
  return { status, content, passes, maxPasses, sourceRevisionId: options.sourceRevisionId };
}
