import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {
  compiledPlugins,
  pluginEntries,
  staticPath,
} from './plugin-build-utils.js';
import { planAssets } from './build-webviews.js';
import { resolvePluginAssets } from '../src/lib/plugin-asset-paths.js';

const bare = {
  id: 'demo.one',
  icon: 'icon.png',
  customCSS: 'style.css',
  customJS: 'viewer.js',
};
const resolvedBare = resolvePluginAssets(bare);
assert.deepEqual(resolvedBare, {
  id: 'demo.one',
  icon: 'src/demo.one/icon.png',
  customCSS: 'src/demo.one/style.css',
  customJS: 'src/demo.one/viewer.js',
});
const idempotentSnapshot = { ...resolvedBare };
assert.deepEqual(
  resolvePluginAssets(resolvedBare),
  idempotentSnapshot,
  'asset resolution is not idempotent',
);
assert.equal(
  resolvePluginAssets({ id: 'demo.two', icon: 'icon.png' }).icon,
  'src/demo.two/icon.png',
  'asset names are not namespaced by plugin id',
);
assert.equal(
  resolvePluginAssets({ id: 'demo.one', icon: 'src/legacy/icon.png' }).icon,
  'src/legacy/icon.png',
  'legacy asset paths were rewritten',
);

const plugins = compiledPlugins();
assert(
  plugins.length > 0,
  'No compiled plugins discovered; run npm run build:plugins first.',
);

const entries = pluginEntries();
assert(
  entries.every(
    entry => !entry.includes('/multisrc/') && !entry.includes('/broken_'),
  ),
);
assert(
  !entries.some(entry =>
    path.basename(path.dirname(entry)).startsWith('broken_'),
  ),
);

const assets = planAssets(plugins);
assert(assets.length > 0, 'No declared plugin assets discovered.');

for (const { plugin } of plugins) {
  for (const field of ['icon', 'customCSS', 'customJS']) {
    if (plugin[field] !== undefined) {
      assert(
        plugin[field].includes('/'),
        `${plugin.id} ${field} remained a bare asset name`,
      );
    }
  }
}

for (const { source, destination, field } of assets) {
  assert(fs.existsSync(source), `${field} source is missing: ${source}`);
  assert(
    fs.existsSync(destination),
    `${field} output is missing: ${destination}`,
  );
  if (field === 'customJS') {
    assert.doesNotThrow(
      () =>
        new vm.Script(fs.readFileSync(destination, 'utf8'), {
          filename: destination,
        }),
      `Invalid JavaScript output: ${destination}`,
    );
  } else {
    assert.deepEqual(
      fs.readFileSync(destination),
      fs.readFileSync(source),
      `${field} output differs from source: ${destination}`,
    );
  }
}

const sample = plugins[0];
const noCssPlugin = plugins.find(({ plugin }) => !plugin.customCSS);
assert(noCssPlugin, 'Expected a compiled plugin without CSS metadata.');
for (const invalid of [
  '../escape.png',
  '/absolute.png',
  'C:/absolute.png',
  'nested\\asset.png',
  'https://example.test/asset.png',
  'asset?query.png',
  'asset#fragment.png',
  'asset:scheme.png',
  'nested//asset.png',
]) {
  assert.throws(
    () =>
      planAssets([{ ...sample, plugin: { ...sample.plugin, icon: invalid } }]),
    /Invalid static asset path/,
    `unsafe asset path was accepted: ${invalid}`,
  );
}

assert.throws(
  () => planAssets([sample, { ...sample, plugin: { ...sample.plugin } }]),
  /asset collision/,
  'duplicate output paths were accepted',
);

assert.throws(
  () =>
    planAssets([
      { ...sample, plugin: { ...sample.plugin, icon: 'missing-icon.png' } },
    ]),
  /missing icon source/,
  'missing declared source was accepted',
);

assert.throws(
  () =>
    planAssets([
      {
        ...noCssPlugin,
        plugin: { ...noCssPlugin.plugin, customCSS: 'missing.css' },
      },
    ]),
  /missing customCSS source/,
  'missing declared CSS source was accepted',
);

assert.throws(() => staticPath('..\\escape.js'), /Invalid static asset path/);

const manifest = JSON.parse(fs.readFileSync('.dist/plugins.json', 'utf8'));
const metadataById = new Map(plugins.map(({ plugin }) => [plugin.id, plugin]));
for (const record of manifest) {
  const plugin = metadataById.get(record.id);
  assert(plugin, `manifest record has no compiled plugin: ${record.id}`);
  for (const [field, urlField] of [
    ['icon', 'iconUrl'],
    ['customJS', 'customJS'],
    ['customCSS', 'customCSS'],
  ]) {
    if (plugin[field] === undefined) continue;
    assert(
      record[urlField]?.endsWith(`/${plugin[field]}`),
      `${record.id} ${urlField} does not match ${plugin[field]}`,
    );
    assert(
      fs.existsSync(path.join('public/static', plugin[field])),
      `${record.id} ${field} file is missing`,
    );
  }
}
console.log(
  `Checked ${plugins.length} plugins and ${assets.length} declared assets.`,
);
