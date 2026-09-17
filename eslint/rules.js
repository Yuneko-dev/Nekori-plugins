import path from 'node:path';

const LNREADER_ONLY_IMPORTS = [
  // Approved external dependencies for plugins
  'htmlparser2',
  'cheerio',
  'dayjs',
  'urlencode',

  // Approved internal dependencies for plugins
  '@libs/novelStatus',
  '@libs/fetch',
  '@libs/isAbsoluteUrl',
  '@libs/filterInputs',
  '@libs/defaultCover',
  '@libs/aes',
  '@libs/utils',
  '@libs/storage',

  // Approved internal types for plugins
  '@/types/plugin',
];

const NEKORI_ONLY_IMPORTS = [
  // Approved internal dependencies for plugins (Nekori-only)
  '@nekori/aes',
  '@nekori/cookie',
  '@nekori/plugin',
  '@nekori/pluginMetadata',
  '@nekori/utils',
];

const NEKORI_EXTERNAL_IMPORTS = [
  // Approved external dependencies for plugins (Nekori-only)
  'node-html-markdown',
];

function isNekoriImport(source) {
  return (
    typeof source === 'string' &&
    (source.startsWith('@nekori/') ||
      NEKORI_EXTERNAL_IMPORTS.some(dep => source.startsWith(dep)))
  );
}

const allowedPluginImports = new Set([
  ...LNREADER_ONLY_IMPORTS,
  ...NEKORI_ONLY_IMPORTS,
  ...NEKORI_EXTERNAL_IMPORTS,
]);

export default {
  rules: {
    'approved-imports': {
      meta: {
        type: 'problem',
        schema: [],
        messages: {
          restricted:
            'Importing external modules is restricted here. Use only the approved dependencies.',
          outsidePlugin:
            'Relative imports must stay within the current plugin directory.',
        },
      },

      create(context) {
        const filename = path.resolve(context.filename);
        const parts = filename.split(path.sep);

        const pluginsIndex = parts.lastIndexOf('plugins');

        // plugins/<category>/<plugin>/
        const pluginRoot =
          pluginsIndex >= 0 && parts.length > pluginsIndex + 2
            ? parts.slice(0, pluginsIndex + 3).join(path.sep)
            : null;

        function check(node) {
          if (!node.source) return;

          const source = node.source.value;
          if (typeof source !== 'string') return;

          // Relative import
          if (source.startsWith('./') || source.startsWith('../')) {
            if (!pluginRoot) return;

            const target = path.resolve(path.dirname(filename), source);
            const relative = path.relative(pluginRoot, target);

            const outside =
              relative === '..' ||
              relative.startsWith(`..${path.sep}`) ||
              path.isAbsolute(relative);

            if (outside) {
              context.report({
                node: node.source,
                messageId: 'outsidePlugin',
              });
            }

            return;
          }

          // Approved external import
          if (allowedPluginImports.has(source)) {
            return;
          }

          context.report({
            node: node.source,
            messageId: 'restricted',
          });
        }

        return {
          ImportDeclaration: check,
          ExportNamedDeclaration: check,
          ExportAllDeclaration: check,
        };
      },
    },

    'no-lnreader-incompatible-imports': {
      meta: {
        type: 'problem',
        schema: [],
        messages: {
          nekori:
            'WARNING: Plugins using this import will only be compatible with Nekori (No backward compatibility with original LNReader).',
        },
      },
      create(context) {
        return {
          ImportDeclaration(node) {
            const source = node.source.value;
            if (isNekoriImport(source)) {
              context.report({
                node,
                messageId: 'nekori',
              });
              return;
            }
          },
        };
      },
    },
  },
};
