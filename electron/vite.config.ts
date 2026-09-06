import { defineConfig, mergeConfig } from 'vite';
import electron from 'vite-plugin-electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import root project's Vite config (React, Tailwind, aliases, polyfills)
import baseConfig from '../vite.config';

const rootDir = path.resolve(__dirname, '..');

// Share the renderer aliases and plugin runtime with the root config.
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

export default merged;
