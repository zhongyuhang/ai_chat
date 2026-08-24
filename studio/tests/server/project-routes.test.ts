import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/server/app.js';
import { createProjectRepository } from '../../src/server/projects/project-repository.js';
import { createChapterStateService } from '../../src/server/canon/chapter-state-service.js';

const roots: string[] = [];
const apps: FastifyInstance[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function setup() {
  const dataRoot = await mkdtemp(join(tmpdir(), 'novel-studio-routes-'));
  roots.push(dataRoot);
  const app = await buildApp({ logger: false, dataRoot });
  apps.push(app);
  return { app, dataRoot };
}

describe('project routes', () => {
  it('captures confirmed character state against every accepted chapter revision', async () => {
    const { app, dataRoot } = await setup();
    const project = (await app.inject({ method: 'POST', url: '/api/projects', payload: { title: '状态快照', writingMode: 'both' } })).json();
    await app.inject({ method: 'PUT', url: `/api/projects/${project.id}/canon/characters/character_lin`, payload: { schemaVersion: 1, name: '林默', goals: ['寻找妹妹'], currentState: { physical: '左腿受伤', emotional: '警惕', relational: '', knowledge: '知道旧城入口' }, createdAt: '2026-08-24T00:00:00.000Z', updatedAt: '2026-08-24T00:00:00.000Z' } });
    const saved = (await app.inject({ method: 'PUT', url: `/api/projects/${project.id}/chapters/chapter_001`, payload: { content: '正式正文', reason: 'accepted' } })).json();
    const states = createChapterStateService({ repository: createProjectRepository({ dataRoot }) });
    expect(await states.traceFact(project.id, 'character:character_lin:physical')).toEqual({ value: '左腿受伤', chapterId: 'chapter_001', revisionId: saved.revision.id });
    expect(await states.traceFact(project.id, 'character:character_lin:knowledge')).toMatchObject({ value: '知道旧城入口' });
  });

  it('rejects invalid project input before touching disk', async () => {
    const { app, dataRoot } = await setup();
    const response = await app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { id: '../escape', title: '', writingMode: 'both' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toMatchObject({ code: 'VALIDATION_ERROR', retryable: false });
    expect(response.json().error.requestId).toEqual(expect.any(String));
    expect(await readdir(dataRoot)).toEqual([]);
  });

  it('creates, lists, reads and revision-saves a durable project', async () => {
    const { app } = await setup();
    const created = await app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { title: '长夜回声', writingMode: 'both', targetCharacters: 1_000_000 },
    });
    expect(created.statusCode).toBe(201);
    const project = created.json();

    const saved = await app.inject({
      method: 'PUT',
      url: `/api/projects/${project.id}/chapters/chapter_001`,
      payload: { content: '# 第一章\n\n雨夜来客。', reason: 'manual-save' },
    });
    expect(saved.statusCode).toBe(200);

    const chapter = await app.inject({ method: 'GET', url: `/api/projects/${project.id}/chapters/chapter_001` });
    expect(chapter.statusCode).toBe(200);
    expect(chapter.json().content).toContain('雨夜来客');

    const revisions = await app.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/chapters/chapter_001/revisions`,
    });
    expect(revisions.statusCode).toBe(200);
    expect(revisions.json().revisions).toEqual([
      expect.objectContaining({ chapterId: 'chapter_001', reason: 'manual-save' }),
    ]);

    const restored = await app.inject({
      method: 'POST',
      url: `/api/projects/${project.id}/chapters/chapter_001/revisions/${revisions.json().revisions[0].id}/restore`,
    });
    expect(restored.statusCode).toBe(200);
    expect(restored.json().revision.reason).toMatch(/^restore:/);

    const listed = await app.inject({ method: 'GET', url: '/api/projects' });
    expect(listed.json().projects).toHaveLength(1);
    const fetched = await app.inject({ method: 'GET', url: `/api/projects/${project.id}` });
    expect(fetched.json().title).toBe('长夜回声');

    const archived = await app.inject({
      method: 'PATCH',
      url: `/api/projects/${project.id}`,
      payload: { status: 'archived' },
    });
    expect(archived.statusCode).toBe(200);
    expect(archived.json().status).toBe('archived');
  });
});
