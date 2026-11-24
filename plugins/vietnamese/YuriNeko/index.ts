import { fetchApi, fetchText } from '@libs/fetch';
import { NovelStatus } from '@libs/novelStatus';
import { NekoriBasePlugin } from '@nekori/plugin';
import { ContentType, ContentWarning } from '@nekori/pluginMetadata';
import { encodeHtmlEntities } from '@nekori/utils';

import { Plugin } from '@/types/plugin';

import filters from './filters';
import { extractMangaId, extractSignedImageUrls, stripHtml } from './utils';

const SITE = 'https://yurinekoz.com';
const CDN = SITE.replace('https://', 'https://cdn.');
const API = `${SITE}/api/v1`;

const LIST_LIMIT = 24;
const CHAPTER_LIMIT = 100;

type MangaDto = {
  id: string;
  title: string;
  slug: string;
  description?: string | null;
  thumbnailUrl?: string | null;
  type?: string;
  status?: string;
  averageRating?: number;
  tags?: { name: string }[];
  linkedAuthors?: { name: string }[];
  linkedArtists?: { name: string }[];
  alternativeTitles?: string[];
};

type ChapterDto = {
  id: string;
  title?: string | null;
  name?: string | null;
  chapterNumber?: string;
  slug: string;
  contentType?: 'TEXT' | 'IMAGES' | string;
  volumeId?: string | null;
  order?: number;
  publishedAt?: string | null;
  createdAt?: string;
};

type VolumeDto = {
  id: string;
  title?: string | null;
  volumeNumber?: number;
  order?: number;
};

type ChapterListDto = {
  data: ChapterDto[];
  totalPages?: number;
  lastPage?: number;
};

type ChapterDetailDto = ChapterDto & {
  content?: string | null;
  images?: { url: string; order?: number }[];
};

function coverUrl(path?: string | null): string | undefined {
  if (!path) return undefined;
  if (path.startsWith('http')) return path;
  return `${CDN}/${path.replace(/^\/+/, '')}`;
}

function parseStatus(status?: string): string {
  switch (status) {
    case 'ONGOING':
      return NovelStatus.Ongoing;
    case 'COMPLETED':
      return NovelStatus.Completed;
    case 'HIATUS':
      return NovelStatus.OnHiatus;
    case 'CANCELLED':
      return NovelStatus.Cancelled;
    default:
      return NovelStatus.Unknown;
  }
}

class YuriNekoPlugin extends NekoriBasePlugin {
  id = 'yurineko.vn';
  name = 'YuriNeko';
  icon = 'icon.png';
  site = SITE;
  version = '1.0.1';
  contentType = ContentType.MIXED;
  contentWarning = ContentWarning.MIXED;

  customCSS = 'style.css';
  customJS = 'custom.js';

  filters = filters;

  imageRequestInit: Plugin.ImageRequestInit = {
    headers: {
      Referer: `${SITE}/`,
    },
  };

  private async apiJson<T>(path: string): Promise<T> {
    const res = await fetchApi(`${API}${path}`);
    if (!res.ok) {
      throw new Error(`YuriNeko API ${path} -> HTTP ${res.status}`);
    }
    return (await res.json()) as T;
  }

  private toNovelItem(manga: MangaDto): Plugin.NovelItem {
    return {
      name: manga.title,
      path: `/${manga.type === 'NOVEL' ? 'novel' : 'manga'}/${manga.slug}`,
      cover: coverUrl(manga.thumbnailUrl),
    };
  }

