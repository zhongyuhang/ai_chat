export type ProviderMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export interface ProviderRequest {
  model: string;
  messages: ProviderMessage[];
  maxOutputTokens: number;
  temperature?: number;
  topP?: number;
  reasoningEffort?: 'low' | 'medium' | 'high';
}

export type ProviderEvent =
  | { type: 'reasoning-delta'; text: string }
  | { type: 'content-delta'; text: string }
  | { type: 'usage'; inputTokens: number; outputTokens: number }
  | { type: 'finish'; reason: string }
  | { type: 'error'; code: string; message: string; retryable: boolean };

export interface TextProvider {
  stream(request: ProviderRequest, options?: { signal?: AbortSignal }): AsyncIterable<ProviderEvent>;
}
