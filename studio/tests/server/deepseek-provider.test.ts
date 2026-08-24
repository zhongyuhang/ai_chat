import { describe, expect, it } from 'vitest';
import { createDeepSeekProvider, type ProviderEvent } from '../../src/server/providers/deepseek-provider.js';

function streamResponse(chunks: string[], status = 200): Response {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
      controller.close();
    },
  }), { status, headers: { 'content-type': 'text/event-stream' } });
}

async function collect(stream: AsyncIterable<ProviderEvent>) {
  const events: ProviderEvent[] = [];
  for await (const event of stream) events.push(event);
  return events;
}

const request = {
  model: 'deepseek-v4-flash',
  messages: [{ role: 'user' as const, content: '写一个结尾' }],
  maxOutputTokens: 2048,
};

describe('DeepSeek provider', () => {
  it('normalizes fragmented reasoning, content, usage and finish events', async () => {
    const chunks = [
      'data: {"choices":[{"delta":{"reasoning_content":"先想"}}]}\n',
      '\ndata: {"choices":[{"delta":{"content":"结',
      '尾"},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":2}}\n\n',
      'data: [DONE]\n\n',
    ];
    const provider = createDeepSeekProvider({
      apiUrl: 'https://example.invalid',
      apiKey: 'secret-key',
      timeoutMs: 1000,
      fetchImpl: async () => streamResponse(chunks),
    });

    expect(await collect(provider.stream(request))).toEqual([
      { type: 'reasoning-delta', text: '先想' },
      { type: 'content-delta', text: '结尾' },
      { type: 'usage', inputTokens: 10, outputTokens: 2 },
      { type: 'finish', reason: 'stop' },
    ]);
  });

  it('emits the final SSE event without a trailing newline', async () => {
    const provider = createDeepSeekProvider({
      apiUrl: 'https://example.invalid',
      apiKey: 'secret-key',
      timeoutMs: 1000,
      fetchImpl: async () => streamResponse(['data: {"choices":[{"delta":{"content":"末句"}}]}']),
    });
    expect(await collect(provider.stream(request))).toContainEqual({ type: 'content-delta', text: '末句' });
  });

  it('normalizes timeout and external cancellation without leaking credentials', async () => {
    const hangingFetch = async (_url: string | URL | Request, init?: RequestInit): Promise<Response> => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('secret-key'), { name: 'AbortError' })), { once: true });
    });
    const provider = createDeepSeekProvider({ apiUrl: 'https://example.invalid', apiKey: 'secret-key', timeoutMs: 20, fetchImpl: hangingFetch });
    await expect(collect(provider.stream(request))).rejects.toMatchObject({ code: 'PROVIDER_TIMEOUT', retryable: true });

    const controller = new AbortController();
    const cancelled = collect(provider.stream(request, { signal: controller.signal }));
    controller.abort();
    await expect(cancelled).rejects.toMatchObject({ code: 'PROVIDER_CANCELLED', retryable: false });
    await cancelled.catch((error) => expect(error.message).not.toContain('secret-key'));
  });
});
