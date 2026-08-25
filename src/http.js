const DEFAULT_HEADERS = {
  'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
  'accept-language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
  'accept-encoding': 'gzip, deflate, br'
};

export async function fetchText(url, options = {}) {
  const timeout = Number(process.env.REQUEST_TIMEOUT_MS || 20_000);
  const response = await fetch(url, {
    redirect: 'follow',
    ...options,
    headers: { ...DEFAULT_HEADERS, ...options.headers },
    signal: AbortSignal.timeout(timeout)
  });
  const body = await response.text();
  if (!response.ok) {
    const error = new Error(`HTTP ${response.status} từ ${new URL(url).hostname}`);
    error.status = response.status;
    error.url = url;
    error.bodyPreview = body.slice(0, 200);
    throw error;
  }
  return { body, contentType: response.headers.get('content-type') || '', finalUrl: response.url };
}
