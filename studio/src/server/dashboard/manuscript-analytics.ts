import type { CanonService } from '../canon/canon-service.js';
import type { OutlineService } from '../outlines/outline-service.js';
import type { ProjectRepository } from '../projects/project-repository.js';

export async function analyzeProject(projectId: string, services: { repository: ProjectRepository; canon: CanonService; outlines: OutlineService }) {
  const [project, outline, canon] = await Promise.all([services.repository.getProject(projectId), services.outlines.getTree(projectId), services.canon.getBundle(projectId)]);
  if (!project) throw Object.assign(new Error('项目不存在。'), { code: 'PROJECT_NOT_FOUND', statusCode: 404 });
  const outlined = outline.volumes.flatMap((volume) => volume.chapters);
  const chapterIds = outlined.length ? outlined.map((chapter) => chapter.id) : await services.repository.listChapterIds(projectId);
  const revisions = await Promise.all(chapterIds.map((chapterId) => services.repository.listChapterRevisions(projectId, chapterId)));
  const accepted = revisions.map((items) => items.at(-1)).filter((item) => Boolean(item));
  return {
    projectId,
    volumeCount: outline.volumes.length,
    plannedChapterCount: chapterIds.length,
    acceptedChapterCount: accepted.length,
    missingChapterCount: chapterIds.length - accepted.length,
    acceptedCharacters: accepted.reduce((sum, revision) => sum + (revision?.characterCount ?? 0), 0),
    characterCount: canon.characters.length,
    relationshipCount: canon.relationships.length,
    worldBookCount: canon.worldBook.length,
    timelineEventCount: canon.timeline.length,
    unresolvedForeshadowing: canon.foreshadowing.filter((item) => item.status !== 'paid' && item.status !== 'abandoned').length,
    updatedAt: project.updatedAt,
  };
}
