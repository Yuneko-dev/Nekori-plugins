import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import process from 'process';
import { pluginEntries } from './plugin-build-utils.js';
import { resolvePluginAssets } from '../src/lib/plugin-asset-paths.js';

const entryPointsFiles = pluginEntries();

const entryPoints = entryPointsFiles.map(input => {
  const [, language, name] = input.split('/');
  return { in: path.resolve(input), out: `${language}/${name}` };
});

async function build() {
  console.log(`Found ${entryPoints.length} plugins to build.`);
  fs.rmSync('.js/plugins', { recursive: true, force: true });

  await esbuild.build({
    entryPoints: entryPoints.map(ep => ({ in: ep.in, out: ep.out })),
    bundle: true,
    minify: true,
    charset: 'utf8',
    outdir: '.js/plugins',
    format: 'cjs',
    target: 'es2020',
    footer: {
      js: `;if(module.exports.default)exports.default=(${resolvePluginAssets.toString()})(module.exports.default);`,
    },
    plugins: [
      {
        name: 'external-packages',
        setup(build) {
          build.onResolve({ filter: /.*/ }, args => {
            if (/^@libs\/webview(?:[/.]|$)/.test(args.path))
              return {
                errors: [
                  {
                    text: '@libs/webview is reserved for the host and must not be imported by plugins.',
                  },
                ],
              };
            if (args.kind === 'entry-point' || args.path.startsWith('.'))
              return;
            return { path: args.path, external: true };
          });
        },
      },
    ],
  });

  console.log('Plugins built successfully.');
}

build().catch(e => {
  console.error('Build failed', e);
  process.exit(1);
});
