import { defineConfig, mergeConfig } from 'vite';
import electron from 'vite-plugin-electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import root project's Vite config (React, Tailwind, aliases, polyfills)
import baseConfig from '../vite.config';

const rootDir = path.resolve(__dirname, '..');

// Step 1: Merge base config WITHOUT resolve.alias (mergeConfig breaks mixed formats)
const merged = mergeConfig(
  baseConfig,
  defineConfig({
    root: rootDir,

    plugins: [
      electron([
        {
          entry: path.resolve(__dirname, 'main/main.ts'),
          vite: {
            build: { outDir: path.resolve(__dirname, 'dist-electron/main') },
          },
        },
      ]),
    ],

    server: { port: 3001, open: false },
  }),
);

// Step 2: Manually build unified alias array —
// Electron overrides MUST come first so they take priority over @libs → src/libs
merged.resolve = merged.resolve || {};
merged.resolve.alias = [
  // ─── Electron IPC overrides (highest priority) ───
  // These intercept @libs/fetch BEFORE the generic @libs alias resolves
  { find: '@libs/fetch', replacement: path.resolve(__dirname, 'lib/fetch.ts') },
  {
    find: '@libs/cookie',
    replacement: path.resolve(__dirname, 'lib/cookie.ts'),
  },
  {
    find: '@libs/storage',
    replacement: path.resolve(__dirname, 'lib/storage.ts'),
  },
  { find: '@libs/utils', replacement: path.resolve(__dirname, 'lib/utils.ts') },
  // Also intercept the src/lib/ imports (for files that import ../lib/fetch directly)
  {
    find: /.*[/\\]src[/\\]lib[/\\]fetch(?:\.ts)?$/,
    replacement: path.resolve(__dirname, 'lib/fetch.ts'),
  },
  {
    find: /.*[/\\]src[/\\]lib[/\\]cookie(?:\.ts)?$/,
    replacement: path.resolve(__dirname, 'lib/cookie.ts'),
  },
  {
    find: /.*[/\\]src[/\\]lib[/\\]storage(?:\.ts)?$/,
    replacement: path.resolve(__dirname, 'lib/storage.ts'),
  },
  {
    find: /.*[/\\]src[/\\]lib[/\\]utils(?:\.ts)?$/,
    replacement: path.resolve(__dirname, 'lib/utils.ts'),
  },
  // ─── Base aliases (from root vite.config) ───
  { find: '@', replacement: path.resolve(rootDir, 'src') },
  { find: '@plugins', replacement: path.resolve(rootDir, 'plugins') },
  { find: '@libs', replacement: path.resolve(rootDir, 'src/libs') },
];

export default merged;