  async popularNovels(
    pageNo: number,
    {
      filters: f,
      showLatestNovels,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const params = new URLSearchParams({
      page: String(pageNo),
      limit: String(LIST_LIMIT),
      sort: showLatestNovels ? 'latest' : f?.sort?.value ?? 'latest',
    });
    if (f?.type?.value) params.set('type', f.type.value);
    if (f?.status?.value) params.set('status', f.status.value);
    if (f?.creator?.value) {
      params.set('authorSlugs', f.creator.value);
      params.set('artistSlugs', f.creator.value);
    }
    const tags = f?.tags?.value ?? [];
    if (tags.length) params.set('tags', tags.join(','));

    const payload = await this.apiJson<{
      data: MangaDto[];
      page: number;
      lastPage: number;
    }>(`/mangas?${params}`);

    return payload.data.map(m => this.toNovelItem(m));
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const params = new URLSearchParams({
      page: String(pageNo),
      limit: String(LIST_LIMIT),
      sort: 'latest',
      search: searchTerm.trim(),
    });
    const payload = await this.apiJson<{
      data: MangaDto[];
    }>(`/mangas?${params}`);
    return payload.data.map(m => this.toNovelItem(m));
  }

  private async fetchMangaId(
    type: string,
    slug: string,
  ): Promise<{ id: string; type: string }> {
    const html = await fetchText(`${SITE}/${type}/${slug}`);
    if (!html) {
      throw new Error(`Không tải được trang ${type}/${slug}`);
    }
    const id = extractMangaId(html);
    if (!id) {
      throw new Error(`Không tìm thấy manga id: ${type}/${slug}`);
    }
    return { id, type };
  }

  private async fetchAllChapters(mangaId: string): Promise<ChapterDto[]> {
    const chapters = new Map<string, ChapterDto>();
    const first = await this.apiJson<ChapterListDto>(
      `/chapters/${mangaId}?page=1&limit=${CHAPTER_LIMIT}&sort=desc`,
    );
    const pageCount = first.totalPages ?? first.lastPage ?? 1;
    const pages = [first];
    for (let page = 2; page <= pageCount; page++) {
      pages.push(
        await this.apiJson<ChapterListDto>(
          `/chapters/${mangaId}?page=${page}&limit=${CHAPTER_LIMIT}&sort=desc`,
        ),
      );
    }
    for (const payload of pages) {
      for (const chapter of payload.data) {
        if (!chapters.has(chapter.id)) chapters.set(chapter.id, chapter);
      }
    }
    return [...chapters.values()];
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const parts = novelPath.replace(/^\/+|\/+$/g, '').split('/');
    const type = parts[0] || 'novel';
    const slug = parts[1] || '';

    const { id: mangaId } = await this.fetchMangaId(type, slug);

    const [details, chaptersRaw, volumes] = await Promise.all([
      this.apiJson<MangaDto>(`/mangas/${mangaId}`),
      this.fetchAllChapters(mangaId),
      this.apiJson<VolumeDto[]>(`/volumes/manga/${mangaId}`).catch(
        () => [] as VolumeDto[],
      ),
    ]);

    const volumeNames = new Map<string, string>();
    for (const volume of [...volumes].sort(
      (a, b) =>
        (a.order ?? a.volumeNumber ?? 0) - (b.order ?? b.volumeNumber ?? 0),
    )) {
      const label = volume.title?.trim()
        ? /^(volume|tập)/i.test(volume.title.trim())
          ? volume.title.trim()
          : `Tập ${volume.volumeNumber ?? ''}: ${volume.title.trim()}`
              .replace(':  ', ': ')
              .trim()
        : `Tập ${volume.volumeNumber ?? ''}`.trim();
      volumeNames.set(volume.id, label);
    }

    const chapters: Plugin.ChapterItem[] = [...chaptersRaw]
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map(chapter => {
        const base = chapter.title?.trim() || chapter.name?.trim() || '';
        const name =
          base && !/^(chương|chapter)/i.test(base)
            ? `Chương ${chapter.chapterNumber ?? ''}: ${base}`
            : base || `Chương ${chapter.chapterNumber ?? ''}`.trim();
        const item: Plugin.ChapterItem = {
          name: name.trim(),
          path: `${novelPath.startsWith('/') ? '' : '/'}${novelPath}/${chapter.slug}@${chapter.id}`,
          releaseTime: chapter.publishedAt ?? chapter.createdAt ?? null,
          chapterNumber: (chapter.order ?? Number(chapter.chapterNumber)) || 0,
        };
        const volume =
          (chapter.volumeId && volumeNames.get(chapter.volumeId)) || null;
        if (volume) item.page = volume;
        return item;
      });

    return {
      path: novelPath.startsWith('/') ? novelPath : `/${novelPath}`,
      name: details.title,
      cover: coverUrl(details.thumbnailUrl),
      summary:
        (details.alternativeTitles?.length
          ? `Tên khác: ${details.alternativeTitles.join(', ')}\n\n`
          : '') + (details.description ? stripHtml(details.description) : ''),
      author: details.linkedAuthors?.map(a => a.name).join(', ') || '',
      artist: details.linkedArtists?.map(a => a.name).join(', ') || '',
      genres: details.tags?.map(t => t.name).join(',') || '',
      status: parseStatus(details.status),
      rating: details.averageRating ?? 0,
      chapters,
    };
  }

  async parseChapter(chapterPath: string): Promise<Plugin.ChapterContent> {
    const at = chapterPath.lastIndexOf('@');
    const chapterId = chapterPath.slice(at + 1);
    const pagePath = chapterPath.slice(0, at);

    const detail = await this.apiJson<ChapterDetailDto>(
      `/chapters/detail/${chapterId}`,
    );

    if (detail.contentType === 'TEXT' && detail.content) {
      const html = detail.content
        .replace(/(<img\b[^>]*\bsrc\s*=\s*["'])http:\/\//gi, '$1https://')
        .trim();
      return {
        html: `<div class="yurineko-novel">\n${html}\n</div>`,
        state: 'ready',
        type: 'novel',
      };
    }

    // IMAGES chapter — decrypt client-side via customJS
    const html = await fetchText(`${SITE}${pagePath}`);
    const urls = extractSignedImageUrls(html);
    if (!urls.length) {
      return {
        html: `<div id="yurineko-image-error"><p>Không tìm thấy ảnh. Mở trang trong WebView để xem.</p></div>`,
        state: 'checkpoint',
        type: 'image',
        checkpointMessage: 'Không trích xuất được ảnh đã ký.',
        noCache: true,
        noPrefetch: true,
      };
    }

    const imgs = urls
      .map(
        url =>
          `<figure><img data-yurineko-src="${encodeHtmlEntities(url)}" alt="" loading="lazy"/></figure>`,
      )
      .join('\n');
    return {
      html: `<div class="yurineko-pages">\n${imgs}\n</div>`,
      state: 'ready',
      type: 'image',
    };
  }

  resolveUrl(path: string): string {
    const clean = path.split('@')[0];
    return `${SITE}${clean.startsWith('/') ? clean : `/${clean}`}`;
  }
}

export default new YuriNekoPlugin();
