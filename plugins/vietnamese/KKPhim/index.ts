import { fetchText } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';
import { encodeHtmlEntities } from '@libs/utils';
import { isUrlAbsolute } from '@libs/isAbsoluteUrl';
import { storage } from '@libs/storage';
import { ContentType } from '@libs/pluginMetadata';

import filters from './filters';

const SITE = 'https://kkphim.com';

class KKPhimPlugin implements Plugin.PluginBase {
  id = 'kkphim';
  name = 'KKPhim';
  icon = 'src/vi/kkphim/icon.png';
  site = SITE;
  version = '1.0.4';
  customJS = 'src/vi/kkphim/player.js';
  contentType = ContentType.VIDEO;

  filters = filters;

  pluginSettings: Plugin.PluginSettings = {
    enableAdBlocker: {
      value: false,
      label: 'Tắt chặn quảng cáo',
      type: 'Switch',
    },
  };

  get enableAdBlocker(): boolean {
    return storage.get('enableAdBlocker') as boolean;
  }

  imageRequestInit: Plugin.ImageRequestInit = {
    headers: {
      Referer: this.site + '/',
    },
  };

  // ---------- helpers ----------
  private stripImageProxy(url: string): string {
    // phimapi.com/image.php?url=<real_url> → <real_url>
    if (url && url.includes('phimapi.com/image.php')) {
      try {
        const u = new URL(url);
        const real = u.searchParams.get('url');
        if (real) return real;
      } catch (e) {
        /* ignore */
      }
    }
    return url;
  }

  private urlToPath(url: string): string {
    if (!isUrlAbsolute(url)) {
      return url;
    } else {
      const parsed = new URL(url);
      return url.slice(parsed.origin.length);
    }
  }

  private async fetchHTML(url: string): Promise<string> {
    return await fetchText(url);
  }

  private parseListHtml(html: string): Plugin.NovelItem[] {
    const novels: Plugin.NovelItem[] = [];
    const $ = loadCheerio(html);
    const seen = new Set<string>();

    $('table tbody tr').each((_: number, el: any) => {
      const $row = $(el);
      const $link = $row.find('a[href*="/phim/"]').first();
      const href = $link.attr('href') || '';
      if (!href) return;
      const path = this.urlToPath(href);
      if (seen.has(path)) return;
      seen.add(path);

      const name = $link.find('h3').first().text().trim();
      const cover = this.stripImageProxy(
        $row.find('img').first().attr('src') || defaultCover,
      );

      if (name) {
        novels.push({ name, path, cover });
      }
    });

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
    const params = new URLSearchParams();
    params.set('page', String(pageNo));

    if (!showLatestNovels && filters) {
      if (filters.sort_lang.value)
        params.set('sort_lang', filters.sort_lang.value);
      if (filters.category.value)
        params.set('category', filters.category.value);
      if (filters.country.value) params.set('country', filters.country.value);
      if (filters.type.value) params.set('type', filters.type.value);
      if (filters.year.value) params.set('year', filters.year.value);
      if (filters.sort_field.value)
        params.set('sort_field', filters.sort_field.value);
    } else {
      params.set('sort_field', 'modified.time');
    }

    const url = `${SITE}/duyet-tim?${params.toString()}`;
    const html = await this.fetchHTML(url);
    return this.parseListHtml(html);
  }

  // ---------- searchNovels ----------
  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const params = new URLSearchParams();
    params.set('keyword', searchTerm.trim());
    params.set('page', String(pageNo));

    const url = `${SITE}/tim-kiem?${params.toString()}`;
    const html = await this.fetchHTML(url);
    return this.parseListHtml(html);
  }

  // ---------- parseNovel ----------
  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const url = `${SITE}${novelPath}`;
    const html = await this.fetchHTML(url);
    const $ = loadCheerio(html);

    // Title
    const title = $('h1').first().text().trim();
    const subtitle = $('h2').first().text().trim();
    const name = subtitle ? `${title} - ${subtitle}` : title;

    // Cover - from og:image meta tag
    const cover = this.stripImageProxy(
      $('meta[property="og:image"]').attr('content') || defaultCover,
    );

    // Description
    const summary = $('article').first().text().trim();

    // Info table
    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name,
      cover,
      summary,
    };

    $('table tr').each((_: number, el: any) => {
      const cells = $(el).find('td');
      if (cells.length < 2) return;
      const key = cells.eq(0).text().trim();
      const value = cells.eq(1).text().trim();

      switch (key) {
        case 'Đạo diễn':
        case 'Diễn viên':
          if (!novel.author) novel.author = value;
          break;
        case 'Thể loại':
          novel.genres = value;
          break;
        case 'Tình trạng':
          if (/hoàn|full|complete|trọn bộ/i.test(value)) {
            novel.status = NovelStatus.Completed;
          } else if (/đang|ongoing|tập/i.test(value)) {
            novel.status = NovelStatus.Ongoing;
          }
          break;
      }
    });

    const chapters: Plugin.ChapterItem[] = [];
    let chapterIndex = 0;

    const episodesStart = html.indexOf('var episodes');
    if (episodesStart !== -1) {
      const arrStart = html.indexOf('[', episodesStart);
      let depth = 0;
      let arrEnd = -1;
      for (let i = arrStart; i < html.length; i++) {
        if (html[i] === '[') depth++;
        if (html[i] === ']') depth--;
        if (depth === 0) {
          arrEnd = i;
          break;
        }
      }

      let episodesData: {
        server_name: string;
        list: { name: string; slug: string; embed: string; m3u8: string }[];
      }[] = [];
      if (arrEnd > arrStart) {
        try {
          episodesData = JSON.parse(html.substring(arrStart, arrEnd + 1));
        } catch (e) {
          // JSON parse failed — episodesData stays empty
        }
      }

      if (episodesData.length) {
        for (const server of episodesData) {
          const serverName = (server.server_name || '')
            .replace(/^#/, '')
            .trim();

          for (const ep of server.list) {
            if (!ep.m3u8) continue;

            chapterIndex++;
            const epNum = parseFloat(ep.name.replace(/[^0-9.]/g, ''));

            chapters.push({
              name: ep.name,
              path: ep.m3u8,
              chapterNumber: Number.isFinite(epNum) ? epNum : chapterIndex,
              page: `Server: ${serverName}`,
            });
          }
        }
      }
    }

    novel.chapters = chapters;
    return novel;
  }

  // ---------- parseChapter ----------
  async parseChapter(chapterPath: string): Promise<string> {
    const m3u8Url = chapterPath.startsWith('http') ? chapterPath : '';

    if (!m3u8Url) {
      return '<p style="color:#ff4444;font-size:14px;font-family:sans-serif;text-align:center;padding:16px;">Không tìm thấy nguồn video cho tập phim này.</p><meta id="no-cache-marker"/><meta id="no-prefetch-marker"/>';
    }

    const esc = (s: string) => encodeHtmlEntities(s);
    return [
      '<meta name="lnreader-chapter-type" content="video">',
      '<meta name="lnreader-video-mode" content="lazy">',
      '<meta id="no-cache-marker"/>',
      '<meta id="no-prefetch-marker"/>',
      `<div id="kkphim-player-container" data-m3u8="${esc(m3u8Url)}" data-ad-blocker="${this.enableAdBlocker}" style="display:none;"></div>`,
    ].join('\n');
  }

  resolveUrl(path: string, isNovel?: boolean): string {
    if (path.startsWith('http')) return path;
    if (isNovel) return `${SITE}/phim/${path.replace(/^\/phim\//, '')}`;
    return `${SITE}${path}`;
  }
}

export default new KKPhimPlugin();
