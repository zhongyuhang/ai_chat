import type { WritingTask } from '../../shared/contracts/tasks.js';
import type { ContextComponent } from '../../shared/contracts/context.js';
import type { CanonService } from '../canon/canon-service.js';
import type { OutlineService } from '../outlines/outline-service.js';
import type { ProjectRepository } from '../projects/project-repository.js';
import { assembleContext } from './context-orchestrator.js';
import type { TheatreRepository } from '../theatre/theatre-repository.js';
import { getActivePath } from '../theatre/message-graph.js';

function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export async function assembleProjectContext(options: {
  repository: ProjectRepository;
  canon: CanonService;
  outlines: OutlineService;
  theatre?: TheatreRepository;
  task: WritingTask;
  contextWindow: number;
}) {
  const { task } = options;
  const [bundle, outline, factIndex] = await Promise.all([
    options.canon.getBundle(task.projectId),
    options.outlines.getTree(task.projectId),
    options.repository.readCanon(task.projectId, 'fact-index'),
  ]);
  const components: ContextComponent[] = [];

  for (const character of bundle.characters) components.push({
    sourceId: character.id,
    kind: 'confirmed-character',
    content: json(character),
    reason: '已确认角色档案与当前状态',
    priority: 1000,
    mandatory: true,
  });
  for (const relationship of bundle.relationships) components.push({
    sourceId: relationship.id,
    kind: 'confirmed-relationship',
    content: json(relationship),
    reason: '已确认人物关系',
    priority: 980,
    mandatory: true,
  });
  for (const item of bundle.foreshadowing.filter((entry) => entry.status !== 'paid' && entry.status !== 'abandoned')) components.push({
    sourceId: item.id,
    kind: 'active-foreshadowing',
    content: json(item),
    reason: '尚未完成的伏笔约束',
    priority: 920,
    mandatory: true,
  });
  for (const event of [...bundle.timeline].reverse()) components.push({
    sourceId: event.id,
    kind: 'timeline-event',
    content: json(event),
    reason: '已确认时间线事件（近期事件优先）',
    priority: 820,
    mandatory: false,
  });

  const storyBible = {
    premise: outline.premise,
    themes: outline.themes,
    coreConflict: outline.coreConflict,
    endingContract: outline.endingContract,
    setting: outline.setting,
    style: outline.style,
  };
  if (Object.values(storyBible).some((value) => Array.isArray(value) ? value.length : Boolean(value))) components.push({
    sourceId: 'story_bible',
    kind: 'story-bible',
    content: json(storyBible),
    reason: '全书创作契约',
    priority: 960,
    mandatory: true,
  });
  const currentChapterOutline = outline.volumes.flatMap((volume) => volume.chapters).find((chapter) => chapter.id === task.target.id);
  if (currentChapterOutline) components.push({
    sourceId: currentChapterOutline.id,
    kind: 'current-chapter-outline',
    content: json(currentChapterOutline),
    reason: '当前章纲与场景卡',
    priority: 950,
    mandatory: true,
  });
  if (factIndex && typeof factIndex === 'object' && Object.keys(factIndex).length) components.push({
    sourceId: 'confirmed_fact_index',
    kind: 'cross-volume-fact-index',
    content: json(factIndex),
    reason: '由已采用章节修订确认的跨卷事实',
    priority: 900,
    mandatory: false,
  });

  if (task.target.kind === 'chapter' && task.kind !== 'chapter-draft') {
    try {
      const accepted = await options.repository.readChapter(task.projectId, task.target.id);
      const excerpt = accepted.length > 40_000 ? accepted.slice(-40_000) : accepted;
      components.push({
        sourceId: `accepted_${task.target.id}`,
        kind: 'accepted-chapter-tail',
        content: excerpt,
        reason: accepted.length === excerpt.length ? '当前正式稿' : '当前正式稿末段（用于连续写作）',
        priority: 940,
        mandatory: false,
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  if (task.target.kind === 'theatre-session' && options.theatre) {
    const session = await options.theatre.get(task.projectId, task.target.id);
    if (!session) throw Object.assign(new Error('剧场会话不存在。'), { code: 'THEATRE_SESSION_NOT_FOUND', statusCode: 404 });
    const activePath = getActivePath(session.graph).map((node) => `${node.role}: ${node.content}`).join('\n');
    components.push({
      sourceId: 'theatre_active_path',
      kind: 'theatre-active-branch',
      content: `用户身份：${session.userPersona}\n旁白模式：${session.narratorMode}\n固定记忆：${session.pinnedMemory.join('；')}\n当前分支：\n${activePath}`,
      reason: '仅使用当前选中的剧场分支与固定记忆',
      priority: 970,
      mandatory: true,
    });
  }

  return assembleContext({
    components,
    worldBookEntries: bundle.worldBook,
    currentTask: task.instruction,
    scope: task.target.kind === 'chapter' ? { chapterId: task.target.id } : task.target.kind === 'theatre-session' ? { theatreSessionId: task.target.id } : undefined,
    contextWindow: options.contextWindow,
    requestedOutputTokens: task.requestedOutputTokens ?? 8192,
  });
}
