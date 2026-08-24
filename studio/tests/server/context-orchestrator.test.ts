import { describe, expect, it } from 'vitest';
import type { WorldBookEntry } from '../../src/shared/contracts/canon.js';
import { assembleContext } from '../../src/server/context/context-orchestrator.js';
import { retrieveWorldBook } from '../../src/server/context/worldbook-retriever.js';

const timestamp = '2026-08-24T00:00:00.000Z';

function entry(overrides: Partial<WorldBookEntry> & Pick<WorldBookEntry, 'id' | 'name' | 'content' | 'activation'>): WorldBookEntry {
  return {
    schemaVersion: 1,
    category: 'setting',
    aliases: [],
    scope: { type: 'global' },
    priority: 50,
    insertion: 'before-outline',
    enabled: true,
    tokenLimit: 2000,
    status: 'confirmed',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

const worldBook = [
  entry({
    id: 'royal_city',
    name: '王都',
    content: '王都终年禁飞。',
    priority: 90,
    activation: { type: 'keyword', keywords: ['王都'], synonyms: ['帝都'] },
  }),
  entry({
    id: 'hero_secret',
    name: '主角秘密',
    content: '林夜惧怕镜子。',
    priority: 80,
    scope: { type: 'character', id: 'character_hero' },
    activation: { type: 'constant' },
  }),
  entry({
    id: 'late_stage',
    name: '终局规则',
    content: '终局才能揭露双月。',
    priority: 100,
    activation: { type: 'stage', stages: ['终局'] },
  }),
];

describe('world-book retrieval', () => {
  it('is deterministic, normalized and scope-aware', () => {
    const fixture = {
      entries: worldBook,
      text: '主角抵达　帝都。',
      scope: { characterIds: ['character_hero'] },
      stage: '发展',
    };
    const first = retrieveWorldBook(fixture);
    const second = retrieveWorldBook(fixture);
    expect(second).toEqual(first);
    expect(first.map((hit) => hit.entry.id)).toEqual(['royal_city', 'hero_secret']);
    expect(first[0]).toMatchObject({ matchedTerm: '帝都', reason: 'keyword:帝都' });
  });
});

describe('context orchestration', () => {
  const components = [
    { sourceId: 'canon_core', kind: 'immutable-canon', content: '主角名叫林夜，左眼失明。', reason: 'confirmed-canon', priority: 1000, mandatory: true },
    { sourceId: 'outline_current', kind: 'outline', content: '本章目标：进入王都寻找失踪导师。', reason: 'current-chapter', priority: 700 },
    { sourceId: 'timeline_recent', kind: 'timeline', content: '此前三日主角仍在北境。'.repeat(3000), reason: 'recent-event', priority: 600 },
  ];

  it('never exceeds input budget after reserving output', () => {
    const result = assembleContext({
      components,
      worldBookEntries: worldBook,
      currentTask: '续写主角抵达王都后的第一场冲突。',
      scope: { characterIds: ['character_hero'] },
      stage: '发展',
      contextWindow: 20_000,
      requestedOutputTokens: 4_000,
    });
    expect(result.inputTokens).toBeLessThanOrEqual(16_000);
    expect(result.inputTokens + result.reservedOutputTokens).toBeLessThanOrEqual(20_000);
    expect(result.manifest.some((item) => item.status === 'omitted-budget')).toBe(true);
    expect(result.messages.at(-1)).toEqual({ role: 'user', content: '续写主角抵达王都后的第一场冲突。' });
  });

  it('holds the budget invariant across supported context sizes', () => {
    for (let contextWindow = 4_000; contextWindow <= 200_000; contextWindow += 4_000) {
      const result = assembleContext({
        components,
        currentTask: '继续写作。',
        contextWindow,
        requestedOutputTokens: Math.min(4_000, Math.floor(contextWindow / 2)),
      });
      expect(result.inputTokens + result.reservedOutputTokens).toBeLessThanOrEqual(contextWindow);
    }
  });

  it('rejects an impossible mandatory budget instead of truncating facts', () => {
    expect(() => assembleContext({
      components: [{ sourceId: 'canon_huge', kind: 'immutable-canon', content: '硬设定'.repeat(5000), reason: 'confirmed-canon', priority: 1000, mandatory: true }],
      currentTask: '继续写。',
      contextWindow: 4_000,
      requestedOutputTokens: 2_000,
    })).toThrow(expect.objectContaining({ code: 'CONTEXT_BUDGET_IMPOSSIBLE' }));
  });
});
