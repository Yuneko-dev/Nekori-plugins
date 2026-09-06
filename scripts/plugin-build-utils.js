import fs from 'node:fs';
import path from 'node:path';
import fastGlob from 'fast-glob';

export const pluginEntries = () =>
  fastGlob
    .globSync('plugins/*/*/index.ts', {
      ignore: ['plugins/*/broken_*/**', 'plugins/multisrc/**'],
    })
    .sort();

const createRecursiveProxy = () => {
  const target = {};
  return new Proxy(target, {
    get(target, prop) {
      if (prop === 'get') return a => a;
      if (!target[prop]) target[prop] = createRecursiveProxy();
      return target[prop];
    },
  });
};

export function readPlugin(file) {
  const proxy = createRecursiveProxy();
  const metadata = {
    ContentWarning: { UNSPECIFIED: 0, SAFE: 1, MIXED: 2, NSFW: 3 },
    ContentType: {
      NOVEL: 'novel',
      IMAGE: 'image',
      VIDEO: 'video',
      MIXED: 'mixed',
    },
  };
  // Match the host evaluator: esbuild's footer populates exports.default.
  return Function(
    'require',
    'module',
    `const exports = module.exports = {};
    ${fs.readFileSync(file, 'utf8')};
    return exports.default;
  `,
  )(name => (name === '@libs/pluginMetadata' ? metadata : proxy), {});
}

export function staticPath(relative) {
  if (
    typeof relative !== 'string' ||
    !relative ||
    /[\\:?#]/.test(relative) ||
    [...relative].some(char => char.charCodeAt(0) < 32) ||
    relative.split('/').some(part => !part || part === '.' || part === '..')
  ) {
    throw new Error(`Invalid static asset path: ${String(relative)}`);
  }
  return path.resolve('public/static', relative);
}

export function compiledPlugins() {
  return pluginEntries().map(entry => {
    const [, language, name] = entry.split('/');
    const file = path.join('.js/plugins', language, `${name}.js`);
    if (!fs.existsSync(file)) {
      throw new Error(`Missing ${file}; run npm run build:plugins first.`);
    }
    return { dir: path.dirname(entry), plugin: readPlugin(file) };
  });
}
