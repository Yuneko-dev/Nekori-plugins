import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { NovelStatus } from '@libs/novelStatus';
import { defaultCover } from '@libs/defaultCover';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { cbc } from '@libs/aes';
import {
  utf8ToBytes,
  Buffer,
  NodeCrypto,
  encodeHtmlEntities,
} from '@libs/utils';

const API_BASE = 'https://backend.metruyencv.com/api';
const APP_ID = 'MeTruyenChu';
const AES_KEY = 'aa4uCch7CR8KiBdQ';

// API decrypt by Captain

function generateSignature(urlPath: string): string {
  const fullUrl = `${API_BASE}/${urlPath}`;
  const pathname = new URL(fullUrl).pathname;
  const payload = JSON.stringify({
    app_id: APP_ID,
    time: Math.floor(Date.now() / 1000),
    path: pathname,
  });

  const key = utf8ToBytes(AES_KEY);
  const iv = utf8ToBytes(AES_KEY);
  const cipher = cbc(key, iv);
  const encrypted = cipher.encrypt(utf8ToBytes(payload));
  return Buffer.from(encrypted).toString('base64');
}

function generateHash(): string {
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let hash = '';
  for (let i = 0; i < 16; i++) {
    hash += chars[Math.floor(Math.random() * chars.length)];
  }
  return hash;
}

function decryptContent(content: string, hash: string): string {
  const seed = Buffer.from(hash + hash, 'binary')
    .toString('base64')
    .slice(0, 16);
  const aesKey = NodeCrypto.createHash('sha1')
    .update(seed)
    .digest('hex')
    .slice(0, 16);

  const key = utf8ToBytes(aesKey);
  const iv = utf8ToBytes(aesKey);
  const decipher = cbc(key, iv);
  const decrypted = decipher.decrypt(
    new Uint8Array(Buffer.from(content, 'base64')),
  );
  return Buffer.from(decrypted).toString('utf8');
}

async function apiGet(urlPath: string) {
  const res = await fetchApi(`${API_BASE}/${urlPath}`, {
    headers: {
      Accept: 'application/json',
      'X-App': APP_ID,
      'X-Signature': generateSignature(urlPath),
    },
  });
  return res.json();
}

type BookItem = {
  id: number;
  name: string;
  slug: string;
  poster: { default: string; '300': string; '600': string };
  synopsis: string;
  vote_count: number;
  status: number;
  status_name: string;
  chapter_count: number;
  kind: number;
  creator?: { name: string };
  author?: { name: string; local_name?: string };
  genres?: { id: number; name: string }[];
};

type ChapterItem = {
  id: number;
  name: string;
  index: number;
  published_at: string;
};

type ApiListResponse<T> = {
  data: T[];
  pagination: { current: number; last: number; total: number };
  success: boolean;
};

class MeTruyenCVPlugin implements Plugin.PluginBase {
  id = 'metruyencv';
  name = 'MeTruyenCV';
  icon = 'src/vi/metruyencv/icon.png';
  site = 'https://metruyencv.com';
  version = '1.0.5';

  async popularNovels(
    pageNo: number,
    { filters }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const sort = filters?.sort?.value || '-updated_at';
    const kind = filters?.kind?.value || '';
    const genre = filters?.genre?.value || '';
    let urlPath = `books?filter[state]=published&include=creator&limit=20&page=${pageNo}&sort=${sort}`;
    if (kind) urlPath += `&filter[kind]=${kind}`;
    if (genre) urlPath += `&filter[genres.id]=${genre}`;
    const json: ApiListResponse<BookItem> = await apiGet(urlPath);

    if (!json.success || !json.data) return [];

    return json.data.map(book => ({
      name: book.name,
      path: String(book.id),
      cover: book.poster?.['300'] || book.poster?.default || defaultCover,
    }));
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const bookId = novelPath;

    const [bookJson, chapJson] = await Promise.all([
      apiGet(`books/${bookId}`),
      apiGet(`chapters?filter[book_id]=${bookId}&filter[type]=published`),
    ]);

    const book = bookJson?.data || chapJson?.extra?.book;
    if (!book) {
      throw new Error('Không tìm thấy truyện');
    }

    const chaptersData: ChapterItem[] = chapJson?.data || [];

    let status: string = NovelStatus.Unknown;
    if (book?.status_name === 'Hoàn thành' || book?.status === 2) {
      status = NovelStatus.Completed;
    } else if (book?.status_name === 'Còn tiếp' || book?.status === 1) {
      status = NovelStatus.Ongoing;
    }

    let authorName = '';
    if (book?.author) {
      authorName = book.author.name || '';
      if (book.author.local_name) authorName += ` (${book.author.local_name})`;
    } else if (book?.creator?.name) {
      authorName = book.creator.name;
    }

    const genres = book?.genres
      ? book.genres.map((g: { name: string }) => g.name).join(', ')
      : '';

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: book?.name || 'Không có tiêu đề',
      cover:
        book?.poster?.['600'] ||
        book?.poster?.['300'] ||
        book?.poster?.default ||
        defaultCover,
      author: authorName,
      genres,
      summary: book?.synopsis || '',
      status,
      chapters: chaptersData.map(ch => ({
        name: ch.name,
        path: String(ch.id),
        chapterNumber: ch.index,
        releaseTime: ch.published_at
          ? new Date(ch.published_at).toISOString()
          : undefined,
      })),
    };

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const hash = generateHash();
    const urlPath = `chapters/${chapterPath}?hash=${hash}`;
    const json = await apiGet(urlPath);

