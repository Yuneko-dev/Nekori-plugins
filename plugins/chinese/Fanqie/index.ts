import { fetchApi } from '@libs/fetch';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { NovelStatus } from '@libs/novelStatus';
import { storage } from '@libs/storage';
import { NekoriBasePlugin } from '@nekori/plugin';
import { ContentType, ContentWarning } from '@nekori/pluginMetadata';
import { load as loadCheerio } from 'cheerio';

import { Plugin } from '@/types/plugin';

import { decodeLibraryFont, decodeReaderFont, hasPuaChars } from './fonts';

const SITE = 'https://fanqienovel.com';
const SEARCH_API =
  'https://novel.snssdk.com/api/novel/channel/homepage/search/search/v1/';
const DEFAULT_PROXY_URL = 'https://gofq.52dns.cc';
const EXPECTED_READER_FONT = 'dc027189e0ba4cd';
const LIBRARY_PAGE_SIZE = 18;
const SEARCH_PAGE_SIZE = 10;
const READABLE_GENRES = new Set(['0', '6', '7', '8', '204']);
const PROXY_WATERMARK_RE =
  /禁止传播直链|书源防失联|本书源属于|提供免费阅读服务|偷接口|谨防上当受骗|发现有倒狗/;

const CATEGORY_OPTIONS = [
  { label: '全部分类 (All Categories)', value: '' },
  { label: '传统玄幻 (Traditional Xuanhuan)', value: '258' },
  { label: '玄幻脑洞 (Xuanhuan Brainhole)', value: '257' },
  { label: '东方仙侠 (Eastern Xianxia)', value: '1140' },
  { label: '西方奇幻 (Western Fantasy)', value: '1141' },
  { label: '都市日常 (Urban Daily)', value: '261' },
  { label: '都市脑洞 (Urban Brainhole)', value: '262' },
  { label: '都市高武 (Urban High-Martial)', value: '1014' },
  { label: '都市修真 (Urban Cultivation)', value: '124' },
  { label: '都市种田 (Urban Farming)', value: '263' },
  { label: '战神赘婿 (God of War / Son-in-Law)', value: '27' },
  { label: '历史古代 (Historical)', value: '273' },
  { label: '历史脑洞 (Historical Brainhole)', value: '272' },
  { label: '抗战谍战 (War & Espionage)', value: '504' },
  { label: '科幻末世 (Sci-Fi & Apocalypse)', value: '8' },
  { label: '悬疑灵异 (Mystery & Supernatural)', value: '751' },
  { label: '悬疑脑洞 (Mystery Brainhole)', value: '539' },
  { label: '游戏体育 (Gaming & Sports)', value: '746' },
  { label: '动漫衍生 (Anime Derivative)', value: '718' },
  { label: '男频衍生 (Male Derivative)', value: '1016' },
  { label: '古风世情 (Ancient Romance & Life)', value: '1139' },
  { label: '古言脑洞 (Ancient Romance Brainhole)', value: '253' },
  { label: '宫斗宅斗 (Palace & Manor Intrigue)', value: '246' },
  { label: '玄幻言情 (Fantasy Romance)', value: '248' },
  { label: '现言脑洞 (Modern Romance Brainhole)', value: '267' },
  { label: '豪门总裁 (CEO & Wealthy Family)', value: '748' },
  { label: '青春甜宠 (Youth Sweet Romance)', value: '749' },
  { label: '职场婚恋 (Workplace & Marriage)', value: '750' },
  { label: '星光璀璨 (Showbiz)', value: '745' },
  { label: '民国言情 (Republican Era Romance)', value: '1017' },
  { label: '女频悬疑 (Female Mystery)', value: '747' },
  { label: '女频衍生 (Female Derivative)', value: '1015' },
  { label: '年代 (Period Drama)', value: '79' },
  { label: '种田 (Farming)', value: '23' },
  { label: '快穿 (Quick Transmigration)', value: '24' },
  { label: '双男主 (BL)', value: '275' },
  { label: '双女主 (GL)', value: '704' },
] as const;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(text: string): string {
  return escapeHtml(text).replace(/"/g, '&quot;');
}

/**
 * Extracts the balanced JSON literal assigned to `window.__INITIAL_STATE__=`.
 */
function extractInitialState(html: string): UnknownRecord | undefined {
  const marker = 'window.__INITIAL_STATE__=';
  const markerIdx = html.indexOf(marker);
  if (markerIdx < 0) return undefined;

  const start = html.indexOf('{', markerIdx + marker.length);
  if (start < 0) return undefined;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < html.length; i += 1) {
    const ch = html[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          const parsed: unknown = JSON.parse(html.slice(start, i + 1));
          return isRecord(parsed) ? parsed : undefined;
        } catch {
          return undefined;
        }
      }
    }
  }

  return undefined;
}

