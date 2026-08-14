# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Context

Fork of `lnreader/lnreader-plugins` (remote `upstream`), targeting **LNReader-eXtended**, not vanilla LNReader. Plugins here use APIs the original app lacks (`@libs/cookie`, extended `@libs/aes` ciphers, `@libs/utils` Node shims, `node-html-markdown`). ESLint warns when those are imported — the warning is a compatibility note, not an error to "fix".

## Commands

```bash
npm run dev              # Electron playground (main dev loop) — delegates to electron/
                         # one-time setup: npm install --prefix electron

npm run lint             # eslint (lint:fix to autofix)
npm run type-check       # tsc --noEmit
npm run format           # prettier write (format:check to verify)

npm run build:full       # clean:multisrc → build:multisrc → compile → webviews → manifest
npm run build:compile    # tsc (tsconfig.production.json) → .tsc-out, then esbuild → .js/plugins
npm run build:webviews   # bundle plugins/*/*/webview/index.ts → public/static/<customJS>
npm run build:manifest   # .js/plugins → .dist/plugins.json + plugins.min.json + total.svg
npm run serve:dev        # local build + static serve for testing against a real device (needs .env)
npm run check:sites      # ping every plugin site, writes broken-sites-report.json
```

There is no test suite. Verification = `lint` + `type-check` + exercising the plugin in the dev site.

## Plugin anatomy

One plugin = one folder: `plugins/<language>/<PluginName>/index.ts`, default-exporting a **class instance** implementing `Plugin.PluginBase` (or `Plugin.PagePlugin` when the source paginates chapter lists).

- Language folder must match a key in `scripts/languages.js` (lowercased on disk).
- Optional `webview/index.ts` in the same folder — bundled to `public/static/<plugin.customJS>` by `build-webviews.js`, and only if the plugin declares `customJS`.
- `icon` / `customJS` / `customCSS` are paths **relative to `public/static/`**, e.g. `src/vi/moetruyen/icon.png`. Icons are 96x96.
- An empty file named `BROKEN` in the plugin folder excludes it everywhere: dev registry, esbuild entry points, webview build, manifest.
- `id` must be unique across all plugins and a valid filename — the manifest build throws on duplicates.
- `version` is semver; the publish pipeline's `--only-new` mode skips plugins whose version didn't increase, so **bump the version or the change won't ship**.

`docs/docs.md` documents an older API surface (`url`, `parseNovelAndChapters`). The authoritative contract is `src/types/plugin.ts`: entities carry `path` (not `url`), and the methods are `popularNovels`, `parseNovel`, `parseChapter`, `searchNovels`, plus optional `parsePage` / `resolveUrl`.

## The `@libs/*` boundary

Plugins run inside the mobile app's Hermes runtime, where `@libs/*` is provided by the host. In this repo `src/libs/*` are thin re-export shims over real web implementations in `src/lib/*` (`fetch`, `storage`, `webview`, `aes`, `html-entities`, …) so the dev site can execute plugin code in a browser. `src/lib/reader-mock.ts` emulates the in-app reader for chapter preview.

Consequences:
- Plugin code imports `@libs/…`, never `@/lib/…` (ESLint blocks the latter).
- ESLint restricts plugin imports to an allowlist: `@libs/*`, `@/types/plugin`, `cheerio`, `htmlparser2`, `dayjs`, `urlencode`, `node-html-markdown`. Anything else is an error.
- Plugin sources are linted with Hermes/RN globals at `ecmaVersion: 5`, and compiled to ES5 CJS. Browser-only APIs will lint clean in the web app but break on device.
- Adding a new `@libs` export means: implement in `src/lib/`, re-export from `src/libs/`, allowlist it in `eslint.config.js`, and confirm LNReader-eXtended actually provides it.

## Build pipeline

