import { z } from 'zod';
import {
  ChapterOutlineSchema,
  OutlineSchema,
  SceneCardSchema,
  VolumeOutlineSchema,
  type Outline,
} from '../../shared/contracts/outline.js';
import type { ProjectRepository } from '../projects/project-repository.js';

function orderError(): never {
  throw Object.assign(new Error('排序必须包含且仅包含全部同级节点。'), {
    code: 'OUTLINE_ORDER_INVALID',
    statusCode: 409,
    retryable: false,
  });
}

function reorderAll<T extends { id: string }>(items: T[], ids: string[]): T[] {
  if (ids.length !== items.length || new Set(ids).size !== ids.length) orderError();
  const byId = new Map(items.map((item) => [item.id, item]));
  if (ids.some((id) => !byId.has(id))) orderError();
  return ids.map((id) => byId.get(id)!);
}

export function createOutlineService(options: { repository: ProjectRepository; clock?: () => Date }) {
  const clock = options.clock ?? (() => new Date());
  async function getTree(projectId: string): Promise<Outline> {
    const stored = await options.repository.readCanon(projectId, 'outline');
    return OutlineSchema.parse(stored ?? { schemaVersion: 1, updatedAt: clock().toISOString() });
  }
  async function persist(projectId: string, outline: Outline): Promise<Outline> {
    outline.updatedAt = clock().toISOString();
    const parsed = OutlineSchema.parse(outline);
    await options.repository.saveCanon(projectId, 'outline', parsed);
    return parsed;
  }
  async function saveStoryBible(projectId: string, patch: Partial<Pick<Outline, 'premise' | 'themes' | 'coreConflict' | 'endingContract' | 'setting' | 'style'>>) {
    return persist(projectId, { ...await getTree(projectId), ...patch });
  }
  async function saveVolume(projectId: string, input: z.input<typeof VolumeOutlineSchema>) {
    const outline = await getTree(projectId);
    const volume = VolumeOutlineSchema.parse(input);
    const index = outline.volumes.findIndex((item) => item.id === volume.id);
    if (index < 0) outline.volumes.push(volume);
    else outline.volumes[index] = volume;
    return persist(projectId, outline);
  }
  async function saveChapterOutline(projectId: string, volumeId: string, input: z.input<typeof ChapterOutlineSchema>) {
    const outline = await getTree(projectId);
    const volume = outline.volumes.find((item) => item.id === volumeId);
    if (!volume) throw Object.assign(new Error('卷不存在。'), { code: 'OUTLINE_PARENT_MISSING', statusCode: 404 });
    const chapter = ChapterOutlineSchema.parse(input);
    const index = volume.chapters.findIndex((item) => item.id === chapter.id);
    if (index < 0) volume.chapters.push(chapter);
    else volume.chapters[index] = chapter;
    return persist(projectId, outline);
  }
  async function saveSceneCard(projectId: string, volumeId: string, chapterId: string, input: z.input<typeof SceneCardSchema>) {
    const outline = await getTree(projectId);
    const chapter = outline.volumes.find((item) => item.id === volumeId)?.chapters.find((item) => item.id === chapterId);
    if (!chapter) throw Object.assign(new Error('章节纲要不存在。'), { code: 'OUTLINE_PARENT_MISSING', statusCode: 404 });
    const scene = SceneCardSchema.parse(input);
    const index = chapter.scenes.findIndex((item) => item.id === scene.id);
    if (index < 0) chapter.scenes.push(scene);
    else chapter.scenes[index] = scene;
    return persist(projectId, outline);
  }
  async function reorder(projectId: string, input:
    | { kind: 'volumes'; ids: string[] }
    | { kind: 'chapters'; volumeId: string; ids: string[] }
    | { kind: 'scenes'; volumeId: string; chapterId: string; ids: string[] }) {
    const outline = await getTree(projectId);
    if (input.kind === 'volumes') outline.volumes = reorderAll(outline.volumes, input.ids);
    else {
      const volume = outline.volumes.find((item) => item.id === input.volumeId);
      if (!volume) return orderError();
      if (input.kind === 'chapters') volume.chapters = reorderAll(volume.chapters, input.ids);
      else {
        const chapter = volume.chapters.find((item) => item.id === input.chapterId);
        if (!chapter) return orderError();
        chapter.scenes = reorderAll(chapter.scenes, input.ids);
      }
    }
    return persist(projectId, outline);
  }
  return { getTree, saveStoryBible, saveVolume, saveChapterOutline, saveSceneCard, reorder };
}

export type OutlineService = ReturnType<typeof createOutlineService>;
