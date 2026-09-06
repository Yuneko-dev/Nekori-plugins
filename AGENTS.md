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
npm run type-check:plugins     # active plugin sources + Electron declarations, excluding webviews
npm run type-check:webviews    # active plugin webviews only
npm run type-check:electron    # Electron main/preload/libs

npm run build:plugins          # direct TypeScript -> ES2020 CJS with esbuild
npm run build:assets           # copy icons/CSS and bundle webview assets
npm run build:webviews         # compatibility alias for build:assets
npm run build:prepare          # clean multisrc + generate + plugins + assets
npm run build:manifest         # bundles -> manifests and total.svg
npm run build:full             # build:prepare + manifest
npm run test:build             # validate emitted assets after a full build
npm run test:checks             # localhost site and plugin-check regressions
npm run serve:dev              # local repository for a real device
npm run check:sites            # writes broken-sites-report.json
npm run check:plugins          # hidden Electron plugin method smoke checks
```

Build and type-check are intentionally independent. Do not add `tsc` back to a
build command.

## Plugin layout

An active plugin lives at `plugins/<language>/<PluginName>/index.ts` and default
exports a class instance implementing `Plugin.PluginBase` or `Plugin.PagePlugin`.

- Disable it by renaming the folder to `broken_<PluginName>`. Never add a marker
  file such as `BROKEN`.
- Optional webview assets: `icon.<ext>` at the plugin root,
  `webview/style.css`, and `webview/index.ts` or `webview/index.js`.
- Language folder must match a lowercased key from `scripts/languages.js`.
- `icon`, `customJS`, and `customCSS` may use short filenames. A bare filename
  is normalized to `src/<plugin.id>/<filename>`; values containing `/` retain
  their legacy full path. The icon source uses the metadata basename; CSS is
  copied from `webview/style.css`; the webview entry is bundled to `customJS`.
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
`@/lib/*`. Root facades in `src/libs/*` re-export the shared implementations
from `src/lib/*` for development and plugin compatibility; Nekori provides the
real modules at runtime.

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
4. `build:assets` (also available as `build:webviews`) requires the compiled
   plugin bundles from `build:plugins`, then reads plugin metadata
   from those bundles, copies declared icons and CSS byte-for-byte, and bundles
   active webview entries to their normalized `public/static/<customJS>` paths
   as ES2020 IIFEs. Missing declared assets and destination collisions fail the
   build; CSS-relative resources are not copied automatically. Short paths use
   the plugin ID as their namespace, so migrating a published path requires a
   patch version bump.
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

There is no asset watch mode. Re-run `npm run build:assets` after editing an
icon or CSS file, and rebuild plugin bundles when metadata changes. The
`build:prepare` pipeline is used before `dev`; `build:full` adds the manifest,
and `serve:dev` prepares assets before its development manifest.

`download-plugin-icons.js` fills missing local icons while preserving existing
icons and fallback files; it does not sweep or delete unrelated static files.

## Electron playground

The project has one React UI in `src/`. `electron/vite.config.ts` points Vite at
the repository root and consumes the shared `src/lib/*` implementations through
the root aliases; there are no per-module Electron alias overrides. There is no
browser/localhost development mode.

`src/provider/plugin-registry.ts` discovers active plugins using
`import.meta.glob`; there is no registry file to edit. Keep aliases synchronized
between `vite.config.ts`, Electron Vite config, and TypeScript configs.

`src/lib/{fetch,cookie,storage,utils}.ts` are the shared renderer/Electron
implementations, while `src/libs/*` preserves the `@libs/*` facades used by
plugins. Renderer code may assume `window.electronAPI` exists.

## Verification

There is no unit test suite. For build changes run:

```bash
npm run lint
npm run type-check
npm run build:full
npm run test:build
```

Then exercise affected plugins in the Electron playground or use
`npm run serve:dev` for a final check in Nekori.

The final verification pass also runs `npm run test:checks`, which covers the
local HTTP probe and plugin validation regressions, including valid, empty, and
malformed M3U responses.

`check:sites` reads local compiled plugin metadata and performs bounded GET
probes through Electron/Chromium. Secure Cloudflare DoH and opportunistic ECH
are enabled by default when the server publishes HTTPS/SVCB records; use
`--dns-mode secure|automatic|off`, `--doh HTTPS_URL`, or `--no-ech` to change
them. `--no-ech` disables Chromium `UseDnsHttpsSvcb` HTTPS/SVCB discovery and
ECH hints, but leaves DoH enabled. A live Chromium 150 check negotiated TLS 1.3
with encrypted SNI by default and plaintext SNI with `--no-ech`. It groups
duplicate sites and reports
`accessible`, `blocked`, `http_error`, `network_error`, `timeout`, or
`invalid_url`, including input/final URL, every redirect hop, host transitions,
attempt count, and reason. It never edits plugin metadata. Blocked is exit 0
because the site is reachable but content cannot be verified; other non-healthy
statuses exit 1. Flags are `--plugin ID`, `--url URL`, `--timeout MS`,
`--attempts N`, `--concurrency N`, and `--output FILE`.

`check:plugins` runs real methods in hidden Electron windows with a fresh
isolated profile/settings store. It supports repeated `--plugin ID`,
`--query TEXT`, `--novel PATH`, `--chapter PATH`, `--config FILE`,
`--timeout MS`, `--output FILE`, `--list`, `--dns-mode secure|automatic|off`,
`--doh HTTPS_URL`, and `--no-ech`. `--method NAME` plus `--args JSON`
or `--args-file FILE` invokes one method and reports `mode: "single_method"`.
`--debug` adds verbose smoke diagnostics; `--inspect` is restricted to one
plugin/method, opens visible DevTools, pauses before the call, and keeps the
window until closed. Config is keyed by plugin ID:
`{"plugin.id":{"settings":{},"query":"...","novel":"...","chapter":"..."}}`.
Reports include redacted, bounded argument/result previews, request timing, and
sanitized stacks. Required empty or skipped methods fail the run; optional
methods may be skipped. Unattended checks do not solve CAPTCHA or interactive
challenges, and sampled method execution does not establish full Hermes/device
compatibility.

Preserve unrelated working-tree changes. In particular, do not restore or alter
the Husky files unless the user explicitly asks.
