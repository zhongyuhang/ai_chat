function upstreamError(statusCode, code, message, retryable) {
  return Object.assign(new Error(message), { statusCode, code, retryable });
}

function createDeepSeekClient({ config, fetchImpl = fetch }) {
  async function request(payload, clientSignal) {
    const controller = new AbortController();
    let abortCause = null;
    const abortFromClient = () => {
      abortCause = 'client';
      controller.abort();
    };
    const timeout = setTimeout(() => {
      abortCause = 'timeout';
      controller.abort();
    }, config.upstreamTimeoutMs);

    if (clientSignal?.aborted) abortFromClient();
    else clientSignal?.addEventListener('abort', abortFromClient, { once: true });

    try {
      return await fetchImpl(config.deepseekUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (error) {
      if (abortCause === 'client') {
        throw upstreamError(499, 'CLIENT_CANCELLED', '请求已取消。', false);
      }
      if (abortCause === 'timeout') {
        throw upstreamError(504, 'UPSTREAM_TIMEOUT', 'DeepSeek 请求超时。', true);
      }
      throw upstreamError(502, 'UPSTREAM_NETWORK', '无法连接 DeepSeek。', true);
    } finally {
      clearTimeout(timeout);
      clientSignal?.removeEventListener('abort', abortFromClient);
    }
  }

  return { request };
}

module.exports = { createDeepSeekClient };
