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
});