function resolveContentType(
  hasText: boolean,
  hasImages: boolean,
): Plugin.ChapterContentType {
  if (hasText && hasImages) return 'mixed';
  if (hasImages) return 'image';
  return 'novel';
}

class FanqiePlugin extends NekoriBasePlugin {
  id = 'fanqienovel.com';
  name = 'Fanqie';
  icon = 'icon.png';
  site = SITE;
  version = '1.0.1';
  contentType = ContentType.NOVEL;
  contentWarning = ContentWarning.UNSPECIFIED;

  imageRequestInit: Plugin.ImageRequestInit = {
    headers: {
      Referer: `${SITE}/`,
    },
  };

  pluginSettings: Plugin.PluginSettings = {
    fanqieProxyUrl: {
      type: 'Text',
      label:
        'Máy chủ nội dung cho chương sau chap 10 (Proxy URL; xóa trống để chỉ dùng fanqienovel.com)',
      value: DEFAULT_PROXY_URL,
    },
    fanqieCookie: {
      type: 'Text',
      label: 'Cookie đăng nhập Fanqie SVIP (tùy chọn: name=value; ...)',
      value: '',
    },
  };

  filters = {
    keyword: {
      type: FilterTypes.TextInput,
      label: '关键词搜索 (Search Keyword)',
      value: '',
    },
    gender: {
      type: FilterTypes.Picker,
      label: '频道 (Audience)',
      value: '',
      options: [
        { label: '全部 (All)', value: '' },
        { label: '男生 (Male)', value: '1' },
        { label: '女生 (Female)', value: '0' },
      ],
    },
    category: {
      type: FilterTypes.Picker,
      label: '分类 (Category)',
      value: '',
      options: CATEGORY_OPTIONS,
    },
    status: {
      type: FilterTypes.Picker,
      label: '状态 (Status)',
      value: '',
      options: [
        { label: '全部 (All)', value: '' },
        { label: '连载中 (Ongoing)', value: '1' },
        { label: '已完结 (Completed)', value: '0' },
      ],
    },
    wordCount: {
      type: FilterTypes.Picker,
      label: '字数 (Word Count)',
      value: '',
      options: [
        { label: '全部 (Any Length)', value: '' },
        { label: '30万以下 (Under 300K)', value: '0' },
        { label: '30–50万 (300K–500K)', value: '1' },
        { label: '50–100万 (500K–1M)', value: '2' },
        { label: '100–200万 (1M–2M)', value: '3' },
        { label: '200万以上 (Over 2M)', value: '4' },
      ],
    },
    sort: {
      type: FilterTypes.Picker,
      label: '排序 (Sort By)',
      value: '0',
      options: [
        { label: '最热 (Popular)', value: '0' },
        { label: '最新 (Latest)', value: '1' },
        { label: '字数 (Word Count)', value: '2' },
      ],
    },
  } satisfies Filters;

  private extractNovelId(path: string): string | undefined {
    const clean = path.trim();
    if (/^\d+$/.test(clean)) return clean;
    return clean.match(/\/page\/(\d+)/)?.[1];
  }

  private extractChapterId(path: string): string | undefined {
    const clean = path.trim();
    if (/^\d+$/.test(clean)) return clean;
    return clean.match(/\/reader\/(\d+)/)?.[1];
  }

