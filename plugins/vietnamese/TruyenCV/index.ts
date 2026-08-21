import { load as parseHTML } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { NovelStatus } from '@libs/novelStatus';
import { FilterTypes, Filters } from '@libs/filterInputs';
import { defaultCover } from '@libs/defaultCover';

const API_BASE = 'https://truyencv.io/wp-json';

type WPManga = {
  id: number;
  title: { rendered: string };
  slug: string;
  link: string;
  content: { rendered: string };
  featured_media: number;
  genre: number[];
  author_tax: number[];
  team: number[];
  manga_status: string;
  _embedded?: {
    'wp:featuredmedia'?: { source_url: string }[];
    'wp:term'?: {
      id: number;
      name: string;
      slug: string;
      taxonomy: string;
    }[][];
  };
};

type ChapterAPIItem = {
  id: number;
  ghost_chapter_id: number;
  manga_id: number;
  title: string;
  number: number;
  slug: string;
  schedule: string;
  created_at: string;
  lock_type: string;
  lock_value: number;
  is_purchased: boolean;
};

type ChaptersResponse = {
  items: ChapterAPIItem[];
  total_pages: number;
  current_page: number;
};

type SearchResult = {
  id: string;
  title: string;
  url: string;
  type: string;
  post_type: string;
  thumb: string;
  date: string;
  category: string;
  excerpt: string;
};

class TruyenCV implements Plugin.PagePlugin {
  id = 'truyencv.io';
  name = 'TruyenCV';
  icon = 'src/vi/truyencv/icon.png';
  site = 'https://truyencv.io';
  version = '1.0.3';

  private mangaIdCache = new Map<string, string>();

  async popularNovels(
    pageNo: number,
    { filters }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    let url = `${API_BASE}/wp/v2/manga?per_page=20&page=${pageNo}&_embed`;

    const sort = filters?.sort?.value || 'modified';
    const order = sort === 'title' ? 'asc' : 'desc';
    url += `&orderby=${sort}&order=${order}`;

    const genres = filters?.genre?.value;
    if (genres && genres.length > 0) {
      url += `&genre=${genres.join(',')}`;
    }

    const status = filters?.status?.value;
    if (status) {
      url += `&manga_status=${status}`;
    }

    const res = await fetchApi(url);
    const data = await res.json();
    if (!Array.isArray(data)) return [];

    return data.map((item: WPManga) => ({
      name: item.title?.rendered,
      path: `/truyen/${item.slug}/`,
      cover:
        item._embedded?.['wp:featuredmedia']?.[0]?.source_url || defaultCover,
    }));
  }

