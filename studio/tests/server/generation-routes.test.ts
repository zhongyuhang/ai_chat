import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { TextProvider } from '../../src/server/providers/provider.js';
import { buildApp } from '../../src/server/app.js';

const roots: string[] = [];
const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('generation routes', () => {
  it('streams a candidate and persists resumable checkpoints by run ID', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'novel-studio-generation-'));
    roots.push(dataRoot);
    const provider: TextProvider = {
      async *stream() {
        yield { type: 'reasoning-delta', text: '构思场景' };
        yield { type: 'content-delta', text: '雨' };
        yield { type: 'content-delta', text: '夜。' };
        yield { type: 'finish', reason: 'stop' };
      },
    };
    const app = await buildApp({ logger: false, dataRoot, provider });
    apps.push(app);
    const projectResponse = await app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { title: '生成测试', writingMode: 'both' },
    });
    const project = projectResponse.json();

    const created = await app.inject({
      method: 'POST',
      url: `/api/projects/${project.id}/runs`,
      payload: {
        task: 'chapter-draft',
        target: { kind: 'chapter', id: 'chapter_001' },
        model: 'deepseek-v4-flash',
        messages: [{ role: 'user', content: '写雨夜开篇' }],
        maxOutputTokens: 2048,
        promptSelection: [
          { id: 'language-baseline', version: 1 },
          { id: 'chapter-draft', version: 1 },
        ],
        contextManifest: [],
      },
    });
    expect(created.statusCode).toBe(201);
    const run = created.json();

    const events = await app.inject({ method: 'GET', url: `/api/runs/${run.id}/events` });
    expect(events.statusCode).toBe(200);
    expect(events.headers['content-type']).toContain('text/event-stream');
    expect(events.body).toContain('"type":"content-delta","text":"雨"');
    expect(events.body).toContain('"type":"finish","reason":"stop"');

    const stored = await app.inject({ method: 'GET', url: `/api/runs/${run.id}` });
    expect(stored.json()).toMatchObject({ status: 'completed' });
    expect(stored.json().checkpoints.length).toBe(2);
  });

  it('previews confirmed context, generates isolated candidates and accepts only the chosen draft', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'novel-studio-task-workflow-'));
    roots.push(dataRoot);
    const providerRequests: Array<{ messages: Array<{ content: string }> }> = [];
    let invocation = 0;
    const provider: TextProvider = {
      async *stream(request) {
        providerRequests.push(request);
        invocation += 1;
        yield { type: 'content-delta', text: invocation === 1 ? '候选一正文' : '候选二正文' };
        yield { type: 'finish', reason: 'stop' };
      },
    };
    const app = await buildApp({ logger: false, dataRoot, provider });
    apps.push(app);
    const project = (await app.inject({ method: 'POST', url: '/api/projects', payload: { title: '候选工作流', writingMode: 'both' } })).json();
    await app.inject({
      method: 'PUT',
      url: `/api/projects/${project.id}/canon/characters/character_lin`,
      payload: {
        schemaVersion: 1,
        name: '林默',
        goals: ['找回失踪的妹妹'],
        speechPatterns: ['说话克制，不用感叹号'],
        currentState: { physical: '左腿旧伤', emotional: '警惕', relational: '', knowledge: '' },
        createdAt: '2026-08-24T00:00:00.000Z',
        updatedAt: '2026-08-24T00:00:00.000Z',
      },
    });
    await app.inject({ method: 'PUT', url: `/api/projects/${project.id}/chapters/chapter_001`, payload: { content: '原正式稿', reason: 'initial' } });

    const task = {
      kind: 'chapter-draft',
      target: { kind: 'chapter', id: 'chapter_001' },
      instruction: '写林默进入旧城的开篇。',
      candidateCount: 2,
      requestedOutputTokens: 2048,
      contextWindow: 16_000,
    };
    const preview = await app.inject({ method: 'POST', url: `/api/projects/${project.id}/generation/preview`, payload: task });
    expect(preview.statusCode).toBe(200);
    expect(preview.json()).toMatchObject({ inputTokens: expect.any(Number), reservedOutputTokens: 2048 });
    expect(preview.json().manifest).toContainEqual(expect.objectContaining({ sourceId: 'character_lin', status: 'included' }));

    const started = await app.inject({ method: 'POST', url: `/api/projects/${project.id}/generation/tasks`, payload: task });
    expect(started.statusCode).toBe(201);
    const runId = started.json().id;
    let detail;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      detail = (await app.inject({ method: 'GET', url: `/api/runs/${runId}/detail` })).json();
      if (detail.status === 'completed') break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(detail).toMatchObject({ status: 'completed' });
    expect(detail.candidates.map((candidate: { content: string }) => candidate.content)).toEqual(['候选一正文', '候选二正文']);
    expect((await app.inject({ method: 'GET', url: `/api/projects/${project.id}/chapters/chapter_001` })).json().content).toBe('原正式稿');
    expect(providerRequests[0].messages.some((message) => message.content.includes('林默') && message.content.includes('左腿旧伤'))).toBe(true);

    const accepted = await app.inject({ method: 'POST', url: `/api/runs/${runId}/candidates/${detail.candidates[1].id}/accept` });
    expect(accepted.statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/api/projects/${project.id}/chapters/chapter_001` })).json().content).toBe('候选二正文');
  });
});
