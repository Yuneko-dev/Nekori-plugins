# AGENTS.md

## Context

Fork of `lnreader/lnreader-plugins` targeting **Nekori**, not vanilla LNReader.
Plugins may use Nekori-only APIs such as `@libs/cookie`, extended `@libs/aes`,
Node shims in `@libs/utils`, and `node-html-markdown`. ESLint warnings for these
imports are compatibility notes, not errors to remove.

## Commands

```bash
npm run dev                    # Electron playground
npm run lint                   # root ESLint
npm run lint:electron          # Electron ESLint

npm run type-check             # all TypeScript scopes below
npm run type-check:app         # src/ + Vite config
npm run type-check:plugins     # active plugin sources, excluding webviews
npm run type-check:webviews    # active plugin webviews only
npm run type-check:electron    # Electron main/preload/libs

npm run build:plugins          # direct TypeScript -> ES2020 CJS with esbuild
npm run build:webviews         # webview TypeScript -> ES2020 IIFE
npm run build:manifest         # bundles -> manifests and total.svg
npm run build:full             # multisrc + plugins + webviews + manifest
npm run serve:dev              # local repository for a real device
npm run check:sites            # writes broken-sites-report.json
```

Build and type-check are intentionally independent. Do not add `tsc` back to a
build command.

## Plugin layout

An active plugin lives at `plugins/<language>/<PluginName>/index.ts` and default
exports a class instance implementing `Plugin.PluginBase` or `Plugin.PagePlugin`.

- Disable it by renaming the folder to `broken_<PluginName>`. Never add a marker
  file such as `BROKEN`.
- Optional webview entry: `plugins/<language>/<PluginName>/webview/index.ts`.
- Language folder must match a lowercased key from `scripts/languages.js`.
- `icon`, `customJS`, and `customCSS` are relative to `public/static/`.
- `id` must be unique and a valid filename.
- `version` is semver and must increase or `--only-new` publishing skips it.
- Generated multisrc folders are disposable. Edit their generator, not output.
  Prefix a multisrc folder with `broken_` to skip generation.

The authoritative plugin contract is `src/types/plugin.ts`. Older API docs may
still mention `url` or `parseNovelAndChapters`; current entities use `path` and
current methods are `popularNovels`, `parseNovel`, `parseChapter`,
`searchNovels`, plus optional `parsePage` / `resolveUrl`.

## Runtime boundary

Plugins run in Nekori's Hermes runtime. Plugin source imports `@libs/*`, never
`@/lib/*`. Root shims in `src/libs/*` re-export browser implementations from
`src/lib/*` for development; Nekori provides the real modules at runtime.

Allowed package imports are defined in `eslint.config.js`. Keep all other
package imports external in plugin bundles. Do not bundle host-provided modules.
Plugin and webview output targets ES2020.

Adding an `@libs` export requires:

1. Implement it in `src/lib/`.
2. Re-export it from `src/libs/`.
3. Update the ESLint allowlist.
4. Confirm Nekori provides the same runtime API.

## Build pipeline

1. `clean:multisrc` removes generated `Name[multisrc]` folders.
2. `build:multisrc` regenerates active multisrc plugins.
3. `build:plugins` sends active `index.ts` entries directly to esbuild, bundles
   relative imports, externalizes packages, minifies once, and writes
   `.js/plugins/<language>/<name>.js` as ES2020 CJS.
4. `build:webviews` reads plugin metadata from those bundles and writes active
   webviews to their declared `public/static/<customJS>` paths as ES2020 IIFEs.
5. `build:manifest` evaluates static plugin metadata through the recursive proxy
   `require`, then emits `.dist/plugins.json`, `.dist/plugins.min.json`, and
   `total.svg`.

The metadata evaluators intentionally initialize and return `exports.default`:

```js
const exports = (module.exports = {});
// compiled plugin code
return exports.default;
```

Keep this behavior aligned with the app. The esbuild footer copies the default
export after esbuild assigns `module.exports`.

Metadata field initializers must be plain values. Calls into real `@libs` APIs
during construction receive the proxy, not a runtime value.

Publishing creates orphan `plugins/v<package version>` branches and copies
`.js/plugins` to `.js/src/plugins` for legacy repository paths. Never put
type-checking in the publish build path; CI checks TypeScript separately.

## Electron playground

The project has one React UI in `src/`. `electron/vite.config.ts` points Vite at
the repository root and overrides selected `@libs` aliases with IPC-backed
Electron implementations. There is no browser/localhost development mode.

`src/provider/plugin-registry.ts` discovers active plugins using
`import.meta.glob`; there is no registry file to edit. Keep aliases synchronized
between `vite.config.ts`, Electron Vite config, and TypeScript configs.

`src/lib/{fetch,cookie,storage,utils}.ts` remain the type-level source even when
Electron overrides them at runtime. Renderer code may assume
`window.electronAPI` exists.

## Verification

There is no unit test suite. For build changes run:

```bash
npm run lint
npm run type-check
npm run build:full
```

Then exercise affected plugins in the Electron playground or use
`npm run serve:dev` for a final check in Nekori.

Preserve unrelated working-tree changes. In particular, do not restore or alter
the Husky files unless the user explicitly asks.
