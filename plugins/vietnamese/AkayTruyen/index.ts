import { fetchApi } from '@libs/fetch';
import { CheerioAPI, load } from 'cheerio';
import { Plugin } from '@/types/plugin';
import { NovelStatus } from '@libs/novelStatus';
import { isUrlAbsolute } from '@libs/isAbsoluteUrl';

class AkayTruyenPlugin implements Plugin.PagePlugin {
  id = 'akaytruyen.com';
  name = 'AkayTruyen';
  version = '1.0.5';
  icon = 'src/vi/akaytruyen/favicon.png';
  site = 'https://akaytruyen.com';

  async popularNovels(
    pageNo: number,
    { filters }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    if (pageNo > 1) return [];
    const res = await fetchApi(this.site);
    const html = await res.text();
    const $ = load(html);
    const novels: Plugin.NovelItem[] = [];

    $('.story-item').each((_, el) => {
      const name = $(el).find('h3').text() || '';
      const path = $(el).find('a').attr('href') || '';
      const cover = $(el).find('img').attr('src') || '';

      if (name && path) {
        novels.push({ name, path, cover });
      }
    });

    return novels;
  }

  async parseNovel(
    novelPath: string,
  ): Promise<Plugin.SourceNovel & { totalPages: number }> {
    const url = new URL(novelPath, this.site);
    url.searchParams.set('old_first', '1');
    const res = await fetchApi(url.toString());
    const html = await res.text();
    const $ = load(html);

    const author = $('.story-detail__bottom--info p')
      .first()
      .find('a')
      .text()
      .trim();

    const genres: string[] = [];
    $('.story-detail__bottom--info .d-flex.align-items-center.mb-1.flex-wrap')
      .first()
      .find('a')
      .each((_, el) => {
        const genre = $(el).text().replace(/,/g, '').trim();
        if (genre) {
          genres.push(genre);
        }
      });

    const statusText = $('.story-detail__bottom--info p')
      .last()
      .find('span')
      .text()
      .trim();
    let status: string = NovelStatus.Ongoing;
    if (statusText.toLowerCase() === 'full') {
      status = NovelStatus.Completed;
    }

    const name = $('h3.story-name').text() || '';
    const cover = $('meta[property="og:image"]').attr('content') || '';
    const summary = $('.story-detail__top--desc.px-3').text() || '';

    // '.pagination-btn.story-ajax-paginate:not(.pagination-arrow)'
    let totalPages = 1;
    $('.pagination-btn.story-ajax-paginate:not(.pagination-arrow)').each(
      (_, el) => {
        const page = Number($(el).text().trim());
        if (!isNaN(page) && page > totalPages) {
          totalPages = page;
        }
      },
    );

    const chapters = this.parseChapters($);

    return {
      name,
      cover,
      author,
      genres: genres.join(','),
      status,
      summary: summary.trim(),
      path: novelPath,
      totalPages,
      chapters,
    };
  }

  async parsePage(novelPath: string, page: string): Promise<Plugin.SourcePage> {
    const url = new URL(novelPath, this.site);
    url.searchParams.set('page', page);
    url.searchParams.set('old_first', '1');
    const res = await fetchApi(url.toString());
    const html = await res.text();
    const $ = load(html);
    const chapters = this.parseChapters($);
    return { chapters };
  }

  parseChapters($: CheerioAPI): Plugin.ChapterItem[] {
    const chapters: Plugin.ChapterItem[] = [];
    $('.chapter-card-mobile').each((_, el) => {
      const chapterPath = $(el).find('a').attr('href') || '';
      const chapterTitle = $(el).find('.chapter-title').text().trim() || '';
      const chapterNumber = Number($(el).attr('data-chapter') || '');
      if (chapterPath && chapterTitle) {
        if (isNaN(chapterNumber)) {
          chapters.push({ name: chapterTitle, path: chapterPath });
        } else {
          chapters.push({
            name: chapterTitle,
            path: chapterPath,
            chapterNumber,
          });
        }
      }
    });
    return chapters;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const res = await fetchApi(chapterPath);
    const html = await res.text();
    const $ = load(html);

    const chapterText = $('#chapter-content').html() || '';
    return chapterText;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    if (pageNo > 1) return [];
    const url = new URL('/tim-kiem', this.site);
    url.searchParams.set('key_word', searchTerm);
    const res = await fetchApi(url.toString());
    const html = await res.text();
    const $ = load(html);
    const novels: Plugin.NovelItem[] = [];
    $('.story-item-list').each((_, el) => {
      const name = $(el).find('.story-name').text() || '';
      const path = $(el).find('.story-name').attr('href') || '';
      const cover = $(el).find('.story-item-list__image img').attr('src') || '';
      if (name && path) {
        novels.push({ name, path, cover });
      }
    });

    return novels;
  }

  resolveUrl(path: string, isNovel?: boolean): string {
    if (isUrlAbsolute(path)) {
      return path;
    } else {
      return this.site + path;
    }
  }

  filters = {};
}

export default new AkayTruyenPlugin();
