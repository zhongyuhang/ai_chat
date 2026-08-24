import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PromptRegistry } from '../../src/server/prompts/prompt-registry.js';

describe('prompt registry', () => {
  it('composes reproducible text with exact module versions', () => {
    const registry = new PromptRegistry(resolve(process.cwd(), 'src/server/prompts/modules'));
    const composed = registry.compose([
      { id: 'language-baseline', version: 1 },
      { id: 'chapter-draft', version: 1 },
    ]);

    expect(composed.manifest).toEqual([
      { id: 'language-baseline', version: 1 },
      { id: 'chapter-draft', version: 1 },
    ]);
    expect(composed.text).toContain('简体中文');
    expect(composed.text).toContain('章节草稿');
  });

  it('rejects an unavailable prompt version instead of silently falling back', () => {
    const registry = new PromptRegistry(resolve(process.cwd(), 'src/server/prompts/modules'));
    expect(() => registry.get('chapter-draft', 99)).toThrow(/提示词模块不存在/);
  });
});
