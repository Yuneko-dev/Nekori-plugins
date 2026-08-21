import { fetchText } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';
import { ContentType } from '@libs/pluginMetadata';

class PhimFunPlugin implements Plugin.PluginBase {
  id = 'yuneko.phimfun';
  name = 'PhimFun';
  icon = 'src/vi/phimfun/icon.png';
  site = 'https://phimfun.net';
  version = '1.0.2';
  contentType = ContentType.VIDEO;

  imageRequestInit: Plugin.ImageRequestInit = {
    headers: {
      Referer: this.site + '/',
    },
  };

  async popularNovels(
    pageNo: number,
    options: Plugin.PopularNovelsOptions<any>,
  ): Promise<Plugin.NovelItem[]> {
    const url = `${this.site}/the-loai/phim-moi-${pageNo}`;
    const html = await fetchText(url);
    const $ = loadCheerio(html);

    const novels: Plugin.NovelItem[] = [];

    $('.TPostMv').each((_, el) => {
      const $el = $(el);
      const $a = $el.find('a').first();
      const path = $a.attr('href')?.replace(this.site, '') || '';
      if (!path) return;

      let name = $el.find('.Title').first().text() || $a.attr('title');
      name = name?.trim() || '';
      if (!name) return;

      const $img = $el.find('img').first();
      let cover =
        $img.attr('src') ||
        $img.attr('data-src') ||
        $img.attr('data-lazy-src') ||
        defaultCover;

      if (!cover.startsWith('http')) {
        cover = this.site + cover;
      }

      novels.push({
        name,
        path,
        cover,
      });
    });

    return novels;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    if (pageNo > 1) return [];
    const term = encodeURIComponent(searchTerm.trim());
    const url = `${this.site}/search?k=${term}${pageNo > 1 ? '&page=' + pageNo : ''}`;
    const html = await fetchText(url);
    const $ = loadCheerio(html);

    const novels: Plugin.NovelItem[] = [];

    $('.TPostMv').each((_, el) => {
      const $el = $(el);
      const $a = $el.find('a').first();
      const path = $a.attr('href')?.replace(this.site, '') || '';
      if (!path) return;

      let name = $el.find('.Title').first().text() || $a.attr('title');
      name = name?.trim() || '';
      if (!name) return;

      const $img = $el.find('img').first();
      let cover =
        $img.attr('src') ||
        $img.attr('data-src') ||
        $img.attr('data-lazy-src') ||
        defaultCover;

      if (!cover.startsWith('http')) {
        cover = this.site + cover;
      }

      novels.push({
        name,
        path,
        cover,
      });
    });

    return novels;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const url = this.site + novelPath;
    const html = await fetchText(url);
    const $ = loadCheerio(html);

    let name = $('.Title').first().text().trim();
    if (!name) {
      name = $('meta[property="og:title"]').attr('content')?.trim() || '';
    }

    let cover = $('.TPostBg').attr('src') || $('.Image figure img').attr('src');
    if (!cover) {
      cover = $('meta[property="og:image"]').attr('content') || defaultCover;
    }
    if (cover && !cover.startsWith('http')) {
      cover = this.site + cover;
    }

    let description = $('.Description p').first().text().trim();
    if (!description) {
      description = $('meta[property="og:description"]').attr('content') || '';
    }

    const genres: string[] = [];
    $('.Genre.phayCuoiCau a').each((_, el) => {
      const title = $(el).text().trim();
      if (title) genres.push(title);
    });

    const statusText = $('.Status, .StatusTxt, .Qlty').text().toLowerCase();
    let status: string = NovelStatus.Unknown;

    if (
      statusText.includes('full') ||
      statusText.includes('hoàn thành') ||
      statusText.includes('completed')
    ) {
      status = NovelStatus.Completed;
    } else if (
      statusText.includes('tập') ||
      statusText.includes('đang') ||
      statusText.includes('ongoing') ||
      statusText.includes('trailer') ||
      statusText.includes('/')
    ) {
      status = NovelStatus.Ongoing;
    }

    const author =
      $(".phayCuoiCau a[href*='/dao-dien/']").first().text().trim() ||
      'Đang cập nhật';

    const chapters: Plugin.ChapterItem[] = [];

    const watchUrl = url.replace('/phim/', '/xem-phim/');
    const watchHtml = await fetchText(watchUrl);
    const $watch = loadCheerio(watchHtml);

    $watch('section.SeasonBx').each((_, section) => {
      const $section = $(section);
      const title = $section.find('.Title').text().trim();
      if (title.toLowerCase().includes('tập')) {
        $section.find('.halim-list-eps li a').each((_, el) => {
          chapters.push({
            name: $(el).text().trim(),
            path: $(el).attr('href')?.replace(this.site, '') || '',
          });
        });
      }
    });

    if (chapters.length === 0) {
      const $fullLink = $watch('.halim-list-eps li a').first();
      if ($fullLink.length > 0) {
        chapters.push({
          name: $fullLink.text().trim(),
          path: $fullLink.attr('href')?.replace(this.site, '') || '',
        });
      } else {
        chapters.push({
          name: 'Full',
          path: watchUrl.replace(this.site, ''),
        });
      }
    }

    return {
      path: novelPath,
      name,
      cover,
      summary: description,
      author,
      genres: genres.join(', '),
      status,
      chapters,
    };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const url = this.site + chapterPath;
    const html = await fetchText(url);
    const $ = loadCheerio(html);

    let videoUrl = $('#iframeStream').attr('src');

    if (!videoUrl) {
      // Find inside sections like chap.js
      $(`section.SeasonBx`).each((_, section) => {
        const title = $(section).find('.Title').text().trim();
        if (title.toLowerCase().includes('máy chủ')) {
          $(section)
            .find('.halim-list-eps li a')
            .each((_, el) => {
              if (
                !videoUrl &&
                $(el).text().trim().toLowerCase().includes('gốc')
              ) {
                videoUrl = $(el).attr('href');
              }
            });
        }
      });
    }

    if (!videoUrl) {
      return '<p style="text-align:center;padding:16px;">Không tìm thấy video.</p><meta id="no-cache-marker"/><meta id="no-prefetch-marker"/>';
    }

    const isIframe = !videoUrl.includes('.m3u8');

    return [
      '<meta name="lnreader-chapter-type" content="video">',
      '<meta name="lnreader-video-mode" content="direct">',
      `<meta name="lnreader-video-type" content="${isIframe ? 'iframe' : 'm3u8'}">`,
      `<meta name="lnreader-video-url" content="${videoUrl}">`,
      '<meta id="no-cache-marker"/>',
      '<meta id="no-prefetch-marker"/>',
    ].join('\n');
  }

  resolveUrl(path: string, isNovel?: boolean): string {
    return this.site + path;
  }
}

export default new PhimFunPlugin();
