import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';
import { encodeHtmlEntities } from '@libs/utils';
import { isUrlAbsolute } from '@libs/isAbsoluteUrl';
import { storage } from '@libs/storage';
import { ContentType } from '@libs/pluginMetadata';

import filters from './filters';

class AnimeVietsubPlugin implements Plugin.PluginBase {
  id = 'animevietsub';
  name = 'AnimeVietsub';
  icon = 'src/vi/animevietsub/icon.png';
  site = 'https://animevietsub.vc';
  version = '1.0.44';
  filters = filters;
  contentType = ContentType.VIDEO;

  customJS = 'src/vi/animevietsub/player.js';

  pluginSettings: Plugin.PluginSettings = {
    playMode: {
      value: 'm3u8',
      label: 'Chế độ phát',
      type: 'Select',
      options: [
        { label: 'm3u8 (giải mã)', value: 'm3u8' },
        { label: 'Embed (iframe)', value: 'embed' },
      ],
    },
    enableDebug: {
      value: false,
      label: 'Bật debug',
      type: 'Switch',
    },
  };

  get playMode(): string {
    return (storage.get('playMode') as string) || 'm3u8';
  }

  get enableDebug(): boolean {
    return storage.get('enableDebug') as boolean;
  }

  imageRequestInit: Plugin.ImageRequestInit = {
    headers: {
      Referer: this.site + '/',
    },
  };

  // ---------- helpers ----------
  private urlToPath(url: string): string {
    if (!isUrlAbsolute(url)) {
      return url;
    } else {
      const parsed = new URL(url);
      return url.slice(parsed.origin.length);
    }
  }

