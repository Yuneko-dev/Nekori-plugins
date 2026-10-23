import { defaultCover } from '@libs/defaultCover';
import { fetchText } from '@libs/fetch';
import { NovelStatus } from '@libs/novelStatus';
import { NekoriBasePlugin } from '@nekori/plugin';
import { ContentType, ContentWarning } from '@nekori/pluginMetadata';
import { load as loadCheerio } from 'cheerio';

import { Plugin } from '@/types/plugin';

class TwkanPlugin extends NekoriBasePlugin {
  id = 'twkan.com';
  name = 'Twkan';
  icon = 'icon.png';
  site = 'https://twkan.com';
  version = '1.0.0';
  contentType = ContentType.NOVEL;
  contentWarning = ContentWarning.SAFE;

  private chapterLinkRegex = /txt\/\d+\/\d+$/;

  private statusTextToEnum(status: string): string {
    const s = status.trim();
    if (s === '完結' || s === '完本' || s === '已完結')
      return NovelStatus.Completed;
    if (s === '連載' || s === '连载' || s === 'Đang cập nhật')
      return NovelStatus.Ongoing;
    if (s === '暫停' || s === '暂停') return NovelStatus.OnHiatus;
    return NovelStatus.Unknown;
  }

  async popularNovels(
    pageNo: number,
    { showLatestNovels }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const url = showLatestNovels
      ? `${this.site}/last`
      : `${this.site}/novels/newhot_0_0_${pageNo}.html`;

    const html = await fetchText(url);
    if (!html) return [];

    const $ = loadCheerio(html);
    const novels: Plugin.NovelItem[] = [];

    if (showLatestNovels) {
      $('ul.recentupdate2 li').each((_, el) => {
        const $el = $(el);
        const novelLink = $el.find('a[href*="/book/"]').first().attr('href');
        const name = $el.find('a[href*="/book/"]').first().text().trim();
        if (!novelLink || !name) return;
        novels.push({ name, path: novelLink.replace(this.site, '') });
      });
    } else {
      $('ul#article_list_content li').each((_, el) => {
        const $el = $(el);
        const novelLink = $el.find('.newnav h3 a').attr('href');
        const name = $el.find('.newnav h3 a').text().trim();
        const cover =
          $el.find('.imgbox img').attr('data-src') ||
          $el.find('.imgbox img').attr('src') ||
          '';
        if (!novelLink || !name) return;
        novels.push({
          name,
          path: novelLink.replace(this.site, ''),
          cover: cover.startsWith('/')
            ? this.site + cover
            : cover || defaultCover,
        });
      });
    }

    return novels;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const html = await fetchText(this.site + novelPath);
    if (!html) {
      throw new Error('Không thể tải trang sách twkan.com');
    }

    const $ = loadCheerio(html);

    const ogTitle = $('meta[property="og:title"]').attr('content') || '';
    const ogAuthor =
      $('meta[property="og:novel:author"]').attr('content') || '';
    const ogCategory =
      $('meta[property="og:novel:category"]').attr('content') || '';
    const ogStatus =
      $('meta[property="og:novel:status"]').attr('content') || '';
    const ogDesc = $('meta[property="og:description"]').attr('content') || '';
    const ogImage = $('meta[property="og:image"]').attr('content') || '';

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name:
        ogTitle || $('h1 a, h1').first().text().trim() || 'Không có tiêu đề',
      cover: ogImage || defaultCover,
      summary: ogDesc || '',
      author: ogAuthor || '',
      artist: '',
      genres: ogCategory || '',
      status: this.statusTextToEnum(ogStatus),
      rating: 0,
      chapters: [],
    };

    const chapters: Plugin.ChapterItem[] = [];
    let index = 0;
    $('ul.qustime li a, .qustime li a').each((_, el) => {
      const href = $(el).attr('href');
      const name = $(el).find('span').text().trim() || $(el).text().trim();
      const releaseTime = $(el).find('small').text().trim() || null;
      if (!href || !name) return;
      if (!this.chapterLinkRegex.test(href)) return;
      index += 1;
      chapters.push({
        name,
        path: href.replace(this.site, ''),
        releaseTime,
        chapterNumber: index,
      });
    });

    novel.chapters = chapters;
    return novel;
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

    const title = $('h1').first().text().trim();

    const content = $('#txtcontent0').first();
    content.find('.txtad, script, style, ins, iframe').remove();
    const chapterHtml = content.html() || '';

    if (!chapterHtml && !title) {
      return {
        state: 'checkpoint',
        type: 'novel',
        html: '<div>Không tìm thấy nội dung chương. Có thể trang bị Cloudflare chặn. Vui lòng mở trong WebView để xác thực và tải lại.</div>',
        checkpointMessage: 'Không có nội dung chương, cần xác thực qua WebView',
        noCache: true,
        noPrefetch: true,
      };
    }

    return {
      state: 'ready',
      type: 'novel',
      html: (title ? `<h1>${title}</h1>\n` : '') + chapterHtml,
    };
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    if (pageNo > 1) return [];
    const trimmed = searchTerm.trim();
    if (!trimmed) return [];
    const url = `${this.site}/search?searchkey=${encodeURIComponent(trimmed)}&searchtype=all`;

    const html = await fetchText(url);
    if (!html) return [];

    const $ = loadCheerio(html);
    const novels: Plugin.NovelItem[] = [];
    const seen = new Set<string>();

    $('a[href*="/book/"]').each((_, el) => {
      const href = $(el).attr('href');
      const name = $(el).text().trim();
      if (!href || !name) return;
      if (!href.match(/book\/\d+\.html$/)) return;
      if (seen.has(href)) return;
      seen.add(href);
      novels.push({ name, path: href.replace(this.site, '') });
    });

    return novels;
  }

  resolveUrl(path: string): string {
    return this.site + path;
  }
}

export default new TwkanPlugin();
