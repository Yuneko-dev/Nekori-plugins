import { ipcMain, net } from 'electron';
import { getEffectiveUserAgent } from './settings-handler';
import { customSession } from '../main';

const REQUEST_TIMEOUT_MS = 30_000;

export async function performNetRequest(url: string, init?: any) {
  const incomingHeaders = init?.headers || {};

  // Build merged headers from defaults + plugin-provided (Cookie handled separately)
  const headerEntries: Record<string, string> = {
    'Connection': 'keep-alive',
    'Accept': '*/*',
    'Accept-Language': '*',
    'Accept-Encoding': 'gzip, deflate',
  };

  if (incomingHeaders instanceof Headers) {
    for (const [k, v] of incomingHeaders.entries()) {
      if (k.toLowerCase() !== 'cookie') headerEntries[k] = v;
    }
  } else {
    for (const [k, v] of Object.entries(incomingHeaders)) {
      if (k.toLowerCase() !== 'cookie' && v != null)
        headerEntries[k] = String(v);
    }
  }

  // Same UA used by both fetch-handler and @libs/utils getUserAgent()
  headerEntries['User-Agent'] = getEffectiveUserAgent();

  // Build Cookie header: session cookies + any plugin-injected cookies
  const urlObj = new URL(url);
  const [urlCookies, domainCookies] = await Promise.all([
    customSession.cookies.get({ url }),
    customSession.cookies.get({ domain: urlObj.hostname }),
  ]);

  const cookieMap = new Map<string, string>();
  for (const c of [...urlCookies, ...domainCookies]) {
    if (c.secure && !url.startsWith('https://')) continue;
    cookieMap.set(c.name, c.value);
  }

  const pluginCookieHeader =
    incomingHeaders instanceof Headers
      ? incomingHeaders.get('cookie')
      : incomingHeaders['Cookie'] || incomingHeaders['cookie'];
  if (pluginCookieHeader) {
    for (const pair of String(pluginCookieHeader).split(';')) {
      const eqIdx = pair.indexOf('=');
      if (eqIdx > 0) {
        cookieMap.set(
          pair.substring(0, eqIdx).trim(),
          pair.substring(eqIdx + 1).trim(),
        );
      }
    }
  }

  const cookieString = Array.from(cookieMap.entries())
    .map(([n, v]) => `${n}=${v}`)
    .join('; ');

  // net.request() instead of session.fetch() — the latter strips Cookie & User-Agent
  return new Promise<{
    statusCode: number;
    statusMessage: string;
    headers: Record<string, string>;
    stream: Electron.IncomingMessage;
    finalUrl: string;
    redirects: {
      from: string;
      to: string;
      statusCode: number;
      method: string;
    }[];
  }>((resolve, reject) => {
    let finalUrl = url;
    const redirects: {
      from: string;
      to: string;
      statusCode: number;
      method: string;
    }[] = [];
    const request = net.request({
      url,
      method: init?.method || 'GET',
      session: customSession,
      useSessionCookies: false,
      redirect: 'follow',
    });

    for (const [k, v] of Object.entries(headerEntries)) {
      try {
        request.setHeader(k, v);
      } catch {
        /* skip invalid headers */
      }
    }
    if (cookieString) {
      request.setHeader('Cookie', cookieString);
    }

    if (
      init?.body &&
      (init.body instanceof Uint8Array || Buffer.isBuffer(init.body))
    ) {
      if (!headerEntries['Content-Type']) {
        request.setHeader('Content-Type', 'application/octet-stream');
      }
    }

    // Timeout to prevent hanging requests from leaking memory
    const timer = setTimeout(() => {
      request.abort();
      reject(
        new Error(`Request timed out after ${REQUEST_TIMEOUT_MS}ms: ${url}`),
      );
    }, REQUEST_TIMEOUT_MS);

    request.on('response', response => {
      clearTimeout(timer);

      const flatHeaders: Record<string, string> = {};
      for (const [k, v] of Object.entries(response.headers)) {
        flatHeaders[k] = Array.isArray(v) ? v[v.length - 1] : v ?? '';
      }

      // Persist response Set-Cookie into the session jar
      const setCookies = response.headers['set-cookie'];
      if (setCookies) {
        const arr = Array.isArray(setCookies) ? setCookies : [setCookies];
        for (const raw of arr) {
          customSession.cookies
            .set(parseSetCookie(raw, finalUrl))
            .catch(() => {});
        }
      }

      resolve({
        statusCode: response.statusCode,
        statusMessage: response.statusMessage,
        headers: flatHeaders,
        stream: response,
        finalUrl,
        redirects,
      });
    });

    request.on('error', err => {
      clearTimeout(timer);
      reject(err);
    });
    request.on('redirect', (statusCode, method, redirectUrl) => {
      const destination = new URL(redirectUrl, finalUrl).href;
      redirects.push({ from: finalUrl, to: destination, statusCode, method });
      finalUrl = destination;
      request.followRedirect();
    });

    if (init?.body) {
      const bodyData =
        init.body instanceof Uint8Array || Buffer.isBuffer(init.body)
          ? Buffer.from(init.body)
          : Buffer.from(String(init.body), 'utf-8');
      request.write(bodyData);
    }
    request.end();
  });
}

ipcMain.handle('fetch:request', async (_e, url: string, init?: any) => {
  const responseData = await performNetRequest(url, init);

  const bodyBuffer = await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    responseData.stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    responseData.stream.on('end', () => resolve(Buffer.concat(chunks)));
    responseData.stream.on('error', reject);
  });

  return {
    status: responseData.statusCode,
    statusText: responseData.statusMessage,
    headers: responseData.headers,
    body: bodyBuffer.toString('base64'),
    url: responseData.finalUrl,
    redirects: responseData.redirects,
  };
});

/** Parse a raw Set-Cookie header into Electron's CookiesSetDetails. */
function parseSetCookie(
  raw: string,
  requestUrl: string,
): Electron.CookiesSetDetails {
  const parts = raw.split(';').map(s => s.trim());
  const [nameVal, ...attrs] = parts;
  const eqIdx = nameVal.indexOf('=');

  const details: Electron.CookiesSetDetails = {
    url: requestUrl,
    name: nameVal.substring(0, eqIdx),
    value: nameVal.substring(eqIdx + 1),
  };

  for (const attr of attrs) {
    const lower = attr.toLowerCase();
    if (lower.startsWith('domain=')) {
      details.domain = attr.substring(7);
    } else if (lower.startsWith('path=')) {
      details.path = attr.substring(5);
    } else if (lower === 'secure') {
      details.secure = true;
    } else if (lower === 'httponly') {
      details.httpOnly = true;
    } else if (lower.startsWith('max-age=')) {
      const maxAge = parseInt(attr.substring(8));
      if (!isNaN(maxAge)) details.expirationDate = Date.now() / 1000 + maxAge;
    } else if (lower.startsWith('expires=')) {
      const ts = new Date(attr.substring(8)).getTime();
      if (!isNaN(ts)) details.expirationDate = ts / 1000;
    } else if (lower.startsWith('samesite=')) {
      const ss = attr.substring(9).toLowerCase();
      if (ss === 'lax' || ss === 'strict' || ss === 'no_restriction') {
        details.sameSite = ss;
      } else if (ss === 'none') {
        details.sameSite = 'no_restriction';
      }
    }
  }

  return details;
}
