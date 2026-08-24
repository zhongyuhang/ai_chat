import { describe, expect, it } from 'vitest';
import { canAccept, QUALITY_WEIGHTS, scoreQuality } from '../../src/server/quality/quality-scorer.js';
import { lintChapter } from '../../src/server/quality/deterministic-lint.js';

const scores = Object.fromEntries(Object.keys(QUALITY_WEIGHTS).map((key) => [key, 10])) as Record<keyof typeof QUALITY_WEIGHTS, number>;

describe('publication quality scoring', () => {
  it('uses exact approved weights that sum to 100', () => {
    const result = scoreQuality(scores);
    expect(result.total).toBe(100);
    expect(Object.values(QUALITY_WEIGHTS).reduce((sum, value) => sum + value, 0)).toBe(100);
    expect(Object.values(result.weighted).reduce((sum, value) => sum + value, 0)).toBe(100);
  });

  it('blocks fatal defects and publication scores below 88 unless an explicit waiver is recorded', () => {
    const report = { total: 96, fatalDefects: [{ code: 'TIMELINE_IMPOSSIBLE', message: '事件早于必要前因。' }] };
    expect(canAccept(report, 'publication')).toEqual({ allowed: false, reason: 'FATAL_DEFECTS', threshold: 88 });
    expect(canAccept({ total: 84, fatalDefects: [] }, 'publication')).toEqual({ allowed: false, reason: 'BELOW_THRESHOLD', threshold: 88 });
    expect(canAccept(report, 'publication', { author: 'local-user', note: '有意使用不可靠叙述', createdAt: '2026-08-24T00:00:00.000Z' })).toMatchObject({ allowed: true, waived: true, threshold: 88 });
    expect(canAccept({ total: 80, fatalDefects: [] }, 'serial')).toMatchObject({ allowed: true, threshold: 80 });
  });

  it('emits deterministic passage citations without inventing semantic defects', () => {
    const revisionId = 'revision_001';
    const content = '# 第一章\n\n“雨停了。\n\n他走进城门。\n\n他走进城门。';
    const issues = lintChapter({ content, revisionId, expectedCharacters: { min: 100, max: 10_000 } });
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'UNMATCHED_CHINESE_QUOTE', revisionId, start: expect.any(Number), end: expect.any(Number) }),
      expect.objectContaining({ code: 'REPEATED_PARAGRAPH', excerpt: '他走进城门。' }),
      expect.objectContaining({ code: 'CHAPTER_TOO_SHORT' }),
    ]));
    expect(issues.every((issue) => issue.start >= 0 && issue.end >= issue.start && issue.excerpt === content.slice(issue.start, issue.end))).toBe(true);
  });
});
