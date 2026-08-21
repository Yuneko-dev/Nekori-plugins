import { fetchApi } from '@libs/fetch';
import { load } from 'cheerio';
import { Plugin } from '@/types/plugin';
import { NovelStatus } from '@libs/novelStatus';
import { defaultCover } from '@libs/defaultCover';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { ecb } from '@libs/aes';
import { utf8ToBytes, Buffer } from '@libs/utils';

const API_HOSTS = [
  'https://api-01.mottruyen.vn',
  'https://api-02.mottruyen.vn',
  'https://api.mottruyen.vn',
];
const WEB_HOST = 'https://mottruyen.com.vn';
const IMAGE_STORAGE = 'https://static.mottruyen.com.vn/api/v1/storage';
const APP_VERSION = '4.3.2';
const PACKAGE_NAME = 'com.tungdx.mottruyenapp';
const CHAPTER_AES_KEY = '7BdHgqdizVWKwzCHBcXluUtorL09lrnk';

function randomHex(length = 16): string {
  const chars = '0123456789abcdef';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

function createGuestContext() {
  const now = Date.now();
  return {
    deviceId: `mt-${randomHex(8)}-${now}`,
    visitorId: `${randomHex(16)}.${randomHex(8)}`,
    cookieId: `mt.${randomHex(12)}.${now}`,
  };
}

const guest = createGuestContext();

function buildHeaders(): Record<string, string> {
  return {
    'Accept': 'application/json, text/plain, */*',
    'Content-Type': 'application/json',
    'User-Agent': 'okhttp/4.9.2',
    'X-Requested-With': PACKAGE_NAME,
    'platform': 'APP',
    'x-platform': 'APP',
    'version': APP_VERSION,
    'app-version': APP_VERSION,
    'deviceId': guest.deviceId,
    'visitorId': guest.visitorId,
    'cookieId': guest.cookieId,
    'Cookie': `cookieId=${guest.cookieId}`,
  };
}

function imageUrl(path: string): string {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith('/api/v1/storage'))
    return `https://static.mottruyen.com.vn${path}`;
  return `${IMAGE_STORAGE}${path.startsWith('/') ? path : `/${path}`}`;
}

function decryptChapterPayload(base64Ciphertext: string): string {
  const key = utf8ToBytes(CHAPTER_AES_KEY);
  const decipher = ecb(key, { disablePadding: false });
  const decrypted = decipher.decrypt(
    new Uint8Array(Buffer.from(base64Ciphertext, 'base64')),
  );
  return Buffer.from(decrypted).toString('utf8');
}

function deepFindContent(node: any, depth = 0): string {
  if (!node || depth > 6) return '';
  if (typeof node === 'string') return node.trim();
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = deepFindContent(item, depth + 1);
      if (found) return found;
    }
    return '';
  }
  if (typeof node !== 'object') return '';

  for (const key of [
    'content',
    'chapterContent',
    'chapterText',
    'text',
    'body',
    'html',
    'rawContent',
  ]) {
    if (typeof node[key] === 'string' && node[key].trim())
      return node[key].trim();
  }
  for (const key of [
    'chapter',
    'chapterData',
    'currentChapter',
    'storyReadingData',
    'data',
    'result',
    'payload',
  ]) {
    const found = deepFindContent(node[key], depth + 1);
    if (found) return found;
  }
  return '';
}

function extractCipher(payload: any): string {
  if (typeof payload === 'string') return payload.trim();
  const obj =
    payload?.data &&
    typeof payload.data === 'object' &&
    !Array.isArray(payload.data)
      ? payload.data
      : payload;
  for (const key of [
    'data',
    'encrypted',
    'encryption',
    'payload',
    'cipher',
    'content',
  ]) {
    if (typeof obj?.[key] === 'string' && obj[key].trim())
      return obj[key].trim();
  }
  return '';
}

function extractList(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.data)) return payload.data.data;
  if (Array.isArray(payload?.list)) return payload.list;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data?.list)) return payload.data.list;
  return [];
}