  private normalizeImageUrl(raw: unknown): string | undefined {
    if (typeof raw !== 'string') return undefined;
    let url = raw.trim();
    if (!url) return undefined;

    if (url.startsWith('//')) {
      url = `https:${url}`;
    } else if (/^http:\/\//i.test(url)) {
      url = url.replace(/^http:\/\//i, 'https://');
    } else if (url.startsWith('/')) {
      url = `${SITE}${url}`;
    }

    // `p*-tt.bytecdn.cn` search thumbnails return 403 outside the app; `p6-novel.byteimg.com` serves the same path cleanly.
    url = url.replace(
      /^https:\/\/p\d+-tt\.bytecdn\.cn\//i,
      'https://p6-novel.byteimg.com/',
    );

    return /^https?:\/\//i.test(url) ? url : undefined;
  }

  private normalizeCover(raw: unknown): string | undefined {
    return this.normalizeImageUrl(raw) || undefined;
  }

  private resolveChapterImageSrc(rawSrc: string): string | undefined {
    const trimmed = rawSrc.trim();
    if (!trimmed) return undefined;

    const jsonBlocks = trimmed.match(/\{[^{}]+\}/g);
    if (jsonBlocks) {
      for (const block of jsonBlocks) {
        if (block.includes('image_domain')) continue;
        try {
          const parsed: unknown = JSON.parse(block);
          if (
            isRecord(parsed) &&
            typeof parsed.web_uri === 'string' &&
            parsed.web_uri.trim()
          ) {
            const uri = parsed.web_uri.trim().replace(/^\/+/, '');
            return `https://p6-novel.byteimg.com/large/${uri}`;
          }
        } catch {
          // Ignore malformed non-JSON braces and fall through to URL normalization.
        }
      }
    }

    return this.normalizeImageUrl(trimmed);
  }

  private getSettingString(key: string, fallback: string): string {
    const stored = storage.get(key);
    return typeof stored === 'string' ? stored.trim() : fallback;
  }

  private getProxyUrl(): string {
    return this.getSettingString('fanqieProxyUrl', DEFAULT_PROXY_URL).replace(
      /\/+$/,
      '',
    );
  }

  private getCookieHeader(): string {
    return this.getSettingString('fanqieCookie', '');
  }

  private buildProxyRequestUrl(proxyBase: string, itemId: string): string {
    if (/\{itemId\}|\{\{item_id\}\}/i.test(proxyBase)) {
      return proxyBase
        .replace(/\{itemId\}/gi, encodeURIComponent(itemId))
        .replace(/\{\{item_id\}\}/gi, encodeURIComponent(itemId));
    }
    return `${proxyBase}/content?item_id=${encodeURIComponent(itemId)}`;
  }

  private extractProxyPayload(payload: unknown): {
    content?: string;
    authorSpeak?: string;
  } {
    if (!isRecord(payload)) return {};
    if (payload.code !== undefined && payload.code !== 0) return {};

    const containers: UnknownRecord[] = [];
    if (isRecord(payload.data)) {
      containers.push(payload.data);
      if (isRecord(payload.data.data)) {
        containers.push(payload.data.data);
      }
    } else if (Array.isArray(payload.data) && isRecord(payload.data[0])) {
      containers.push(payload.data[0]);
    }
    containers.push(payload);

    for (const container of containers) {
      const content =
        typeof container.content === 'string' && container.content.trim()
          ? container.content
          : typeof container.text === 'string' && container.text.trim()
            ? container.text
            : undefined;
      if (content) {
        const authorSpeak =
          typeof container.author_speak === 'string' &&
          container.author_speak.trim()
            ? container.author_speak.trim()
            : undefined;
        return { content, authorSpeak };
      }
    }

    return {};
  }

  private async fetchFromProxy(itemId: string): Promise<{
    result?: Plugin.ChapterContent;
    error?: string;
  }> {
    const proxyBase = this.getProxyUrl();
    if (!proxyBase) return {};

    const url = this.buildProxyRequestUrl(proxyBase, itemId);
    let response = await fetchApi(url).catch(() => undefined);
    if (response && response.status >= 500 && response.status < 600) {
      response = await fetchApi(url).catch(() => undefined);
    }
    if (!response) {
      return { error: 'Proxy request failed (network error)' };
    }
    if (!response.ok) {
      return { error: `Proxy returned HTTP ${response.status}` };
    }

    let payload: unknown;
    try {
      payload = JSON.parse(await response.text());
    } catch {
      return { error: 'Proxy returned invalid JSON' };
    }

    const { content: rawContent, authorSpeak } =
      this.extractProxyPayload(payload);
    if (!rawContent) {
      return { error: 'Proxy returned empty chapter content' };
    }

    const decoded = hasPuaChars(rawContent)
      ? decodeReaderFont(rawContent)
      : rawContent;
    const body = this.renderChapterBody(decoded, true);
    if (!body.html) {
      return { error: 'Proxy chapter content was empty after cleaning' };
    }

    let html = body.html;
    let hasText = body.hasText;
    if (authorSpeak) {
      const note = this.formatSummary(authorSpeak);
      if (note) {
        const noteHtml = note
          .split('\n')
          .map(line => `<p>${escapeHtml(line)}</p>`)
          .join('');
        html += `<hr /><p><strong>作者有话说：</strong></p>${noteHtml}`;
        hasText = true;
      }
    }

    return {
      result: {
        state: 'ready',
        type: resolveContentType(hasText, body.hasImages),
        html,
      },
    };
  }

  private async fetchTextStrict(
    url: string,
    referer = `${SITE}/`,
    cookie?: string,
  ): Promise<string> {
    const headers: Record<string, string> = {
      Referer: referer,
    };
    if (cookie) {
      headers.Cookie = cookie;
    }
    const response = await fetchApi(url, { headers });
    if (!response.ok) {
      throw new Error(
        `Fanqie request failed (${url}): HTTP ${response.status}`,
      );
    }
    return response.text();
  }

  private async fetchJson(
    url: string,
    referer = `${SITE}/`,
  ): Promise<UnknownRecord> {
    const body = await this.fetchTextStrict(url, referer);
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      throw new Error(`Fanqie returned invalid JSON for ${url}`);
    }
    if (!isRecord(parsed)) {
      throw new Error(`Fanqie returned unexpected payload for ${url}`);
    }
    return parsed;
  }

