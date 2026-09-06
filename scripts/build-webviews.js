import esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { compiledPlugins, staticPath } from './plugin-build-utils.js';

export function planAssets(plugins) {
  const outputs = new Map();
  const assets = [];
  for (const { dir, plugin } of plugins) {
    const webview = ['index.ts', 'index.js']
      .map(file => path.join(dir, 'webview', file))
      .find(file => fs.existsSync(file));
    const css = path.join(dir, 'webview/style.css');
    if (webview && !plugin.customJS) {
      throw new Error(`${dir}: webview entry requires customJS metadata.`);
    }
    if (fs.existsSync(css) && !plugin.customCSS) {
      throw new Error(`${dir}: webview/style.css requires customCSS metadata.`);
    }
    for (const field of ['icon', 'customCSS', 'customJS']) {
      const relative = plugin[field];
      if (relative === undefined) continue;
      const destination = staticPath(relative);
      const source =
        field === 'icon'
          ? path.join(dir, path.posix.basename(relative))
          : field === 'customCSS'
            ? css
            : webview;
      if (!source || !fs.existsSync(source) || !fs.statSync(source).isFile()) {
        throw new Error(
          `${dir}: missing ${field} source (${source || 'webview/index.ts or index.js'}).`,
        );
      }
      // Case-insensitive comparison also catches collisions before Windows builds.
      const key = destination.toLowerCase();
      if (outputs.has(key)) {
        throw new Error(
          `${dir}: asset collision at ${relative} with ${outputs.get(key)}.`,
        );
      }
      outputs.set(key, dir);
      assets.push({ source, destination, field });
    }
  }
  return assets;
}

export async function buildAssets(plugins = compiledPlugins()) {
  // Validate every source/output before writing anything; old output is never a source.
  const assets = planAssets(plugins);
  for (const { source, destination, field } of assets) {
    if (field === 'customJS') {
      await esbuild.build({
        entryPoints: [source],
        bundle: true,
        minify: true,
        charset: 'utf8',
        outfile: destination,
        format: 'iife',
        target: 'es2020',
      });
    } else {
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(source, destination);
    }
  }
  console.log(`Built ${assets.length} assets for ${plugins.length} plugins.`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  buildAssets().catch(error => {
    console.error('Asset build failed:', error);
    process.exitCode = 1;
  });
}