  async parseNovel(
    novelPath: string,
  ): Promise<Plugin.SourceNovel & { totalPages: number }> {
    const slug = novelPath.replace(/^\/truyen\//, '').replace(/\/$/, '');

    const res = await fetchApi(`${API_BASE}/wp/v2/manga?slug=${slug}&_embed`);
    const data: WPManga[] = await res.json();
    const manga = data[0];

    if (!manga) {
      return {
        path: novelPath,
        name: 'Không tìm thấy',
        totalPages: 0,
      };
    }

    this.mangaIdCache.set(slug, manga.id.toString());

    const chapRes = await fetchApi(
      `${API_BASE}/initmanga/v1/chapters?manga_id=${manga.id}&paged=1`,
    );
    const chapData: ChaptersResponse = await chapRes.json();

    const terms = manga._embedded?.['wp:term']?.flat() || [];
    const genres = terms
      .filter(t => t.taxonomy === 'genre')
      .map(t => t.name)
      .join(', ');
    const author = terms
      .filter(t => t.taxonomy === 'author_tax')
      .map(t => t.name)
      .join(', ');

    const totalPages = chapData.total_pages || 1;

    const apiPage = totalPages;
    const firstPageRes =
      totalPages > 1
        ? await fetchApi(
            `${API_BASE}/initmanga/v1/chapters?manga_id=${manga.id}&paged=${apiPage}`,
          )
        : null;
    const firstPageData: ChaptersResponse = firstPageRes
      ? await firstPageRes.json()
      : chapData;

    const chapters = this.mapChapters(
      totalPages > 1 ? firstPageData.items : chapData.items,
    );

    const novel: Plugin.SourceNovel & { totalPages: number } = {
      path: novelPath,
      name: manga.title?.rendered || 'Không có tiêu đề',
      cover:
        manga._embedded?.['wp:featuredmedia']?.[0]?.source_url || defaultCover,
      summary: parseHTML(manga.content?.rendered || '')
        .text()
        .trim(),
      author,
      genres,
      status:
        manga.manga_status === 'completed'
          ? NovelStatus.Completed
          : manga.manga_status === 'ongoing'
            ? NovelStatus.Ongoing
            : NovelStatus.Unknown,
      chapters,
      totalPages,
    };

    return novel;
  }

  async parsePage(novelPath: string, page: string): Promise<Plugin.SourcePage> {
    const slug = novelPath.replace(/^\/truyen\//, '').replace(/\/$/, '');
    let mangaId = this.mangaIdCache.get(slug);

    if (!mangaId) {
      const res = await fetchApi(
        `${API_BASE}/wp/v2/manga?slug=${slug}&_fields=id`,
      );
      const data = await res.json();
      mangaId = data[0]?.id?.toString();
      if (mangaId) this.mangaIdCache.set(slug, mangaId);
    }

    if (!mangaId) return { chapters: [] };

    // Reverse page order for A-Z sorting
    const chapRes = await fetchApi(
      `${API_BASE}/initmanga/v1/chapters?manga_id=${mangaId}&paged=1`,
    );
    const metaData: ChaptersResponse = await chapRes.json();
    const totalPages = metaData.total_pages;
    const apiPage = totalPages - Number(page) + 1;

    const res = await fetchApi(
      `${API_BASE}/initmanga/v1/chapters?manga_id=${mangaId}&paged=${apiPage}`,
    );
    const data: ChaptersResponse = await res.json();

    return {
      chapters: this.mapChapters(data.items),
    };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const chapterId = chapterPath.split('/').pop();
    const res = await fetchApi(`${API_BASE}/initmanga/v1/chapter/${chapterId}`);
    const data = await res.json();
    const content: string = data.content || '';
    return content.split('\\"').join('"').split('\\/').join('/');
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    if (pageNo > 1) return [];

    const res = await fetchApi(
      `${API_BASE}/initlise/v1/search?term=${encodeURIComponent(searchTerm)}`,
    );
    const data: SearchResult[] = await res.json();

    return data
      .filter(item => item.post_type === 'manga')
      .map(item => {
        const slug = item.url
          .replace('https://truyencv.io/truyen/', '')
          .replace(/\/$/, '');
        return {
          name: item.title?.replace(/<[^>]*>/g, ''),
          path: `/truyen/${slug}/`,
          cover: item.thumb || defaultCover,
        };
      });
  }

  resolveUrl(path: string, isNovel?: boolean): string {
    if (isNovel) return this.site + path;
    else return this.site; // idk
  }

  private mapChapters(items: ChapterAPIItem[]): Plugin.ChapterItem[] {
    return [...items].reverse().map(ch => ({
      name: `Chương ${ch.number}: ${ch.title}`,
      path: `/chapter/${ch.id}`,
      releaseTime: ch.created_at,
      chapterNumber: ch.number,
    }));
  }

  filters = {
    genre: {
      type: FilterTypes.CheckboxGroup,
      label: 'Thể loại',
      value: [],
      options: [
        { label: 'Cổ Đại', value: '29' },
        { label: 'Cung Đấu', value: '30' },
        { label: 'Đề Cử', value: '639' },
        { label: 'Dị Giới', value: '75' },
        { label: 'Dị Năng', value: '134' },
        { label: 'Điền Văn', value: '31' },
        { label: 'Đô Thị', value: '23' },
        { label: 'Đồng Nhân', value: '792' },
        { label: 'Du Hí', value: '92' },
        { label: 'Gia Đấu', value: '32' },
        { label: 'Hài Hước', value: '197' },
        { label: 'Hậu Cung', value: '142' },
        { label: 'Hay', value: '638' },
        { label: 'HE', value: '20' },
        { label: 'Hệ Thống', value: '57' },
        { label: 'Học Đường', value: '213' },
        { label: 'Huyền Huyễn', value: '72' },
        { label: 'Khác', value: '38' },
        { label: 'Khoa Huyễn', value: '39' },
        { label: 'Không Thánh Mẫu', value: '857' },
        { label: 'Kiếm Hiệp', value: '86' },
        { label: 'Làm Ruộng', value: '173' },
        { label: 'Lịch Sử', value: '145' },
        { label: 'Linh Dị', value: '82' },
        { label: 'Ma Đạo', value: '761' },
        { label: 'Mạt Thế', value: '40' },
        { label: 'Ngôn Tình', value: '19' },
        { label: 'Ngược', value: '26' },
        { label: 'Nữ Cường', value: '33' },
        { label: 'Nữ Phụ', value: '48' },
        { label: 'Phàm Nhân', value: '858' },
        { label: 'Phản Phái', value: '155' },
        { label: 'Sắc', value: '27' },
        { label: 'Sau Màn', value: '196' },
        { label: 'Sủng', value: '36' },
        { label: 'Tiên Hiệp', value: '16' },
        { label: 'Tổng Tài', value: '123' },
        { label: 'Trinh Thám', value: '88' },
        { label: 'Trọng Sinh', value: '24' },
        { label: 'Võng Du', value: '167' },
        { label: 'Voz', value: '11' },
        { label: 'Xuyên Không', value: '34' },
        { label: 'Xuyên Nhanh', value: '90' },
      ],
    },
    status: {
      type: FilterTypes.Picker,
      label: 'Tình trạng',
      value: '',
      options: [
        { label: 'Tất cả', value: '' },
        { label: 'Đang tiến hành', value: 'ongoing' },
        { label: 'Đã hoàn thành', value: 'completed' },
      ],
    },
    sort: {
      type: FilterTypes.Picker,
      label: 'Sắp xếp',
      value: 'modified',
      options: [
        { label: 'Mới cập nhật', value: 'modified' },
        { label: 'Mới đăng', value: 'date' },
        { label: 'Theo tên A-Z', value: 'title' },
      ],
    },
  } satisfies Filters;
}

export default new TruyenCV();
