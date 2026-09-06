import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import sizeOf from 'image-size';
import { compiledPlugins, staticPath } from './plugin-build-utils.js';

async function downloadIcons() {
  const fallback = fs.readFileSync('public/static/siteNotAvailable.png');
  for (const { dir, plugin } of compiledPlugins()) {
    if (!plugin.icon) continue;
    staticPath(plugin.icon);
    const source = path.join(dir, path.posix.basename(plugin.icon));
    // Existing local icons belong to the plugin author, including custom artwork.
    if (fs.existsSync(source)) continue;
    try {
      if (!plugin.site) throw new Error('Missing site URL');
      const response = await fetch(
        `https://www.google.com/s2/favicons?domain=${encodeURIComponent(plugin.site)}&sz=96&type=png`,
        { signal: AbortSignal.timeout(15000) },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const image = Buffer.from(await response.arrayBuffer());
      const dimensions = sizeOf(image);
      if (
        image.equals(fallback) ||
        !dimensions.width ||
        !dimensions.height ||
        dimensions.width <= 16 ||
        dimensions.height <= 16
      ) {
        throw new Error(
          'No usable icon returned; supply a local icon manually',
        );
      }
      if (
        path.extname(source).toLowerCase() !== '.png' ||
        dimensions.type !== 'png'
      ) {
        throw new Error(
          'Automatic download supports PNG icons only; supply this icon manually',
        );
      }
      fs.writeFileSync(source, image, { flag: 'wx' });
      console.log(`Downloaded ${source}`);
    } catch (error) {
      console.error(`${dir}: ${error.message}`);
      process.exitCode = 1;
    }
  }
}

downloadIcons().catch(error => {
  console.error('Icon download failed:', error);
  process.exitCode = 1;
});