  private async fetchHTML(url: string, isRetry = false): Promise<string> {
    const req = await fetchApi(url);
    const text = await req.text();
    // console.log('fetchHTML', url, req.status, isRetry, text);
    if (
      req.status === 403 &&
      text.includes('<title></title>') &&
      text.includes('<div></div>') &&
      /window\.location\.href\s*=\s*(["'`])(.*?)\1\s*;?/.test(text) &&
      !isRetry
    ) {
      console.warn('Redirected, trying to fetch HTML again', url);
      // Retry once
      return this.fetchHTML(url, true);
    }
    return text;
  }

  private checkCommonBlocked($: ReturnType<typeof loadCheerio>): void {
    if ($('.verification-status, #challenge-error-text').length > 0) {
      throw new Error(
        'Đã bị chặn bởi Cloudflare JS Challenge. Mở trang web trong WebView để xác minh.',
      );
    }
    if ($('.verification-section, .captcha-placeholder').length > 0) {
      throw new Error(
        'Đã bị chặn bởi Cloudflare Turnstile. Mở trang web trong WebView để xác minh.',
      );
    }
    if ($('.map-title, .map-notice-caution, #verify-form').length > 0) {
      throw new Error(
        'Bạn đang sử dụng VPN hoặc Proxy. Mở trang web trong WebView, trả lời câu hỏi xác minh rồi thử lại.',
      );
    }
  }

  private parseListHtml(html: string): Plugin.NovelItem[] {
    const novels: Plugin.NovelItem[] = [];
    const $ = loadCheerio(html);
    this.checkCommonBlocked($);
    const seen = new Set<string>();

    $('.TPostMv').each((_, el) => {
      const $el = $(el);
      const $a = $el.find('article a').first();
      const href = $a.attr('href') || '';
      if (!href || !/\/phim\//.test(href)) return;
      const path = this.urlToPath(href);
      if (seen.has(path)) return;
      seen.add(path);
      const name =
        $el.find('h2.Title').first().text().trim() ||
        $el.find('.TPMvCn .Title').first().text().trim() ||
        $a.attr('title') ||
        '';
      const cover =
        $el.find('img').first().attr('src') ||
        $el.find('img').first().attr('data-src') ||
        defaultCover;
      if (name) {
        novels.push({ name, path, cover });
      }
    });

    if (novels.length === 0) {
      $('.e-item, .row-display').each((_, el) => {
        const $el = $(el);
        const $a = $el.find('a.thumb, h3.title-item a, a').first();
        const href = $a.attr('href') || '';
        if (!href || !/\/phim\//.test(href)) return;
        const path = this.urlToPath(href);
        if (seen.has(path)) return;
        seen.add(path);
        const name =
          $el.find('h3.title-item').text().trim() || $a.attr('title') || '';
        const cover = $el.find('img').first().attr('src') || defaultCover;
        if (name) {
          novels.push({ name, path, cover });
        }
      });
    }

    return novels;
  }

  // ---------- popularNovels ----------
  async popularNovels(
    pageNo: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    // Build filters into URL parameters
    const category = filters.category?.value || 'all';
    const genreList =
      filters.genre?.value.length > 0 ? filters.genre.value.join('-') : 'all';
    const season = filters.season?.value || 'all';
    const year = filters.year?.value || 'all';
    const studio = 'all'; // Not implemented in filters
    const age = encodeURIComponent(filters.ageRating?.value || 'all');
    const country = filters.country?.value || 'all';
    const page = pageNo > 1 ? `trang-${pageNo}.html` : '';
    const url = new URL(
      `${this.site}/danh-sach/${category}/${genreList}/${season}/${year}/${studio}/${age}/${country}/${page}`,
    );
    url.searchParams.set('sort', filters.sort?.value || 'latest');
    // Build URL
    // https://animevietsub.bz/danh-sach/category/genre_list/season/year/studio/age/country?sort=?
    const html = await this.fetchHTML(url.toString());
    return this.parseListHtml(html);
  }

  // ---------- searchNovels ----------
  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const term = encodeURIComponent(searchTerm.trim());
    const url =
      pageNo <= 1
        ? `${this.site}/tim-kiem/${term}/F`
        : `${this.site}/tim-kiem/${term}/trang-${pageNo}.html`;
    const html = await this.fetchHTML(url);
    return this.parseListHtml(html);
  }

  // ---------- parseNovel ----------
  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const url = this.site + novelPath;
    const html = await this.fetchHTML(url);
    if (!html) throw new Error('API error: ' + url);
    const $ = loadCheerio(html);
    this.checkCommonBlocked($);
    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name:
        $('header.Container h1.Title').first().text().trim() ||
        $('h1.Title').first().text().trim() ||
        $('meta[property="og:title"]').attr('content') ||
        '',
      cover:
        $('.attachment-img-mov-md').attr('src') ||
        $('meta[property="og:image"]').attr('content') || // ele 1: banner, ele 2: cover
        $('.Image img').attr('src') ||
        defaultCover,
      summary:
        $('.Description').text().trim() ||
        $('meta[property="og:description"]').attr('content') ||
        '',
    };

    const genres: string[] = [];
    $('.InfoList a[href*="/the-loai/"]').each((_, el) => {
      const t = $(el).text().trim();
      if (t) genres.push(t);
    });
    if (genres.length) novel.genres = genres.join(', ');

    $('.InfoList li').each((_, li) => {
      const label = $(li).find('strong').text().trim();
      if (/Đạo diễn/i.test(label)) {
        const author = $(li)
          .text()
          .replace(/Đạo diễn:?/i, '')
          .trim();
        if (author) novel.author = author;
      }
      if (/Trạng thái/i.test(label)) {
        const st = $(li)
          .text()
          .replace(/Trạng thái:?/i, '')
          .trim()
          .toLowerCase();
        if (/full|hoàn|complete|trọn bộ/.test(st))
          novel.status = NovelStatus.Completed;
        else if (/đang|tập/.test(st)) novel.status = NovelStatus.Ongoing;
        else novel.status = NovelStatus.Unknown;
      }
    });

    // Chapter list: detail page only shows latest 3 in "Tập mới".
    // To get the full episode list (server "AnimeVsub") we visit the
    // latest episode page and parse the list-server section.
    const latestEpHref = $('.InfoList li.latest_eps a').first().attr('href');
    if (latestEpHref) {
      const epPageUrl = latestEpHref.startsWith('http')
        ? latestEpHref
        : this.site + latestEpHref;
      const epHtml = await this.fetchHTML(epPageUrl);
      novel.chapters = this.parseEpisodeList(epHtml);
    }

    return novel;
  }

  private parseEpisodeList(html: string): Plugin.ChapterItem[] {
    const $ = loadCheerio(html);
    this.checkCommonBlocked($);
    const chapters: Plugin.ChapterItem[] = [];

    const seen = new Set<string>();
    $('#list-server .server').each((_, el) => {
      const $group = $(el);
      const name = $group.find('.server-name').first().text().trim();
      $group
        .find('ul.list-episode li.episode a.btn-episode')
        .each((idx, el) => {
          const $a = $(el);
          const href = $a.attr('href') || '';
          if (!href) return;
          const path = this.urlToPath(href);
          if (seen.has(path)) return;
          seen.add(path);
          const epLabel = $a.attr('title')?.trim() || `Tập ${$a.text().trim()}`;
          const num = parseFloat($a.text().replace(/[^0-9.]/g, ''));
          chapters.push({
            name: epLabel,
            path,
            chapterNumber: Number.isFinite(num) ? num : idx + 1,
            page: `AVS: ${name}`,
          });
        });
    });

    return chapters;
  }

  // ---------- parseChapter ----------
  // Strategy:
  //   1. Fetch episode page → extract inline window.PLAYER_DATA
  //   2. If playTech=iframe (storage.googleapiscdn.com player):
  //      fetch the player page → extract avsToken & id → build m3u8 URL
  //   3. If playTech=api/all with sources → pass sources to customJS
  //   4. Fallback: extract data-hash/data-id for AJAX approach in customJS
  async parseChapter(chapterPath: string): Promise<string> {
    const url = this.site + chapterPath;
    const html = await this.fetchHTML(url);
    if (!html) throw new Error('API error: ' + url);
    const $ = loadCheerio(html);
    // Get banner
    const img = $('img.TPostBg').first().attr('src')?.trim();
    // ── 1. Try extracting window.PLAYER_DATA from inline scripts ──
    const pdMatch = html.match(
      /window\.PLAYER_DATA\s*=\s*(\{[\s\S]*?\})\s*;?\s*<\/script>/,
    );
    if (pdMatch) {
      try {
        const rawJson = pdMatch[1].replace(/\\\//g, '/');
        const pd = JSON.parse(rawJson);

        // Case A: iframe player at stream.googleapiscdn.com
        // The player page is behind Cloudflare managed challenge, so
        // fetchText cannot reach it. Embed the iframe directly and let
        // the WebView handle the Cloudflare challenge + JWPlayer boot.
        if (
          pd.playTech === 'iframe' &&
          typeof pd.link === 'string' &&
          pd.link.includes('googleapiscdn.com')
        ) {
          if (this.playMode === 'embed') {
            return this.buildPlayerHtml({
              iframe: pd.link,
              embedOnly: true,
              bannerUrl: img,
            });
          }
          return this.buildPlayerHtml({ iframe: pd.link, bannerUrl: img });
        }

        // Case B: api / all with sources array
        if (
          (pd.playTech === 'api' || pd.playTech === 'all') &&
          Array.isArray(pd.link)
        ) {
          const sources = pd.link.map((s: any) => ({
            file: (s.file || '').replace(/^&http/, 'http'),
            type: s.type || '',
            label: s.label || '',
          }));
          return this.buildPlayerHtml({ sources, bannerUrl: img });
        }

        // Case C: api / all with single string link
        if (
          (pd.playTech === 'api' || pd.playTech === 'all') &&
          typeof pd.link === 'string'
        ) {
          const link = pd.link.replace(/^&http/, 'http');
          if (/\.m3u8(\?|$)/i.test(link)) {
            return this.buildPlayerHtml({
              m3u8: link,
              referer: url,
              bannerUrl: img,
            });
          }
          if (/\.(mp4|webm)(\?|$)/i.test(link)) {
            return this.buildPlayerHtml({
              sources: [{ file: link, type: 'mp4', label: '' }],
              bannerUrl: img,
            });
          }
        }

        // Case D: iframe to non-googleapiscdn player
        if (pd.playTech === 'iframe' && typeof pd.link === 'string') {
          return this.buildPlayerHtml({
            iframe: pd.link,
            embedOnly: true,
            bannerUrl: img,
          });
        }
      } catch (_) {
        //
      }
    }

    // ── 2. Fallback: extract data-hash/data-id for AJAX via customJS ──
    // The customJS handles the AJAX response: if the server returns an
    // iframe URL (e.g. googleapiscdn), it uses hidden-iframe token
    // extraction → direct m3u8 playback. Always allow this path.
    this.checkCommonBlocked($);
    const cleanPath = chapterPath.split('?')[0].split('#')[0];
    let $link = $(
      `a.btn-episode.episode-link[href$="${cleanPath}"], a.btn-episode.episode-link[href*="${cleanPath}"]`,
    ).first();
    if ($link.length === 0) {
      $link = $('#list-server .server-group')
        .filter((_, el) => /AnimeVsub/i.test($(el).find('.server-name').text()))
        .find('a.btn-episode.active')
        .first();
    }
    if ($link.length === 0) {
      $link = $('a.btn-episode.episode-link.active').first();
    }

    const dataHash = $link.attr('data-hash') || '';
    const dataId = $link.attr('data-id') || '';

    if (dataHash) {
      return this.buildPlayerHtml({
        hash: dataHash,
        id: dataId,
        referer: url,
        site: this.site,
        bannerUrl: img,
      });
    }

    // ── 3. Last resort: embed the episode page in an iframe ──
    if (this.playMode === 'embed') {
      return this.buildPlayerHtml({
        iframe: url,
        embedOnly: true,
        bannerUrl: img,
      });
    }
    return '<p style="color:#ff4444;font-size:14px;font-family:sans-serif;text-align:center;padding:16px;">Không tìm thấy nguồn video cho tập phim này.</p><meta id="no-cache-marker"/><meta id="no-prefetch-marker"/>';
  }

  // ── Helper: build the HTML container for customJS ──
  private buildPlayerHtml(opts: {
    m3u8?: string;
    sources?: { file: string; type: string; label: string }[];
    iframe?: string;
    hash?: string;
    id?: string;
    referer?: string;
    site?: string;
    embedOnly?: boolean;
    bannerUrl?: string;
  }): string {
    const esc = (s: string) => encodeHtmlEntities(s);

    const base: string[] = [
      '<meta name="lnreader-chapter-type" content="video">',
      `<meta name="lnreader-debug-mode" content="${Boolean(this.enableDebug)}">`,
      '<meta id="no-cache-marker"/>',
      '<meta id="no-prefetch-marker"/>',
    ];

    if (opts.embedOnly && opts.iframe) {
      return [
        ...base,
        '<meta name="lnreader-video-mode" content="direct">',
        '<meta name="lnreader-video-type" content="iframe">',
        `<meta name="lnreader-video-url" content="${esc(opts.iframe)}">`,
      ].join('\n');
    }

    const attrs: string[] = ['id="avs-player-container"'];
    if (opts.bannerUrl) attrs.push(`data-banner="${esc(opts.bannerUrl)}"`);
    if (opts.m3u8) attrs.push(`data-m3u8="${esc(opts.m3u8)}"`);
    if (opts.sources)
      attrs.push(`data-sources="${esc(JSON.stringify(opts.sources))}"`);
    if (opts.iframe) attrs.push(`data-iframe="${esc(opts.iframe)}"`);
    if (opts.hash) attrs.push(`data-hash="${esc(opts.hash)}"`);
    if (opts.id) attrs.push(`data-id="${esc(opts.id)}"`);
    if (opts.referer) attrs.push(`data-referer="${esc(opts.referer)}"`);
    if (opts.site) attrs.push(`data-site="${esc(opts.site)}"`);
    attrs.push(`data-mode="${opts.embedOnly ? 'embed' : this.playMode}"`);

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

export default new AnimeVietsubPlugin();
