import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { build } from 'esbuild';

const bundle = await build({
  entryPoints: ['src/lib/plugin-check-validation.ts'],
  bundle: true,
  write: false,
  format: 'cjs',
  packages: 'external',
  platform: 'node',
});
const module = { exports: {} };
Function(
  'require',
  'module',
  'exports',
  bundle.outputFiles[0].text,
)(createRequire(import.meta.url), module, module.exports);
const { validateChapter, classifyError } = module.exports;
assert.equal(validateChapter('<p>Legacy</p>'), '<p>Legacy</p>');
assert.equal(
  validateChapter({
    state: 'ready',
    type: 'video',
    html: '<meta name="lnreader-video-poster" content="cover.jpg">',
  }),
  '<meta name="lnreader-video-poster" content="cover.jpg">',
);
assert.throws(
  () => validateChapter({ state: 'ready', type: 'invalid', html: 'x' }),
  /Invalid chapter/,
);
assert.throws(
  () =>
    validateChapter({
      state: 'ready',
      type: 'novel',
      html: 'x',
      noCache: 'false',
    }),
  /Invalid chapter/,
);
assert.throws(
  () => validateChapter({ state: 'ready', type: 'novel', html: '' }),
  /empty/,
);
try {
  validateChapter({
    state: 'checkpoint',
    type: 'novel',
    html: '<div>Captcha</div>',
    checkpointMessage: 'Verify token',
  });
  assert.fail('checkpoint must not be a successful chapter');
} catch (error) {
  assert.equal(classifyError(error), 'blocked');
}
console.log('Chapter response regressions passed.');
