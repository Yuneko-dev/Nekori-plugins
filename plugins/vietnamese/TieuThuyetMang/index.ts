import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';
import { Filters } from '@libs/filterInputs';
import { set } from '@libs/cookie';
import { encodeHtmlEntities } from '@libs/utils';

type TieuThuyetMangStory = {
  slug?: string;
  title?: string;
  coverUrl?: string;
};

type TieuThuyetMangSearchResponse = {
  stories?: TieuThuyetMangStory[];
};

class TieuThuyetMangPlugin implements Plugin.PluginBase {
  id = 'tieuthuyetmang.com';
  name = 'Tiểu Thuyết Mạng';
  icon = 'src/vi/tieuthuyetmang/icon.png';
  site = 'https://tieuthuyetmang.com';
  version = '1.0.8';

  imageRequestInit: Plugin.ImageRequestInit = {
    headers: {
      Referer: this.site,
    },
  };

  private beforeRequest() {
    return set(this.site, {
      name: 'site_access_gate',
      value: '1',
      path: '/',
      httpOnly: true,
      secure: true,
    });
  }

  private normalizeCoverUrl(rawUrl?: string): string {
    if (!rawUrl) {
      return defaultCover;
    }

    try {
      const url = new URL(rawUrl, this.site);
      if (url.pathname.startsWith('/_next/image')) {
        const encodedOriginal = url.searchParams.get('url');
        if (encodedOriginal) {
          return new URL(
            decodeURIComponent(encodedOriginal),
            this.site,
          ).toString();
        }
      }
      return url.toString();
    } catch {
      return rawUrl;
    }
  }

  private normalizeNovelPath(rawPath: string): string {
    if (!rawPath) {
      return rawPath;
    }

    try {
      const url = new URL(rawPath, this.site);
      url.pathname = url.pathname.replace(/\/nghe\/\d+\/?$/, '');
      return url.pathname;
    } catch {
      return rawPath;
    }
  }

  private normalizeStatus(statusText: string): string {
    const status = statusText.toLowerCase();

    if (status.includes('hoàn')) {
      return NovelStatus.Completed;
    }
    if (status.includes('tạm')) {
      return NovelStatus.OnHiatus;
    }
    if (status.includes('đang') || status.includes('tiến hành')) {
      return NovelStatus.Ongoing;
    }

    return NovelStatus.Unknown;
  }

  private normalizeEscapedJson(text: string): string {
    return text
      .replace(/\\"/g, '"')
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\\\/g, '\\');
  }

  private parseChaptersFromHtml(
    html: string,
    novelPath: string,
  ): Plugin.ChapterItem[] {
    const escapedMatch = html.match(
      // @ts-expect-error
      /\\"chapters\\":\[(.*?)\],\\"contentDescription\\"/s,
    );
    // @ts-expect-error
    const plainMatch = html.match(/"chapters":\[(.*?)\],"contentDescription"/s);

    let rawArray = null;
    if (escapedMatch?.[1]) {
      rawArray = `[${this.normalizeEscapedJson(escapedMatch[1])}]`;
    } else if (plainMatch?.[1]) {
      rawArray = `[${plainMatch[1]}]`;
    }

    if (!rawArray) return [];

    let chapters: any[];
    try {
      chapters = JSON.parse(rawArray);
    } catch {
      return [];
    }

    return chapters
      .map(c => ({
        chapterNumber: c.chapterNumber,
        name: `${c.isLocked ? '🔒 ' : '📖 '}Chương ${c.chapterNumber}: ${c.title}`,
        path: `${novelPath}/doc/${c.chapterNumber}`,
      }))
      .sort((a, b) => a.chapterNumber - b.chapterNumber);
  }

  async popularNovels(
    pageNo: number,
    options: Plugin.PopularNovelsOptions<Filters>,
  ): Promise<Plugin.NovelItem[]> {
    void options;
    const response = await fetchApi(
      `https://be.tieuthuyetmang.com/api/stories?sort=hot&page=${pageNo}&per_page=20`,
    );
    const json = (await response.json()) as {
      data: {
        id: string;
        title: string;
        slug: string;
        coverUrl: string;
        description: null;
        excerpt: string | null;
        contentDescription: string;
        status: string;
        viewCount: number;
        author: {
          id: string;
          name: string;
          slug: string;
        };
        categories: {
          id: string;
          name: string;
          slug: string;
        }[];
        chapters_count: number;
        latestChapter: {
          title: string;
          chapterNumber: number;
        };
        ratings_count: number;
        avgRating: number;
        createdAt: string;
        updatedAt: string;
      }[];
      total: number;
      per_page: number;
      current_page: number;
      last_page: number;
    };
    const novels: Plugin.NovelItem[] = [];
    json.data.forEach(item => {
      if (!item.slug || !item.title) {
        return;
      }
      novels.push({
        name: item.title,
        path: `/truyen/${item.slug}`,
        cover: this.normalizeCoverUrl(item.coverUrl),
      });
    });
    return novels;
  }

