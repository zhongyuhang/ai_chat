import type { ProjectRepository } from '../../src/server/projects/project-repository.js';

const timestamp = '2026-08-24T00:00:00.000Z';

export async function createLargeProject(repository: ProjectRepository, options: { chapters: number; characters: number; worldBookEntries: number; chineseCharacters: number }) {
  const project = await repository.createProject({ title: '百万字压力作品', writingMode: 'both', targetCharacters: options.chineseCharacters });
  const chapterDefinitions = Array.from({ length: options.chapters }, (_, index) => ({ id: `chapter_${String(index + 1).padStart(3, '0')}`, title: `第${index + 1}章`, purpose: `推进第${index + 1}个情节点` }));
  await repository.saveCanon(project.id, 'outline', { schemaVersion: 1, volumes: [{ id: 'volume_001', title: '第一卷', chapters: chapterDefinitions }], updatedAt: timestamp });
  const base = Math.floor(options.chineseCharacters / options.chapters);
  let remainder = options.chineseCharacters % options.chapters;
  for (const chapter of chapterDefinitions) {
    const count = base + (remainder-- > 0 ? 1 : 0);
    await repository.saveChapterRevision(project.id, chapter.id, '文'.repeat(count), { reason: 'scale-fixture' });
  }
  await repository.saveCanon(project.id, 'characters', Array.from({ length: options.characters }, (_, index) => ({ schemaVersion: 1, id: `character_${String(index + 1).padStart(3, '0')}`, name: `角色${index + 1}`, goals: [`完成目标${index + 1}`], currentState: { physical: '健康', emotional: '稳定', relational: '', knowledge: '' }, createdAt: timestamp, updatedAt: timestamp })));
  await repository.saveCanon(project.id, 'worldbook', Array.from({ length: options.worldBookEntries }, (_, index) => ({ schemaVersion: 1, id: `worldbook_${String(index + 1).padStart(4, '0')}`, name: `设定${index + 1}`, category: 'setting', content: `第${index + 1}条世界规则。`, scope: { type: 'global' }, activation: { type: 'keyword', keywords: [`关键词${index + 1}`], synonyms: [] }, priority: index % 100, insertion: 'before-outline', enabled: true, tokenLimit: 2000, status: 'confirmed', createdAt: timestamp, updatedAt: timestamp })));
  await repository.saveCanon(project.id, 'fact-index', { 'character:character_001:injuredLeg': { value: true, chapterId: 'chapter_120', revisionId: (await repository.listChapterRevisions(project.id, 'chapter_120')).at(-1)!.id } });
  return project;
}
