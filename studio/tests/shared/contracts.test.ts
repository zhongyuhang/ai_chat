import { describe, expect, it } from 'vitest';
import {
  CharacterSchema,
  GenerationRunSchema,
  ProjectSchema,
  WorldBookEntrySchema,
} from '../../src/shared/contracts/index.js';

const timestamp = '2026-08-24T00:00:00.000Z';

describe('shared contracts', () => {
  it('rejects unsafe project IDs and impossible quality thresholds', () => {
    const result = ProjectSchema.safeParse({
      schemaVersion: 1,
      id: '../escape',
      title: '越界项目',
      writingMode: 'both',
      quality: { serial: 120, publication: 88 },
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    expect(result.success).toBe(false);
  });

  it('requires inspectable activation rules for world-book entries', () => {
    const result = WorldBookEntrySchema.safeParse({
      schemaVersion: 1,
      id: 'world_01',
      name: '王都',
      category: 'location',
      content: '王国首都。',
      scope: { type: 'global' },
      activation: { type: 'keyword', keywords: [] },
      priority: 50,
      enabled: true,
      status: 'confirmed',
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    expect(result.success).toBe(false);
  });

  it('keeps interrupted generation runs resumable', () => {
    const result = GenerationRunSchema.safeParse({
      schemaVersion: 1,
      id: 'run_01',
      projectId: 'project_01',
      task: 'chapter-draft',
      status: 'interrupted',
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      target: { kind: 'chapter', id: 'chapter_01' },
      promptManifest: [],
      contextManifest: [],
      candidates: [],
      checkpoints: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.status).toBe('interrupted');
  });

  it('rejects a character without immutable canon fact provenance', () => {
    const result = CharacterSchema.safeParse({
      schemaVersion: 1,
      id: 'character_01',
      name: '林夜',
      aliases: [],
      canonFacts: [{ fact: '左眼失明', sourceId: '' }],
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    expect(result.success).toBe(false);
  });
});
