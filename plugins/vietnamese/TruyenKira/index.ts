import { defaultCover } from '@libs/defaultCover';
import { fetchApi } from '@libs/fetch';
import { NovelStatus } from '@libs/novelStatus';
import { NekoriBasePlugin } from '@nekori/plugin';
import { ContentType, ContentWarning } from '@nekori/pluginMetadata';
import { encodeHtmlEntities } from '@nekori/utils';

import { Plugin } from '@/types/plugin';

import filters from './filters';

const SITE = 'https://truyenkira.net';
const API = SITE.replace('://', '://api.');

const CHAPTERS_PER_VOLUME = 50;

type ComicListItem = {
  id: string;
  title: string;
  thumbnail?: string | null;
  status?: string;
  type?: string;
};

type ComicListResponse = {
  comics: ComicListItem[];
  current_page: number;
  total_pages: number;
};

type ComicDetail = {
  id: string;
  title: string;
  thumbnail?: string | null;
  description?: string | null;
  author?: { name?: string } | null;
  authors?: string;
  status?: string;
  type?: string;
  genres?: { id: string; name: string }[];
  other_names?: string | null;
  chapters?: {
    id: number;
    name: string;
    coinPrice?: number;
    unlockAt?: string;
  }[];
};

type ChapterContentResponse = {
  type?: string;
  images?: { page: number; src: string }[];
  textContent?: string | null;
  chapter_name?: string;
};

class TruyenKiraPlugin extends NekoriBasePlugin {
  id = 'truyenkira.vn';
  name = 'TruyenKira';
  site = SITE;
  icon = 'icon.png';
  version = '1.0.0';
  customCSS = 'style.css';
  customJS = 'index.js';
  contentType = ContentType.MIXED;
  contentWarning = ContentWarning.SAFE;
  filters = filters;

  private readonly requestHeaders = {
    Accept: 'application/json',
    Referer: SITE + '/',
    Origin: SITE,
  };

  private async fetchJson<T>(url: string): Promise<T> {
    const res = await fetchApi(url, { headers: this.requestHeaders });
    if (!res.ok) {
      throw new Error(`Request failed ${res.status}: ${url}`);
    }
    return (await res.json()) as T;
  }

  private toNovelItem(c: ComicListItem): Plugin.NovelItem {
    return {
      name: c.title,
      path: `/comics/${c.id}`,
      cover: c.thumbnail || defaultCover,
    };
  }

