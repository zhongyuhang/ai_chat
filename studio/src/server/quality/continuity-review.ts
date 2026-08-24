import type { Character } from '../../shared/contracts/canon.js';
import type { QualityIssue } from '../../shared/contracts/quality.js';

export function reviewContinuity(input: { content: string; revisionId: string; characters: Character[] }): QualityIssue[] {
  const issues: QualityIssue[] = [];
  let sequence = 0;
  for (const character of input.characters) {
    const expectedAge = Number.parseInt(character.age, 10);
    if (!Number.isFinite(expectedAge)) continue;
    const pattern = new RegExp(`${character.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^。！？\\n]{0,20}?([0-9一二三四五六七八九十百]+)岁`, 'gu');
    for (const match of input.content.matchAll(pattern)) {
      const stated = Number(match[1]);
      if (Number.isFinite(stated) && stated !== expectedAge) {
        const start = match.index ?? 0;
        issues.push({ id: `continuity_issue_${String(++sequence).padStart(4, '0')}`, code: 'CHARACTER_AGE_CONTRADICTION', revisionId: input.revisionId, category: 'continuity', severity: 'fatal', start, end: start + match[0].length, excerpt: match[0], message: `${character.name} 的已确认年龄为 ${expectedAge}，正文明确写成 ${stated} 岁。` });
      }
    }
  }
  return issues;
}
