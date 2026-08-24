import { describe, expect, it } from 'vitest';
import { applyPatches } from '../../src/server/quality/patch-applier.js';
import { runRevisionPipeline } from '../../src/server/quality/revision-pipeline.js';

describe('bounded targeted revision', () => {
  it('rejects stale, frozen and overlapping patches', () => {
    expect(() => applyPatches({ source: '当前正文', sourceRevisionId: 'revision_old', currentRevisionId: 'revision_new', frozenRanges: [], patches: [] })).toThrow(expect.objectContaining({ code: 'SOURCE_REVISION_CHANGED' }));
    expect(() => applyPatches({ source: '不可修改的句子。其余正文。', sourceRevisionId: 'revision_001', currentRevisionId: 'revision_001', frozenRanges: [{ start: 0, end: 8 }], patches: [{ start: 2, end: 6, replacement: '修改' }] })).toThrow(expect.objectContaining({ code: 'FROZEN_RANGE' }));
    expect(() => applyPatches({ source: 'abcdefghij', sourceRevisionId: 'revision_001', currentRevisionId: 'revision_001', frozenRanges: [], patches: [{ start: 1, end: 5, replacement: 'x' }, { start: 4, end: 7, replacement: 'y' }] })).toThrow(expect.objectContaining({ code: 'PATCH_OVERLAP' }));
  });

  it('applies validated patches from end to start and records exact changes', () => {
    const result = applyPatches({ source: '甲走进城。乙留在门外。', sourceRevisionId: 'revision_001', currentRevisionId: 'revision_001', frozenRanges: [], patches: [
      { start: 0, end: 1, sourceExcerpt: '甲', replacement: '林默' },
      { start: 5, end: 6, sourceExcerpt: '乙', replacement: '苏晚' },
    ] });
    expect(result.content).toBe('林默走进城。苏晚留在门外。');
    expect(result.changes).toHaveLength(2);
  });

  it('stops after the configured maximum passes when still below threshold', async () => {
    const scores = [60, 70, 75, 79];
    const result = await runRevisionPipeline({
      source: '初稿',
      sourceRevisionId: 'revision_001',
      mode: 'serial',
      maxPasses: 3,
      review: async (content, pass) => ({ total: scores[pass], fatalDefects: [], patches: [{ start: 0, end: content.length, sourceExcerpt: content, replacement: `第${pass + 1}稿` }] }),
    });
    expect(result.passes).toHaveLength(3);
    expect(result.status).toBe('below-threshold');
    expect(result.content).toBe('第3稿');
  });
});
