import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/server/app.js';

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe('production studio static server', () => {
  it('serves built assets and SPA routes without masking unknown APIs', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-studio-static-'));
    roots.push(root);
    const clientRoot = join(root, 'client');
    await mkdir(join(clientRoot, 'assets'), { recursive: true });
    await writeFile(join(clientRoot, 'index.html'), '<!doctype html><div id="root">studio-shell</div>');
    await writeFile(join(clientRoot, 'assets', 'app.js'), 'globalThis.STUDIO = true;');
    const app = await buildApp({ dataRoot: join(root, 'data'), serveClient: true, clientRoot });

    const home = await app.inject({ url: '/' });
    expect(home.body).toContain('studio-shell');
    expect(home.headers['content-security-policy']).toContain("default-src 'self'");
    expect(home.headers['x-content-type-options']).toBe('nosniff');
    expect((await app.inject({ url: '/assets/app.js' })).body).toContain('STUDIO');
    expect((await app.inject({ url: '/projects/project_001/studio/chapter_001' })).body).toContain('studio-shell');
    const missingApi = await app.inject({ url: '/api/not-real' });
    expect(missingApi.statusCode).toBe(404);
    expect(missingApi.headers['content-type']).toContain('application/json');
    await app.close();
  });
});
