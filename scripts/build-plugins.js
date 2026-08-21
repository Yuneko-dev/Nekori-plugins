import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import process from 'process';
import fastGlob from 'fast-glob';
const globSync = fastGlob.globSync;

const entryPointsFiles = globSync('plugins/*/*/index.ts', {
  ignore: ['plugins/*/broken_*/**', 'plugins/multisrc/**'],
});

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
      js: ';if(module.exports.default)exports.default=module.exports.default;',
    },
    plugins: [
      {
        name: 'external-packages',
        setup(build) {
          build.onResolve({ filter: /.*/ }, args => {
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
