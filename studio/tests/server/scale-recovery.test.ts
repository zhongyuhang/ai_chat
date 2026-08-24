import { mkdtemp, rm } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createProjectRepository } from '../../src/server/projects/project-repository.js';
import { createCanonService } from '../../src/server/canon/canon-service.js';
import { createOutlineService } from '../../src/server/outlines/outline-service.js';
import { createChapterStateService } from '../../src/server/canon/chapter-state-service.js';
import { analyzeProject } from '../../src/server/dashboard/manuscript-analytics.js';
import { createLargeProject } from '../fixtures/large-project.js';

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe('million-character scale and recovery', () => {
  it('analyzes 240 chapters, 80 characters and 1000 world-book entries within five seconds', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'novel-studio-scale-')); roots.push(dataRoot);
    const repository = createProjectRepository({ dataRoot });
    const project = await createLargeProject(repository, { chapters: 240, characters: 80, worldBookEntries: 1_000, chineseCharacters: 1_000_000 });
    const canon = createCanonService({ repository });
    const outlines = createOutlineService({ repository });
    const started = performance.now();
    const analytics = await analyzeProject(project.id, { repository, canon, outlines });
    const elapsed = performance.now() - started;
    expect(analytics).toMatchObject({ plannedChapterCount: 240, acceptedChapterCount: 240, acceptedCharacters: 1_000_000, characterCount: 80, worldBookCount: 1_000 });
    expect(elapsed).toBeLessThan(5_000);
    const states = createChapterStateService({ repository });
    expect(await states.traceFact(project.id, 'character:character_001:injuredLeg')).toMatchObject({ value: true, chapterId: 'chapter_120', revisionId: expect.stringMatching(/^revision_/) });
  }, 120_000);
});