  private async fetchPlainBookInfo(
    bookId: string,
  ): Promise<UnknownRecord | undefined> {
    try {
      const payload = await this.fetchJson(
        `${SITE}/api/book/info?bookId=${bookId}`,
        `${SITE}/page/${bookId}`,
      );
      return isRecord(payload.data) ? payload.data : undefined;
    } catch {
      return undefined;
    }
  }

  async popularNovels(
    pageNo: number,
    options: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    if (!Number.isInteger(pageNo) || pageNo < 1) return [];

    const filters = options?.filters;
    const keyword = filters?.keyword?.value?.trim() || '';
    if (keyword) {
      return this.searchNovels(keyword, pageNo);
    }

    const sort = options?.showLatestNovels ? '1' : filters?.sort?.value || '0';

    const params = new URLSearchParams({
      page_count: String(LIBRARY_PAGE_SIZE),
      page_index: String(pageNo - 1),
      gender: filters?.gender?.value || '-1',
      category_id: filters?.category?.value || '-1',
      creation_status: filters?.status?.value || '-1',
      word_count: filters?.wordCount?.value || '-1',
      book_type: '-1',
      sort,
    });

    const payload = await this.fetchJson(
      `${SITE}/api/library/book_list?${params.toString()}`,
      `${SITE}/library`,
    );

    if (payload.code !== 0) {
      if (pageNo > 1) return [];
      const message =
        typeof payload.message === 'string' && payload.message
          ? payload.message
          : 'Unknown API error';
      throw new Error(`Fanqie library request failed: ${message}`);
    }

    const data = isRecord(payload.data) ? payload.data : undefined;
    const bookList = Array.isArray(data?.book_list) ? data.book_list : [];
    const novels: Plugin.NovelItem[] = [];

    for (const item of bookList) {
      if (!isRecord(item)) continue;
      const bookId =
        typeof item.book_id === 'string' || typeof item.book_id === 'number'
          ? String(item.book_id).trim()
          : '';
      const rawName =
        typeof item.book_name === 'string' ? item.book_name.trim() : '';
      if (!/^\d+$/.test(bookId) || !rawName) continue;

      let name = decodeLibraryFont(rawName);
      if (hasPuaChars(name)) {
        const info = await this.fetchPlainBookInfo(bookId);
        if (typeof info?.bookName === 'string' && info.bookName.trim()) {
          name = info.bookName.trim();
        }
      }

      novels.push({
        name,
        path: `/page/${bookId}`,
        cover: this.normalizeCover(item.thumb_url ?? item.thumb_uri),
      });
    }

    return novels;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const term = searchTerm.trim();
    if (!term || !Number.isInteger(pageNo) || pageNo < 1) return [];

    const params = new URLSearchParams({
      device_platform: 'android',
      parent_enterfrom: 'novel_channel_search.tab.',
      offset: String((pageNo - 1) * SEARCH_PAGE_SIZE),
      aid: '1967',
      q: term,
    });

    const payload = await this.fetchJson(`${SEARCH_API}?${params.toString()}`);
    if (payload.code !== 0) {
      const message =
        typeof payload.message === 'string' && payload.message
          ? payload.message
          : 'Unknown search error';
      throw new Error(`Fanqie search failed: ${message}`);
    }

    const data = isRecord(payload.data) ? payload.data : undefined;
    const rows = Array.isArray(data?.ret_data) ? data.ret_data : [];
    const novels: Plugin.NovelItem[] = [];
    const seen = new Set<string>();

    for (const row of rows) {
      if (!isRecord(row)) continue;
      const genre =
        row.genre !== undefined && row.genre !== null
          ? String(row.genre).trim()
          : '0';
      if (genre && !READABLE_GENRES.has(genre)) continue;

      const bookId =
        typeof row.book_id === 'string' || typeof row.book_id === 'number'
          ? String(row.book_id).trim()
          : '';
      const title = typeof row.title === 'string' ? row.title.trim() : '';
      if (!/^\d+$/.test(bookId) || !title || seen.has(bookId)) continue;
      seen.add(bookId);

      const cover =
        this.normalizeImageUrl(row.thumb_url) ||
        this.normalizeImageUrl(row.audio_thumb_uri) ||
        undefined;

      novels.push({
        name: title,
        path: `/page/${bookId}`,
        cover,
      });
    }

    return novels;
  }

