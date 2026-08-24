import type { Manuscript } from './manuscript-model.js';

function bodyWithoutLeadingHeading(content: string) {
  return content.replace(/^#{1,6}\s+[^\n]+\n+/, '').trim();
}

export function renderMarkdown(manuscript: Manuscript): string {
  const parts = [`# ${manuscript.project.title}`];
  for (const volume of manuscript.volumes) {
    parts.push(`## ${volume.title}`);
    for (const chapter of volume.chapters) parts.push(`### ${chapter.title}\n\n${bodyWithoutLeadingHeading(chapter.content)}`);
  }
  return `${parts.join('\n\n')}\n`;
}