function parseJsonOrText(text: string): any {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function apiGet(endpoint: string): Promise<any> {
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const headers = buildHeaders();
  let lastError: any;

  for (const host of API_HOSTS) {
    try {
      const res = await fetchApi(`${host}${path}`, { headers });
      if (!res.ok) {
        lastError = new Error(`HTTP ${res.status}`);
        continue;
      }
      const text = await res.text();
      return parseJsonOrText(text);
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError;
}

type StoryItem = {
  id: number;
  name: string;
  slug?: string;
  image?: string;
  imageUrl?: string;
  thumbnail?: string;
  introduce?: string;
  category?: { id: string; name: string; index: string }[];
  author?: { id: number; name: string } | string;
  countChapter?: number;
  type?: string;
  finish?: boolean;
  packageType?: string;
};

type ChapterListItem = {
  id: number;
  chapter: number;
  name?: string;
  title?: string;
  createdAt?: string;
  updatedAt?: string;
};

class MotTruyenPlugin implements Plugin.PluginBase {
  id = 'mottruyen.com.vn';
  name = 'Mọt Truyện';
  icon = 'src/vi/mottruyen/icon.png';
  site = WEB_HOST;
  version = '1.0.3';

  async popularNovels(
    pageNo: number,
    { filters }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const collection = filters?.collection?.value || 'NEW';
    const noPagination = collection === 'NEW' || collection === 'POPULAR';
    if (noPagination && pageNo > 1) return [];
    const page = pageNo - 1;
    const json = await apiGet(
      `/api/v1/story?collection=${collection}&size=20&page=${page}`,
    );
    const list: StoryItem[] = extractList(json);

    return list.map(story => ({
      name: story.name || '',
      path: String(story.id),
      cover: imageUrl(story.image || story.imageUrl || '') || defaultCover,
    }));
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const storyId = novelPath;

    const [detailJson, chapJson] = await Promise.all([
      apiGet(`/api/v1/story/${storyId}`),
      apiGet(`/api/v1/story/${storyId}/chapter?size=9999&page=0&sort=asc`),
    ]);

    const story: StoryItem =
      detailJson?.data && typeof detailJson.data === 'object'
        ? detailJson.data
        : detailJson;

    let authorName = '';
    if (story.author) {
      if (typeof story.author === 'string') {
        authorName = story.author;
      } else if (typeof story.author === 'object' && story.author.name) {
        authorName = story.author.name;
      }
    }

    const genres = story.category
      ? story.category.map(c => c.name).join(',')
      : '';

    let status: string = NovelStatus.Unknown;
    if (story.finish === true) {
      status = NovelStatus.Completed;
    } else if (story.finish === false) {
      status = NovelStatus.Ongoing;
    }

    const chapList: ChapterListItem[] = extractList(chapJson);

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: story.name || '',
      cover: imageUrl(story.image || story.imageUrl || '') || defaultCover,
      author: authorName,
      genres,
      summary: story.introduce ? load(story.introduce).text() : '',
      status,
      chapters: chapList.map(ch => ({
        name: ch.name || ch.title || `Chương ${ch.chapter}`,
        path: `${storyId}/${ch.chapter}`,
        chapterNumber: ch.chapter,
        releaseTime: ch.createdAt
          ? new Date(ch.createdAt).toISOString()
          : ch.updatedAt
            ? new Date(ch.updatedAt).toISOString()
            : undefined,
      })),
    };

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const [storyId, chapterNo] = chapterPath.split('/');
    const json = await apiGet(
      `/api/v1/story/${storyId}/chapter/${chapterNo}/encryption?password=null`,
    );
    const cipher = extractCipher(json);
    if (!cipher) throw new Error('Không tìm thấy dữ liệu mã hóa của chương');

    const decryptedText = decryptChapterPayload(cipher);
    let parsed: any;
    try {
      parsed = JSON.parse(decryptedText);
    } catch {
      parsed = decryptedText;
    }

    const content = deepFindContent(
      parsed &&
        typeof parsed === 'object' &&
        !Array.isArray(parsed) &&
        parsed.data
        ? parsed.data
        : parsed,
    );
    if (!content) throw new Error('Không tìm thấy nội dung chương');

    const $ = load(content);
    $('br').replaceWith('\n');
    $('p').each((_, el) => {
      $(el).replaceWith($(el).text() + '\n');
    });

    return $.text()
      .split('\n')
      .filter((line: string) => line.trim().length > 0)
      .map((line: string) => `<p>${line.trim()}</p>`)
      .join('\n');
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const keyword = encodeURIComponent(searchTerm.trim());
    if (!keyword) return [];
    const page = pageNo - 1;
    const json = await apiGet(
      `/api/v1/story?collection=SEARCH&keyword=${keyword}&size=20&page=${page}`,
    );
    const list: StoryItem[] = extractList(json);

    return list.map(story => ({
      name: story.name || '',
      path: String(story.id),
      cover: imageUrl(story.image || story.imageUrl || '') || defaultCover,
    }));
  }

  resolveUrl(path: string, isNovel?: boolean): string {
    if (isNovel) {
      return `${WEB_HOST}/story/${path}`;
    }
    const [storyId, chapterNo] = path.split('/');
    return `${WEB_HOST}/story/${storyId}/chuong/${chapterNo}`;
  }

  filters = {
    collection: {
      label: 'Danh mục',
      value: 'NEW',
      options: [
        { label: 'Mới', value: 'NEW' },
        { label: 'Phổ biến', value: 'POPULAR' },
        { label: 'Hoàn thành', value: 'FULL' },
        { label: 'Sáng tác', value: 'COMPOSE' },
        { label: 'Chuyển ngữ', value: 'TRANSLATE' },
        { label: 'Độc quyền', value: 'EXCLUSIVE' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;
}

export default new MotTruyenPlugin();