  private formatGenres(
    categoryV2: unknown,
    category: unknown,
    completeCategory: unknown,
  ): string | undefined {
    const genres = new Set<string>();

    const parseCategoryArray = (items: unknown[]) => {
      for (const entry of items) {
        if (!isRecord(entry)) continue;
        const name =
          typeof entry.Name === 'string'
            ? entry.Name.trim()
            : typeof entry.name === 'string'
              ? entry.name.trim()
              : '';
        if (name) genres.add(name);
      }
    };

    if (typeof categoryV2 === 'string' && categoryV2.trim()) {
      try {
        const parsed: unknown = JSON.parse(categoryV2);
        if (Array.isArray(parsed)) parseCategoryArray(parsed);
      } catch {
        // Ignore non-JSON categoryV2 values.
      }
    } else if (Array.isArray(categoryV2)) {
      parseCategoryArray(categoryV2);
    }

    for (const raw of [category, completeCategory]) {
      if (typeof raw !== 'string') continue;
      for (const part of raw.split(/[,，、/]+/)) {
        const trimmed = part.trim();
        if (trimmed) genres.add(trimmed);
      }
    }

    return genres.size ? [...genres].join(', ') : undefined;
  }

  private formatSummary(raw: unknown): string | undefined {
    if (typeof raw !== 'string') return undefined;
    const cleaned = raw
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .join('\n');
    return cleaned || undefined;
  }

  private formatReleaseTime(raw: unknown): string | null {
    const sec = Number(raw);
    if (!Number.isFinite(sec) || sec <= 0) return null;
    try {
      return new Date(sec * 1000).toISOString().slice(0, 10);
    } catch {
      return null;
    }
  }

