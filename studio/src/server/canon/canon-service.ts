import { z } from 'zod';
import {
  CharacterSchema,
  ForeshadowingSchema,
  RelationshipSchema,
  TimelineEventSchema,
  WorldBookEntrySchema,
  type Character,
  type Foreshadowing,
  type Relationship,
  type TimelineEvent,
  type WorldBookEntry,
} from '../../shared/contracts/canon.js';
import type { ProjectRepository } from '../projects/project-repository.js';

const CharacterList = z.array(CharacterSchema);
const RelationshipList = z.array(RelationshipSchema);
const WorldBookList = z.array(WorldBookEntrySchema);
const TimelineList = z.array(TimelineEventSchema);
const ForeshadowingList = z.array(ForeshadowingSchema);

async function collection<T>(repository: ProjectRepository, projectId: string, kind: string, schema: z.ZodType<T[]>): Promise<T[]> {
  return schema.parse(await repository.readCanon(projectId, kind) ?? []);
}

async function upsert<T extends { id: string }>(items: T[], item: T): Promise<T[]> {
  const index = items.findIndex((current) => current.id === item.id);
  if (index < 0) return [...items, item];
  const next = [...items];
  next[index] = item;
  return next;
}

export function createCanonService({ repository }: { repository: ProjectRepository }) {
  async function getBundle(projectId: string) {
    const [characters, relationships, worldBook, timeline, foreshadowing] = await Promise.all([
      collection(repository, projectId, 'characters', CharacterList),
      collection(repository, projectId, 'relationships', RelationshipList),
      collection(repository, projectId, 'worldbook', WorldBookList),
      collection(repository, projectId, 'timeline', TimelineList),
      collection(repository, projectId, 'foreshadowing', ForeshadowingList),
    ]);
    return { characters, relationships, worldBook, timeline, foreshadowing };
  }

  async function saveCharacter(projectId: string, input: z.input<typeof CharacterSchema>): Promise<Character> {
    const character = CharacterSchema.parse(input);
    const items = await collection(repository, projectId, 'characters', CharacterList);
    await repository.saveCanon(projectId, 'characters', await upsert(items, character));
    return character;
  }

  async function saveRelationship(projectId: string, input: z.input<typeof RelationshipSchema>): Promise<Relationship> {
    const relationship = RelationshipSchema.parse(input);
    const characters = await collection(repository, projectId, 'characters', CharacterList);
    if (![relationship.fromCharacterId, relationship.toCharacterId].every((id) => characters.some((item) => item.id === id))) {
      throw Object.assign(new Error('关系引用了不存在的角色。'), { code: 'RELATIONSHIP_CHARACTER_MISSING' });
    }
    const items = await collection(repository, projectId, 'relationships', RelationshipList);
    await repository.saveCanon(projectId, 'relationships', await upsert(items, relationship));
    return relationship;
  }

  async function saveWorldBookEntry(projectId: string, input: z.input<typeof WorldBookEntrySchema>): Promise<WorldBookEntry> {
    const entry = WorldBookEntrySchema.parse(input);
    const items = await collection(repository, projectId, 'worldbook', WorldBookList);
    await repository.saveCanon(projectId, 'worldbook', await upsert(items, entry));
    return entry;
  }

  async function saveTimelineEvent(projectId: string, input: z.input<typeof TimelineEventSchema>): Promise<TimelineEvent> {
    const event = TimelineEventSchema.parse(input);
    const items = await collection(repository, projectId, 'timeline', TimelineList);
    for (const dependencyId of event.dependencyIds) {
      const dependency = items.find((item) => item.id === dependencyId);
      if (!dependency || dependency.inWorldTime.localeCompare(event.inWorldTime) > 0) {
        throw Object.assign(new Error('时间线依赖不存在或发生在当前事件之后。'), {
          code: 'TIMELINE_DEPENDENCY_INVALID',
          statusCode: 409,
          retryable: false,
        });
      }
    }
    await repository.saveCanon(projectId, 'timeline', await upsert(items, event));
    return event;
  }

  async function saveForeshadowing(projectId: string, input: z.input<typeof ForeshadowingSchema>): Promise<Foreshadowing> {
    const item = ForeshadowingSchema.parse(input);
    const items = await collection(repository, projectId, 'foreshadowing', ForeshadowingList);
    await repository.saveCanon(projectId, 'foreshadowing', await upsert(items, item));
    return item;
  }

  return { getBundle, saveCharacter, saveRelationship, saveWorldBookEntry, saveTimelineEvent, saveForeshadowing };
}

export type CanonService = ReturnType<typeof createCanonService>;
