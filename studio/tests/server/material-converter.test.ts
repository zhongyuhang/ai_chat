import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createProjectRepository } from '../../src/server/projects/project-repository.js';
import { createCanonService } from '../../src/server/canon/canon-service.js';
import { createTheatreRepository } from '../../src/server/theatre/theatre-repository.js';
import { createMaterialConverter } from '../../src/server/material/material-converter.js';

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe('theatre material converter', () => {
  it('converts only the selected branch and never mutates confirmed canon', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'novel-studio-material-'));
    roots.push(dataRoot);
    let sequence = 0;
    const idFactory = (prefix: string) => `${prefix}_${String(++sequence).padStart(4, '0')}`;
    const projects = createProjectRepository({ dataRoot, idFactory });
    const project = await projects.createProject({ title: '素材转换', writingMode: 'both' });
    const canon = createCanonService({ repository: projects });
    const theatre = createTheatreRepository({ dataRoot, idFactory });
    const session = await theatre.create({
      projectId: project.id,
      title: '雨夜交锋',
      participantIds: ['character_lin'],
      opening: { role: 'user', content: '你为什么来？' },
    });
    const original = await theatre.append(project.id, session.id, session.graph.rootId, { role: 'assistant', content: '原回答：为了钱。' });
    const branched = await theatre.retry(project.id, session.id, session.graph.rootId, { role: 'assistant', content: '新回答：为了救人。' });
    const converter = createMaterialConverter({ theatre, canon, idFactory });

    const result = await converter.convert({ projectId: project.id, sessionId: session.id, nodeId: branched.graph.activeLeafId, kind: 'branch-to-scene-card', title: '雨夜交锋' });
    expect(result.sceneCard.beats.join('\n')).toContain('新回答：为了救人。');
    expect(result.sceneCard.beats.join('\n')).not.toContain('原回答：为了钱。');
    expect((await canon.getBundle(project.id)).timeline).toHaveLength(0);
    expect(Object.keys(original.graph.nodes)).toHaveLength(2);
  });
});