  private extractChaptersFromVolumes(
    volumes: unknown,
    volumeNames: unknown,
  ): Plugin.ChapterItem[] {
    if (!Array.isArray(volumes)) return [];

    const validVolumes = volumes.filter(
      (volume): volume is unknown[] =>
        Array.isArray(volume) && volume.length > 0,
    );
    const hasMultipleVolumes = validVolumes.length > 1;
    const names = Array.isArray(volumeNames) ? volumeNames : [];

    const chapters: Plugin.ChapterItem[] = [];
    const seen = new Set<string>();

    validVolumes.forEach((volume, volumeIndex) => {
      const fallbackVolumeName =
        typeof names[volumeIndex] === 'string' ? names[volumeIndex].trim() : '';

      for (const entry of volume) {
        if (!isRecord(entry)) continue;
        const itemId =
          typeof entry.itemId === 'string' || typeof entry.itemId === 'number'
            ? String(entry.itemId).trim()
            : '';
        const rawTitle =
          typeof entry.title === 'string' ? entry.title.trim() : '';
        if (!/^\d+$/.test(itemId) || !rawTitle || seen.has(itemId)) continue;
        seen.add(itemId);

        const isPaid =
          Number(entry.needPay) === 1 ||
          Boolean(entry.isPaidPublication) ||
          Boolean(entry.isPaidStory);

        const order = Number(entry.realChapterOrder);
        const chapterNumber =
          Number.isInteger(order) && order > 0 ? order : chapters.length + 1;
        const volumeName =
          typeof entry.volume_name === 'string' && entry.volume_name.trim()
            ? entry.volume_name.trim()
            : fallbackVolumeName;

        const chapter: Plugin.ChapterItem = {
          name: isPaid ? `🔒 ${rawTitle}` : rawTitle,
          path: `/reader/${itemId}`,
          releaseTime: this.formatReleaseTime(entry.firstPassTime),
          chapterNumber,
        };
        if (hasMultipleVolumes && volumeName) {
          chapter.page = volumeName;
        }
        chapters.push(chapter);
      }
    });

    return chapters;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const bookId = this.extractNovelId(novelPath);
    if (!bookId) {
      throw new Error(`Invalid Fanqie novel path: ${novelPath}`);
    }

    const pageUrl = `${SITE}/page/${bookId}`;
    const html = await this.fetchTextStrict(pageUrl, `${SITE}/`);
    const state = extractInitialState(html);
    const pageState = state && isRecord(state.page) ? state.page : undefined;

    let info = pageState;
    if (!info || !info.bookName) {
      info = await this.fetchPlainBookInfo(bookId);
    }

    if (!info) {
      throw new Error(`Fanqie novel page data was not found for ${bookId}`);
    }

    let chapters = this.extractChaptersFromVolumes(
      pageState?.chapterListWithVolume,
      pageState?.volumeNameList,
    );

    if (!chapters.length) {
      const dirPayload = await this.fetchJson(
        `${SITE}/api/reader/directory/detail?bookId=${bookId}`,
        pageUrl,
      ).catch(() => undefined);
      const dirData =
        dirPayload && isRecord(dirPayload.data) ? dirPayload.data : undefined;
      chapters = this.extractChaptersFromVolumes(
        dirData?.chapterListWithVolume,
        dirData?.volumeNameList,
      );
    }

    const name =
      (typeof info.bookName === 'string' && info.bookName.trim()) || '';
    if (!name) {
      throw new Error(`Fanqie book title was not found for ${bookId}`);
    }

    const author =
      (typeof info.authorName === 'string' && info.authorName.trim()) ||
      (typeof info.author === 'string' && info.author.trim()) ||
      undefined;

    const creationStatus =
      info.creationStatus !== undefined && info.creationStatus !== null
        ? String(info.creationStatus)
        : '';
    const status =
      creationStatus === '0'
        ? NovelStatus.Completed
        : creationStatus === '1'
          ? NovelStatus.Ongoing
          : NovelStatus.Unknown;

    return {
      name,
      path: `/page/${bookId}`,
      cover: this.normalizeCover(info.thumbUri ?? info.thumbUrl),
      author,
      summary: this.formatSummary(info.abstract ?? info.description),
      genres: this.formatGenres(
        info.categoryV2,
        info.category,
        info.completeCategory,
      ),
      status,
      chapters,
    };
  }

