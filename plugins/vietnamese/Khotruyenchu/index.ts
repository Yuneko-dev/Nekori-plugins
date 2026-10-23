import { defaultCover } from '@libs/defaultCover';
import { fetchText } from '@libs/fetch';
import { Filters } from '@libs/filterInputs';
import { NovelStatus } from '@libs/novelStatus';
import { NekoriPagePlugin } from '@nekori/plugin';
import { ContentType, ContentWarning } from '@nekori/pluginMetadata';
import { load as loadCheerio } from 'cheerio';

import { Plugin } from '@/types/plugin';

class KhotruyenchuPlugin extends NekoriPagePlugin {
  id = 'khotruyenchu';
  name = 'Khotruyenchu';
  icon = 'icon.png';
  site = 'https://khotruyenchu.fun';
  version = '1.0.0';
  filters: Filters | undefined = undefined;
  contentType = ContentType.NOVEL;
  contentWarning = ContentWarning.SAFE;

  private chapterUrlRegex = /chuong-(\d+)-([^/]+)\/?/;

  private novelName($: ReturnType<typeof loadCheerio>): string {
    const h1 = $('h1.entry-title, h1.page-title, h1').first().text().trim();
    if (h1) return h1.replace(/\s*-\s*.*$/, '').trim();
    const title = $('meta[property="og:title"]').attr('content') || '';
    return title.replace(/\s*-\s*.*$/, '').trim() || 'Không có tiêu đề';
  }

  private extractJsonLd(
    $: ReturnType<typeof loadCheerio>,
    key: string,
  ): string | null {
    const html = $.html();
    const match = html.match(new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`));
    return match ? match[1] : null;
  }

  async popularNovels(
    _pageNo: number,
    _options: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const html = await fetchText(`${this.site}/`);
    if (!html) return [];

    const $ = loadCheerio(html);
    const novels: Plugin.NovelItem[] = [];
    const seen = new Set<string>();

    $('a.ktc-rank-name').each((_, el) => {
      const href = $(el).attr('href');
      const name = $(el).text().trim();
      if (!href || !name) return;
      if (!href.match(/truyen\/[^/]+\/$/)) return;
      if (seen.has(href)) return;
      seen.add(href);
      const cover =
        $(el).closest('li, article').find('img').attr('data-src') ||
        $(el).closest('li, article').find('img').attr('src') ||
        '';
      novels.push({
        name,
        path: href.replace(this.site, ''),
        cover: cover.startsWith('/')
          ? this.site + cover
          : cover || defaultCover,
      });
    });

    return novels;
  }

  async parseNovel(
    novelPath: string,
  ): Promise<Plugin.SourceNovel & { totalPages: number }> {
    const url = this.site + novelPath;
    const html = await fetchText(url);
    if (!html) {
      throw new Error('Không thể tải trang sách khotruyenchu.fun');
    }

    const $ = loadCheerio(html);

    let totalPages = 1;
    $('a.page-numbers').each((_, el) => {
      const text = $(el).text().trim();
      const page = Number(text);
      if (!Number.isNaN(page) && page > totalPages) totalPages = page;
    });

    const novel: Plugin.SourceNovel & { totalPages: number } = {
      path: novelPath,
      name: this.novelName($),
      chapters: [],
      totalPages,
    };

    novel.cover = $('meta[property="og:image"]').attr('content') || '';
    novel.summary = $('meta[name="description"]').attr('content') || '';
    novel.author = this.extractJsonLd($, 'author') || '';
    novel.genres = this.extractJsonLd($, 'genre') || '';
    novel.status = NovelStatus.Unknown;

    return novel;
  }

  async parsePage(novelPath: string, page: string): Promise<Plugin.SourcePage> {
    const pageNum = Number(page);
    const url =
      pageNum <= 1
        ? this.site + novelPath
        : `${this.site}${novelPath.replace(/\/$/, '')}/page/${pageNum}/`;

    const html = await fetchText(url);
    if (!html) return { chapters: [] };

    const $ = loadCheerio(html);

    const chapters: Plugin.ChapterItem[] = [];
    $('a[href*="/chuong-"]').each((_, el) => {
      const href = $(el).attr('href');
      if (!href) return;
      const name = $(el).text().trim();
      if (!name) return;
      const path = href.replace(this.site, '');
      const match = path.match(this.chapterUrlRegex);
      chapters.push({
        name,
        path,
        chapterNumber: match ? Number(match[1]) : undefined,
      });
    });

    return { chapters };
  }

  async parseChapter(chapterPath: string): Promise<Plugin.ChapterContent> {
    const html = await fetchText(this.site + chapterPath);
    if (!html) {
      return {
        state: 'checkpoint',
        type: 'novel',
        html: '<div>Không thể tải nội dung chương. Vui lòng mở trang trong WebView để xác thực và tải lại.</div>',
        checkpointMessage: 'Site yêu cầu xác thực qua WebView',
        noCache: true,
        noPrefetch: true,
      };
    }

    const $ = loadCheerio(html);

    const title = $('h1.page-title, h1.entry-title, h1').first().text().trim();
    const content = $('.entry-content').html() || '';

    if (!content && !title) {
      return {
        state: 'checkpoint',
        type: 'novel',
        html: '<div>Không tìm thấy nội dung chương. Có thể trang bị chặn. Vui lòng mở trong WebView để xác thực và tải lại.</div>',
        checkpointMessage: 'Không có nội dung chương, cần xác thực qua WebView',
        noCache: true,
        noPrefetch: true,
      };
    }

    return {
      state: 'ready',
      type: 'novel',
      html: (title ? `<h1>${title}</h1>\n` : '') + content,
    };
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    if (pageNo > 1) return [];
    const trimmed = searchTerm.trim();
    if (!trimmed) return [];

    try {
      const url = `${this.site}/?s=${encodeURIComponent(trimmed)}`;
      const html = await fetchText(url);
      if (!html) return [];

      const $ = loadCheerio(html);
      const novels: Plugin.NovelItem[] = [];
      const seen = new Set<string>();

      $('a[href*="/truyen/"]').each((_, el) => {
        const href = $(el).attr('href');
        const name = $(el).text().trim();
        if (!href || !name) return;
        if (!href.match(/truyen\/[^/]+\/$/)) return;
        if (seen.has(href)) return;
        seen.add(href);
        novels.push({ name, path: href.replace(this.site, '') });
      });

      return novels;
    } catch {
      return [];
    }
  }

  resolveUrl(path: string): string {
    return this.site + path;
  }
}

export default new KhotruyenchuPlugin();