  async popularNovels(
    pageNo: number,
    {
      filters: activeFilters,
      showLatestNovels,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const sort =
      activeFilters?.sort?.value ??
      (showLatestNovels ? 'updated' : this.filters.sort.value);
    const status = activeFilters?.status?.value ?? this.filters.status.value;
    const genres = activeFilters?.genres?.value ?? this.filters.genres.value;

    const params = new URLSearchParams({
      sort: sort || 'updated',
      status: status || 'all',
      page: String(pageNo),
    });
    if (genres?.length) {
      params.set('genres', genres.join(','));
    }

    const data = await this.fetchJson<ComicListResponse>(
      `${API}/new-comics?${params.toString()}`,
    );
    return (data.comics || []).map(c => this.toNovelItem(c));
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const slug = novelPath.replace(/^\/+/, '').replace(/^comics\//, '');
    const data = await this.fetchJson<ComicDetail>(`${API}/comics/${slug}`);

    const novel: Plugin.SourceNovel = {
      path: `/comics/${data.id}`,
      name: data.title,
      cover: data.thumbnail || defaultCover,
      author: data.author?.name || data.authors || '',
      summary: data.description || '',
      genres: (data.genres || []).map(g => g.name).join(','),
      status: this.mapStatus(data.status),
    };

    if (data.type) {
      novel.genres = `${data.type === 'novel' ? 'Novel' : 'Manga'}${
        novel.genres ? ',' + novel.genres : ''
      }`;
    }

    // API returns chapters newest-first; group into volumes of 50 like the site
    const chapters = (data.chapters || [])
      .slice()
      .sort((a, b) => a.id - b.id)
      .map(ch => {
        const chapterNumber = this.parseChapterNumber(ch.name) ?? ch.id;
        const volStart =
          Math.floor((chapterNumber - 1) / CHAPTERS_PER_VOLUME) *
            CHAPTERS_PER_VOLUME +
          1;
        const chapter: Plugin.ChapterItem = {
          name: ch.name,
          path: `/chapters/${data.id}/${ch.id}`,
          chapterNumber,
          page: `Chương ${volStart} - ${volStart + CHAPTERS_PER_VOLUME - 1}`,
        };
        if (ch.unlockAt) {
          chapter.releaseTime = new Date(ch.unlockAt)
            .toISOString()
            .split('T')[0];
        }
        return chapter;
      });

    novel.chapters = chapters;
    return novel;
  }

  private parseChapterNumber(name: string): number | null {
    const m = name.match(/(?:chương|chapter)\s*(\d+(?:\.\d+)?)/i);
    if (!m) return null;
    const n = Number(m[1]);
    return Number.isNaN(n) || n <= 0 ? null : n;
  }

  private mapStatus(status?: string): string {
    switch ((status || '').toLowerCase()) {
      case 'updating':
      case 'ongoing':
      case 'đang cập nhật':
        return NovelStatus.Ongoing;
      case 'completed':
      case 'hoàn thành':
        return NovelStatus.Completed;
      case 'paused':
      case 'hiatus':
        return NovelStatus.OnHiatus;
      case 'cancelled':
      case 'dropped':
        return NovelStatus.Cancelled;
      default:
        return NovelStatus.Unknown;
    }
  }

  async parseChapter(chapterPath: string): Promise<Plugin.ChapterContent> {
    const match = chapterPath.match(/\/chapters\/([^/]+)\/(\d+)/);
    if (!match) {
      throw new Error('Invalid chapter path: ' + chapterPath);
    }
    const [, slug, chapterId] = match;
    const res = await fetchApi(`${API}/comics/${slug}/chapters/${chapterId}`, {
      headers: this.requestHeaders,
    });
    if (res.status === 401 || res.status === 402 || res.status === 403) {
      return {
        state: 'checkpoint',
        type: 'image',
        html: `<div><p>Chương này yêu cầu đăng nhập hoặc trả phí trên truyenkira.net.</p></div>`,
        checkpointMessage: 'Chapter requires login or purchase',
        noCache: true,
        noPrefetch: true,
      };
    }
    if (!res.ok) {
      throw new Error(`Request failed ${res.status}: ${chapterPath}`);
    }
    const data = (await res.json()) as ChapterContentResponse;

    if (data.images && data.images.length > 0) {
      const figures = data.images
        .sort((a, b) => a.page - b.page)
        .map(
          img =>
            `<figure><img src="${encodeHtmlEntities(
              img.src,
            )}" alt="Page ${img.page}" loading="lazy" /></figure>`,
        )
        .join('\n');
      return {
        state: 'ready',
        type: 'image',
        html: `<div class="truyenkira-pages">\n${figures}\n</div>`,
      };
    }

    const text = (data.textContent || '').trim();
    if (!text) {
      throw new Error('Chapter content is empty or locked.');
    }

    const paragraphs = text
      .split(/\n{1,}/)
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => `<p>${encodeHtmlEntities(line)}</p>`)
      .join('\n');

    return {
      state: 'ready',
      type: 'novel',
      html: `<div>\n${paragraphs}\n</div>`,
    };
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const params = new URLSearchParams({
      q: searchTerm,
      page: String(pageNo),
    });
    const data = await this.fetchJson<ComicListResponse>(
      `${API}/search?${params.toString()}`,
    );
    return (data.comics || []).map(c => this.toNovelItem(c));
  }

  resolveUrl(path: string): string {
    return SITE + path;
  }

  imageRequestInit: Plugin.ImageRequestInit = {
    headers: {
      Referer: SITE + '/',
    },
  };
}

export default new TruyenKiraPlugin();
