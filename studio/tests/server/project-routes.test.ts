import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/server/app.js';

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

    const listed = await app.inject({ method: 'GET', url: '/api/projects' });
    expect(listed.json().projects).toHaveLength(1);
    const fetched = await app.inject({ method: 'GET', url: `/api/projects/${project.id}` });
    expect(fetched.json().title).toBe('长夜回声');
  });
});
