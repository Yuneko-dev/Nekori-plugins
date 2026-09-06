const { app, net, session } = require('electron');

async function readInput() {
  if (process.env.NEKORI_SITE_CHECK_INPUT)
    return JSON.parse(
      require('node:fs').readFileSync(
        process.env.NEKORI_SITE_CHECK_INPUT,
        'utf8',
      ),
    );
  let text = '';
  for await (const chunk of process.stdin) text += chunk;
  return JSON.parse(text || '{}');
}

function requestOnce(url, options, redirects, deadline) {
  return new Promise((resolve, reject) => {
    let current = new URL(url);
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
    const hops = options.redirects || [];
    let redirectCount = redirects;
    const request = net.request({
      url: current.toString(),
      method: 'GET',
      session: options.session,
      redirect: 'follow',
    });
    request.setHeader(
      'User-Agent',
      options.userAgent.replace(/\s*Electron\/[\d.]+/gi, ''),
    );
    request.setHeader(
      'Accept',
      'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
    );
    request.setHeader('Accept-Encoding', 'identity');
    let settled = false;
    let timer;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(result);
    };
    request.on(
      'redirect',
      (statusCode, method, redirectUrl) => {
        const next = new URL(redirectUrl, current).toString();
        redirectCount += 1;
        hops.push({
          url: current.toString(),
          statusCode,
          method,
          location: next,
          fromHost: current.host,
          toHost: new URL(next).host,
        });
        if (redirectCount > options.maxRedirects) {
          request.abort();
          finish(
            Object.assign(new Error('Too many redirects'), {
              code: 'REDIRECT_LIMIT',
            }),
          );
          return;
        }
        current = new URL(next);
        request.followRedirect();
      },
    );
    request.on('response', response => {
      const headers = Object.fromEntries(
        Object.entries(response.headers).map(([key, value]) => [
          key.toLowerCase(),
          Array.isArray(value) ? value.join(', ') : value || '',
        ]),
      );
      const chunks = [];
      let bytes = 0;
      let truncated = false;
      const bodyText = () => Buffer.concat(chunks).toString('utf8');
      response.on('data', chunk => {
        if (bytes < options.maxBodyBytes) {
          const part = Buffer.from(chunk).subarray(
            0,
            options.maxBodyBytes - bytes,
          );
          chunks.push(part);
          bytes += part.length;
        }
        if (bytes >= options.maxBodyBytes && !truncated) {
          truncated = true;
          finish(null, {
            statusCode: response.statusCode || 0,
            headers,
            body: bodyText(),
            finalUrl: current.toString(),
            redirects: hops.slice(),
          });
          request.abort();
        }
      });
      response.on('end', () =>
        finish(null, {
          statusCode: response.statusCode || 0,
          headers,
          body: bodyText(),
          finalUrl: current.toString(),
          redirects: hops.slice(),
        }),
      );
      response.on('error', error => finish(error));
      response.on('aborted', () => {
        if (!truncated)
          finish(
            Object.assign(new Error('Response aborted'), {
              code: 'ECONNRESET',
            }),
          );
      });
    });
    request.on('error', error => finish(error));
    timer = setTimeout(() => {
      request.abort();
      finish(
        Object.assign(new Error('Request timed out'), { code: 'TIMEOUT' }),
      );
    }, remaining);
    request.end();
  });
}

(async () => {
  const input = await readInput();
  const { applyNetworkFeatures, configureNetwork } = await import(
    './check-network.js'
  );
  const network = {
    dnsMode: input.options?.dnsMode || 'secure',
    doh: input.options?.doh || 'https://cloudflare-dns.com/dns-query',
    ech: input.options?.ech !== false,
  };
  applyNetworkFeatures(app, network);
  const { probeSite } = await import('./site-probe.js');
  await app.whenReady();
  configureNetwork(app, network);
  const customSession = session.fromPartition(`site-check-${process.pid}`);
  const options = input.options || {};
  const records = [];
  let next = 0;
  async function consume() {
    while (next < (input.entries || []).length) {
      const entry = input.entries[next++];
      const result = await probeSite(entry.url, {
        ...options,
        userAgent: customSession.getUserAgent(),
        session: customSession,
        requestOnce,
      });
      records.push({ ...entry, result });
    }
  }
  await Promise.all(
    Array.from(
      {
        length: Math.min(
          options.concurrency || 4,
          (input.entries || []).length,
        ),
      },
      consume,
    ),
  );
  require('node:fs').writeFileSync(
    process.env.NEKORI_SITE_CHECK_OUTPUT,
    JSON.stringify(records),
  );
  app.exit(0);
})().catch(error => {
  process.stderr.write(`${error.stack || error}\n`);
  app.exit(1);
});
