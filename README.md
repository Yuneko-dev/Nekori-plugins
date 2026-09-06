# Nekori Plugins

This is a fork of the original repository, containing only my custom plugins and hotfixes.

> [!WARNING]
> I highly recommend using this plugin collection with my modified version of Nekori. Most of the plugins here are not compatible with the original LNReader or other apps that support JS plugins (such as Tsundoku, IReader, Kototoro, etc.), as these plugins rely heavily on modern JavaScript libraries.

> [!WARNING]
> Plugins are built for ES2020 and Nekori on React Native 0.86+. They are not compatible with older LNReader releases, including LNReader-eXtended v2.0.3.


<p>
<img alt="Total number of available plugins" src="https://raw.githubusercontent.com/Yuneko-dev/Nekori-plugins/plugins/v3.0.0/total.svg">
<img alt="Open plugin requests" src="https://img.shields.io/github/issues/Yuneko-dev/Nekori-plugins/Plugin%20Request?color=success&label=plugin%20requests">
<img alt="Open bug reports" src="https://img.shields.io/github/issues/Yuneko-dev/Nekori-plugins/Bug?color=red&label=bugs">
</p>

### Install URL
```sh
https://raw.githubusercontent.com/Yuneko-dev/Nekori-plugins/plugins/v3.0.0/.dist/plugins.min.json
```

### Additional APIs

Plugins in this repository make use of new API functions that are not available in the original LNReader. Below is a (potentially incomplete) list:

- `node-html-markdown`
- `@libs/aes`: added `ctr`, `ecb`, `cbc`, `cfb`, `gcmsiv`, `aeskw`, `aeskwp`, `cmac` and `aessiv`
- `@libs/utils`: added `utf8ToBytes`, `bytesToUtf8`, `getUserAgent`, `Buffer`, `NodeCrypto` (Used similarly to `import NodeCrypto from "node:crypto"`), `encodeHtmlEntities` and `decodeHtmlEntities`
- `@libs/cookie`
- `@libs/pluginMetadata`

### Development

**Prerequisites:** Node.js >= 20

```bash
npm install
npm run dev
```

Build and type-check are independent. The normal preparation pipeline is:

```bash
npm run build:prepare          # multisrc, plugin bundles, and plugin assets
npm run build:full             # prepare plus manifest
npm run build:assets           # copy/bundle plugin-local assets
npm run build:webviews         # compatibility alias for build:assets
npm run type-check             # check app, plugins, webviews, and Electron
npm run type-check:plugins     # plugin sources + Electron declarations
npm run type-check:webviews    # plugin webviews only
```

The playground uses one implementation of fetch, cookie, storage, and utils in
`src/lib/`; `src/libs/` keeps the `@libs/*` compatibility facades used by
plugins. Nekori supplies these modules separately on the device.

Plugin assets are kept with their plugin. Put the icon at the plugin root using
the basename from `metadata.icon`, put CSS in `webview/style.css`, and put the
webview entry in `webview/index.ts` or `webview/index.js`. `build:assets` copies
icons and CSS byte-for-byte and bundles the webview entry to the declared
`customJS` path. The metadata paths remain relative to `public/static/`, so
published short paths use `public/static/src/<plugin.id>/`; values containing
`/` keep their legacy full path. There is no asset watch mode; rebuild after
asset edits, and rebuild plugin bundles if metadata changes. Missing declared
local assets fail the build. CSS dependencies are not copied automatically.
`build:assets` reads compiled plugin metadata and must follow `build:plugins`;
`build:prepare` performs both steps in order.

After a full build, `npm run test:build` checks the emitted plugin assets.
`npm run test:checks` runs the localhost site-probe regressions and the real
plugin-check validation cases, including valid, empty, and malformed M3U
responses.

### Automated plugin checks

`npm run check:sites` probes each unique `plugin.site` from local compiled
metadata with bounded GET requests and writes `broken-sites-report.json`.
Checks use the Electron/Chromium request path with secure Cloudflare DoH and
opportunistic ECH enabled by default when the server publishes the required
HTTPS/SVCB records. Use `--dns-mode secure|automatic|off`, `--doh HTTPS_URL`,
or `--no-ech` to tune network behavior. `--no-ech` disables Chromium's
`UseDnsHttpsSvcb` HTTPS/SVCB discovery and its ECH hints; it does not disable
DoH itself. A live Chromium 150 check negotiated TLS 1.3 with encrypted SNI
by default and plaintext SNI with `--no-ech`, alongside
`--plugin ID`, `--url URL`, `--timeout MS`, `--attempts N`, `--concurrency N`,
and `--output FILE`. Reports retain the input URL, final URL, every redirect
hop, and host transitions; checks report the endpoint reached and never edit
plugin site metadata. Site statuses are `accessible`, `blocked`, `http_error`,
`network_error`, `timeout`, and `invalid_url`. A blocked site exits 0 because it
responded but content access could not be verified; other non-healthy statuses
exit 1.

