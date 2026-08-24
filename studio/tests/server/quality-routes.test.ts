import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/server/app.js';

const roots: string[] = [];
const apps: FastifyInstance[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe('quality routes', () => {
  it('reviews an exact accepted revision and records a waiver without deleting issues', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'novel-studio-quality-')); roots.push(dataRoot);
    const app = await buildApp({ dataRoot }); apps.push(app);
    const project = (await app.inject({ method: 'POST', url: '/api/projects', payload: { title: '审校测试', writingMode: 'publication' } })).json();
    const saved = (await app.inject({ method: 'PUT', url: `/api/projects/${project.id}/chapters/chapter_001`, payload: { content: '# 第一章\n\n“未闭合的引号。', reason: 'initial' } })).json();

    const reviewed = await app.inject({ method: 'POST', url: `/api/projects/${project.id}/chapters/chapter_001/quality`, payload: { mode: 'publication' } });
    expect(reviewed.statusCode).toBe(201);
    expect(reviewed.json().report).toMatchObject({ revisionId: saved.revision.id, mode: 'publication', threshold: 88 });
    expect(reviewed.json().report.issues).toContainEqual(expect.objectContaining({ code: 'UNMATCHED_CHINESE_QUOTE' }));
    expect(reviewed.json().decision.allowed).toBe(false);

    const waived = await app.inject({ method: 'POST', url: `/api/projects/${project.id}/chapters/chapter_001/quality/${reviewed.json().report.id}/waive`, payload: { author: 'local-user', note: '有意保留开放引语' } });
    expect(waived.statusCode).toBe(200);
    expect(waived.json().report.waiver.note).toBe('有意保留开放引语');
    expect(waived.json().report.issues).toHaveLength(reviewed.json().report.issues.length);
  });
});
