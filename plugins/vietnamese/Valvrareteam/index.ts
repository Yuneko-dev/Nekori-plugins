import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { CheerioAPI, load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

class ValvrareTeamPlugin implements Plugin.PluginBase {
  id = 'valvrareteam';
  name = 'Valvrareteam';
  icon = 'src/vi/valvrareteam/icon.png';
  site = 'https://valvrareteam.net';
  version = '1.0.13';

  api = 'https://val-ssr-2kzit.ondigitalocean.app/api';

  // private allNovels: Plugin.NovelItem[] = [];
  // private isLoaded = this.loadAllNovels();

  private normalizeInline(text = '') {
    return text
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  async popularNovels(
    pageNo: number,
    { filters, showLatestNovels }: Plugin.PopularNovelsOptions<any>,
  ): Promise<Plugin.NovelItem[]> {
    return this.fetchPageNovel(pageNo);
    /*
    await this.isLoaded;
    if (pageNo > 1) {
      return [];
    } else {
      return this.allNovels;
    }
    */
  }

  async fetchPageNovel(pageNo: number): Promise<Plugin.NovelItem[]> {
    const url = `${this.site}/danh-sach-truyen/trang/${pageNo}`;
    const res = await fetchApi(url);
    const html = await res.text();
    const $ = loadCheerio(html);

    const novels: Plugin.NovelItem[] = [];

    $('.nd-novel-card').each((i, card) => {
      const $card = $(card);
      const title = $card.find('.nd-novel-title').text().trim();
      const thumbnail = $card.find('.nd-novel-image img').attr('src');
      let path = $card.find('.nd-novel-title-link').attr('href');
      if (path && !path.startsWith('/')) {
        path = '/' + path;
      }

      if (title && path) {
        novels.push({
          name: title,
          cover: thumbnail || defaultCover,
          path: path,
        });
      }
    });

    return novels;
  }

  queryNovelStatus(html: string) {
    let status: string = NovelStatus.Unknown;
    // class="rd-status-badge-inline rd-status-ongoing"
    if (html.includes(`class="rd-status-badge-inline rd-status-completed"`)) {
      status = NovelStatus.Completed;
    } else if (
      html.includes(`class="rd-status-badge-inline rd-status-ongoing"`)
    ) {
      status = NovelStatus.Ongoing;
    } else if (
      html.includes(`class="rd-status-badge-inline rd-status-hiatus"`)
    ) {
      status = NovelStatus.OnHiatus;
    }
    return status;
  }

  private extractAuthors($: CheerioAPI) {
    let author = '';
    let illustrator = '';

    $('.rd-info-row').each((_, row) => {
      const $row = $(row);
      const label = this.normalizeInline($row.find('.rd-info-label').text())
        .toLowerCase()
        .replace(':', '');
      const value = this.normalizeInline($row.find('.rd-info-value').text());

      if (label === 'tác giả') {
        author = value;
      }

      if (label === 'họa sĩ') {
        illustrator = value;
      }
    });

    return { author, illustrator };
  }

  private extractChaptersByVolume($: CheerioAPI) {
    const chapters: Plugin.ChapterItem[] = [];

    $('.module-container').each((_, moduleElement) => {
      const $module = $(moduleElement);
      const volumeName = this.normalizeInline(
        $module.find('.module-title').first().text(),
      );

      const templateId = $module
        .find('.module-content-wrapper > template[id^="B:"]')
        .attr('id');

      let $source = $module;
      if (templateId) {
        const idNumber = templateId.split(':')[1];
        $source = $(`#S\\:${idNumber}`);
      }

      $source.find('.module-chapter-item').each((__, item) => {
        const $item = $(item);
        const chapterTitle = this.normalizeInline(
          $item.find('.chapter-title-link').first().text(),
        ).replace(/([^\s])\(/g, '$1 (');
        const date = this.normalizeInline(
          $item.find('.novel-detail-chapter-date').first().text(),
        );
        let chapterPath =
          $item.find('a.chapter-title-link').attr('href') || null;

        if (chapterPath && !chapterPath.startsWith('/')) {
          chapterPath = '/' + chapterPath;
        }

        const loginRequired = $item.find('.login-required-text').length > 0;

        if (chapterTitle && chapterPath) {
          const [dd, mm, yyyy] = date.split('/');
          const correct = `${yyyy}-${mm}-${dd}`;
          chapters.push({
            name: loginRequired ? '🔒 ' + chapterTitle : chapterTitle,
            releaseTime: correct,
            path: chapterPath,
            page: volumeName || undefined,
          });
        }
      });
    });

    return chapters;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const url = this.site + novelPath;
    const res = await fetchApi(url);
    const html = await res.text();
    const $ = loadCheerio(html);

    const title = this.normalizeInline(
      $('.rd-novel-title').first().clone().children().remove().end().text(),
    );
    const { author } = this.extractAuthors($);
    const genres = $('.rd-genres-list .rd-genre-tag')
      .map((_, el) => this.normalizeInline($(el).text()))
      .get()
      .filter(Boolean)
      .join(', ');

    const descriptionParagraphs = $('.rd-description-content p')
      .map((_, p) => this.normalizeInline($(p).text()))
      .get()
      .filter(Boolean);
    const description =
      descriptionParagraphs.length > 0
        ? descriptionParagraphs.join('\\n\\n')
        : this.normalizeInline($('.rd-description-content').first().text());

    const thumbnail = $('.rd-cover-image').attr('src') || defaultCover;

    let chapters = this.extractChaptersByVolume($);

    const novelId = this.parseNovelId(html);
    console.log('Extracted novel ID:', novelId);

    console.log('Chapters extracted from main page:', chapters);

    if (chapters.length === 0 && novelId) {
      chapters = await this.fallbackGetNovelChapters(novelId);
    }

    const status = this.queryNovelStatus(html);

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: title || 'Untitled',
      cover: thumbnail,
      summary: description,
      author: author,
      genres: genres,
      chapters: chapters,
      status,
    };

    console.log('Parsed novel:', novel);

    return novel;
  }

  parseNovelId(html: string) {
    return this.getFrom(html, '{\\"novel\\":{\\"_id\\":\\"', '\\",');
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const url = this.site + chapterPath;
    const res = await fetchApi(url);
    const html = await res.text();
    const $ = loadCheerio(html);
    if ($('.chapter-content').length === 0) {
      throw new Error(
        'Không thể tải nội dung chương này. Hãy thử đăng nhập WebView trước.',
      );
    }
    return $('.chapter-content').first().html()?.trim() ?? '';
  }

  /*
  async loadAllNovels() {
    let page = 1;
    let n = [];
    do {
      try {
        n = await this.fetchPageNovel(page);
        this.allNovels.push(...n);
        page++;
      } catch (e) {
        break;
      }
    } while (n.length > 0);
  }
    */

  /*
  async searchNovelsOld(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    // await this.isLoaded;
    // pagination for search results
    const results = this.allNovels.filter(novel =>
      novel.name.toLowerCase().includes(searchTerm.toLowerCase()),
    );

    const PAGE_SIZE = 20;
    const startIndex = (pageNo - 1) * PAGE_SIZE;

    return results.slice(startIndex, startIndex + PAGE_SIZE);
  }
    */

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    if (pageNo > 1) {
      return [];
    }
    const url = `${this.api}/novels/search?title=${encodeURIComponent(searchTerm)}`;
    const res = await fetchApi(url);
    const data = await res.json();

    const novels: Plugin.NovelItem[] = data.map(
      (novel: {
        _id: string;
        title: string;
        author: string;
        illustration: string;
        // status, totalChapters
      }) => ({
        name: novel.title,
        cover: novel.illustration || defaultCover,
        // Idk???
        path: `/truyen/${this.normalizeName(novel.title, novel._id)}`,
      }),
    );

    return novels;
  }

  getFrom(str: string, startToken: string, endToken: string) {
    const start = str.indexOf(startToken) + startToken.length;
    if (start < startToken.length) return '';
    const lastHalf = str.substring(start);
    const end = lastHalf.indexOf(endToken);
    if (end === -1) {
      throw new Error(
        'Could not find endToken `' + endToken + '` in the given string.',
      );
    }
    return lastHalf.substring(0, end);
  }

  normalizeName(name: string, id: string) {
    id = id.slice(-8);
    const map: Record<string, string> = {
      'a': 'aáàảãạăắằẳẵặâấầẩẫậ',
      'e': 'eéèẻẽẹêếềểễệ',
      'i': 'iíìỉĩị',
      'o': 'oóòỏõọôốồổỗộơớờởỡợ',
      'u': 'uúùủũụưứừửữự',
      'y': 'yýỳỷỹỵ',
      'd': 'dđ',
    };
    return (
      name
        .toLowerCase()
        .replace(/./g, char => {
          for (const key in map) {
            if (map[key]?.includes(char)) {
              return key;
            }
          }
          return char;
        })
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') +
      '-' +
      id
    );
  }

  async fallbackGetNovelChapters(novelId: string) {
    const url = `${this.api}/novels/${novelId}/complete?skipViewTracking=true`;
    const res = await fetchApi(url);
    const data = (await res.json()) as {
      novel: {
        _id: string;
        title: string;
        description: string;
        alternativeTitles: string[];
        genres: string[];
        author: string;
        illustration: string;
        status: string;
        createdAt: string;
        updatedAt: string;
        views: {
          total: number;
          daily: {
            date: string;
            count: number;
            _id: string;
          }[];
        };
        active: {
          translator: string[];
          editor: string[];
          proofreader: never[];
          pj_user: never[];
        };
        novelBalance: number;
        inactive: {
          editor: never[];
          proofreader: never[];
          translator: never[];
          pj_user: never[];
        };
        novelBudget: number;
        wordCount: number;
      };
      modules: {
        _id: string;
        title: string;
        illustration: string;
        chapters: {
          _id: string;
          moduleId: string;
          title: string;
          order: number;
          createdAt: string;
          updatedAt: string;
          mode: string;
          chapterBalance?: number;
        }[];
        order: number;
      }[];
      gifts: {
        _id: string;
        name: string;
        icon: string;
        price: number;
        order: number;
        count: number;
      }[];
      interactions: {
        totalLikes: number;
        totalRatings: number;
        totalBookmarks: number;
        averageRating: string;
        userInteraction: {
          liked: boolean;
          rating: null;
          bookmarked: boolean;
          followed: boolean;
        };
      };
      contributionHistory: never[];
    };
    const chapters: Plugin.ChapterItem[] = [];
    for (const module of data.modules) {
      for (const chapter of module.chapters) {
        chapters.push({
          name: chapter.title,
          releaseTime: chapter.createdAt,
          path: `/truyen/${this.normalizeName(data.novel.title, data.novel._id)}/chuong/${this.normalizeName(chapter.title, chapter._id)}`,
          page: module.title,
        });
      }
    }
    return chapters;
  }

  resolveUrl(path: string, isNovel?: boolean): string {
    return this.site + path;
  }
}

export default new ValvrareTeamPlugin();
