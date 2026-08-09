import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';
import {
  decodeHtmlEntities,
  encodeHtmlEntities,
  NodeCrypto,
} from '@libs/utils';
import { Buffer } from '@libs/utils';
import { storage } from '@libs/storage';
import { ctr } from '@libs/aes';
import { ContentType, ContentWarning } from '@libs/pluginMetadata';

import filters from './filters';

const SITE = 'https://hentaiz.bike';
const STORAGE_URL = 'https://storage.haiten.org';
const MIMIX_API = 'https://x.mimix.cc/watch/';
const EMBED_ORIGIN = 'https://x.haiten.org';

// SvelteKit "remote function" endpoint hash. It changes on every site
// deployment, so it is resolved at runtime and cached in `storage`.
const REMOTE_HASH_KEY = 'htz_remote_hash';
const REMOTE_HASH_TTL = 6 * 60 * 60 * 1000; // 6h

function hexToBytes(hex: string): Uint8Array {
  return Buffer.from(hex, 'hex');
}

type VideoData = {
  id: string;
  segDomain: string;
  masterUrl: string;
  m3u8Master: string;
  m3u8Playlists: string[];
  variantFolders: string[];
};

/**
 * Fetch + decrypt the mimix payload (AES-256-CTR, key = sha256(videoId)).
 * The response body is `<iv-hex>:<ciphertext-hex>`.
 */
