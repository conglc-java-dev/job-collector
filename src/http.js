import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

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

// Một số job board chặn TLS fingerprint của Node nhưng vẫn cho phép HTTP client
// thông thường. execFile truyền từng argument trực tiếp, không chạy qua shell.
export async function fetchTextWithCurl(url, options = {}) {
  const timeout = Number(process.env.REQUEST_TIMEOUT_MS || 20_000);
  const headers = options.headers || {};
  const args = ['--location', '--compressed', '--silent', '--show-error', '--fail-with-body'];
  if (options.method && options.method !== 'GET') args.push('--request', options.method);
  for (const [name, value] of Object.entries(headers)) {
    if (value !== undefined && value !== null && value !== '') args.push('--header', `${name}: ${value}`);
  }
  if (options.body !== undefined) args.push('--data-binary', String(options.body));
  args.push(String(url));

  try {
    const { stdout } = await execFileAsync('curl', args, { timeout, maxBuffer: 20 * 1024 * 1024 });
    return { body: stdout, contentType: '', finalUrl: String(url) };
  } catch (cause) {
    const error = new Error(`cURL thất bại từ ${new URL(url).hostname}: ${cleanCurlError(cause.stderr || cause.message)}`);
    error.url = String(url);
    throw error;
  }
}

function cleanCurlError(value) {
  return String(value || 'unknown error').replace(/\s+/g, ' ').trim().slice(0, 240);
}
