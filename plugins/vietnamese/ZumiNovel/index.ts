import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { NovelStatus } from '@libs/novelStatus';
import { FilterTypes, Filters } from '@libs/filterInputs';
import { defaultCover } from '@libs/defaultCover';
import { storage } from '@libs/storage';
import { decodeHtmlEntities } from '@libs/utils';

const SITE = 'https://zuminovel.com';

// ── Helpers ─────────────────────────────────────────
type ZumiNovel = {
  _id?: string;
  id?: string;
  slug?: string;
  title?: string;
  author?: string;
  description?: string;
  coverUrl?: string;
  genres?: string[];
  novelType?: string;
  status?: string;
  country?: string | null;
  chaptersCount?: number;
  chapters?: ZumiChapter[];
};

type ZumiChapter = {
  _id?: string;
  id?: string;
  title?: string;
  slug?: string;
  order?: number;
  volume?: string;
  isVIP?: boolean;
  isAdult?: boolean;
  price?: number;
  wordCount?: number;
  createdAt?: string;
};

const NOVEL_TYPE_LABELS: Record<string, string> = {
  original: 'Sáng tác',
  translated: 'Dịch thủ công',
  ai_translated: 'Dịch AI',
  raw: 'RAW',
};

function zumiSlugify(input: string): string {
  if (!input) return '_';
  let out = '';
  for (const ch of input.toLowerCase()) {
    if (ch >= 'a' && ch <= 'z') out += ch;
    else if (ch >= '0' && ch <= '9') out += ch;
    else if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r')
      out += '-';
  }
  out = out.replace(/-+/g, '-').replace(/^-+|-+$/g, '');
  return out || '_';
}

function cleanDescriptionHtml(raw: string): string {
  if (!raw) return '';
  let t = raw;
  t = t.replace(/<br\s*\/?>(?!\s*$)/gi, '\n');
  t = t.replace(/<br\s*\/?>/gi, '\n');
  t = t.replace(/<\/(p|div|h[1-6]|li|tr|blockquote|section|article)>/gi, '\n');
  t = t.replace(/<[^>]+>/g, '');
  t = decodeHtmlEntities(t);
  t = t.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  t = t.replace(/[ \t\u00A0]+\n/g, '\n');
  t = t.replace(/\n[ \t\u00A0]+/g, '\n');
  t = t.replace(/[ \t\u00A0]{2,}/g, ' ');
  t = t.replace(/\n{3,}/g, '\n\n');
  return t.trim();
}

function parseZumiStatus(s: string | undefined): string {
  switch ((s || '').toLowerCase()) {
    case 'ongoing':
      return NovelStatus.Ongoing;
    case 'completed':
      return NovelStatus.Completed;
    case 'hiatus':
    case 'on_hiatus':
      return NovelStatus.OnHiatus;
    default:
      return NovelStatus.Unknown;
  }
}

function parseVolumeNumber(s: string): number | null {
  if (!s) return null;
  const numbered = s.match(/(?:tập|tap|quyển|quyen|volume|vol\.?)\s*([0-9]+)/i);
  if (numbered) return Number(numbered[1]);
  const anyNum = s.match(/([0-9]+)/);
  if (anyNum) return Number(anyNum[1]);
  return null;
}

function isIntroVolume(s: string): boolean {
  return /^\s*(minh\s*hoạ|minh\s*họa|ảnh\s*bìa|anh\s*bia|giới\s*thiệu|gioi\s*thieu|mở\s*đầu|mo\s*dau|prologue|introduction|preface|intro)\b/i.test(
    s,
  );
}

function compareZumiVolumes(a: string, b: string): number {
  if (a === b) return 0;
  const aIntro = isIntroVolume(a);
  const bIntro = isIntroVolume(b);
  if (aIntro && !bIntro) return -1;
  if (bIntro && !aIntro) return 1;

  const numA = parseVolumeNumber(a);
  const numB = parseVolumeNumber(b);
  if (numA !== null && numB !== null) {
    if (numA !== numB) return numA - numB;
    return a.localeCompare(b);
  }
  if (numA !== null) return -1;
  if (numB !== null) return 1;
  return a.localeCompare(b);
}

class ZumiNovelPlugin implements Plugin.PluginBase {
  id = 'zuminovel';
  name = 'ZumiNovel';
  icon = 'src/vi/zuminovel/icon.png';
  site = SITE;
  version = '1.0.9';

