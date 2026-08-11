# LNReader Plugins

This is a fork of the original repository, containing only my custom plugins and hotfixes.

> [!WARNING]  
> I highly recommend using this plugin collection with my modified version of LNReader-eXtended. Most of the plugins here are not compatible with the original LNReader or other apps that support JS plugins (such as Tsundoku, IReader, Kototoro, etc.), as these plugins rely heavily on modern JavaScript libraries.

<p>
<img alt="Total number of available plugins" src="https://raw.githubusercontent.com/Yuneko-dev/lnreader-plugins/plugins/v3.0.0/total.svg">
<img alt="Open plugin requests" src="https://img.shields.io/github/issues/Yuneko-dev/lnreader-plugins/Plugin%20Request?color=success&label=plugin%20requests">
<img alt="Open bug reports" src="https://img.shields.io/github/issues/Yuneko-dev/lnreader-plugins/Bug?color=red&label=bugs">
</p>

### Included sources:

<details>
<summary><b>📖 Novel (19 sources)</b></summary>

- [Akaytruyen](https://akaytruyen.com)
- [DocTruyenLN](https://quykiep.com)
- [Hako Novel](https://ln.hako.vn)[^1]
- [JukaNovel](https://sangtacviet.online)[^1]
- [LNKuro](https://lnkuro.top)[^1]
- [Luvevaland](https://luvevaland.co)
- [MeTruyenCV](https://metruyencv.com)[^1]
- [Mọt Truyện](https://mottruyen.com.vn)[^1]
- [Newtoki](https://sbxh1.com)[^1]
- [NocSyosetu](https://noc.syosetu.com)[^1]
- [PixivNovel](https://pixiv.net)[^1]
- [Sáng Tác Việt](https://sangtacviet.app/)[^1]
- [tieuthuyetmang](https://tieuthuyetmang.com)
- [TomatoMTL](https://tomatomtl.com)[^1]
- [truyenfull](https://truyenfull.vision)
- [TruyenCV](https://truyencv.io)
- [Valvrareteam](https://valvrareteam.net)[^1]
- ~~[WanwanSekai](https://wanwansekai.com)~~
- [ZumiNovel](https://zuminovel.com)[^1]
</details>

<details>
<summary><b>🎬 Streaming (10 sources)</b></summary>

- [AnimeVietsub](https://animevietsub.bz)[^1]
- [AnimeVsub](https://animevsub.app)[^1]
- ~~[AnimeHay](https://animehay.fm)[^1][^2]~~
- [HentaiZ](https://hentaiz.hot)[^1]
- [KKPhim](https://kkphim.com)[^1]
- [Motchill](https://envasion.net)[^1]
- [NguonC](https://phim.nguonc.com)[^1]
- [OPhim](https://ophim17.cc)[^1]
- [PhimFun](https://phimfun.net)[^1]
- [Yêu Anime](https://yeuanime.org)[^1]
</details>

<details>
<summary><b>📰 News (1 source)</b></summary>

- [BaoMoi](https://baomoi.com)
</details>

[^1]: This plugin is incompatible with the original LNReader as it utilizes new APIs introduced in [LNReader-Extended](https://github.com/Yuneko-dev/lnreader-extended)
[^2]: This plugin has been discontinued and removed due to the poor quality of the website.

### Install URL
```sh
https://raw.githubusercontent.com/Yuneko-dev/lnreader-plugins/plugins/v3.0.0/.dist/plugins.min.json
```

### Additional APIs

Plugins in this repository make use of new API functions that are not available in the original LNReader. Below is a (potentially incomplete) list:

- `node-html-markdown`
- `@libs/aes`: added `ctr`, `ecb`, `cbc`, `cfb`, `gcmsiv`, `aeskw`, `aeskwp`, `cmac` and `aessiv`
- `@libs/utils`: added `utf8ToBytes`, `bytesToUtf8`, `getUserAgent`, `Buffer`, `NodeCrypto` (Used similarly to `import NodeCrypto from "node:crypto"`), `encodeHtmlEntities` and `decodeHtmlEntities`
- `@libs/fetch`: removed `fetchFile`
- `@libs/cookie`
- `@libs/pluginMetadata`

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
