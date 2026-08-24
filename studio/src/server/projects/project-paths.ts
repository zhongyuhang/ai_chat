import { resolve, sep } from 'node:path';
import { EntityIdSchema } from '../../shared/contracts/common.js';

function assertSegment(segment: string): void {
  if (!segment || segment.includes('..') || segment.includes('/') || segment.includes('\\') || segment.includes('\0')) {
    throw new Error('非法项目路径');
  }
}

export function resolveProjectPath(dataRoot: string, projectId: string, ...segments: string[]): string {
  if (!EntityIdSchema.safeParse(projectId).success) throw new Error('非法项目路径');
  segments.forEach(assertSegment);
  const projectsRoot = resolve(dataRoot, 'projects');
  const target = resolve(projectsRoot, projectId, ...segments);
  const projectRoot = resolve(projectsRoot, projectId);
  if (target !== projectRoot && !target.startsWith(`${projectRoot}${sep}`)) throw new Error('非法项目路径');
  return target;
}

export function assertEntityId(id: string): string {
  if (!EntityIdSchema.safeParse(id).success) throw new Error('非法项目路径');
  return id;
}
