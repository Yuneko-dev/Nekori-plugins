# Nekori plugin quick start

1. Install dependencies with Node.js 20+ and `npm install`.
2. Copy [the base template](../plugins/vietnamese/broken_Template/index.ts), or
   [the paged template](../plugins/vietnamese/broken_Template2/index.ts), into
   `plugins/<language>/<PluginName>/index.ts`. Remove the `broken_` prefix from the new folder.
3. Extend `NekoriBasePlugin` or `NekoriPagePlugin` from `@nekori/plugin` and default-export an instance.
   Use a unique id and return `ChapterContent` from `parseChapter`. The base class supplies API metadata.
4. Put the icon beside `index.ts` and optional Custom JS/CSS under `webview/`. Use short asset filenames in metadata.
5. Run `npm run dev` for Electron source development. Rebuild assets with `npm run build:assets` after webview edits.
6. Run `npm run type-check`, `npm run build:full`, `npm run test:build` and `npm run test:checks`.
   Test the release on the Nekori app; new Nekori plugins do not run on LNReader.

Read the [English reference](docs.md) or [Vietnamese reference](docs_vi.md) for
checkpoint handling, API exports, filters, storage, video and repository manifests.
