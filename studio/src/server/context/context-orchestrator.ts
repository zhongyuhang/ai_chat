import type { WorldBookEntry } from '../../shared/contracts/canon.js';
import {
  ContextComponentSchema,
  type ContextComponent,
  type ContextManifestEntry,
} from '../../shared/contracts/context.js';
import { estimateTokens } from './token-estimator.js';
import { retrieveWorldBook, type ActiveScope } from './worldbook-retriever.js';

interface ContextMessage {
  role: 'system' | 'user';
  content: string;
}

export interface AssembleContextInput {
  components: ContextComponent[];
  worldBookEntries?: WorldBookEntry[];
  currentTask: string;
  scope?: ActiveScope;
  stage?: string;
  contextWindow: number;
  requestedOutputTokens: number;
}

function formatted(component: ReturnType<typeof ContextComponentSchema.parse>): string {
  return `【${component.kind}｜${component.sourceId}】\n${component.content}`;
}

function budgetError(message: string) {
  return Object.assign(new Error(message), {
    code: 'CONTEXT_BUDGET_IMPOSSIBLE',
    statusCode: 422,
    retryable: false,
  });
}

export function assembleContext(input: AssembleContextInput): {
  messages: ContextMessage[];
  manifest: ContextManifestEntry[];
  inputTokens: number;
  reservedOutputTokens: number;
} {
  if (!Number.isInteger(input.contextWindow) || input.contextWindow < 1) throw budgetError('上下文窗口不合法。');
  if (!Number.isInteger(input.requestedOutputTokens) || input.requestedOutputTokens < 1 || input.requestedOutputTokens >= input.contextWindow) {
    throw budgetError('输出预算必须小于上下文窗口。');
  }
  const task = input.currentTask.trim();
  if (!task) throw budgetError('当前写作任务不能为空。');

  const components = input.components.map((component) => ContextComponentSchema.parse(component));
  const worldBookHits = retrieveWorldBook({
    entries: input.worldBookEntries ?? [],
    text: task,
    scope: input.scope,
    stage: input.stage,
  });
  for (const hit of worldBookHits) {
    components.push(ContextComponentSchema.parse({
      sourceId: hit.entry.id,
      kind: 'worldbook',
      content: hit.entry.content,
      reason: hit.reason,
      priority: hit.entry.priority,
      mandatory: false,
    }));
  }

  const availableInput = input.contextWindow - input.requestedOutputTokens;
  const taskTokens = estimateTokens(task);
  const mandatory = components.filter((component) => component.mandatory)
    .sort((a, b) => b.priority - a.priority || a.sourceId.localeCompare(b.sourceId));
  const optional = components.filter((component) => !component.mandatory)
    .sort((a, b) => b.priority - a.priority || a.sourceId.localeCompare(b.sourceId));
  const mandatoryTokens = mandatory.reduce((sum, component) => sum + estimateTokens(formatted(component)), 0);
  if (taskTokens + mandatoryTokens > availableInput) {
    throw budgetError('硬设定与当前任务已超过可用输入预算，未对事实做截断。');
  }

  const selected = [...mandatory];
  let used = taskTokens + mandatoryTokens;
  const manifest: ContextManifestEntry[] = mandatory.map((component) => ({
    sourceId: component.sourceId,
    kind: component.kind,
    reason: component.reason,
    priority: component.priority,
    estimatedTokens: estimateTokens(formatted(component)),
    status: 'included',
  }));

  for (const component of optional) {
    const tokens = estimateTokens(formatted(component));
    const status = used + tokens <= availableInput ? 'included' as const : 'omitted-budget' as const;
    manifest.push({
      sourceId: component.sourceId,
      kind: component.kind,
      reason: component.reason,
      priority: component.priority,
      estimatedTokens: tokens,
      status,
    });
    if (status === 'included') {
      selected.push(component);
      used += tokens;
    }
  }

  const messages: ContextMessage[] = [
    ...selected.map((component) => ({ role: 'system' as const, content: formatted(component) })),
    { role: 'user', content: task },
  ];
  const inputTokens = messages.reduce((sum, message) => sum + estimateTokens(message.content), 0);
  if (inputTokens > availableInput) throw budgetError('上下文预算内部校验失败。');
  return { messages, manifest, inputTokens, reservedOutputTokens: input.requestedOutputTokens };
}
