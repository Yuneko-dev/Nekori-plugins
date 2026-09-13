import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

const dirname = path.dirname(fileURLToPath(import.meta.url));

// Renderer config. Only consumed through electron/vite.config.ts — the app is
// not served to a plain browser, so there is no dev server or CORS proxy here.
// https://vitejs.dev/config/
export default defineConfig({
  plugins: [tailwindcss(), nodePolyfills(), react({ devTarget: 'es2020' })],
  resolve: {
    alias: {
      '@': path.resolve(dirname, './src'),
      '@plugins': path.resolve(dirname, './plugins'),
      '@libs': path.resolve(dirname, './src/libs'),
      '@nekori': path.resolve(dirname, './src/nekori'),
    },
  },
});