`npm run check:plugins` runs real plugin methods in hidden Electron windows,
using a fresh profile per run and separate settings namespaces per plugin.
Plugins in one run share the temporary cookie session and the same Chromium
DNS/ECH options (`--dns-mode secure|automatic|off`, `--doh HTTPS_URL`, and
`--no-ech`). It accepts repeated `--plugin ID`, `--query TEXT`, `--novel
PATH`, `--chapter PATH`, `--config FILE`, `--timeout MS`, `--output FILE`, and
`--list`. For a reproducible single call, select one plugin and use
`--method NAME` with `--args JSON` or `--args-file FILE`; the report uses
`mode: "single_method"` and includes bounded, redacted argument/result
previews, request timing, and a sanitized stack. `--debug` enables verbose
diagnostics for the smoke run. `--inspect` is available only with one plugin
and method: it opens visible DevTools, pauses before invocation, and keeps the
window until it is closed.

For Windows, an args file avoids shell quoting issues:

```json
["/novel/example"]
```

```powershell
npm run check:plugins -- --plugin example --method parseNovel --args-file .\args.json --inspect
```

JSON config is keyed by plugin ID:
`{"plugin.id":{"settings":{},"query":"...","novel":"...","chapter":"..."}}`.
Checks sample methods and validate returned entities; they do not prove full
Hermes/device compatibility or complete catalog correctness. Required empty or
skipped methods fail; optional methods may be skipped. CAPTCHA and interactive
challenges are not solved in unattended runs. A fully passed run exits 0; any
failed, empty, blocked, timeout, network, or required-skipped result exits 1.

Plugins are tested in the Electron playground only — the browser/localhost mode
has been removed. Plugin requests need to bypass CORS, keep persistent cookies
and solve Cloudflare in a real WebView, none of which a plain browser can do.

For a final check on the real app, `npm run serve:dev` serves the built manifest
over your LAN (see `.env.template`), then add
`http://<your-lan-ip>:3000/.dist/plugins.min.json` under **Settings →
Repositories** in LNReader.

### Documentation

- **[Plugin Development](./docs/docs.md)** — API reference (English)
- **[Tài liệu phát triển plugin](./docs/docs_vi.md)** — API reference (Tiếng Việt)
- **[Komga Plugin](./docs/komga-plugin.md)** — self-hosted server integration

> [!NOTE]
> `docs/docs.md` and `docs/docs_vi.md` were generated by AI from the repository
> source.

---

<details>

<summary><b>Original Readme & Disclaimer</b></summary>

# LNReader Plugins

<p>
<img alt="Total number of available plugins" src="https://raw.githubusercontent.com/LNReader/lnreader-plugins/plugins/v3.0.0/total.svg">
<img alt="Open plugin requests" src="https://img.shields.io/github/issues/lnreader/lnreader-plugins/Plugin%20Request?color=success&label=plugin%20requests">
<img alt="Open bug reports" src="https://img.shields.io/github/issues/lnreader/lnreader-plugins/Bug?color=red&label=bugs">
</p>

Community-driven plugin repository for [LNReader](https://github.com/LNReader/lnreader). This repository hosts plugins and manages related issues and requests.

## Quick Start

**Prerequisites:** Node.js >= 20 

```bash
npm install
npm run dev:start
```

## Documentation

- **[Quick Start Guide](./docs/quickstart.md)** - Create your first plugin
- **[Plugin Development](./docs/docs.md)** - Complete API reference
- **[Testing Guide](./docs/website-tutorial.md)** - Test plugins using the web interface
- **[Komga Plugin](./docs/komga-plugin.md)** - Self-hosted server integration

## Testing Methods

### Web Interface

```bash
npm run dev:start
```

Open [localhost:3000](http://localhost:3000) to test plugins interactively. See the [testing guide](./docs/website-tutorial.md) for details.

### Mobile App

**From GitHub (Automated):**

Push your changes to the `master` branch. The [GitHub Action](./.github/workflows/publish-plugins.yml) automatically builds and publishes plugins to the `plugins` branch.

Add your repository URL to the app:

```
https://raw.githubusercontent.com/<username>/<repo>/plugins/<tag>/.dist/plugins.min.json
```

**From Localhost:**

```bash
npm run serve:dev
```

Add `http://10.0.2.2/.dist/plugins.min.json` (Android emulator) to the app. Requires `.env` configuration (see `.env.template`).

## Disclaimer

The developers are not affiliated with any content providers. If you are a non-aggregator website owner, you may request plugin removal via [Discord](https://discord.gg/QdcWN4MD63) or by [creating an issue](https://github.com/LNReader/lnreader-plugins/issues/new). Removed sites are added to the [blacklist](BLACKLIST.json).

</details>