    if (!json.success || !json.data) {
      throw new Error('Không tìm thấy chương');
    }

    const encrypted = json.data.content;
    if (!encrypted) throw new Error('Nội dung chương trống hoặc lỗi');

    const content = decryptContent(encrypted, hash);
    return content
      .split('\n')
      .filter(line => line.trim().length > 0)
      .map(line => `<p>${encodeHtmlEntities(line.trim())}</p>`)
      .join('<br>');
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const keyword = encodeURIComponent(searchTerm.trim());
    if (!keyword) return [];
    const urlPath = `books?limit=20&page=${pageNo}&filter[keyword]=${keyword}&include=creator`;
    const json: ApiListResponse<BookItem> = await apiGet(urlPath);

    if (!json.success || !json.data) return [];

    return json.data.map(book => ({
      name: book.name,
      path: String(book.id),
      cover: book.poster?.['300'] || book.poster?.default || defaultCover,
    }));
  }

  resolveUrl(path: string, isNovel?: boolean): string {
    if (isNovel) {
      return `${this.site}/truyen/${path}`;
    }
    return `${this.site}/truyen/chuong/${path}`;
  }

  filters = {
    sort: {
      label: 'Sắp xếp',
      value: '-updated_at',
      options: [
        { label: 'Mới cập nhật', value: '-updated_at' },
        { label: 'Nhiều vote', value: '-vote_count' },
        { label: 'Nhiều lượt xem', value: '-view_count' },
        { label: 'Nhiều bookmark', value: '-bookmark_count' },
        { label: 'Đánh giá cao', value: '-review_score' },
        { label: 'Nhiều đánh giá', value: '-review_count' },
        { label: 'Nhiều bình luận', value: '-comment_count' },
        { label: 'Nhiều chương', value: '-chapter_count' },
        { label: 'Nhiều chữ', value: '-word_count' },
        { label: 'Mới đăng', value: '-published_at' },
      ],
      type: FilterTypes.Picker,
    },
    kind: {
      label: 'Loại truyện',
      value: '',
      options: [
        { label: 'Tất cả', value: '' },
        { label: 'Chuyển ngữ', value: '1' },
        { label: 'Sáng tác', value: '2' },
      ],
      type: FilterTypes.Picker,
    },
    genre: {
      label: 'Thể loại',
      value: '',
      options: [
        { label: 'Tất cả', value: '' },
        { label: 'Tiên Hiệp', value: '2' },
        { label: 'Huyền Huyễn', value: '3' },
        { label: 'Khoa Huyễn', value: '4' },
        { label: 'Võng Du', value: '5' },
        { label: 'Đô Thị', value: '6' },
        { label: 'Đồng Nhân', value: '7' },
        { label: 'Dã Sử', value: '8' },
        { label: 'Cạnh Kỹ', value: '9' },
        { label: 'Hiện Đại Ngôn Tình', value: '10' },
        { label: 'Huyền Nghi', value: '11' },
        { label: 'Kiếm Hiệp', value: '12' },
        { label: 'Huyền Huyễn Ngôn Tình', value: '13' },
        { label: 'Huyền Nghi Thần Quái', value: '16' },
        { label: 'Khoa Huyễn Không Gian', value: '17' },
        { label: 'Lãng Mạn Thanh Xuân', value: '18' },
        { label: 'Kỳ Ảo', value: '20' },
        { label: 'Light Novel', value: '22' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;
}

export default new MeTruyenCVPlugin();
