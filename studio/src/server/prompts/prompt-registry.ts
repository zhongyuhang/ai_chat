import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { EntityIdSchema } from '../../shared/contracts/common.js';

interface PromptModule {
  id: string;
  version: number;
  task: string;
  modes: string[];
  text: string;
  file: string;
}

function parseModule(file: string): PromptModule {
  const source = readFileSync(file, 'utf8').replaceAll('\r\n', '\n');
  const match = source.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error(`提示词模块缺少 front matter：${file}`);
  const metadata = Object.fromEntries(match[1].split('\n').map((line) => {
    const separator = line.indexOf(':');
    if (separator < 1) throw new Error(`提示词元数据不合法：${file}`);
    return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
  }));
  const id = EntityIdSchema.parse(metadata.id);
  const version = Number(metadata.version);
  if (!Number.isInteger(version) || version < 1) throw new Error(`提示词版本不合法：${file}`);
  const text = match[2].trim();
  if (!text) throw new Error(`提示词正文为空：${file}`);
  return {
    id,
    version,
    task: metadata.task || 'shared',
    modes: (metadata.modes || '').split(',').map((mode) => mode.trim()).filter(Boolean),
    text,
    file,
  };
}

export class PromptRegistry {
  private readonly modules = new Map<string, PromptModule>();

  constructor(modulesRoot: string) {
    for (const entry of readdirSync(modulesRoot, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
      const module = parseModule(resolve(modulesRoot, entry.name));
      const key = `${module.id}@${module.version}`;
      if (this.modules.has(key)) throw new Error(`提示词模块重复：${key}`);
      this.modules.set(key, module);
    }
  }

  get(id: string, version: number): PromptModule {
    const module = this.modules.get(`${id}@${version}`);
    if (!module) throw new Error(`提示词模块不存在：${id}@${version}`);
    return module;
  }

  compose(selection: Array<{ id: string; version: number }>) {
    const selected = selection.map(({ id, version }) => this.get(id, version));
    return {
      text: selected.map((module) => module.text).join('\n\n'),
      manifest: selected.map((module) => ({ id: module.id, version: module.version })),
    };
  }
}
