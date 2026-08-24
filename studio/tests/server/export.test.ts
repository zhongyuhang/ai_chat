import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { createProjectRepository } from '../../src/server/projects/project-repository.js';
import { createOutlineService } from '../../src/server/outlines/outline-service.js';
import { buildManuscript } from '../../src/server/export/manuscript-model.js';
import { renderMarkdown } from '../../src/server/export/markdown-export.js';
import { renderText } from '../../src/server/export/text-export.js';
import { renderPortableJson } from '../../src/server/export/json-export.js';
import { renderDocx } from '../../src/server/export/docx-export.js';

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe('accepted manuscript exports', () => {
  it('falls back to accepted chapter filenames when no outline exists yet', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'novel-studio-export-fallback-')); roots.push(dataRoot);
    const repository = createProjectRepository({ dataRoot });
    const project = await repository.createProject({ title: '无章纲作品', writingMode: 'serial' });
    await repository.saveChapterRevision(project.id, 'chapter_002', '# 第二章\n\n正文二。', { reason: 'accepted' });
    await repository.saveChapterRevision(project.id, 'chapter_001', '# 第一章\n\n正文一。', { reason: 'accepted' });
    const manuscript = await buildManuscript(project.id, repository);
    expect(manuscript.volumes[0].chapters.map((chapter) => chapter.id)).toEqual(['chapter_001', 'chapter_002']);
  });

  it('exports accepted chapters in outline order with no candidate or secret internals', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'novel-studio-export-')); roots.push(dataRoot);
    let sequence = 0; const repository = createProjectRepository({ dataRoot, idFactory: (prefix) => `${prefix}_${String(++sequence).padStart(4, '0')}` });
    const project = await repository.createProject({ title: '雾城来信', writingMode: 'publication' });
    const outlines = createOutlineService({ repository });
    await outlines.saveVolume(project.id, { id: 'volume_001', title: '第一卷 雾城' });
    await outlines.saveChapterOutline(project.id, 'volume_001', { id: 'chapter_001', title: '第一章 雨夜', purpose: '入城' });
    await outlines.saveChapterOutline(project.id, 'volume_001', { id: 'chapter_002', title: '第二章 镜门', purpose: '交锋' });
    await repository.saveChapterRevision(project.id, 'chapter_001', '# 第一章 雨夜\n\n正式正文一。', { reason: 'accepted' });
    await repository.saveChapterRevision(project.id, 'chapter_002', '# 第二章 镜门\n\n正式正文二。', { reason: 'accepted' });
    await repository.saveCanon(project.id, 'characters', [{ secret: 'API_KEY_SHOULD_NOT_EXPORT' }]);

    const manuscript = await buildManuscript(project.id, repository);
    expect(manuscript.volumes[0].chapters.map((chapter) => chapter.title)).toEqual(['第一章 雨夜', '第二章 镜门']);
    const markdown = renderMarkdown(manuscript);
    expect(markdown).toContain('正式正文一。');
    expect(markdown.indexOf('正式正文一。')).toBeLessThan(markdown.indexOf('正式正文二。'));
    expect(renderText(manuscript)).not.toContain('# ');
    const portable = JSON.parse(renderPortableJson(manuscript));
    expect(portable.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(portable)).not.toContain('API_KEY_SHOULD_NOT_EXPORT');
  });

  it('creates a readable DOCX with Chinese volume/chapter headings and body text', async () => {
    const bytes = await renderDocx({ schemaVersion: 1, project: { id: 'project_001', title: '雾城来信' }, generatedAt: '2026-08-24T00:00:00.000Z', volumes: [{ id: 'volume_001', title: '第一卷', chapters: [{ id: 'chapter_001', title: '第一章', content: '# 第一章\n\n正文第一段。', revisionId: 'revision_001', characterCount: 6 }] }] });
    expect(bytes.subarray(0, 2).toString()).toBe('PK');
    const zip = await JSZip.loadAsync(bytes);
    const documentXml = await zip.file('word/document.xml')!.async('string');
    expect(documentXml).toContain('第一卷');
    expect(documentXml).toContain('第一章');
    expect(documentXml).toContain('正文第一段');
  });
});
