import type { ProjectRepository } from '../projects/project-repository.js';
import { createOutlineService } from '../outlines/outline-service.js';

export interface ManuscriptChapter { id: string; title: string; content: string; revisionId: string; characterCount: number }
export interface ManuscriptVolume { id: string; title: string; chapters: ManuscriptChapter[] }
export interface Manuscript {
  schemaVersion: 1;
  project: { id: string; title: string };
  generatedAt: string;
  volumes: ManuscriptVolume[];
}

export async function buildManuscript(projectId: string, repository: ProjectRepository, options: { includePlaceholders?: boolean; clock?: () => Date } = {}): Promise<Manuscript> {
  const project = await repository.getProject(projectId);
  if (!project) throw Object.assign(new Error('项目不存在。'), { code: 'PROJECT_NOT_FOUND', statusCode: 404 });
  const outline = await createOutlineService({ repository }).getTree(projectId);
  const volumes: ManuscriptVolume[] = [];
  for (const volume of outline.volumes) {
    const chapters: ManuscriptChapter[] = [];
    for (const chapter of volume.chapters) {
      const revisions = await repository.listChapterRevisions(projectId, chapter.id);
      const revision = revisions.at(-1);
      if (!revision) {
        if (options.includePlaceholders) chapters.push({ id: chapter.id, title: chapter.title, content: '', revisionId: 'revision_missing', characterCount: 0 });
        else throw Object.assign(new Error(`章纲“${chapter.title}”没有正式稿，导出已停止。`), { code: 'ACCEPTED_CHAPTER_MISSING', statusCode: 409 });
      } else {
        chapters.push({ id: chapter.id, title: chapter.title, content: await repository.readChapter(projectId, chapter.id), revisionId: revision.id, characterCount: revision.characterCount });
      }
    }
    volumes.push({ id: volume.id, title: volume.title, chapters });
  }
  if (!volumes.length) {
    const chapters: ManuscriptChapter[] = [];
    for (const chapterId of await repository.listChapterIds(projectId)) {
      const revisions = await repository.listChapterRevisions(projectId, chapterId);
      const revision = revisions.at(-1);
      if (!revision) continue;
      const content = await repository.readChapter(projectId, chapterId);
      const title = /^#{1,6}\s+([^\n]+)/mu.exec(content)?.[1]?.trim() || chapterId;
      chapters.push({ id: chapterId, title, content, revisionId: revision.id, characterCount: revision.characterCount });
    }
    if (chapters.length) volumes.push({ id: 'volume_unplanned', title: '正文', chapters });
  }
  return { schemaVersion: 1, project: { id: project.id, title: project.title }, generatedAt: (options.clock ?? (() => new Date()))().toISOString(), volumes };
}
