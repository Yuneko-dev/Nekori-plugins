#!/usr/bin/env node
import assert from 'node:assert/strict';
import http from 'node:http';
import { probeSite } from './site-probe.js';
import {
  makeReport,
  siteEntries,
  runChromiumChecks,
} from './check-plugin-sites.js';
import { resolveNetworkOptions } from './check-network.js';

let retryCount = 0;
const server = http.createServer((request, response) => {
  if (request.url === '/cross-host') {
    response
      .writeHead(302, {
        location: `http://localhost:${server.address().port}/redirect`,
      })
      .end();
    return;
  }
  if (request.url === '/loop') {
    response.writeHead(302, { location: '/loop' }).end();
    return;
  }
  if (request.url === '/large') {
    response.end('x'.repeat(128 * 1024));
    return;
  }
  if (request.url === '/head403') {
    if (request.method === 'HEAD') response.writeHead(403).end();
    else response.end('ok');
    return;
  }
  if (request.url === '/redirect') {
    response.writeHead(302, { location: '/healthy' }).end();
    return;
  }
  if (request.url === '/redirect-slow') {
    response.writeHead(302, { location: '/slow' }).end();
    return;
  }
  if (request.url === '/redirect-invalid') {
    response.writeHead(302, { location: 'http://[invalid' }).end();
    return;
  }
  if (request.url === '/blocked') {
    response.writeHead(403).end('forbidden');
    return;
  }
  if (request.url === '/rate') {
    response.writeHead(429).end('slow down');
    return;
  }
  if (request.url === '/challenge') {
    response
      .writeHead(200, { 'cf-mitigated': 'challenge' })
      .end('<title>Just a moment...</title>');
    return;
  }
  if (request.url === '/cloudflare') {
    response
      .writeHead(200, { server: 'cloudflare' })
      .end('<html>healthy</html>');
    return;
  }
  if (request.url === '/ordinary-text') {
    response.end('Please wait just a moment while we prepare your page.');
    return;
  }
  if (request.url === '/missing') {
    response.writeHead(404).end('missing');
    return;
  }
  if (request.url === '/retry') {
    retryCount += 1;
    if (retryCount === 1) response.writeHead(503).end('temporary');
    else response.end('ok');
    return;
  }
  if (request.url === '/slow') {
    response.write('first');
    setTimeout(() => response.end('late'), 100);
    return;
  }
  if (request.url === '/premature') {
    response.writeHead(200, { 'Content-Length': 20 });
    response.write('short');
    response.socket.destroy();
    return;
  }
  response.end('ok');
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const probe = (route, options = {}) =>
  probeSite(`${base}${route}`, { attempts: 2, timeout: 50, ...options });
try {
  assert.equal((await probe('/head403')).status, 'accessible');
  assert.equal((await probe('/redirect')).finalUrl, `${base}/healthy`);
  assert.equal((await probe('/blocked')).status, 'blocked');
  assert.equal((await probe('/rate')).status, 'blocked');
  assert.equal((await probe('/challenge')).status, 'blocked');
  assert.equal((await probe('/cloudflare')).status, 'accessible');
  assert.equal((await probe('/ordinary-text')).status, 'accessible');
  assert.equal((await probe('/missing')).status, 'http_error');
  assert.equal((await probe('/retry')).status, 'accessible');
  assert.equal((await probe('/slow', { timeout: 20 })).status, 'timeout');
  assert.equal(
    (await probe('/redirect-slow', { timeout: 30 })).status,
    'timeout',
  );
  assert.equal((await probe('/redirect-invalid')).status, 'invalid_url');
  assert.equal((await probe('/premature')).status, 'network_error');
  assert.equal((await probe('not a url')).status, 'invalid_url');
  const entries = siteEntries([
    { plugin: { id: 'a', name: 'A', lang: 'en', site: `${base}/healthy` } },
    { plugin: { id: 'b', name: 'B', lang: 'en', site: `${base}/healthy` } },
  ]);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].plugins.length, 2);
  const report = makeReport([
    {
      ...entries[0],
      result: {
        status: 'accessible',
        inputUrl: entries[0].url,
        finalUrl: entries[0].url,
        attempts: 1,
      },
    },
  ]);
  assert.equal(report.counts.accessible, 1);
  assert.equal(report.sites[0].plugins.length, 2);
  const chromium = await runChromiumChecks(
    [
      '/cross-host',
      '/head403',
      '/large',
      '/blocked',
      '/premature',
      '/loop',
    ].map(route => ({ url: base + route, plugins: [] })),
    {
      network: resolveNetworkOptions({ 'dns-mode': 'off' }),
      timeout: 1000,
      attempts: 1,
      concurrency: 1,
      maxRedirects: 2,
    },
  );
  const find = route =>
    chromium.find(record => record.url === base + route).result;
  assert.equal(find('/cross-host').status, 'accessible');
  assert.equal(
    find('/cross-host').finalUrl,
    `http://localhost:${server.address().port}/healthy`,
  );
  assert.equal(find('/cross-host').redirects.length, 2);
  assert.notEqual(
    find('/cross-host').redirects[0].fromHost,
    find('/cross-host').redirects[0].toHost,
  );
  assert.equal(find('/head403').status, 'accessible');
  assert.equal(find('/large').status, 'accessible');
  assert.equal(find('/blocked').status, 'blocked');
  assert.equal(find('/premature').status, 'network_error');
  assert.equal(find('/loop').error, 'REDIRECT_LIMIT');
  const slow = await runChromiumChecks([{ url: base + '/slow', plugins: [] }], {
    network: resolveNetworkOptions({ 'dns-mode': 'off' }),
    timeout: 20,
    attempts: 1,
    concurrency: 1,
  });
  assert.equal(slow[0].result.status, 'timeout');
  console.log('site probe checks passed');
} finally {
  server.close();
}