async function decryptVideoData(videoId: string): Promise<VideoData | null> {
  try {
    const res = await fetchApi(MIMIX_API + videoId, {
      headers: { Referer: EMBED_ORIGIN + '/' },
    });
    if (!res.ok) {
      console.error('[HTZ] mimix fetch failed:', res.status);
      return null;
    }
    const text = (await res.text()).trim();
    const colonIdx = text.indexOf(':');
    if (colonIdx < 0) {
      console.error('[HTZ] invalid mimix response format');
      return null;
    }

    const iv = hexToBytes(text.substring(0, colonIdx));
    const ct = hexToBytes(text.substring(colonIdx + 1));
    const key = NodeCrypto.createHash('sha256').update(videoId).digest();

    const cipher = ctr(key, iv);
    const jsonStr = new TextDecoder().decode(cipher.decrypt(ct));
    const data = JSON.parse(jsonStr);

    const m3u8 = data.defaultM3u8;
    if (!m3u8?.master || !m3u8?.playlists?.length) {
      console.error('[HTZ] no m3u8 data in decrypted response');
      return null;
    }

    const segDomain: string =
      data.segmentDomains?.length > 0
        ? data.segmentDomains[0]
        : data.domain || '';
    const id: string = data.id || videoId;

    const variantFolders: string[] = [];
    for (const line of m3u8.master.split('\n')) {
      const trimmed = line.trim();
      if (
        trimmed &&
        !trimmed.startsWith('#') &&
        trimmed.includes('playlist.m3u8')
      ) {
        variantFolders.push(trimmed.replace('/playlist.m3u8', ''));
      }
    }

    return {
      id,
      segDomain,
      masterUrl: `${segDomain}/${id}/master.m3u8`,
      m3u8Master: m3u8.master,
      m3u8Playlists: m3u8.playlists,
      variantFolders,
    };
  } catch (e) {
    console.error('[HTZ] decryptVideoData error:', e);
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function decodeSvelteData(data: any[]): any {
  const cache = new Map();
  function resolve(idx: number): any {
    if (cache.has(idx)) return cache.get(idx);
    const val = data[idx];
    if (val === null || val === undefined) {
      cache.set(idx, val);
      return val;
    }
    if (
      typeof val === 'string' ||
      typeof val === 'number' ||
      typeof val === 'boolean'
    ) {
      cache.set(idx, val);
      return val;
    }
    if (Array.isArray(val)) {
      if (val.length === 2 && val[0] === 'Date') {
        const d = val[1];
        cache.set(idx, d);
        return d;
      }
      const arr: any[] = [];
      cache.set(idx, arr);
      for (const i of val) {
        arr.push(resolve(i));
      }
      return arr;
    }
    const obj: Record<string, any> = {};
    cache.set(idx, obj);
    // `Object.keys` (ES5) instead of `Object.entries` (ES2017): the project
    // compiles against an ES2016 lib.
    for (const key of Object.keys(val)) {
      obj[key] = resolve(val[key] as number);
    }
    return obj;
  }
  return resolve(0);
}

async function fetchSvelteData(url: string): Promise<any> {
  const res = await fetchApi(url);
  if (!res.ok) return null;
  const json = await res.json();
  const pageNode = json?.nodes?.[2];
  if (!pageNode || pageNode.type === 'error' || !pageNode.data) return null;
  return decodeSvelteData(pageNode.data);
}

/** Collapse `.` / `..` segments in an absolute path. */
function normalizePath(path: string): string {
  const out: string[] = [];
  for (const part of path.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return '/' + out.join('/');
}

/**
 * Resolve the current SvelteKit remote-function hash.
 *
 * The site exposes `/_app/remote/<hash>/<fnName>`. The hash is embedded in one
 * of the immutable JS chunks reachable from the page's leaf node chunk, so we
 * walk: page HTML -> node_ids -> app entry -> nodes/<id>.js -> its imports.
 *
 * @param forceRefresh skip (and overwrite) the cached value. Used when the
 *   site redeploys mid-TTL and the cached hash starts returning 404.
 */
async function resolveRemoteHash(
  slug: string,
  forceRefresh = false,
): Promise<string | null> {
  if (!forceRefresh) {
    const cached = storage.get(REMOTE_HASH_KEY);
    if (cached) return cached as string;
  }

  const getText = async (url: string) => {
    const r = await fetchApi(url);
    return r.ok ? await r.text() : '';
  };

  try {
    const html = await getText(`${SITE}/watch/${slug}`);
    if (!html) return null;

    // Fast path: hash occasionally appears inline.
    const inline = html.match(/_app\/remote\/([a-z0-9]{5,12})\//i);
    if (inline) {
      storage.set(REMOTE_HASH_KEY, inline[1], REMOTE_HASH_TTL);
      return inline[1];
    }

    const idsMatch = html.match(/node_ids:\s*\[([^\]]*)\]/);
    const appMatch = html.match(
      /\/_app\/immutable\/entry\/app\.[^"'\s\\]+\.js/,
    );
    if (!idsMatch || !appMatch) return null;

    const nodeIds = idsMatch[1]
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    const leafId = nodeIds[nodeIds.length - 1];

    const appJs = await getText(SITE + appMatch[0]);
    const nodeFile = appJs.match(
      new RegExp(`nodes/${leafId}\\.[A-Za-z0-9_-]+\\.js`),
    );
    if (!nodeFile) return null;

    // BFS over the leaf chunk's relative imports, bounded to keep it cheap.
    const seen = new Set<string>();
    const queue: string[] = ['/_app/immutable/' + nodeFile[0]];
    let budget = 40;

    while (queue.length > 0 && budget-- > 0) {
      const path = queue.shift() as string;
      if (seen.has(path)) continue;
      seen.add(path);

      const code = await getText(SITE + path);
      if (!code) continue;

      const hit = code.match(/([a-z0-9]{5,12})\/getEpisodeEmbedUrl/i);
      if (hit) {
        storage.set(REMOTE_HASH_KEY, hit[1], REMOTE_HASH_TTL);
        return hit[1];
      }

      const dir = path.substring(0, path.lastIndexOf('/'));
      const importRe = /["'](\.{1,2}\/[A-Za-z0-9_\-./]+\.js)["']/g;
      let m: RegExpExecArray | null;
      while ((m = importRe.exec(code)) !== null) {
        queue.push(normalizePath(dir + '/' + m[1]));
      }
    }
  } catch (e) {
    console.error('[HTZ] resolveRemoteHash error:', e);
  }
  return null;
}

/**
 * Call a SvelteKit remote query. Arguments are devalue-encoded and base64'd
 * into the `payload` search param; the response is devalue-encoded too.
 *
 * Returns the HTTP status alongside the data so the caller can tell a stale
 * hash (404) apart from a genuine empty result.
 */
async function callRemote(
  hash: string,
  fnName: string,
  args: Record<string, unknown>,
  slug: string,
): Promise<{ status: number; data: any }> {
  const keys = Object.keys(args);
  // devalue layout: [ {<key>: <idx>, ...}, ...values ] with index 0 = root map
  const encoded: any[] = [['__skrao', 1]];
  const rootMap: Record<string, number> = {};
  let next = 2;
  for (const k of keys) rootMap[k] = next++;
  encoded.push(rootMap);
  for (const k of keys) encoded.push(args[k]);

  const payload = Buffer.from(JSON.stringify(encoded)).toString('base64');
  const url = `${SITE}/_app/remote/${hash}/${fnName}?payload=${encodeURIComponent(payload)}`;

  const res = await fetchApi(url, {
    headers: {
      'Referer': `${SITE}/watch/${slug}`,
      'x-sveltekit-pathname': `/watch/${slug}`,
      'x-sveltekit-search': '',
    },
  });
  if (!res.ok) {
    console.error(`[HTZ] remote ${fnName} failed:`, res.status);
    return { status: res.status, data: null };
  }

  try {
    const body = await res.json();
    if (body?.type !== 'result' || !body.data) {
      return { status: res.status, data: null };
    }

    const root = decodeSvelteData(JSON.parse(body.data));
    // Remote results are wrapped: { _: <actual>, q: <refresh map> }
    const data =
      root && typeof root === 'object' && '_' in root ? root._ : root;
    return { status: res.status, data };
  } catch (e) {
    console.error(`[HTZ] remote ${fnName} decode error:`, e);
    return { status: res.status, data: null };
  }
}

/**
 * Call a remote function, transparently recovering from a stale cached hash.
 *
 * The hash rotates whenever the site redeploys, which can happen at any point
 * inside the cache TTL. When that happens the endpoint 404s, so we evict the
 * cached value, re-resolve from the live page and replay the call once.
 */
async function callRemoteWithRetry(
  fnName: string,
  args: Record<string, unknown>,
  slug: string,
): Promise<any> {
  const hash = await resolveRemoteHash(slug);
  if (!hash) {
    console.error('[HTZ] could not resolve remote hash');
    return null;
  }

  const first = await callRemote(hash, fnName, args, slug);
  if (first.data) return first.data;

  // 2xx with no data means the call really did return nothing -> don't retry.
  if (first.status >= 200 && first.status < 300) return null;

  console.log(`[HTZ] hash "${hash}" looks stale (${first.status}), refreshing`);
  storage.delete(REMOTE_HASH_KEY);

  const fresh = await resolveRemoteHash(slug, true);
  if (!fresh || fresh === hash) return null;

  const second = await callRemote(fresh, fnName, args, slug);
  return second.data;
}

class HentaiZPlugin implements Plugin.PluginBase {
  id = 'hentaiz';
  name = 'HentaiZ';
  icon = 'src/vi/hentaiz/icon.png';
  site = SITE;
  version = '1.1.0';
  contentType = ContentType.VIDEO;
  contentWarning = ContentWarning.NSFW;

  customJS = 'src/vi/hentaiz/player.js';

  imageRequestInit: Plugin.ImageRequestInit = {
    headers: {
      Referer: SITE + '/',
    },
  };

  pluginSettings: Plugin.PluginSettings = {
    enableEmbed: {
      value: false,
      label: 'Bật embed',
      type: 'Switch',
    },
  };

  get enableEmbed() {
    return storage.get('enableEmbed') as boolean;
  }

  filters = filters;

  // ---------- helpers ----------

  private buildBrowseUrl(
    page: number,
    filterVals: {
      sort: string;
      animationType: string;
      contentRating: string;
      isTrailer: string;
      genres: string[];
      excludeGenres: string[];
      studios: string;
      year: string;
    },
    searchTerm?: string,
  ): string {
    const params = new URLSearchParams();
    if (searchTerm) params.set('q', searchTerm);
    params.set('sort', filterVals.sort);
    params.set('page', String(page));
    params.set('limit', '24');
    params.set('animationType', filterVals.animationType);
    params.set('contentRating', filterVals.contentRating);
    params.set('isTrailer', filterVals.isTrailer);
    params.set('year', filterVals.year);

    if (filterVals.genres.length > 0) {
      params.set('genres', ',' + filterVals.genres.join(','));
    }
    if (filterVals.excludeGenres.length > 0) {
      params.set('excludeGenres', ',' + filterVals.excludeGenres.join(','));
    }
    if (filterVals.studios && filterVals.studios !== 'ALL') {
      params.set('studios', ',' + filterVals.studios);
    }

    return `${SITE}/browse/__data.json?${params.toString()}`;
  }

  private parseBrowseData(data: any): Plugin.NovelItem[] {
    if (!data?.episodes) return [];
    const novels: Plugin.NovelItem[] = [];
    for (const ep of data.episodes) {
      if (!ep?.slug || !ep?.title) continue;
      const cover = ep.posterImage?.filePath
        ? STORAGE_URL + ep.posterImage.filePath
        : ep.backdropImage?.filePath
          ? STORAGE_URL + ep.backdropImage.filePath
          : defaultCover;

      novels.push({
        name: ep.title,
        path: '/watch/' + ep.slug,
        cover,
      });
    }
    return novels;
  }

  // ---------- popularNovels ----------

  async popularNovels(
    pageNo: number,
    {
      filters,
      showLatestNovels,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const url = this.buildBrowseUrl(pageNo, {
      sort:
        (showLatestNovels ? 'publishedAt_desc' : filters?.sort?.value) ||
        'publishedAt_desc',
      animationType: filters?.animationType?.value || 'ALL',
      contentRating: filters?.contentRating?.value || 'ALL',
      isTrailer: filters?.isTrailer?.value || 'ALL',
      genres: (filters?.genres?.value as string[]) || [],
      excludeGenres: (filters?.excludeGenres?.value as string[]) || [],
      studios: (filters?.studios?.value as string) || 'ALL',
      year: filters?.year?.value || 'ALL',
    });

    const data = await fetchSvelteData(url);
    return this.parseBrowseData(data);
  }

  // ---------- searchNovels ----------

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const url = this.buildBrowseUrl(
      pageNo,
      {
        sort: 'publishedAt_desc',
        animationType: 'ALL',
        contentRating: 'ALL',
        isTrailer: 'ALL',
        genres: [],
        excludeGenres: [],
        studios: 'ALL',
        year: 'ALL',
      },
      searchTerm,
    );

    const data = await fetchSvelteData(url);
    return this.parseBrowseData(data);
  }

  // ---------- parseNovel ----------

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const slug = novelPath.replace('/watch/', '');
    const dataUrl = `${SITE}/watch/${slug}/__data.json`;
    const data = await fetchSvelteData(dataUrl);

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: '',
    };

    if (!data?.episode) throw new Error('Không lấy được dữ liệu truyện');

    const ep = data.episode;
    novel.name = ep.title || '';
    novel.summary = ep.description
      ? decodeHtmlEntities(
          (ep.description as string)
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<[^>]+>/g, ''),
        )
      : '';

    // Detail endpoint has no images; cover is fetched from browse data below
    novel.cover = ep.posterImage?.filePath
      ? STORAGE_URL + ep.posterImage.filePath
      : ep.backdropImage?.filePath
        ? STORAGE_URL + ep.backdropImage.filePath
        : defaultCover;

    if (ep.genres && Array.isArray(ep.genres)) {
      novel.genres = ep.genres
        .map((g: any) => g?.genre?.name)
        .filter(Boolean)
        .join(', ');
    }

    if (ep.studios && Array.isArray(ep.studios)) {
      novel.author = ep.studios
        .map((s: any) => s?.studio?.name)
        .filter(Boolean)
        .join(', ');
    }

    if (ep.contentRating) {
      novel.artist = ep.contentRating;
    }

    novel.status = NovelStatus.Completed;

    // Fetch all episodes of the same series via the `getSeriesEpisodes`
    // remote function (authoritative), falling back to a title search.
    const chapters: Plugin.ChapterItem[] = [];
    const seriesTitle = ep.title || '';

    let seriesEps: any[] = [];

    const series = await callRemoteWithRetry(
      'getSeriesEpisodes',
      { currentSlug: slug },
      slug,
    );
    if (Array.isArray(series?.episodes)) seriesEps = series.episodes;

    if (seriesEps.length === 0 && seriesTitle) {
      const searchUrl = this.buildBrowseUrl(
        1,
        {
          sort: 'publishedAt_desc',
          animationType: 'ALL',
          contentRating: 'ALL',
          isTrailer: 'ALL',
          genres: [],
          excludeGenres: [],
          studios: 'ALL',
          year: 'ALL',
        },
        seriesTitle,
      );

      const browseData = await fetchSvelteData(searchUrl);
      if (Array.isArray(browseData?.episodes)) {
        seriesEps = browseData.episodes.filter(
          (e: any) => e?.title === seriesTitle,
        );
      }
    }

    if (seriesEps.length > 0) {
      // Detail endpoint may not carry images; take them from the list instead
      if (novel.cover === defaultCover) {
        const firstEp = seriesEps[0];
        if (firstEp.backdropImage?.filePath) {
          novel.cover = STORAGE_URL + firstEp.backdropImage.filePath;
        } else if (firstEp.posterImage?.filePath) {
          novel.cover = STORAGE_URL + firstEp.posterImage.filePath;
        }
      }

      seriesEps
        .filter((e: any) => e?.slug)
        .sort(
          (a: any, b: any) => (a.episodeNumber || 0) - (b.episodeNumber || 0),
        )
        .forEach((e: any) => {
          chapters.push({
            name: `Tập ${e.episodeNumber || 1}`,
            path: '/watch/' + e.slug,
            chapterNumber: e.episodeNumber || 1,
          });
        });
    }

    // Fallback: if search found nothing, add current episode
    if (chapters.length === 0) {
      const numMatch = slug.match(/-(\d+)$/);
      const epNum = numMatch ? parseInt(numMatch[1]) : 1;
      chapters.push({
        name: `Tập ${epNum}`,
        path: novelPath,
        chapterNumber: epNum,
      });
    }

    const seen = new Set();
    const uniqueChapters = chapters.filter(
      c => !seen.has(c.path) && seen.add(c.path),
    );
    novel.chapters = uniqueChapters;
    return novel;
  }

  // ---------- parseChapter ----------

  /**
   * Resolve the iframe embed URL for an episode.
   *
   * The site no longer ships `embedUrl` inside `__data.json` (it only exposes
   * `hasEmbed`); it is served by the `getEpisodeEmbedUrl` remote function.
   */
  private async getEmbedUrl(slug: string): Promise<string> {
    const data = await fetchSvelteData(`${SITE}/watch/${slug}/__data.json`);
    const ep = data?.episode;

    // Legacy field, kept as a fast path in case the site restores it.
    if (ep?.embedUrl) return ep.embedUrl as string;
    if (!ep?.id) return '';

    // `callRemoteWithRetry` handles a hash that went stale mid-TTL.
    const result = await callRemoteWithRetry(
      'getEpisodeEmbedUrl',
      { episodeId: ep.id },
      slug,
    );

    return result?.embedUrl || '';
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const slug = chapterPath.replace('/watch/', '');
    const embedUrl = await this.getEmbedUrl(slug);

    if (!embedUrl) {
      throw new Error('Không tìm thấy nguồn phát video.');
    }

    // Embed mode: plain iframe
    if (this.enableEmbed) {
      return this.buildPlayerHtml({ iframe: embedUrl });
    }

    // M3U8 mode: decrypt video data server-side
    const idMatch = embedUrl.match(/[?&]v=([a-f0-9-]+)/i);
    const videoId = idMatch ? idMatch[1] : '';

    if (!videoId) {
      return this.buildPlayerHtml({ iframe: embedUrl });
    }

    const videoData = await decryptVideoData(videoId);
    if (!videoData) {
      return this.buildPlayerHtml({ iframe: embedUrl });
    }

    // Preferred: the CDN serves a real master playlist with `ACAO: *`, so the
    // core player can stream it directly without any blob juggling.
    if (videoData.masterUrl) {
      return this.buildPlayerHtml({ m3u8: videoData.masterUrl });
    }

    // Build absolute-URL m3u8 playlists and embed as JSON data attribute
    const rewrittenPlaylists: string[] = [];
    for (let i = 0; i < videoData.m3u8Playlists.length; i++) {
      const folder =
        videoData.variantFolders[i] || videoData.variantFolders[0] || '';
      const baseUrl = `${videoData.segDomain}/${videoData.id}/${folder}/`;
      const lines = videoData.m3u8Playlists[i].split('\n');
      const rewritten = lines
        .map(line => {
          const t = line.trim();
          return t && !t.startsWith('#') ? baseUrl + t : t;
        })
        .join('\n');
      rewrittenPlaylists.push(rewritten);
    }

    // Rewrite master playlist with placeholder variant indices
    const masterLines = videoData.m3u8Master.split('\n');
    let varIdx = 0;
    const rewrittenMaster = masterLines
      .map(line => {
        const t = line.trim();
        if (t && !t.startsWith('#') && t.includes('playlist.m3u8')) {
          return `__VARIANT_${varIdx++}__`;
        }
        return t;
      })
      .join('\n');

    return this.buildPlayerHtml({
      m3u8Master: rewrittenMaster,
      m3u8Playlists: rewrittenPlaylists,
    });
  }

  private buildPlayerHtml(opts: {
    iframe?: string;
    m3u8?: string;
    m3u8Master?: string;
    m3u8Playlists?: string[];
  }): string {
    const esc = (s: string) => encodeHtmlEntities(s);

    const base: string[] = [
      '<meta name="lnreader-chapter-type" content="video">',
      `<meta name="lnreader-debug-mode" content="false">`,
      '<meta id="no-cache-marker"/>',
      '<meta id="no-prefetch-marker"/>',
    ];

    if (opts.iframe) {
      return [
        ...base,
        '<meta name="lnreader-video-mode" content="direct">',
        '<meta name="lnreader-video-type" content="iframe">',
        `<meta name="lnreader-video-url" content="${esc(opts.iframe)}">`,
      ].join('\n');
    }

    if (opts.m3u8) {
      return [
        ...base,
        '<meta name="lnreader-video-mode" content="direct">',
        '<meta name="lnreader-video-type" content="m3u8">',
        `<meta name="lnreader-video-url" content="${esc(opts.m3u8)}">`,
      ].join('\n');
    }

    const attrs: string[] = ['id="htz-player-container"'];
    if (opts.m3u8Master)
      attrs.push(`data-m3u8-master="${esc(opts.m3u8Master)}"`);
    if (opts.m3u8Playlists) {
      attrs.push(
        `data-m3u8-playlists="${esc(JSON.stringify(opts.m3u8Playlists))}"`,
      );
    }

    return [
      ...base,
      '<meta name="lnreader-video-mode" content="lazy">',
      `<div ${attrs.join(' ')} style="display:none;"></div>`,
    ].join('\n');
  }

  resolveUrl(path: string, isNovel?: boolean): string {
    return this.site + path;
  }
}

export default new HentaiZPlugin();
