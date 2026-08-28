import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';
import { encodeHtmlEntities } from '@libs/utils';
import { storage } from '@libs/storage';
import { ContentType } from '@libs/pluginMetadata';

import filters from './filters';

const SITE = 'https://kkphim.com';
const API = 'https://phimapi.com/v1/api';

type Movie = {
  name?: string;
  slug?: string;
  content?: string;
  thumb_url?: string;
  poster_url?: string;
  status?: string;
  actor?: string[];
  director?: string[];
  category?: { name?: string }[];
  country?: { name?: string }[];
  episodes?: {
    server_name?: string;
    server_data?: {
      name?: string;
      link_m3u8?: string;
      link_embed?: string;
    }[];
  }[];
};

type ListResponse = {
  data?: { items?: Movie[]; APP_DOMAIN_CDN_IMAGE?: string };
  items?: Movie[];
  APP_DOMAIN_CDN_IMAGE?: string;
};

function statusOf(value: string | undefined): string {
  if (value === 'completed') return NovelStatus.Completed;
  if (value === 'ongoing') return NovelStatus.Ongoing;
  return NovelStatus.Unknown;
}

function imageOf(
  url: string | undefined,
  fallback: string,
  cdn = 'https://phimimg.com/',
): string {
  if (!url) return fallback;
  return url.startsWith('http')
    ? url
    : new URL(url, `${cdn.replace(/\/$/, '')}/`).toString();
}

function parseList(response: ListResponse): Plugin.NovelItem[] {
  const items = response.data?.items || response.items || [];
  const cdn =
    response.data?.APP_DOMAIN_CDN_IMAGE ||
    response.APP_DOMAIN_CDN_IMAGE ||
    'https://phimimg.com';
  const fallback = defaultCover;
  return items.flatMap(movie => {
    if (!movie.slug || !movie.name) return [];
    return [
      {
        name: movie.name,
        path: `/phim/${movie.slug}`,
        cover: imageOf(movie.thumb_url || movie.poster_url, fallback, cdn),
      },
    ];
  });
}

class KKPhimPlugin implements Plugin.PluginBase {
  id = 'kkphim';
  name = 'KKPhim';
  icon = 'src/vi/kkphim/icon.png';
  site = SITE;
  version = '1.0.5';
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
    headers: { Referer: `${this.site}/` },
  };

  private async getJson<T>(url: string): Promise<T> {
    const response = await fetchApi(url, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`KKPhim API HTTP ${response.status}`);
    return (await response.json()) as T;
  }

  async popularNovels(
    pageNo: number,
    options: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const params = new URLSearchParams({
      page: String(pageNo),
      sort_field: options.showLatestNovels
        ? 'modified.time'
        : options.filters?.sort_field?.value || 'modified.time',
      sort_type: 'desc',
    });
    const selected = options.showLatestNovels ? undefined : options.filters;
    for (const key of ['category', 'country', 'year', 'sort_lang'] as const) {
      const value = selected?.[key]?.value;
      if (value) params.set(key, String(value));
    }
    const type = selected?.type?.value;
    const endpoint = type
      ? `${API}/danh-sach/${encodeURIComponent(String(type))}`
      : `${API}/danh-sach`;
    return parseList(await this.getJson<ListResponse>(`${endpoint}?${params}`));
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const params = new URLSearchParams({
      keyword: searchTerm.trim(),
      page: String(pageNo),
      limit: '64',
    });
    return parseList(
      await this.getJson<ListResponse>(`${API}/tim-kiem?${params}`),
    );
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const slug = novelPath.replace(/^\/phim\//, '').replace(/\.html$/, '');
    const response = await this.getJson<{ data?: { item?: Movie } }>(
      `${API}/phim/${encodeURIComponent(slug)}`,
    );
    const movie = response.data?.item;
    if (!movie?.name) throw new Error('Cannot fetch movie from KKPhim API');

    const chapters: Plugin.ChapterItem[] = [];
    let chapterNumber = 0;
    for (const server of movie.episodes || []) {
      for (const episode of server.server_data || []) {
        const videoUrl = episode.link_m3u8 || episode.link_embed;
        if (!videoUrl || !episode.name) continue;
        chapterNumber++;
        const parsedNumber = Number.parseFloat(
          episode.name.replace(/[^0-9.]/g, ''),
        );
        chapters.push({
          name: episode.name,
          path: videoUrl,
          chapterNumber: Number.isFinite(parsedNumber)
            ? parsedNumber
            : chapterNumber,
          page: server.server_name || 'KKPhim',
        });
      }
    }

    const tags = [
      ...(movie.category || []).map(item => item.name).filter(Boolean),
      ...(movie.country || []).map(item => item.name).filter(Boolean),
    ];
    return {
      path: novelPath,
      name: movie.name,
      cover: imageOf(movie.thumb_url || movie.poster_url, defaultCover),
      summary: movie.content?.replace(/<[^>]*>/g, '').trim() || '',
      author: movie.director?.join(', ') || 'Đang cập nhật',
      genres: tags.join(', '),
      status: statusOf(movie.status),
      chapters,
    };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    if (!chapterPath.startsWith('http')) {
      return '<p style="color:#ff4444;font-size:14px;font-family:sans-serif;text-align:center;padding:16px;">Không tìm thấy nguồn video cho tập phim này.</p>';
    }
    const escapedUrl = encodeHtmlEntities(chapterPath);
    return [
      '<meta name="lnreader-chapter-type" content="video">',
      '<meta name="lnreader-video-mode" content="lazy">',
      '<meta id="no-cache-marker"/>',
      '<meta id="no-prefetch-marker"/>',
      `<div id="kkphim-player-container" data-m3u8="${escapedUrl}" data-ad-blocker="${this.enableAdBlocker}" style="display:none;"></div>`,
    ].join('\n');
  }

  resolveUrl(path: string): string {
    return path.startsWith('http') ? path : `${SITE}${path}`;
  }
}

export default new KKPhimPlugin();