1. `plugins/multisrc/<name>/generator.js` exports `generateAll()` → writes generated `plugins/<lang>/<Name>[<multisrc>]/index.ts`. Generated folders are disposable — edit the template/generator, never the output. `clean:multisrc` removes them; a `.broken` suffix on the multisrc dir skips it.
2. `tsc --project tsconfig.production.json` transpiles `plugins/**` to `.tsc-out/` with `noCheck`/`noResolve` (type errors do **not** block a build — that's what `type-check` is for).
3. `scripts/build-plugins.js` esbuilds each `.tsc-out/<lang>/<name>/index.js` to `.js/plugins/<lang>/<name>.js`, CJS/ES5, marking every non-relative import external so `@libs/*` resolves against the host app at runtime.
4. `scripts/build-plugin-manifest.js` `Function()`-evaluates each bundle with a recursive-proxy `require` to read the plugin's static metadata, then emits `.dist/plugins.json`, `.dist/plugins.min.json`, and `total.svg`. Metadata read this way must be plain field initializers — anything that touches a real `@libs` API at construction time meets the proxy, not a value.
5. `scripts/publish-plugins.sh` builds on an orphan `plugins/v<package.json version>` branch and force-pushes it. `.js/plugins` is copied to `.js/src/plugins` for backward compatibility with older app versions. The `publish-plugins.yml` workflow runs this on pushes to `master` touching `plugins/**` or `public/**`.

## Fork delta vs `upstream/master`

What this fork changed, so upstream docs/answers can be trusted or discarded on sight. Regenerate with `git diff upstream/master master`.

**Plugin layout — the biggest structural break.** Upstream: one flat file `plugins/<lang>/<Name>.ts`, disabled via a `.broken.ts` filename suffix. Here: a folder `plugins/<lang>/<Name>/index.ts`, disabled via an empty `BROKEN` file in the folder, with an optional sibling `webview/index.ts`. Registry glob, manifest scan, esbuild entry points and the webview builder all follow the folder form. Upstream code snippets that assume flat files are wrong here.

**Build pipeline.** Upstream ran `tsc` straight to `.js/plugins`. Here `build:compile` is `tsc → .tsc-out` followed by `scripts/build-plugins.js` (esbuild, bundles relative imports, externalizes everything else). Added: `scripts/build-webviews.js`, `scripts/clean-multisrc.js` (replaces upstream's `find` / PowerShell one-liner pair — `clean:multisrc:windows` is gone), `tsconfig.webview.json`, an `npm run type-check` script, and prettier coverage widened to `tsx`/`css`. `tsconfig.production.json` switched from a long exclude list to `include: ./plugins/**/*`. Removed: `check:plugin` / `scripts/live-check-plugin.js` / `plugin-live-check.yml`, `.github/scripts/add-multisrc-source.cjs`.

**Plugin API additions** (`src/types/plugin.ts`) — all eXtended-only:
- `pluginSettings`: user-configurable settings with `Text` / `Switch` / `Select` / `CheckboxGroup` types, read back through `@libs/storage`.
- `contentWarning` / `contentType` from `@libs/pluginMetadata`, surfaced in the dev UI by `src/lib/plugin-metadata.ts`.
- `PluginBase` / `PagePlugin` refactored onto a shared `PluginCommon`; `PluginBase` now carries `parsePage?: never`, so a plugin declaring `parsePage` must be typed as `PagePlugin`.
- `ImageRequestInit` gained an index signature (arbitrary init fields pass through).

**`@libs` surface** — the source of truth for what breaks on vanilla LNReader:
- `@libs/aes`: upstream exported `gcm` only; now `ctr, ecb, cbc, cfb, gcm, gcmsiv, aeskw, aeskwp, cmac, aessiv`.
- `@libs/utils`: added `utf8ToBytes`, `bytesToUtf8`, `Buffer`, `NodeCrypto`, `getUserAgent`, `encodeHtmlEntities`, `decodeHtmlEntities`.
- `@libs/cookie` (new) and `@libs/webview` (new, Cloudflare interstitial/turnstile solvers) — both are no-op stubs in `src/lib/` for the web harness; real behavior only exists in the app or the Electron playground.
- `@libs/fetch`: `fetchFile` removed.
- `storage` / `fetchProto` generics were loosened back to `any`.
- `defaultCover` repoints at `Yuneko-dev/lnreader-plugins`.

**ESLint.** Upstream only blocked `@/lib/fetch*`. Here plugin files get a deny-all import rule with an explicit allowlist, plus `no-restricted-syntax` warnings that fire on the eXtended-only AES ciphers, the new `@libs/utils` exports, and any `@libs/cookie` import — these warnings are informational (they ask for a README compatibility note), not defects. Ignores added for `.tsc-out`, `public/static`, `electron`.

**`electron/`** (new sub-project, own `package.json`, excluded from root tsconfig/eslint). A Chromium playground for running plugins closer to the real app: main-process IPC handlers for fetch, cookies, storage, settings and Cloudflare, plus an `lnproxy` protocol. Paired with `src/lib/reader-mock.ts` (injects mock `ReactNativeWebView` / reader JS context) and `src/lib/core-player.js` + `core-player.css` (video/HLS player used by the streaming plugins). Run it from `electron/` with its own `npm run dev`.

**Manifest & publish.** `build-plugin-manifest.js` now validates `id` with `valid-filename`, passes `contentWarning`/`contentType` through, serves `@libs/pluginMetadata` as real enums to the sandbox `require` (everything else still gets the proxy), picks `.js/plugins` vs legacy `.js/src/plugins` based on `USER_CONTENT_BASE`, and detects broken plugins by scanning for `BROKEN` files. `publish-plugins.sh` calls `build:compile` + `build:webviews` instead of raw `tsc`.

**Content.** Upstream's plugin catalogue is largely deleted; what remains is the fork's own Vietnamese/multi/streaming set (see README). README rewritten, `docs/docs_vi.md` added.

## Dev UI — Electron only

Vite + React 18 + Tailwind v4 + Radix (shadcn-style `src/components/ui`). `src/provider/plugin-registry.ts` picks up plugins via `import.meta.glob` of `/plugins/*/*/index.ts`, filtering out `BROKEN` dirs — no registration step. Aliases `@` → `src`, `@libs` → `src/libs`, `@plugins` → `plugins` are defined in both `vite.config.ts` and the tsconfigs — keep them in sync.

**There is no separate Electron UI.** `electron/vite.config.ts` sets `root: <repo root>` and merges the root `vite.config.ts`, so Electron renders the same `src/` React app — it only prepends higher-priority aliases pointing `@libs/{fetch,cookie,storage,utils}` (and the matching `src/lib/*` paths) at `electron/lib/*`, which are IPC-backed. Editing `src/` edits the Electron app.

Running the UI in a plain browser was removed: there is no `vite dev` server, no `:3000`, no CORS proxy. Electron is the only host, because plugin fetches need to bypass CORS, keep persistent cookies, and solve Cloudflare in a real WebView. Consequences worth remembering:
- `src/lib/{fetch,cookie,storage,utils}.ts` are still the type-level source for `@libs/*` (the aliases are Vite-only; `tsc` resolves to `src/lib`), so they cannot be deleted even though Electron overrides them at runtime.
- Renderer code may assume `window.electronAPI` exists — no browser-fallback branch.
- `npm run serve:dev` is unrelated to the UI: it statically serves `.dist/plugins.min.json` so the real mobile app can install plugins from your machine (configured via `.env` / `USER_CONTENT_BASE`).
