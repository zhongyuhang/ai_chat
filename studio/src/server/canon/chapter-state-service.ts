import { z } from 'zod';
import { EntityIdSchema, IsoTimestampSchema } from '../../shared/contracts/common.js';
import type { ProjectRepository } from '../projects/project-repository.js';

const FactValue = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const ChapterStateSchema = z.object({
  schemaVersion: z.literal(1),
  chapterId: EntityIdSchema,
  revisionId: EntityIdSchema,
  characters: z.array(z.object({ id: EntityIdSchema, facts: z.record(z.string(), FactValue) })),
  relationships: z.array(z.unknown()),
  timelineEvents: z.array(z.unknown()),
  revealedKnowledge: z.array(z.unknown()),
  activeGoals: z.array(z.unknown()),
  unresolvedHooks: z.array(z.unknown()),
  foreshadowing: z.array(z.unknown()),
  capturedAt: IsoTimestampSchema,
});
const StateList = z.array(ChapterStateSchema);
const FactIndex = z.record(z.string(), z.object({
  value: FactValue,
  chapterId: EntityIdSchema,
  revisionId: EntityIdSchema,
}));

export function createChapterStateService(options: { repository: ProjectRepository; clock?: () => Date }) {
  const clock = options.clock ?? (() => new Date());
  async function states(projectId: string) {
    return StateList.parse(await options.repository.readCanon(projectId, 'chapter-states') ?? []);
  }
  async function rebuildIndex(projectId: string) {
    const index: z.infer<typeof FactIndex> = {};
    for (const state of await states(projectId)) {
      for (const character of state.characters) {
        for (const [key, value] of Object.entries(character.facts)) {
          index[`character:${character.id}:${key}`] = { value, chapterId: state.chapterId, revisionId: state.revisionId };
        }
      }
    }
    const parsed = FactIndex.parse(index);
    await options.repository.saveCanon(projectId, 'fact-index', parsed);
    return parsed;
  }
  async function capture(projectId: string, input: Omit<z.input<typeof ChapterStateSchema>, 'schemaVersion' | 'capturedAt'>) {
    const state = ChapterStateSchema.parse({ schemaVersion: 1, capturedAt: clock().toISOString(), ...input });
    const current = await states(projectId);
    const next = [...current.filter((item) => item.chapterId !== state.chapterId), state];
    await options.repository.saveCanon(projectId, 'chapter-states', next);
    await rebuildIndex(projectId);
    return state;
  }
  async function getAtChapter(projectId: string, chapterId: string) {
    return (await states(projectId)).find((item) => item.chapterId === chapterId) ?? null;
  }
  async function traceFact(projectId: string, key: string) {
    const index = FactIndex.parse(await options.repository.readCanon(projectId, 'fact-index') ?? {});
    return index[key] ?? null;
  }
  return { capture, getAtChapter, traceFact, rebuildIndex };
}

export type ChapterStateService = ReturnType<typeof createChapterStateService>;
