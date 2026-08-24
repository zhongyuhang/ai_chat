import type { ProviderEvent, ProviderRequest, TextProvider } from './provider.js';

export type { ProviderEvent } from './provider.js';

interface DeepSeekProviderOptions {
  apiUrl: string;
  apiKey: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}

function providerError(code: string, message: string, retryable: boolean, statusCode: number) {
  return Object.assign(new Error(message), { code, retryable, statusCode });
}

function eventsFromPayload(payload: string): ProviderEvent[] {
  if (!payload || payload === '[DONE]') return [];
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(payload) as Record<string, unknown>;
  } catch {
    throw providerError('PROVIDER_INVALID_STREAM', 'DeepSeek 返回了无法解析的流事件。', true, 502);
  }
  const choices = Array.isArray(data.choices) ? data.choices as Array<Record<string, unknown>> : [];
  const events: ProviderEvent[] = [];
  for (const choice of choices) {
    const delta = choice.delta && typeof choice.delta === 'object' ? choice.delta as Record<string, unknown> : {};
    if (typeof delta.reasoning_content === 'string' && delta.reasoning_content) {
      events.push({ type: 'reasoning-delta', text: delta.reasoning_content });
    }
    if (typeof delta.content === 'string' && delta.content) {
      events.push({ type: 'content-delta', text: delta.content });
    }
  }
  const usage = data.usage && typeof data.usage === 'object' ? data.usage as Record<string, unknown> : null;
  if (usage && typeof usage.prompt_tokens === 'number' && typeof usage.completion_tokens === 'number') {
    events.push({ type: 'usage', inputTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens });
  }
  for (const choice of choices) {
    if (typeof choice.finish_reason === 'string' && choice.finish_reason) {
      events.push({ type: 'finish', reason: choice.finish_reason });
    }
  }
  return events;
}

function parseEventBlock(block: string): ProviderEvent[] {
  const payload = block.replaceAll('\r\n', '\n').split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n');
  return eventsFromPayload(payload);
}

export function createDeepSeekProvider(options: DeepSeekProviderOptions): TextProvider {
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async *stream(request: ProviderRequest, streamOptions: { signal?: AbortSignal } = {}) {
      const controller = new AbortController();
      let abortCause: 'timeout' | 'client' | null = null;
      const cancel = () => {
        abortCause = 'client';
        controller.abort();
      };
      if (streamOptions.signal?.aborted) cancel();
      else streamOptions.signal?.addEventListener('abort', cancel, { once: true });
      const timeout = setTimeout(() => {
        abortCause = 'timeout';
        controller.abort();
      }, options.timeoutMs);

      try {
        const response = await fetchImpl(options.apiUrl, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${options.apiKey}`,
          },
          body: JSON.stringify({
            model: request.model,
            messages: request.messages,
            stream: true,
            max_tokens: request.maxOutputTokens,
            ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
            ...(request.topP === undefined ? {} : { top_p: request.topP }),
            ...(request.reasoningEffort === undefined ? {} : { reasoning_effort: request.reasoningEffort }),
          }),
          signal: controller.signal,
        });
        if (!response.ok) {
          throw providerError('PROVIDER_HTTP', `DeepSeek 请求失败：HTTP ${response.status}`, response.status >= 500 || response.status === 429, response.status);
        }
        if (!response.body) throw providerError('PROVIDER_EMPTY_STREAM', 'DeepSeek 未返回流式正文。', true, 502);
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true }).replaceAll('\r\n', '\n');
          let boundary = buffer.indexOf('\n\n');
          while (boundary >= 0) {
            const block = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            for (const event of parseEventBlock(block)) yield event;
            boundary = buffer.indexOf('\n\n');
          }
        }
        buffer += decoder.decode();
        if (buffer.trim()) {
          for (const event of parseEventBlock(buffer)) yield event;
        }
      } catch (error) {
        if (abortCause === 'client') throw providerError('PROVIDER_CANCELLED', '生成已取消。', false, 499);
        if (abortCause === 'timeout') throw providerError('PROVIDER_TIMEOUT', 'DeepSeek 生成超时。', true, 504);
        if (error && typeof error === 'object' && 'code' in error) throw error;
        throw providerError('PROVIDER_NETWORK', '无法连接 DeepSeek。', true, 502);
      } finally {
        clearTimeout(timeout);
        streamOptions.signal?.removeEventListener('abort', cancel);
      }
    },
  };
}
