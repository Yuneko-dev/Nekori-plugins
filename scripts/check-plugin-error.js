import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import process from 'node:process';

import { build } from 'esbuild';

const bundle = await build({
  stdin: {
    contents:
      "export * from './src/libs/pluginError'; export { classifyError } from './src/lib/plugin-check-validation';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: 'cjs',
  packages: 'external',
  platform: 'node',
  tsconfig: 'tsconfig.json',
});

const mod = { exports: {} };
Function(
  'require',
  'module',
  'exports',
  bundle.outputFiles[0].text,
)(createRequire(import.meta.url), mod, mod.exports);

const {
  PluginError,
  assertNoChallenge,
  checkResponse,
  classifyError,
  createPluginError,
  httpError,
  isChallengeHtml,
  isPluginError,
} = mod.exports;

const rateLimited = createPluginError(PluginError.RateLimited, {
  status: 429,
  url: 'https://example.com/ch/1',
});
assert.equal(isPluginError(rateLimited), true);
assert.equal(rateLimited.name, 'PluginError');
assert.equal(rateLimited.code, PluginError.RateLimited);
assert.equal(rateLimited.status, 429);
assert.equal(classifyError(rateLimited), 'blocked');
assert.equal(classifyError(createPluginError(PluginError.NotFound)), 'failed');
assert.equal(isPluginError(new Error('plain error')), false);

assert.equal(httpError(401).code, PluginError.AuthRequired);
assert.equal(httpError(403).code, PluginError.Cloudflare);
assert.equal(httpError(404).code, PluginError.NotFound);
assert.equal(httpError(429).code, PluginError.RateLimited);
assert.equal(httpError(503).code, PluginError.Cloudflare);
assert.equal(httpError(502).code, PluginError.NetworkError);

const search404 = { ok: false, status: 404, url: 'https://example.com/search' };
assert.equal(checkResponse(search404, { search: true }), search404);
assert.throws(
  () =>
    checkResponse(
      { ok: false, status: 404, url: 'https://example.com/novel/1' },
      { notFoundCode: PluginError.NovelNotFound },
    ),
  err => isPluginError(err) && err.code === PluginError.NovelNotFound,
);

assert.equal(
  isChallengeHtml('<html><head><title>Just a moment...</title></head></html>'),
  true,
);
assert.equal(
  isChallengeHtml(
    '<html><head><title>OK</title></head></html>',
    'https://www.example.com/novel',
    'https://login.other.org/',
  ),
  true,
);
assert.throws(
  () =>
    assertNoChallenge(
      '<html><head><title>Attention Required! | Cloudflare</title></head></html>',
      'https://example.com/ch/1',
    ),
  err => isPluginError(err) && err.code === PluginError.Captcha,
);

console.log('PluginError helpers and check classification passed.');
