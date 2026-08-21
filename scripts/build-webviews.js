import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import process from 'process';
import fastGlob from 'fast-glob';
const globSync = fastGlob.globSync;

const createRecursiveProxy = () => {
  const target = {};
  const handler = {
    get(target, prop) {
      if (prop === 'get') return a => a;
      if (!target[prop]) target[prop] = createRecursiveProxy();
      return target[prop];
    },
  };
  return new Proxy(target, handler);
};

async function buildWebviews() {
  const pluginFiles = globSync('.js/plugins/*/*.js');
  console.log(`Found ${pluginFiles.length} plugins to check for webviews.`);

  const proxyRequire = () => createRecursiveProxy();

  for (const pf of pluginFiles) {
    const parts = pf.split('/');
    const lang = parts[2];
    const name = parts[3].replace('.js', '');

    const webviewTs = path.join('plugins', lang, name, 'webview', 'index.ts');
    const webviewJs = path.join('plugins', lang, name, 'webview', 'index.js');

    let webviewEntry = null;
    if (fs.existsSync(webviewTs)) webviewEntry = webviewTs;
    else if (fs.existsSync(webviewJs)) webviewEntry = webviewJs;

    if (webviewEntry) {
      const rawCode = fs.readFileSync(pf, 'utf-8');
      const plugin = Function(
        'require',
        'module',
        `const exports = module.exports = {};
        ${rawCode};
        return exports.default`,
      )(proxyRequire, {});

      if (plugin.customJS) {
        console.log(`[Webview] ${name} -> public/static/${plugin.customJS}`);
        await esbuild.build({
          entryPoints: [webviewEntry],
          bundle: true,
          minify: true,
          charset: 'utf8',
          outfile: path.join('public', 'static', plugin.customJS),
          format: 'iife',
          target: 'es2020',
        });
      }
    }
  }

  console.log('Webviews built successfully.');
}

buildWebviews().catch(e => {
  console.error('Webview build failed', e);
  process.exit(1);
});
