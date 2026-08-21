import path from 'node:path';

const allowedPluginImports = new Set([
  // Approved external dependencies for plugins
  'htmlparser2',
  'cheerio',
  'dayjs',
  'urlencode',
  'node-html-markdown',

  // Approved internal dependencies for plugins
  '@libs/novelStatus',
  '@libs/fetch',
  '@libs/isAbsoluteUrl',
  '@libs/filterInputs',
  '@libs/defaultCover',
  '@libs/pluginMetadata',
  '@libs/aes',
  '@libs/utils',
  '@libs/cookie',
  '@libs/storage',

  // Approved internal types for plugins
  '@/types/plugin',
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
          aes: 'WARNING: Plugins using this AES function will only be compatible with Nekori (No backward compatibility with original LNReader). Please take note and add a warning to the Readme.',
          utils:
            'WARNING: Plugins using this utility function/variable will only be compatible with Nekori (No backward compatibility with original LNReader). Please take note and add a warning to the Readme.',
          cookie:
            "WARNING: Plugins using the '@libs/cookie' library will only be compatible with Nekori (No backward compatibility with original LNReader). Please take note and add a warning to the Readme.",
        },
      },
      create(context) {
        const nekoriOnlyAesImports = new Set([
          'ctr',
          'ecb',
          'cbc',
          'cfb',
          'gcmsiv',
          'aeskw',
          'aeskwp',
          'cmac',
          'aessiv',
        ]);

        const nekoriOnlyUtilsImports = new Set([
          'Buffer',
          'encodeHtmlEntities',
          'decodeHtmlEntities',
          'NodeCrypto',
          'getUserAgent',
          'utf8ToBytes',
          'bytesToUtf8',
        ]);

        return {
          ImportDeclaration(node) {
            const source = node.source.value;

            // Entire @libs/cookie module is Nekori-only.
            if (source === '@libs/cookie') {
              context.report({
                node,
                messageId: 'cookie',
              });
              return;
            }

            if (source === '@libs/aes') {
              for (const specifier of node.specifiers) {
                if (specifier.type !== 'ImportSpecifier') {
                  continue;
                }

                const imported =
                  specifier.imported.type === 'Identifier'
                    ? specifier.imported.name
                    : specifier.imported.value;

                if (nekoriOnlyAesImports.has(imported)) {
                  context.report({
                    node: specifier,
                    messageId: 'aes',
                  });
                }
              }

              return;
            }

            if (source === '@libs/utils') {
              for (const specifier of node.specifiers) {
                if (specifier.type !== 'ImportSpecifier') {
                  continue;
                }

                const imported =
                  specifier.imported.type === 'Identifier'
                    ? specifier.imported.name
                    : specifier.imported.value;

                if (nekoriOnlyUtilsImports.has(imported)) {
                  context.report({
                    node: specifier,
                    messageId: 'utils',
                  });
                }
              }
            }
          },
        };
      },
    },
  },
};
