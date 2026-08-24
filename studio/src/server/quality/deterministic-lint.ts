import type { QualityIssue } from '../../shared/contracts/quality.js';

interface LintInput {
  content: string;
  revisionId: string;
  expectedViewpoint?: string;
  expectedCharacters?: { min: number; max: number };
}

export function lintChapter(input: LintInput): QualityIssue[] {
  const { content, revisionId } = input;
  let sequence = 0;
  const issues: QualityIssue[] = [];
  const add = (issue: Omit<QualityIssue, 'id' | 'revisionId' | 'excerpt'> & { excerpt?: string }) => {
    const start = Math.max(0, Math.min(issue.start, content.length));
    const end = Math.max(start, Math.min(issue.end, content.length));
    issues.push({ ...issue, id: `quality_issue_${String(++sequence).padStart(4, '0')}`, revisionId, start, end, excerpt: issue.excerpt ?? content.slice(start, end) });
  };

  if (!content.trim()) add({ code: 'EMPTY_CHAPTER', category: 'mechanics', severity: 'fatal', start: 0, end: 0, message: '章节正文为空。' });
  if (content.trim() && !/^#{1,6}\s+\S/m.test(content)) add({ code: 'MISSING_CHAPTER_HEADING', category: 'mechanics', severity: 'warning', start: 0, end: Math.min(content.length, 120), message: '导出正文缺少 Markdown 章节标题。' });

  for (const [open, close] of [['“', '”'], ['‘', '’']] as const) {
    const opens = [...content.matchAll(new RegExp(open, 'gu'))];
    const closes = [...content.matchAll(new RegExp(close, 'gu'))];
    if (opens.length !== closes.length) {
      const position = (opens.at(-1) ?? closes.at(-1))?.index ?? 0;
      add({ code: 'UNMATCHED_CHINESE_QUOTE', category: 'mechanics', severity: 'error', start: position, end: Math.min(position + 1, content.length), message: `中文引号 ${open}${close} 未成对。` });
    }
  }

  const punctuation = /(?:[，。！？；：][,.!?;:]|[,.!?;:][，。！？；：])/gu.exec(content);
  if (punctuation?.index !== undefined) add({ code: 'MIXED_PUNCTUATION', category: 'mechanics', severity: 'warning', start: punctuation.index, end: punctuation.index + punctuation[0].length, message: '同一位置混用了全角与半角标点。' });

  const seen = new Map<string, number>();
  for (const match of content.matchAll(/(?:^|\n\s*\n)([^\n]+)(?=\n\s*\n|$)/gu)) {
    const paragraph = match[1].trim();
    if (paragraph.length < 5) continue;
    const start = (match.index ?? 0) + match[0].indexOf(match[1]) + match[1].indexOf(paragraph);
    if (seen.has(paragraph)) add({ code: 'REPEATED_PARAGRAPH', category: 'originality', severity: 'error', start, end: start + paragraph.length, message: '发现完全重复的段落。' });
    else seen.set(paragraph, start);
  }

  if (input.expectedViewpoint) {
    for (const match of content.matchAll(/(?:POV|视角)[：:]\s*([^\n】]+)/giu)) {
      const actual = match[1].trim();
      if (actual !== input.expectedViewpoint) add({ code: 'VIEWPOINT_LABEL_DRIFT', category: 'viewpoint', severity: 'error', start: match.index ?? 0, end: (match.index ?? 0) + match[0].length, message: `显式视角标记为“${actual}”，与章纲“${input.expectedViewpoint}”不一致。` });
    }
  }

  const characters = [...content].filter((value) => !/\s/u.test(value)).length;
  if (input.expectedCharacters && characters < input.expectedCharacters.min) add({ code: 'CHAPTER_TOO_SHORT', category: 'pacing', severity: 'warning', start: 0, end: Math.min(content.length, 200), message: `章节有效字符数 ${characters}，低于目标下限 ${input.expectedCharacters.min}。` });
  if (input.expectedCharacters && characters > input.expectedCharacters.max) add({ code: 'CHAPTER_TOO_LONG', category: 'pacing', severity: 'warning', start: Math.max(0, content.length - 200), end: content.length, message: `章节有效字符数 ${characters}，超过目标上限 ${input.expectedCharacters.max}。` });
  return issues;
}