  /*
  async popularNovelsOld(
    pageNo: number,
    options: Plugin.PopularNovelsOptions<Filters>,
  ): Promise<Plugin.NovelItem[]> {
    void options;
    if (pageNo > 1) {
      return [];
    }
    const url = new URL('/truyen', this.site);
    url.searchParams.set('editor_pick', '1');
    url.searchParams.set('sort', 'new');

    const response = await fetchApi(url.toString());
    const html = await response.text();
    const $ = loadCheerio(html);

    const novels: Plugin.NovelItem[] = [];

    $('article').each((_, article) => {
      const item = $(article);
      const title = item.find('h3').first().text().trim();
      const rawPath =
        item.find('a[href*="/truyen/"]').first().attr('href') || '';
      const rawCover = item.find('img').first().attr('src') || '';
      const path = this.normalizeNovelPath(rawPath);

      if (!title || !path.startsWith('/truyen/')) {
        return;
      }

      novels.push({
        name: title,
        path,
        cover: this.normalizeCoverUrl(rawCover),
      });
    });

    return novels;
  }
    */

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    await this.beforeRequest();
    const response = await fetchApi(new URL(novelPath, this.site).toString());
    if (!response.ok) {
      throw new Error(
        `Failed to fetch novel page: ${response.status} ${response.statusText}`,
      );
    }
    const html = await response.text();
    const $ = loadCheerio(html);

    const title = $('h1').first().text().trim();
    const summary = $('.prose').text().trim() || '';

    const statusText =
      $('h1').next('div').find('span').first().text().trim() ||
      $('span')
        .filter((_, el) => $(el).text().toLowerCase().includes('trạng thái'))
        .first()
        .text()
        .trim();

    const genres = $('h1')
      .next('div')
      .find('span')
      .slice(1)
      .map((_, el) => $(el).text().trim())
      .get()
      .filter(Boolean)
      .join(',');

    const author = $('a[href*="/tac-gia/"]').first().text().trim();

    const thumbnailRaw = $('h1')
      .closest('div.flex-1.min-w-0')
      .prev()
      .find('img')
      .first()
      .attr('src');

    const chapters = this.parseChaptersFromHtml(html, novelPath);

    return {
      path: this.normalizeNovelPath(novelPath),
      name: title || 'Untitled',
      cover: this.normalizeCoverUrl(thumbnailRaw),
      summary,
      author,
      genres,
      status: statusText
        ? this.normalizeStatus(statusText)
        : NovelStatus.Unknown,
      chapters,
    };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    await this.beforeRequest();
    const response = await fetchApi(new URL(chapterPath, this.site).toString());
    const html = await response.text();
    const $ = loadCheerio(html);

    const chapterContent = $('.whitespace-pre-wrap').first();

    if (!chapterContent?.text().trim()) {
      throw new Error(
        'Không thể tải nội dung chương này. Hãy thử đăng nhập WebView trước.',
      );
    }

    return `<div>${chapterContent
      .html()
      ?.trim()
      .split('\n')
      .map(line => `<p>${encodeHtmlEntities(line)}</p>`)
      .join('<br>')}<div>`;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    if (!searchTerm.trim() || pageNo > 1) {
      return [];
    }

    const api = new URL('https://be.tieuthuyetmang.com/api/search');
    api.searchParams.set('q', searchTerm);

    const response = await fetchApi(api.toString());
    const data = (await response.json()) as TieuThuyetMangSearchResponse;

    const novels: Plugin.NovelItem[] = [];

    (data.stories || []).forEach(item => {
      const slug = item.slug?.trim();
      const title = item.title?.trim();

      if (!slug || !title) {
        return;
      }

      novels.push({
        name: title,
        path: `/truyen/${slug}`,
        cover: this.normalizeCoverUrl(item.coverUrl),
      });
    });

    return novels;
  }

  resolveUrl(path: string, isNovel?: boolean): string {
    return this.site + path;
  }

  filters = undefined;
}

export default new TieuThuyetMangPlugin();
