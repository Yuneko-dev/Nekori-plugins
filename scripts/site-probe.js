import { Buffer } from 'node:buffer';
import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';

export const DEFAULT_OPTIONS = {
  timeout: 15000,
  attempts: 2,
  maxBodyBytes: 64 * 1024,
  maxRedirects: 10,
};

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const TRANSIENT_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'EPIPE',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'ENETUNREACH',
]);

function challengeBody(body) {
  return (
    /<title[^>]*>\s*(?:just a moment|checking your browser|attention required)/i.test(
      body,
    ) ||
    /<(?:script|iframe)[^>]+(?:\/cdn-cgi\/challenge-platform\/|challenges\.cloudflare\.com)/i.test(
      body,
    )
  );
}

function classify(statusCode, headers, body) {
  const challenge =
    headers['cf-mitigated']?.toLowerCase() === 'challenge' ||
    challengeBody(body);
  if (
    statusCode === 401 ||
    statusCode === 403 ||
    statusCode === 429 ||
    challenge
  )
    return 'blocked';
  if (statusCode >= 200 && statusCode < 400) return 'accessible';
  return 'http_error';
}

function requestOnce(url, options, redirects, deadline) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (error) {
      reject(Object.assign(error, { code: 'INVALID_URL' }));
      return;
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      reject(
        Object.assign(new Error(`Unsupported protocol: ${parsed.protocol}`), {
          code: 'INVALID_URL',
        }),
      );
      return;
    }
    if (redirects > options.maxRedirects) {
      reject(
        Object.assign(new Error('Too many redirects'), {
          code: 'REDIRECT_LIMIT',
        }),
      );
      return;
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      reject(
        Object.assign(new Error('Request timed out'), { code: 'TIMEOUT' }),
      );
      return;
    }
    const client = parsed.protocol === 'https:' ? https : http;
    const hostname = parsed.hostname.replace(/^\[|\]$/g, '');
    let settled = false;
    let redirected = false;
    let totalTimer;
    let request;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(totalTimer);
      if (error) reject(error);
      else resolve(result);
    };
    request = client.request(
      {
        hostname,
        port: parsed.port || undefined,
        path: `${parsed.pathname || '/'}${parsed.search}`,
        method: 'GET',
        headers: {
          'User-Agent': USER_AGENT,
          Accept:
            'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
          'Accept-Encoding': 'identity',
        },
      },
      response => {
        const headers = Object.fromEntries(
          Object.entries(response.headers).map(([key, value]) => [
            key.toLowerCase(),
            Array.isArray(value) ? value.join(', ') : value || '',
          ]),
        );
        if (
          headers.location &&
          response.statusCode >= 300 &&
          response.statusCode < 400
        ) {
          let next;
          try {
            next = new URL(headers.location, parsed).toString();
          } catch (error) {
            response.on('error', () => {
              /* Discarding a redirect response. */
            });
            response.destroy();
            finish(Object.assign(error, { code: 'INVALID_URL' }));
            return;
          }
          options.redirects?.push({
            url: parsed.toString(),
            statusCode: response.statusCode,
            location: next,
            fromHost: parsed.host,
            toHost: new URL(next).host,
          });
          redirected = true;
          clearTimeout(totalTimer);
          request.setTimeout(0);
          response.on('error', () => {
            /* Discarding a redirect response. */
          });
          response.destroy();
          requestOnce(next, options, redirects + 1, deadline).then(
            result => finish(null, result),
            error => finish(error),
          );
          return;
        }
        const chunks = [];
        let bytes = 0;
        let truncated = false;
        const bodyText = () => Buffer.concat(chunks).toString('utf8');
        response.on('data', chunk => {
          if (bytes < options.maxBodyBytes) {
            const part = chunk.subarray(0, options.maxBodyBytes - bytes);
            chunks.push(part);
            bytes += part.length;
          }
          if (bytes >= options.maxBodyBytes) {
            truncated = true;
            finish(null, {
              statusCode: response.statusCode || 0,
              headers,
              body: bodyText(),
              finalUrl: parsed.toString(),
              redirects: options.redirects || [],
            });
            response.destroy();
          }
        });
        response.on('end', () =>
          finish(null, {
            statusCode: response.statusCode || 0,
            headers,
            body: bodyText(),
            finalUrl: parsed.toString(),
            redirects: options.redirects || [],
          }),
        );
        response.on('aborted', () => {
          if (!truncated)
            finish(
              Object.assign(
                new Error('Response ended before the body completed'),
                { code: 'ECONNRESET' },
              ),
            );
        });
        response.on('error', error => finish(error));
        response.on('close', () => {
          if (!response.complete && !truncated)
            finish(
              Object.assign(
                new Error('Response closed before the body completed'),
                { code: 'ECONNRESET' },
              ),
            );
        });
      },
    );
    totalTimer = setTimeout(() => {
      request.destroy();
      finish(
        Object.assign(new Error('Request timed out'), { code: 'TIMEOUT' }),
      );
    }, remaining);
    request.setTimeout(remaining, () => {
      request.destroy();
      finish(
        Object.assign(new Error('Request timed out'), { code: 'TIMEOUT' }),
      );
    });
    request.on('error', error => {
      if (!redirected) finish(error);
    });
    request.end();
  });
}

function retryable(error) {
  return error?.code === 'TIMEOUT' || TRANSIENT_CODES.has(error?.code);
}

export async function probeSite(inputUrl, provided = {}) {
  const options = { ...DEFAULT_OPTIONS, ...provided };
  let parsed;
  try {
    parsed = new URL(inputUrl);
  } catch {
    return {
      status: 'invalid_url',
      inputUrl,
      finalUrl: inputUrl,
      attempts: 0,
      reason: 'Invalid URL',
    };
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return {
      status: 'invalid_url',
      inputUrl,
      finalUrl: inputUrl,
      attempts: 0,
      reason: `Unsupported protocol: ${parsed.protocol}`,
    };
  }
  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    const deadline = Date.now() + options.timeout;
    const attemptOptions = { ...options, redirects: [] };
    try {
      const transport =
        typeof attemptOptions.requestOnce === 'function'
          ? attemptOptions.requestOnce
          : requestOnce;
      const result = await transport(
        parsed.toString(),
        attemptOptions,
        0,
        deadline,
      );
      if (
        result.statusCode >= 500 &&
        result.statusCode <= 599 &&
        attempt < options.attempts
      )
        continue;
      return {
        status: classify(result.statusCode, result.headers, result.body),
        inputUrl,
        finalUrl: result.finalUrl,
        redirects: result.redirects || [],
        statusCode: result.statusCode,
        attempts: attempt,
        reason: `HTTP ${result.statusCode}`,
      };
    } catch (error) {
      const status =
        error.code === 'TIMEOUT'
          ? 'timeout'
          : error.code === 'INVALID_URL'
            ? 'invalid_url'
            : 'network_error';
      if (!retryable(error) || attempt === options.attempts)
        return {
          status,
          inputUrl,
          finalUrl: attemptOptions.redirects.at(-1)?.location || inputUrl,
          redirects: attemptOptions.redirects,
          attempts: attempt,
          reason: error.message,
          error: error.code,
        };
    }
  }
  throw new Error('Unreachable retry loop');
}
