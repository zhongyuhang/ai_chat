import type { Manuscript } from './manuscript-model.js';

function plain(content: string) {
  return content
    .replace(/^#{1,6}\s+[^\n]+\n+/u, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/gu, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, '$1')
    .replace(/[*_~`]+/gu, '')
    .trim();
}

export function renderText(manuscript: Manuscript): string {
  const parts = [manuscript.project.title];
  for (const volume of manuscript.volumes) {
    parts.push(volume.title);
    for (const chapter of volume.chapters) parts.push(`${chapter.title}\n\n${plain(chapter.content)}`);
  }
  return `${parts.join('\n\n')}\n`;
}