  pluginSettings: Plugin.PluginSettings = {
    showRaw: {
      value: false,
      label: 'Hiện truyện RAW',
      type: 'Switch',
    },
  };

  get showRaw(): boolean {
    return storage.get('showRaw') as boolean;
  }

  private novelIdCache = new Map<string, string>();

  resolveCover(url: string | undefined): string {
    if (!url) return defaultCover;
    if (/^https?:\/\//i.test(url)) return url;
    return this.site + (url.startsWith('/') ? url : '/' + url);
  }

  zumiToNovelItem(n: ZumiNovel): Plugin.NovelItem | undefined {
    if (!n?.slug || !n?.title) return undefined;
    return {
      name: n.title.trim(),
      path: `/novel/${n.slug}`,
      cover: this.resolveCover(n.coverUrl),
    };
  }

  buildListQuery(opts: {
    page: number;
    sort?: string;
    status?: string;
    type?: string;
    country?: string;
    genre?: string;
    search?: string;
    showRaw?: boolean;
    limit?: number;
  }): string {
    const params = new URLSearchParams();
    params.set('page', String(opts.page));
    params.set('limit', String(opts.limit ?? 20));

    if (opts.sort) params.set('sort', opts.sort);
    if (opts.status) params.set('status', opts.status);
    if (opts.country) params.set('country', opts.country);
    if (opts.genre) params.set('genre', opts.genre);
    if (opts.search) params.set('search', opts.search);

    if (opts.type) {
      params.set('type', opts.type);
    }

    params.set('includeDescription', 'false');
    params.set('includeAdult', 'false');
    return params.toString();
  }

  async fetchNovels(qs: string): Promise<Plugin.NovelItem[]> {
    const url = `${this.site}/api/novels?${qs}`;
    const res = await fetchApi(url, {
      headers: { Accept: 'application/json', Referer: this.site + '/' },
    });
    if (!res.ok) throw new Error(res.statusText);
    const json = await res.json().catch(() => null);
    if (!json?.success || !Array.isArray(json.data))
      throw new Error('Invalid data: ' + json);

    const items: Plugin.NovelItem[] = [];
    for (const raw of json.data as ZumiNovel[]) {
      if (raw?.slug) {
        const id = raw.id || raw._id;
        if (id) this.novelIdCache.set(raw.slug, id);
      }
      const item = this.zumiToNovelItem(raw);
      if (item) items.push(item);
    }
    return items;
  }

  async popularNovels(
    pageNo: number,
    options: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const filters = options.filters;

    let sort = filters?.sort?.value;
    if (!sort) sort = options.showLatestNovels ? 'updated' : 'views';

    const qs = this.buildListQuery({
      page: pageNo,
      sort,
      status: filters?.status?.value || undefined,
      type: filters?.type?.value || undefined,
      country: filters?.country?.value || undefined,
      genre: filters?.genre?.value || undefined,
      showRaw: this.showRaw,
    });

    return this.fetchNovels(qs);
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const qs = this.buildListQuery({
      page: pageNo,
      search: searchTerm,
      sort: 'views',
      showRaw: true,
    });
    return this.fetchNovels(qs);
  }

  async getNovelId(slug: string): Promise<string> {
    if (!slug) return '';
    const cached = this.novelIdCache.get(slug);
    if (cached) return cached;
    try {
      const res = await fetchApi(
        `${this.site}/api/novels/${encodeURIComponent(slug)}`,
        {
          headers: { Accept: 'application/json', Referer: this.site + '/' },
        },
      );
      if (!res.ok) return '';
      const json = await res.json().catch(() => null);
      const data: ZumiNovel = json?.data || {};
      const id = data.id || data._id || '';
      if (id) this.novelIdCache.set(slug, id);
      return id;
    } catch {
      return '';
    }
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const path = novelPath.replace(/^https?:\/\/[^/]+/, '');
    const slugMatch = path.match(/\/novel\/([^/?#]+)/);
    const slug = slugMatch
      ? decodeURIComponent(slugMatch[1])
      : path.replace(/^\/+/g, '').split(/[/?#]/)[0] || '';

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: '',
    };

    if (!slug) return novel;

    const url = `${this.site}/api/novels/${encodeURIComponent(slug)}`;
    let json: { success?: boolean; data?: ZumiNovel } | null = null;
    const res = await fetchApi(url, {
      headers: { Accept: 'application/json', Referer: this.site + '/' },
    });
    if (!res.ok) {
      throw new Error(`HTTP Error: ${res.status}`);
    }
    json = await res.json();

    if (!json?.success || !json?.data)
      throw new Error('Không lấy được dữ liệu truyện');
    const data: ZumiNovel = json.data;

    if (data.id || data._id) {
      this.novelIdCache.set(slug, data.id || data._id!);
    }

    novel.name = (data.title || '').trim();
    novel.author = (data.author || '').trim();
    novel.cover = this.resolveCover(data.coverUrl);
    novel.summary = cleanDescriptionHtml(data.description || '');
    novel.status = parseZumiStatus(data.status);

    const genreParts: string[] = [];
    if (data.novelType) {
      genreParts.push(NOVEL_TYPE_LABELS[data.novelType] || data.novelType);
    }
    if (data.country) genreParts.push(String(data.country));
    if (Array.isArray(data.genres)) {
      for (const g of data.genres) if (g) genreParts.push(g);
    }
    novel.genres = genreParts.filter(Boolean).join(', ');

    const rawChapters = Array.isArray(data.chapters)
      ? data.chapters.slice()
      : [];
    const byVolume: Record<string, ZumiChapter[]> = {};
    const volumeOrder: string[] = [];
    for (const c of rawChapters) {
      const v = (c.volume || '').trim();
      if (!byVolume[v]) {
        byVolume[v] = [];
        volumeOrder.push(v);
      }
      byVolume[v].push(c);
    }
    for (const v of volumeOrder) {
      byVolume[v].sort((a, b) => (a.order || 0) - (b.order || 0));
    }
    volumeOrder.sort(compareZumiVolumes);

    const chapters: Plugin.ChapterItem[] = [];
    let chapterIndex = 0;
    for (const v of volumeOrder) {
      for (const c of byVolume[v]) {
        const cId = c.id || c._id || '';
        if (!cId) continue;
        chapterIndex++;

        const volumeName = v;
        const volumeSlug = zumiSlugify(volumeName) || '_';
        const baseSlug = c.slug || zumiSlugify(c.title || '') || cId;
        const chapterFinalSlug = baseSlug.endsWith(cId)
          ? baseSlug
          : `${baseSlug}-${cId}`;

        let name = (c.title || '').trim() || `Chương ${c.order || ''}`.trim();
        if (c.isVIP) name = `[VIP] ${name}`;

        const chapter: Plugin.ChapterItem = {
          path: `/novel/${slug}/read/${volumeSlug}/${chapterFinalSlug}`,
          name,
          chapterNumber: chapterIndex,
        };
        if (volumeName) chapter.page = volumeName;
        if (c.createdAt) chapter.releaseTime = c.createdAt;

        chapters.push(chapter);
      }
    }
    novel.chapters = chapters;

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const cleanPath = chapterPath
      .replace(/^https?:\/\/[^/]+/, '')
      .split('?')[0]
      .split('#')[0];

    const slugMatch = cleanPath.match(/\/novel\/([^/]+)\//);
    const slug = slugMatch ? decodeURIComponent(slugMatch[1]) : '';

    const lastSeg = cleanPath.split('/').filter(Boolean).pop() || '';
    const idMatch =
      lastSeg.match(/-([a-f0-9]{24})$/i) || lastSeg.match(/^([a-f0-9]{24})$/i);
    const chapterId = idMatch ? idMatch[1] : '';

    if (!slug || !chapterId) return '';

    const novelId = await this.getNovelId(slug);
    if (!novelId) return '';

    const apiUrl =
      `${this.site}/api/novels/${encodeURIComponent(novelId)}` +
      `/chapters/${encodeURIComponent(chapterId)}`;

    type ChapterApiResponse = {
      success?: boolean;
      data?: { title?: string; content?: string };
    };
    let json: ChapterApiResponse | null = null;
    const res = await fetchApi(apiUrl, {
      headers: {
        Accept: 'application/json',
        Referer: `${this.site}${cleanPath}`,
      },
    });
    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
    json = await res.json();

    if (!json?.success || !json?.data)
      throw new Error('Không có nội dung chương');

    const title = String(json.data.title || '').trim();
    let content = String(json.data.content || '');

    // The API often prefixes content with a `<p>{title}</p>` line that
    // duplicates the chapter title.
    if (title) {
      const dupRe = new RegExp(
        '^\\s*<p[^>]*>\\s*' +
          title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
          '\\s*</p>\\s*',
        'i',
      );
      content = content.replace(dupRe, '');
    }

    content = content.trim();
    if (!content) return title ? `<h2>${title}</h2>` : '';

    return `<h2>${title}</h2>\n${content}`;
  }

  resolveUrl(path: string, isNovel?: boolean): string {
    return this.site + path;
  }

  imageRequestInit: Plugin.ImageRequestInit = {
    headers: {
      Referer: this.site + '/',
    },
  };

  // ── Filters ────────────────────────────────────────
  filters = {
    status: {
      type: FilterTypes.Picker,
      label: 'Trạng thái',
      value: '',
      options: [
        { label: 'Tất cả', value: '' },
        { label: 'Đang ra', value: 'ongoing' },
        { label: 'Hoàn thành', value: 'completed' },
      ],
    },
    type: {
      type: FilterTypes.Picker,
      label: 'Loại',
      value: '',
      options: [
        { label: 'Tất cả', value: '' },
        { label: 'Sáng tác', value: 'original' },
        { label: 'Dịch thủ công', value: 'translated' },
        { label: 'Dịch AI', value: 'ai_translated' },
        { label: 'Truyện RAW', value: 'raw' },
      ],
    },
    country: {
      type: FilterTypes.Picker,
      label: 'Quốc gia',
      value: '',
      options: [
        { label: 'Tất cả', value: '' },
        { label: 'Trung Quốc', value: 'Trung Quốc' },
        { label: 'Hàn Quốc', value: 'Hàn Quốc' },
        { label: 'Nhật Bản', value: 'Nhật Bản' },
        { label: 'Anh / Âu Mỹ', value: 'Anh / Âu Mỹ' },
        { label: 'Khác', value: 'Khác' },
      ],
    },
    sort: {
      type: FilterTypes.Picker,
      label: 'Sắp xếp',
      value: '',
      options: [
        { label: 'Mặc định', value: '' },
        { label: 'Mới cập nhật', value: 'updated' },
        { label: 'Lượt xem', value: 'views' },
        { label: 'Tên A-Z', value: 'name' },
      ],
    },
    genre: {
      type: FilterTypes.Picker,
      label: 'Thể loại',
      value: '',
      options: [
        { label: 'Tất cả', value: '' },
        { label: '18+', value: '18+' },
        { label: 'AI Dịch', value: 'AI Dịch' },
        { label: 'Academy', value: 'Academy' },
        { label: 'Action', value: 'Action' },
        { label: 'Adult', value: 'Adult' },
        { label: 'Adventure', value: 'Adventure' },
        { label: 'Age Gap', value: 'Age Gap' },
        { label: 'Bi Kịch', value: 'Bi Kịch' },
        { label: 'Bách Hợp', value: 'Bách Hợp' },
        { label: 'Bí Ản', value: 'Bí Ản' },
        { label: 'Bí Ẩn', value: 'Bí Ẩn' },
        { label: 'Chiến Tranh', value: 'Chiến Tranh' },
        { label: 'Chuyển thể Manga', value: 'Chuyển thể Manga' },
        { label: 'Chuyển thể Manhua', value: 'Chuyển thể Manhua' },
        { label: 'Comedy', value: 'Comedy' },
        { label: 'Cyberpunk', value: 'Cyberpunk' },
        { label: 'Cổ Đại', value: 'Cổ Đại' },
        { label: 'Detective', value: 'Detective' },
        { label: 'Drama', value: 'Drama' },
        { label: 'Ecchi', value: 'Ecchi' },
        { label: 'Fantasy', value: 'Fantasy' },
        { label: 'Game', value: 'Game' },
        { label: 'Gay Cấn', value: 'Gay Cấn' },
        { label: 'Gender Bender', value: 'Gender Bender' },
        { label: 'Harem', value: 'Harem' },
        { label: 'Historical', value: 'Historical' },
        { label: 'Hiểu Lầm', value: 'Hiểu Lầm' },
        { label: 'Horror', value: 'Horror' },
        { label: 'Huyền Huyễn', value: 'Huyền Huyễn' },
        { label: 'Hài Hước', value: 'Hài Hước' },
        { label: 'Hành Động', value: 'Hành Động' },
        { label: 'Hệ Thống', value: 'Hệ Thống' },
        { label: 'Học Viện', value: 'Học Viện' },
        { label: 'Học Đường', value: 'Học Đường' },
        { label: 'Isekai', value: 'Isekai' },
        { label: 'Josei', value: 'Josei' },
        { label: 'Khoa Huyễn', value: 'Khoa Huyễn' },
        { label: 'Kinh Dị', value: 'Kinh Dị' },
        { label: 'Kiếm Hiệp', value: 'Kiếm Hiệp' },
        { label: 'Kịch Tính', value: 'Kịch Tính' },
        { label: 'Kỳ Ảo', value: 'Kỳ Ảo' },
        { label: 'Lãng Mạn', value: 'Lãng Mạn' },
        { label: 'Lịch Sử', value: 'Lịch Sử' },
        { label: 'Ma Thuật', value: 'Ma Thuật' },
        { label: 'Magical Girls', value: 'Magical Girls' },
        { label: 'Martial Arts', value: 'Martial Arts' },
        { label: 'Mature', value: 'Mature' },
        { label: 'Mystery', value: 'Mystery' },
        { label: 'Mạt Thế', value: 'Mạt Thế' },
        { label: 'Netorare', value: 'Netorare' },
        { label: 'Netorase', value: 'Netorase' },
        { label: 'Netori', value: 'Netori' },
        { label: 'Ngôn Tình', value: 'Ngôn Tình' },
        { label: 'Ngược', value: 'Ngược' },
        { label: 'Nữ Cường', value: 'Nữ Cường' },
        { label: 'One Shot', value: 'One Shot' },
        { label: 'Otome Game', value: 'Otome Game' },
        { label: 'Parody', value: 'Parody' },
        { label: 'Phiêu Lưu', value: 'Phiêu Lưu' },
        { label: 'Phát triển nhân vật', value: 'Phát triển nhân vật' },
        { label: 'Psychological', value: 'Psychological' },
        { label: 'Quân Sự', value: 'Quân Sự' },
        { label: 'Reincarnation', value: 'Reincarnation' },
        { label: 'Rom-Com', value: 'Rom-Com' },
        { label: 'Romance', value: 'Romance' },
        { label: 'School Life', value: 'School Life' },
        { label: 'Sci-Fi', value: 'Sci-Fi' },
        { label: 'Seinen', value: 'Seinen' },
        { label: 'Shoujo', value: 'Shoujo' },
        { label: 'Shoujo ai', value: 'Shoujo ai' },
        { label: 'Shounen', value: 'Shounen' },
        { label: 'Siêu Nhiên', value: 'Siêu Nhiên' },
        { label: 'Siêu Năng Lực', value: 'Siêu Năng Lực' },
        { label: 'Slice of Life', value: 'Slice of Life' },
        { label: 'Slow Life', value: 'Slow Life' },
        { label: 'Smut', value: 'Smut' },
        { label: 'Supernatural', value: 'Supernatural' },
        { label: 'Thanh Xuân', value: 'Thanh Xuân' },
        { label: 'Tiên Hiệp', value: 'Tiên Hiệp' },
        { label: 'Truyện Hàn', value: 'Truyện Hàn' },
        { label: 'Truyện Nhật', value: 'Truyện Nhật' },
        { label: 'Truyện Trung', value: 'Truyện Trung' },
        { label: 'Trọng Sinh', value: 'Trọng Sinh' },
        { label: 'Tâm Lý', value: 'Tâm Lý' },
        { label: 'Vampire', value: 'Vampire' },
        { label: 'Võ Thuật', value: 'Võ Thuật' },
        { label: 'Web Novel', value: 'Web Novel' },
        { label: 'Wuxia', value: 'Wuxia' },
        { label: 'Xuyên Không', value: 'Xuyên Không' },
        { label: 'Yandere', value: 'Yandere' },
        { label: 'Yuri', value: 'Yuri' },
        { label: 'tragedy', value: 'tragedy' },
        { label: 'Đô Thị', value: 'Đô Thị' },
        { label: 'Đời Thường', value: 'Đời Thường' },
      ],
    },
  } satisfies Filters;
}

export default new ZumiNovelPlugin();
