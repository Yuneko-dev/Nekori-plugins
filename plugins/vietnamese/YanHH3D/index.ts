import { defaultCover } from '@libs/defaultCover';
import { fetchText } from '@libs/fetch';
import { isUrlAbsolute } from '@libs/isAbsoluteUrl';
import { NovelStatus } from '@libs/novelStatus';
import { storage } from '@libs/storage';
import { NekoriBasePlugin } from '@nekori/plugin';
import { ContentType } from '@nekori/pluginMetadata';
import { encodeHtmlEntities } from '@nekori/utils';
import { load as loadCheerio } from 'cheerio';

import { Plugin } from '@/types/plugin';

import filters from './filters';

const SITE = 'https://yanhh3d.plus';

class YanHH3DPlugin extends NekoriBasePlugin {
  id = 'yanhh3d.plus';
  name = 'YanHH3D';
  icon = 'icon.png';
  site = SITE;
  version = '1.1.5';
  minApiVersion = 2;
  contentType = ContentType.VIDEO;
  filters = filters;

  customJS = 'player.js';

  pluginSettings: Plugin.PluginSettings = {
    enableDebug: {
      value: false,
      label: 'Bật debug',
      type: 'Switch',
    },
  };

  get enableDebug(): boolean {
    return storage.get('enableDebug') as boolean;
  }

  imageRequestInit: Plugin.ImageRequestInit = {
    headers: {
      Referer: SITE + '/',
    },
  };

  // ---------- helpers ----------
  private urlToPath(url: string): string {
    if (!url) return '';
    if (isUrlAbsolute(url)) {
      try {
        return new URL(url).pathname;
      } catch {
        return url;
      }
    }
    return url.startsWith('/') ? url : '/' + url;
  }

  private normalizeUrl(url: string): string {
    if (!url) return '';
    if (isUrlAbsolute(url)) return url;
    if (url.startsWith('//')) return 'https:' + url;
    if (url.startsWith('/')) return SITE + url;
    return SITE + '/' + url;
  }

