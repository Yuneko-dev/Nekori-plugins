import path from 'node:path';

const LNREADER_IMPORTS = [
  // External
  'htmlparser2',
  'cheerio',
  'dayjs',
  'urlencode',

  // Internal
  '@libs/novelStatus',
  '@libs/fetch',
  '@libs/isAbsoluteUrl',
  '@libs/filterInputs',
  '@libs/defaultCover',
  '@libs/aes',
  '@libs/utils',
  '@libs/storage',

  // Types
  '@/types/plugin',
];

const NEKORI_IMPORTS = [
  '@nekori/cookie',
  '@nekori/plugin',
  '@nekori/pluginMetadata',
  '@nekori/utils',

  'node-html-markdown',
];

const DEPRECATED_IMPORTS = ['@nekori/aes'];

const ALLOWED_IMPORTS = new Set([
  ...LNREADER_IMPORTS,
  ...NEKORI_IMPORTS,
  ...DEPRECATED_IMPORTS,
]);

const DEPRECATED_IMPORT_SET = new Set(DEPRECATED_IMPORTS);

function matchesImport(source, dependency) {
  return source === dependency || source.startsWith(`${dependency}/`);
}

function isNekoriImport(source) {
  return NEKORI_IMPORTS.some(dep => matchesImport(source, dep));
}

function getSource(node) {
  const source = node.source?.value;
  return typeof source === 'string' ? source : null;
}

function getImportVisitors(check) {
  return {
    ImportDeclaration: check,
    ExportNamedDeclaration: check,
    ExportAllDeclaration: check,
  };
}

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
          const source = getSource(node);
          if (!source) return;

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

          if (ALLOWED_IMPORTS.has(source)) {
            return;
          }

          context.report({
            node: node.source,
            messageId: 'restricted',
          });
        }

        return getImportVisitors(check);
      },
    },

    'deprecated-imports': {
      meta: {
        type: 'problem',
        schema: [],
        messages: {
          deprecated:
            'This import is deprecated and should not be used in new plugins.',
        },
      },

      create(context) {
        function check(node) {
          const source = getSource(node);

          if (source && DEPRECATED_IMPORT_SET.has(source)) {
            context.report({
              node: node.source,
              messageId: 'deprecated',
            });
          }
        }

        return getImportVisitors(check);
      },
    },

    'no-lnreader-incompatible-imports': {
      meta: {
        type: 'problem',
        schema: [],
        messages: {
          nekori:
            'WARNING: Plugins using this import will only be compatible with Nekori (no backward compatibility with original LNReader).',
        },
      },

      create(context) {
        function check(node) {
          const source = getSource(node);

          if (source && isNekoriImport(source)) {
            context.report({
              node: node.source,
              messageId: 'nekori',
            });
          }
        }

        return getImportVisitors(check);
      },
    },
  },
};