  private renderChapterBody(
    rawHtml: string,
    fromProxy = false,
  ): {
    html: string;
    hasText: boolean;
    hasImages: boolean;
  } {
    let source = rawHtml;
    const bodyMatch = source.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch) {
      source = bodyMatch[1];
    }

    const cleaned = source
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<\?xml[\s\S]*?\?>/gi, '')
      .replace(/<!DOCTYPE[^>]*>/gi, '')
      .replace(/<div[^>]*data-fanqie-type=["']pay_tag["'][\s\S]*$/i, '')
      .replace(/<[^>]*$/, '')
      .replace(/<br\s*\/?>/gi, '\n');

    const $ = loadCheerio(`<div id="fq-root">${cleaned}</div>`);
    const root = $('#fq-root');
    root.find('script, style, head').remove();
    if (fromProxy) {
      root.find('h1.chapterTitle1, h1.fyTitle').remove();
    }

    const parts: string[] = [];
    let hasText = false;
    let hasImages = false;

    const pushLine = (rawLine: string) => {
      const text = rawLine.replace(/[\u00a0\u3000]+/g, ' ').trim();
      if (!text) return;
      if (fromProxy && PROXY_WATERMARK_RE.test(text)) return;
      parts.push(`<p>${escapeHtml(text)}</p>`);
      hasText = true;
    };

    root.find('p, h1, h2, h3, h4, h5, h6, img').each((_idx, el) => {
      const node = $(el);
      const tag = el.tagName?.toLowerCase();

      if (tag === 'img') {
        const src = this.resolveChapterImageSrc(
          node.attr('src') || node.attr('data-src') || '',
        );
        if (src) {
          parts.push(`<img src="${escapeAttr(src)}" />`);
          hasImages = true;
        }
        return;
      }

      if (node.find('p, h1, h2, h3, h4, h5, h6').length > 0) return;

      const clone = node.clone();
      clone.find('img').remove();
      for (const line of clone.text().split('\n')) {
        pushLine(line);
      }
    });

    if (!parts.length) {
      for (const line of root.text().split('\n')) {
        pushLine(line);
      }
    }

    return { html: parts.join(''), hasText, hasImages };
  }

  async parseChapter(chapterPath: string): Promise<Plugin.ChapterContent> {
    const itemId = this.extractChapterId(chapterPath);
    if (!itemId) {
      throw new Error(`Invalid Fanqie chapter path: ${chapterPath}`);
    }

    const chapterUrl = `${SITE}/reader/${itemId}`;
    const cookie = this.getCookieHeader();
    let html: string;
    try {
      html = await this.fetchTextStrict(chapterUrl, `${SITE}/`, cookie);
    } catch (error) {
      const proxyAttempt = await this.fetchFromProxy(itemId);
      if (proxyAttempt.result) return proxyAttempt.result;
      throw error;
    }

    const state = extractInitialState(html);

    if (!state) {
      const proxyAttempt = await this.fetchFromProxy(itemId);
      if (proxyAttempt.result) return proxyAttempt.result;

      if (/bdturing|captcha|verify/i.test(html)) {
        return {
          state: 'checkpoint',
          type: 'novel',
          html:
            '<p>番茄小说触发了人机验证，请在浏览器中完成验证后重试。</p>' +
            '<p>Fanqie triggered a verification challenge. Complete verification in the browser and retry.</p>',
          checkpointMessage:
            'Fanqie verification challenge required in browser',
          noCache: true,
          noPrefetch: true,
        };
      }
      throw new Error(`Fanqie chapter state was not found for ${itemId}`);
    }

    const readerFonts = [
      ...new Set(
        [...html.matchAll(/awesome-font\/c\/([a-zA-Z0-9_-]+)/g)].map(match =>
          match[1].replace(/-(?:500|700)$/, ''),
        ),
      ),
    ];
    if (readerFonts.length > 0 && !readerFonts.includes(EXPECTED_READER_FONT)) {
      const proxyAttempt = await this.fetchFromProxy(itemId);
      if (proxyAttempt.result) return proxyAttempt.result;
      throw new Error(
        `Fanqie rotated chapter font (${readerFonts.join(', ')}); font mapping update required`,
      );
    }

    const readerState = isRecord(state.reader) ? state.reader : undefined;
    const chapterData =
      readerState && isRecord(readerState.chapterData)
        ? readerState.chapterData
        : undefined;
    if (!chapterData) {
      const proxyAttempt = await this.fetchFromProxy(itemId);
      if (proxyAttempt.result) return proxyAttempt.result;
      throw new Error(`Fanqie chapter data missing for ${itemId}`);
    }

    const rawContent =
      typeof chapterData.content === 'string' ? chapterData.content : '';
    const decodedContent = decodeReaderFont(rawContent);
    const hasPayTag = /data-fanqie-type=["']pay_tag["']/i.test(decodedContent);
    const isPaidPublication = Boolean(chapterData.isPaidPublication);
    const isLocked =
      Boolean(chapterData.isChapterLock) ||
      Number(chapterData.needPay) === 1 ||
      isPaidPublication ||
      Boolean(chapterData.isPaidStory) ||
      hasPayTag;

    if (isLocked) {
      const proxyAttempt = await this.fetchFromProxy(itemId);
      if (proxyAttempt.result) return proxyAttempt.result;

      const body = this.renderChapterBody(decodedContent);
      const contentType = resolveContentType(body.hasText, body.hasImages);
      const proxyNote = proxyAttempt.error
        ? `<p>Proxy error: ${escapeHtml(proxyAttempt.error)}</p>`
        : '';
      const noticeHtml =
        '<blockquote>' +
        '<p><strong>章节已锁定 / Chapter Locked</strong></p>' +
        (isPaidPublication
          ? '<p>本书为出版或付费会员章节，请在设置中配置可用的内容代理服务器或登录番茄小说会员账号。</p>' +
            '<p>This chapter belongs to a Fanqie paid/published book. Configure a working proxy URL or sign in with a Fanqie VIP account.</p>'
          : '<p>番茄小说网页端仅开放前10章免费阅读。请在插件设置中填写可用的“Máy chủ nội dung (Proxy URL)”或登录番茄小说SVIP账号。</p>' +
            '<p>Fanqie Web previews chapters after chapter 10. Configure a proxy server in plugin settings or sign in with a Fanqie SVIP account/cookie.</p>') +
        proxyNote +
        '</blockquote>';

      return {
        state: 'checkpoint',
        type: contentType,
        html: `${body.html}${noticeHtml}`,
        checkpointMessage: proxyAttempt.error
          ? `Locked chapter proxy failed (${proxyAttempt.error})`
          : isPaidPublication
            ? 'Fanqie paid publication chapter requires VIP login or proxy'
            : 'Chapters after chapter 10 on Fanqie Web require a proxy URL or SVIP login',
        noCache: true,
        noPrefetch: true,
      };
    }

    const body = this.renderChapterBody(decodedContent);
    if (!body.html) {
      throw new Error('Fanqie chapter content was empty or unavailable');
    }

    return {
      state: 'ready',
      type: resolveContentType(body.hasText, body.hasImages),
      html: body.html,
    };
  }

  override resolveUrl(path: string, isNovel = true): string {
    if (isNovel) {
      const bookId = this.extractNovelId(path);
      if (bookId) return `${SITE}/page/${bookId}`;
    } else {
      const itemId = this.extractChapterId(path);
      if (itemId) return `${SITE}/reader/${itemId}`;
    }
    const clean = path.trim();
    if (/^https?:\/\//i.test(clean)) return clean;
    return `${SITE}${clean.startsWith('/') ? clean : `/${clean}`}`;
  }
}

export default new FanqiePlugin();
