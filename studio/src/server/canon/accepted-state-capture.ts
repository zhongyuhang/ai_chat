import type { CanonService } from './canon-service.js';
import type { ChapterStateService } from './chapter-state-service.js';
import type { OutlineService } from '../outlines/outline-service.js';

export function createAcceptedStateCapture(services: { canon: CanonService; chapterStates: ChapterStateService; outlines: OutlineService }) {
  return async (projectId: string, chapterId: string, revisionId: string) => {
    const [bundle, outline] = await Promise.all([services.canon.getBundle(projectId), services.outlines.getTree(projectId)]);
    const volume = outline.volumes.find((item) => item.chapters.some((chapter) => chapter.id === chapterId));
    const chapter = volume?.chapters.find((item) => item.id === chapterId);
    return services.chapterStates.capture(projectId, {
      chapterId,
      revisionId,
      characters: bundle.characters.map((character) => ({
        id: character.id,
        facts: {
          physical: character.currentState.physical,
          emotional: character.currentState.emotional,
          relational: character.currentState.relational,
          knowledge: character.currentState.knowledge,
        },
      })),
      relationships: bundle.relationships,
      timelineEvents: bundle.timeline,
      revealedKnowledge: bundle.characters.filter((character) => character.currentState.knowledge).map((character) => ({ characterId: character.id, knowledge: character.currentState.knowledge })),
      activeGoals: bundle.characters.flatMap((character) => character.goals.map((goal) => ({ characterId: character.id, goal }))),
      unresolvedHooks: [...(volume?.unresolvedHooks ?? []), ...(chapter?.endingHook ? [chapter.endingHook] : [])],
      foreshadowing: bundle.foreshadowing.filter((item) => item.status !== 'paid' && item.status !== 'abandoned'),
    });
  };
}