  /**
   * `.m3u8` data-src URLs are JW Player wrapper HTML pages, not playlists.
   * Two wrapper flavours:
   *   - `/o2/v/…` → `data-obf` attr: base64 JSON `{ sU, pU, eK, hD }`
   *     → `pU` is the real playlist URL.
   *   - `/o1/v/…` → plaintext `var cccc = "<url>"` in the script body
   *     → that URL is the real playlist.
   */
  private async resolvePlaylistUrl(wrapperUrl: string): Promise<string | null> {
    try {
      const html = await fetchText(wrapperUrl, {
        headers: { Referer: SITE + '/' },
      });
      if (!html) return null;
      // o2 style — data-obf base64
      const obf = html.match(/data-obf="([^"]+)"/)?.[1];
      if (obf) {
        const json = JSON.parse(b64Decode(obf)) as { pU?: string };
        if (json.pU) return json.pU;
      }
      // o1 style — jwplayer setup with var cccc = "…"
      const cccc = html.match(/var\s+cccc\s*=\s*"([^"]+)"/)?.[1];
      if (cccc) return cccc;
      return null;
    } catch {
      return null;
    }
  }

  // ---------- list / search ----------
  private parseCards(html: string): Plugin.NovelItem[] {
    const $ = loadCheerio(html);
    const novels: Plugin.NovelItem[] = [];
    $('.flw-item').each((_, el) => {
      const $el = $(el);
      const $poster = $el.find('a.film-poster-ahref').first();
      const $name = $el.find('h3.film-name a, .film-name a').first();
      const href = $poster.attr('href') || $name.attr('href') || '';
      const name = ($name.text() || $poster.attr('title') || '').trim();
      if (!href || !name) return;
      const img =
        $el.find('img.film-poster-img').attr('data-src') ||
        $el.find('img.film-poster-img').attr('src') ||
        '';
      novels.push({
        name,
        path: this.urlToPath(href),
        cover: this.normalizeUrl(img) || defaultCover,
      });
    });
    return novels;
  }

  async popularNovels(
    pageNo: number,
    {
      filters: f,
      showLatestNovels,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const genre = f?.genre?.value;
    const cat = f?.category?.value || 'moi-cap-nhat';

    // Latest tab → /moi-cap-nhat or filtered list (same codepath).
    if (showLatestNovels || genre || cat !== 'moi-cap-nhat') {
      let url = SITE + '/';
      if (genre) url += `the-loai/${genre}`;
      else url += cat;
      url += `?page=${pageNo}`;
      const html = await fetchText(url);
      return this.parseCards(html);
    }

    // Popular tab → sidebar "Bảng Xếp Hạng" (top-viewed-day ranking on
    // the index page). Site has no dedicated /hot URL — the chart lives
    // inside /moi-cap-nhat as .anif-block-chart.
    const html = await fetchText(SITE + '/moi-cap-nhat');
    const $ = loadCheerio(html);
    const novels: Plugin.NovelItem[] = [];
    $('#top-viewed-day li.item-top').each((_, el) => {
      const $el = $(el);
      const $a = $el.find('.film-poster a').first();
      const $name = $el.find('.film-name a, .dynamic-name').first();
      const href = $a.attr('href') || $name.attr('href') || '';
      const name = ($name.attr('title') || $name.text() || '').trim();
      if (!href || !name) return;
      const img =
        $el.find('img.film-poster-img').attr('data-src') ||
        $el.find('img.film-poster-img').attr('src') ||
        '';
      novels.push({
        name,
        path: this.urlToPath(href),
        cover: this.normalizeUrl(img) || defaultCover,
      });
    });
    return novels;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const q = encodeURIComponent(searchTerm.trim());
    const url = `${SITE}/search?keysearch=${q}${pageNo > 1 ? `&page=${pageNo}` : ''}`;
    const html = await fetchText(url);
    return this.parseCards(html);
  }

  // ---------- detail ----------
  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const url = this.normalizeUrl(novelPath);
    const html = await fetchText(url);
    const $ = loadCheerio(html);

    const name =
      $('h1.film-name').first().text().trim() ||
      $('meta[property="og:title"]').attr('content')?.trim() ||
      '';
    const cover =
      $('meta[property="og:image"]').attr('content') ||
      $('img.film-poster-img').first().attr('data-src') ||
      $('img.film-poster-img').first().attr('src') ||
      defaultCover;
    const summary =
      $('.film-description .text').first().text().trim() ||
      $('meta[property="og:description"]').attr('content')?.trim() ||
      '';
    const statusText = $('.anisc-info .item')
      .filter((_, el) => $(el).find('.item-head').text().includes('Trạng thái'))
      .find('.name')
      .first()
      .text()
      .trim()
      .toLowerCase();
    let status: string = NovelStatus.Unknown;
    if (/đang chiếu|ongoing|trailer/.test(statusText))
      status = NovelStatus.Ongoing;
    else if (/hoàn thành|completed|full|end/.test(statusText))
      status = NovelStatus.Completed;

    const genres: string[] = [];
    $('.anisc-info a.name.genre').each((_, el) => {
      const t = $(el).text().trim();
      if (t) genres.push(t);
    });

    // buttons → server paths
    const watchLinks: {
      label: string;
      href: string;
      volume: 'Thuyết Minh' | 'Vietsub';
    }[] = [];
    $('.film-buttons a.btn-play').each((_, el) => {
      const $a = $(el);
      const href = $a.attr('href') || '';
      const label = $a.text().trim();
      if (!href) return;
      if (/\/sever2\//.test(href)) {
        watchLinks.push({ label, href, volume: 'Vietsub' });
      } else {
        watchLinks.push({ label, href, volume: 'Thuyết Minh' });
      }
    });

    const chapters: Plugin.ChapterItem[] = [];
    if (watchLinks.length === 0) {
      // Fallback: query ep page via slug directly (TM assumed)
      const slug = this.urlToPath(url).replace(/^\//, '').replace(/\/$/, '');
      if (slug) {
        const epHtml = await fetchText(`${SITE}/${slug}/tap-1`);
        this.collectEpisodes(epHtml, chapters);
      }
    } else {
      // Only need to fetch one ep page — both tabs listed there.
      // But tabs on that page include BOTH TM+VS. Fetch the page of the FIRST button.
      const epHtml = await fetchText(watchLinks[0].href);
      this.collectEpisodes(epHtml, chapters);
    }

    return {
      path: novelPath,
      name,
      cover,
      summary,
      author: 'Đang cập nhật',
      genres: genres.join(', '),
      status,
      chapters,
    };
  }

  /**
   * Episodes page has `.ep-range.ss-list` blocks inside `.tab-pane` containers
   * labelled by `.cm-tab` nav-link text: "Thuyết Minh" → tab id "top-comment",
   * "Vietsub" → "new-comment". Extract episodes per block and tag with volume.
   */
  private collectEpisodes(html: string, chapters: Plugin.ChapterItem[]): void {
    const $ = loadCheerio(html);
    const tabLabels: { id: string; label: string }[] = [];
    $('ul.sever-ep li.nav-item a.cm-tab').each((_, el) => {
      const $a = $(el);
      const href = $a.attr('href') || '';
      const label = $a.text().trim();
      const id = href.replace(/^#/, '');
      if (id) tabLabels.push({ id, label });
    });

    const seen = new Set<string>();
    const addEp = (href: string, title: string, page: string) => {
      const path = this.urlToPath(href);
      const key = page + '|' + path;
      if (!path || seen.has(key)) return;
      seen.add(key);
      const num = parseInt(title, 10);
      chapters.push({
        name: `Tập ${title}`,
        path,
        page,
        chapterNumber: isNaN(num) ? undefined : num,
      });
    };

    if (tabLabels.length > 0) {
      // Map: tab id → volume label
      tabLabels.forEach(t => {
        const pane = $(`#${t.id}`).first();
        const label = /vietsub|sub/i.test(t.label) ? 'Vietsub' : 'Thuyết Minh';
        pane.find('.ep-range a.ssl-item').each((_, el) => {
          const $a = $(el);
          const href = $a.attr('href') || '';
          const title = (
            $a.attr('title') ||
            $a.find('.ep-name').text() ||
            ''
          ).trim();
          if (href && title) addEp(href, title, label);
        });
      });
    } else {
      // No tabs — single server, infer label from URL host pattern.
      $('.ep-range a.ssl-item').each((_, el) => {
        const $a = $(el);
        const href = $a.attr('href') || '';
        const title = (
          $a.attr('title') ||
          $a.find('.ep-name').text() ||
          ''
        ).trim();
        const label = /\/sever2\//.test(href) ? 'Vietsub' : 'Thuyết Minh';
        if (href && title) addEp(href, title, label);
      });
    }

    // Sort each volume descending by chapter number already handled by display;
    // ensure ascending here.
    chapters.sort((a, b) => {
      const pa = a.page || '';
      const pb = b.page || '';
      if (pa !== pb) return pa.localeCompare(pb);
      return (a.chapterNumber || 0) - (b.chapterNumber || 0);
    });
  }

  // ---------- chapter ----------
  async parseChapter(chapterPath: string): Promise<Plugin.ChapterContent> {
    const url = this.normalizeUrl(chapterPath);
    const html = await fetchText(url);
    const $ = loadCheerio(html);

    const buttons: ServerButton[] = [];
    $('.btn3dsv[data-src]').each((_, el) => {
      const $el = $(el);
      const src = $el.attr('data-src') || '';
      const label = $el.text().trim();
      if (src) buttons.push({ label, src });
    });

    const poster = $('meta[property="og:image"]').attr('content') || undefined;

    // Resolve .m3u8 wrappers → real playlist URL, in parallel
    await Promise.all(
      buttons.map(async b => {
        if (/\.m3u8(\?|$)/i.test(b.src)) {
          const p = await this.resolvePlaylistUrl(b.src);
          if (p) b.resolved = p;
        }
      }),
    );

    // Drop m3u8 sources that failed to resolve
    const candidates = buttons.filter(
      b => b.resolved || !/\.m3u8(\?|$)/i.test(b.src),
    );

    if (!candidates.length) {
      return {
        state: 'checkpoint',
        type: 'video',
        noCache: true,
        noPrefetch: true,
        html: '<p style="color:#ff4444;font-family:sans-serif;text-align:center;padding:16px;">Không tìm thấy nguồn video.</p>',
      };
    }

    const esc = encodeHtmlEntities;
    const sourcesJson = esc(JSON.stringify(candidates));

    const meta: string[] = [
      '<meta name="nekori-video-mode" content="lazy">',
      `<meta name="nekori-debug-mode" content="${Boolean(this.enableDebug)}">`,
    ];
    if (poster)
      meta.push(`<meta name="nekori-video-poster" content="${esc(poster)}">`);

    const container = [
      '<div id="yanhh3d-player"',
      `  data-sources="${sourcesJson}"`,
      `  data-page-url="${esc(url)}"`,
      `  data-debug="${this.enableDebug ? '1' : '0'}"`,
      '  style="display:none"></div>',
    ].join(' ');

    return {
      state: 'ready',
      type: 'video',
      noCache: true,
      noPrefetch: true,
      html: meta.join('\n') + '\n' + container,
    };
  }

  resolveUrl(path: string): string {
    return this.normalizeUrl(path);
  }
}

type ServerButton = {
  label: string;
  src: string;
  /** real m3u8 playlist resolved from wrapper, or undefined for iframe-only sources */
  resolved?: string;
};

const B64_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

function b64Decode(input: string): string {
  // minimal atob replacement that works in Hermes too
  let output = '';
  let i = 0;
  const clean = input.replace(/[^A-Za-z0-9+/=]/g, '');
  while (i < clean.length) {
    const e1 = B64_CHARS.indexOf(clean.charAt(i++));
    const e2 = B64_CHARS.indexOf(clean.charAt(i++));
    const e3 = B64_CHARS.indexOf(clean.charAt(i++));
    const e4 = B64_CHARS.indexOf(clean.charAt(i++));
    const c1 = (e1 << 2) | (e2 >> 4);
    const c2 = ((e2 & 15) << 4) | (e3 >> 2);
    const c3 = ((e3 & 3) << 6) | e4;
    output += String.fromCharCode(c1);
    if (e3 !== 64) output += String.fromCharCode(c2);
    if (e4 !== 64) output += String.fromCharCode(c3);
  }
  return output;
}

export default new YanHH3DPlugin();
