import { WritingTaskSchema, type WritingTask } from '../../shared/contracts/tasks.js';
import type { ProviderRequest } from '../providers/provider.js';
import type { PromptRegistry } from '../prompts/prompt-registry.js';
import type { ProviderMessage } from '../providers/provider.js';

export function compileWritingTask(input: WritingTask, registry: PromptRegistry, contextMessages?: ProviderMessage[]) {
  const task = WritingTaskSchema.parse(input);
  const moduleId = task.kind.endsWith('-plan') ? 'outline-planning'
    : task.kind === 'theatre-reply' ? 'theatre-reply'
      : task.kind.includes('selection') ? 'selection-rewrite'
        : 'chapter-draft';
  const prompt = registry.compose([
    { id: 'language-baseline', version: 1 },
    { id: moduleId, version: 1 },
  ]);
  const providerRequest: ProviderRequest = {
    model: task.model,
    messages: [
      { role: 'system', content: prompt.text },
      ...(contextMessages ?? [{ role: 'user' as const, content: task.instruction }]),
    ],
    maxOutputTokens: task.requestedOutputTokens,
    reasoningEffort: 'high',
  };
  return { task, promptManifest: prompt.manifest, providerRequest };
}
