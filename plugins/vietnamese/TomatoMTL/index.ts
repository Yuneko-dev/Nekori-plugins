import { load as parseHTML } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { NovelStatus } from '@libs/novelStatus';
import { FilterTypes, Filters } from '@libs/filterInputs';
import { defaultCover } from '@libs/defaultCover';
import { storage } from '@libs/storage';
import { Buffer, encodeHtmlEntities } from '@libs/utils';
import { cbc } from '@libs/aes';
import { isUrlAbsolute } from '@libs/isAbsoluteUrl';

const SITE = 'https://tomatomtl.com';
const CHAPTERS_PER_VOLUME = 50;

const CATEGORY_OPTIONS = [
  { label: 'Tất cả', value: '-1' },
  { label: 'Đô thị', value: '1' },
  { label: 'Ngôn tình hiện đại', value: '3' },
  { label: 'Ngôn tình cổ đại', value: '5' },
  { label: 'Huyền huyễn', value: '7' },
  { label: 'Trinh thám / Suy luận', value: '10' },
  { label: 'Lịch sử', value: '12' },
  { label: 'Thể thao', value: '15' },
  { label: 'Võ hiệp', value: '16' },
  { label: 'Ngôn tình huyền ảo', value: '32' },
  { label: 'Kỳ ảo / Tiên hiệp', value: '259' },
  { label: 'Trường học', value: '4' },
  { label: 'Khoa huyễn / Mạt thế', value: '8' },
  { label: 'Đồng quê', value: '11' },
  { label: 'Hệ thống', value: '19' },
  { label: 'Thần hào', value: '20' },
  { label: 'Điền văn', value: '23' },
  { label: 'Khoái xuyên (Quick Transmigration)', value: '24' },
  { label: 'Trùng sinh', value: '36' },
  { label: 'Xuyên việt', value: '37' },
  { label: '2D / Anime', value: '39' },
  { label: 'Trọng sinh xuyên thư', value: '102' },
  { label: 'Đô thị võ thuật', value: '1014' },
  { label: 'Bại tế (Live-in son-in-law)', value: '25' },
  { label: 'Thần y', value: '26' },
  { label: 'Tổng tài', value: '29' },
];

type EncryptedPayload = {
  iv: string;
  enc: string;
};

class TomatoMTLPlugin implements Plugin.PluginBase {
  id = 'tomatomtl';
  name = 'TomatoMTL';
  icon = 'src/vi/tomatomtl/icon.png';
  site = SITE;
  version = '1.0.8';
  webStorageUtilized = true;

  pluginSettings: Plugin.PluginSettings = {
    usingProxyThumbnail: {
      value: false,
      label: 'Use proxied thumbnail URLs (may fix missing covers)',
      type: 'Switch',
    },
  };

  // ─── Setting accessors ──────────────────────────────
  get usingProxyThumbnail(): boolean {
    return storage.get('usingProxyThumbnail');
  }

  // --- Utils ---
  private normalizeCoverUrl(url: unknown): string {
    if (typeof url !== 'string' || !url) return '';
    if (!isUrlAbsolute(url)) return '';
    const urlObj = new URL(url);
    // Query parameters: url, w, h, fit, output
    urlObj.searchParams.set('output', 'jpg'); // better safe than webp
    if (this.usingProxyThumbnail) return urlObj.toString();
    return urlObj.searchParams.get('url') || urlObj.toString();
  }

  // ─── Cookie / session management ───────────────────────────
  private cookieJar: Record<string, string> = {};

  private buildCookieHeader(extra?: Record<string, string>): string {
    const merged: Record<string, string> = {
      ...this.cookieJar,
      translator_button: 'vi',
      machine_translation: 'google',
      ...(extra || {}),
    };
    return Object.entries(merged)
      .filter(([, v]) => v != null && v !== '')
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }

  private absorbSetCookie(header: string | null | undefined): void {
    if (!header) return;
    // Multiple Set-Cookie headers may be comma-joined; split safely on
    // boundaries that look like a new cookie (name=value preceded by comma).
    const parts = header.split(/,(?=\s*[A-Za-z0-9_-]+=)/);
    for (const raw of parts) {
      const seg = raw.split(';')[0].trim();
      if (!seg) continue;
      const eq = seg.indexOf('=');
      if (eq <= 0) continue;
      const name = seg.substring(0, eq).trim();
      const value = seg.substring(eq + 1).trim();
      if (
        !name ||
        value === '' ||
        value === 'deleted' ||
        /max-age=0/i.test(raw)
      ) {
        delete this.cookieJar[name];
      } else {
        this.cookieJar[name] = value;
      }
    }
  }

  private async fetchHtml(
    url: string,
    init: {
      method?: string;
      body?: string | FormData;
      headers?: Record<string, string>;
    } = {},
  ): Promise<{ html: string; status: number }> {
    const headers: Record<string, string> = {
      Referer: SITE + '/',
      ...(init.headers || {}),
    };
    const cookieHeader = this.buildCookieHeader();
    if (cookieHeader) headers.Cookie = cookieHeader;

    const res = await fetchApi(url, { ...init, headers });
    this.absorbSetCookie(res.headers.get('set-cookie'));
    const html = await res.text();
    return { html, status: res.status };
  }

  // Login is handled exclusively in LNReader's WebView (the site uses
  // Cloudflare Turnstile, so programmatic POST always fails). Anything
  // here is just a best-effort warm-up of the session in case the user
  // is already logged in.
  private async warmUpSession(): Promise<void> {
    try {
      const headers: Record<string, string> = {
        Referer: `${SITE}/`,
      };
      const cookieHeader = this.buildCookieHeader();
      if (cookieHeader) headers.Cookie = cookieHeader;
      const res = await fetchApi(`${SITE}/user/login`, {
        method: 'GET',
        headers,
      });
      this.absorbSetCookie(res.headers.get('set-cookie'));
      // Drain the body so the underlying connection is released.
      await res.text();
    } catch {
      //
    }
  }

  // ─── AES-128-CBC decryption matching the site's chapter_decrypt() ─────
  private decryptPayload(
    unlockCode: string,
    payload: EncryptedPayload,
  ): string {
    const keyBytes = base64ToBytes(unlockCode).subarray(0, 16);
    const ivBytes = base64ToBytes(payload.iv);
    const encBytes = base64ToBytes(payload.enc);
    const decrypted = cbc(keyBytes, ivBytes).decrypt(encBytes);
    return new TextDecoder('utf-8').decode(decrypted);
  }

  private extractInlineString(html: string, name: string): string {
    const re = new RegExp(name + '\\s*=\\s*"([^"]+)"');
    const m = re.exec(html);
    return m ? m[1] : '';
  }

  private extractEncryptedData(html: string): EncryptedPayload | null {
    const m = /encryptedData\s*=\s*(\{[\s\S]*?\})\s*;/.exec(html);
    if (!m) return null;
    try {
      return JSON.parse(m[1]) as EncryptedPayload;
    } catch {
      return null;
    }
  }

  // ─── Plugin API: novel listings ────────────────────────────
  async popularNovels(
    pageNo: number,
    options: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const { filters, showLatestNovels } = options;

    const params = new URLSearchParams({
      ajax: '1',
      page_index: String(Math.max(0, pageNo - 1)),
      page_count: '18',
      gender: (filters?.gender?.value as string) || '-1',
      creation_status: (filters?.creation_status?.value as string) || '-1',
      word_count: (filters?.word_count?.value as string) || '-1',
      sort: showLatestNovels ? '1' : (filters?.sort?.value as string) || '0',
      category_id: (filters?.category_id?.value as string) || '-1',
    });

    const url = `${SITE}/fanqie-explorer?${params.toString()}`;
    const headers: Record<string, string> = {
      'X-Requested-With': 'XMLHttpRequest',
      Accept: 'application/json',
      Referer: `${SITE}/fanqie-explorer`,
    };
    const cookieHeader = this.buildCookieHeader();
    if (cookieHeader) headers.Cookie = cookieHeader;

    const res = await fetchApi(url, { headers });
    if (!res.ok) {
      throw new Error('Open this plugin in a WebView to bypass Cloudflare.');
    }
    this.absorbSetCookie(res.headers.get('set-cookie'));

    const data = (await res.json().catch(() => null)) as {
      books?: { book_id?: string; book_name?: string; thumb_url?: string }[];
    } | null;
    if (!data || !Array.isArray(data.books)) return [];

    return data.books
      .filter(b => b && b.book_id)
      .map(book => ({
        name: String(book.book_name || '').trim() || `#${book.book_id}`,
        path: `/book/${book.book_id}`,
        cover: this.normalizeCoverUrl(book.thumb_url) || defaultCover,
      }));
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const trimmed = searchTerm.trim();
    if (!trimmed) return [];

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Referer: `${SITE}/search?q=${encodeURIComponent(trimmed)}`,
    };
    const cookieHeader = this.buildCookieHeader();
    if (cookieHeader) headers.Cookie = cookieHeader;

    const res = await fetchApi(`${SITE}/api/search-proxy.php`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        query: trimmed,
        page_index: Math.max(0, pageNo - 1),
        page_count: 10,
        query_type: 0,
      }),
    });
    this.absorbSetCookie(res.headers.get('set-cookie'));

    type SearchBook = {
      book_id?: string;
      book_name?: string;
      thumb_url?: string;
    };
    const data = (await res.json().catch(() => null)) as {
      search_tabs?: {
        data?: { book_data?: SearchBook[] }[];
      }[];
    } | null;
    if (!data || !Array.isArray(data.search_tabs)) return [];

    const novels: Plugin.NovelItem[] = [];
    const seen = new Set<string>();
    for (const tab of data.search_tabs) {
      const items = Array.isArray(tab?.data) ? tab.data : [];
      for (const item of items) {
        const books = Array.isArray(item?.book_data) ? item.book_data : [];
        for (const book of books) {
          const id = String(book?.book_id || '').trim();
          if (!id || seen.has(id)) continue;
          seen.add(id);
          novels.push({
            name: String(book.book_name || '').trim() || `#${id}`,
            path: `/book/${id}`,
            cover: this.normalizeCoverUrl(book.thumb_url) || defaultCover,
          });
        }
      }
    }
    return novels;
  }

  // ─── Plugin API: novel details ─────────────────────────────
  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const bookId = extractBookId(novelPath);
    if (!bookId) throw new Error(`Invalid novel path: ${novelPath}`);

    const { html } = await this.fetchHtml(`${SITE}/book/${bookId}`);
    const $ = parseHTML(html);

    // The inline script has the original Chinese title as `book_name`.
    const rawBookName = this.extractInlineString(html, 'book_name');
    // Decode unicode escapes (e.g. \u6211 → 我)
    const chineseName = rawBookName
      ? rawBookName.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
          String.fromCharCode(parseInt(hex, 16)),
        )
      : '';
    const fallbackName =
      $('meta[property="og:title"]').attr('content')?.trim() ||
      $('title').text().trim() ||
      '';

    const novelName = chineseName || fallbackName || `#${bookId}`;

    const novel: Plugin.SourceNovel = {
      path: `/book/${bookId}`,
      name: novelName,
    };

    // Extract cover from inline JS `book_cover` variable (direct byteimg URL)
    // or fall back to the HTML element / og:image.
    const inlineCover = this.extractInlineString(html, 'book_cover').replace(
      /\\\//g,
      '/',
    );
    const coverEl = $('#book_cover').first();
    novel.cover =
      this.normalizeCoverUrl(inlineCover) ||
      this.normalizeCoverUrl(coverEl.attr('data-src')) ||
      this.normalizeCoverUrl(coverEl.attr('src')) ||
      this.normalizeCoverUrl($('meta[property="og:image"]').attr('content')) ||
      defaultCover;

    let author = '';
    let status = '';
    let score = '';
    let chineseReaders = '';
    let lastUpdated = '';
    let createdAt = '';
    $('.book-meta-item').each((_, el) => {
      const $el = $(el);
      const label = $el.find('b').first().text().toLowerCase();
      const value = $el
        .clone()
        .find('b, i')
        .remove()
        .end()
        .text()
        .replace(/\|/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (!author && label.includes('author')) {
        author = $el.find('button').first().text().trim() || value;
      } else if (!status && label.includes('status')) {
        status = $el.find('.badge').first().text().trim();
      } else if (!score && label.includes('score')) {
        score = value.replace(/[^0-9.]/g, '');
      } else if (label.includes('chinese readers')) {
        chineseReaders = value.replace(/[^0-9,]/g, '');
      } else if (label.includes('last updated')) {
        lastUpdated = $el.find('span').last().text().trim();
      } else if (label.includes('created')) {
        createdAt = $el.find('span').last().text().trim();
      }
    });
    novel.author = author;

    novel.genres = $('#book_categories a')
      .map((_, a) => $(a).text().trim())
      .get()
      .filter(Boolean)
      .join(',');

    novel.summary = ($('#description').text() || '').trim();
    if (chineseName && chineseName !== novelName) {
      novel.summary =
        `Tên gốc: ${chineseName}\n` +
        (score ? `Điểm: ${score}\n` : '') +
        (chineseReaders ? `Lượt đọc CN: ${chineseReaders}\n` : '') +
        (lastUpdated ? `Cập nhật: ${lastUpdated}\n` : '') +
        (createdAt ? `Tạo: ${createdAt}\n` : '') +
        '\n' +
        novel.summary;
    }

    const normalized = status.toLowerCase();
    if (/ongoing|đang|loading/.test(normalized))
      novel.status = NovelStatus.Ongoing;
    else if (/completed|hoàn|finished/.test(normalized))
      novel.status = NovelStatus.Completed;
    else if (/hiatus|pause|tạm/.test(normalized))
      novel.status = NovelStatus.OnHiatus;
    else novel.status = NovelStatus.Unknown;

    novel.chapters = await this.fetchChapterList(bookId, html);
    return novel;
  }

  // The catalog endpoint returns the full chapter list as an encrypted
  // JSON blob. The decryption key (`unlock_code`) lives on the book HTML
  // page. We re-use the freshly-fetched book page rather than making a
  // second round trip.
  private async fetchChapterList(
    bookId: string,
    bookHtml: string,
  ): Promise<Plugin.ChapterItem[]> {
    let unlockCode = this.extractInlineString(bookHtml, 'unlock_code');
    if (!unlockCode) {
      const { html } = await this.fetchHtml(`${SITE}/book/${bookId}`);
      unlockCode = this.extractInlineString(html, 'unlock_code');
    }
    if (!unlockCode) {
      throw new Error(
        'Không lấy được mã giải mã (unlock_code) từ trang truyện. ' +
          'Trang web có thể đã thay đổi cấu trúc, hoặc bạn cần mở ' +
          'tomatomtl.com trong WebView của LNReader để vượt Cloudflare.',
      );
    }

    const headers: Record<string, string> = {
      Accept: 'application/json',
      Referer: `${SITE}/book/${bookId}`,
    };
    const cookieHeader = this.buildCookieHeader();
    if (cookieHeader) headers.Cookie = cookieHeader;

    const res = await fetchApi(`${SITE}/catalog/${bookId}`, { headers });
    this.absorbSetCookie(res.headers.get('set-cookie'));

    if (!res.ok) {
      throw new Error(
        `Catalog request failed: HTTP ${res.status} ${res.statusText}. ` +
          'Hãy đăng nhập tomatomtl.com qua WebView rồi thử lại.',
      );
    }

    // The catalog endpoint always replies with JSON. If the body is HTML
    // (e.g. a Cloudflare interstitial or "Login Required" page) JSON.parse
    // will throw and we surface a helpful message instead of an empty list.
    const rawText = await res.text();
    let payload: EncryptedPayload | null;
    try {
      payload = JSON.parse(rawText) as EncryptedPayload;
    } catch {
      throw new Error(
        'Catalog không trả về JSON (có thể là trang Cloudflare/Login). ' +
          'Hãy mở https://tomatomtl.com trong WebView của LNReader, ' +
          'đăng nhập, rồi quay lại.',
      );
    }
    if (!payload || !payload.iv || !payload.enc) {
      throw new Error('Catalog JSON thiếu trường iv/enc.');
    }

    let plaintext: string;
    try {
      plaintext = this.decryptPayload(unlockCode, payload);
    } catch (err) {
      throw new Error(
        `Giải mã danh sách chương thất bại: ${(err as Error).message}`,
      );
    }

    type CatalogEntry = { id?: string; title?: string };
    let parsed: unknown;
    try {
      parsed = JSON.parse(plaintext);
    } catch {
      throw new Error(
        'Danh sách chương sau khi giải mã không phải JSON hợp lệ.',
      );
    }

    const entries: { id: string; title: string }[] = [];
    if (Array.isArray(parsed)) {
      for (const c of parsed as CatalogEntry[]) {
        const id = String(c?.id || '').trim();
        const title = String(c?.title || '').trim();
        if (id) entries.push({ id, title: title || `Chương ${id}` });
      }
    } else if (parsed && typeof parsed === 'object') {
      // Object map keyed by index.
      const obj = parsed as Record<string, CatalogEntry>;
      for (const key of Object.keys(obj)) {
        const c = obj[key];
        const id = String(c?.id || '').trim();
        const title = String(c?.title || '').trim();
        if (id) entries.push({ id, title: title || `Chương ${id}` });
      }
    }

    if (!entries.length) {
      throw new Error('Catalog trả về danh sách chương rỗng.');
    }

    // Group every 50 chapters into a "Volume" page label so the chapter
    // list mirrors the accordion the website itself shows. This makes
    // long catalogs (often 1k+ chapters) browsable inside LNReader.
    const titles = entries.map(e => e.title);

    const chapters: Plugin.ChapterItem[] = entries.map((entry, idx) => {
      const chapterNumber = idx + 1;
      const start =
        Math.floor((chapterNumber - 1) / CHAPTERS_PER_VOLUME) *
          CHAPTERS_PER_VOLUME +
        1;
      const end = Math.min(start + CHAPTERS_PER_VOLUME - 1, entries.length);
      return {
        name: titles[idx] || entry.title,
        path: `/book/${bookId}/${entry.id}`,
        chapterNumber,
        page: `Chapter ${start} - ${end}`,
      };
    });
    return chapters;
  }

  // ─── Plugin API: chapter content ───────────────────────────
  async parseChapter(chapterPath: string): Promise<string> {
    const url = `${SITE}${chapterPath.startsWith('/') ? '' : '/'}${chapterPath}`;
    let { html } = await this.fetchHtml(url);

    if (this.detectLoginRequired(html)) {
      await this.warmUpSession();
      ({ html } = await this.fetchHtml(url));
      if (this.detectLoginRequired(html)) {
        throw new Error(
          'TomatoMTL yêu cầu đăng nhập để đọc chương.\n' +
            'Mở https://tomatomtl.com/user/login bằng trình duyệt trong app (LNReader → WebView), đăng nhập một lần để cookie được lưu, rồi thử lại.',
        );
      }
    }

    const unlockCode = this.extractInlineString(html, 'unlock_code');
    const payload = this.extractEncryptedData(html);
    if (!unlockCode || !payload) {
      throw new Error(
        'Không tìm thấy nội dung mã hóa trong trang chương. Trang web có thể đã thay đổi cấu trúc.',
      );
    }

    let plaintext: string;
    try {
      plaintext = this.decryptPayload(unlockCode, payload);
    } catch (err) {
      throw new Error(`Giải mã chương thất bại: ${(err as Error).message}`);
    }

    const $ = parseHTML(html);
    const chapterTitle =
      $('#chapter_title').first().text().trim() || $('title').text().trim();

    // The decrypted blob is plain Chinese text with `\n` paragraph breaks.
    const rawLines = plaintext
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    if (!rawLines.length) {
      throw new Error('Nội dung chương rỗng sau khi giải mã.');
    }

    const out: string[] = [];
    if (chapterTitle) {
      out.push(`<h2>${encodeHtmlEntities(chapterTitle)}</h2>`);
    }

    for (const line of rawLines) {
      out.push(`<p>${encodeHtmlEntities(line)}</p>`);
    }

    return out.join('\n');
  }

  private detectLoginRequired(html: string): boolean {
    return /Login Required|need to log in to read chapter content/i.test(html);
  }

  resolveUrl(path: string, isNovel?: boolean): string {
    return this.site + path;
  }

  // ─── Filters mirror the /fanqie-explorer page selectors ────
  filters = {
    sort: {
      type: FilterTypes.Picker,
      label: 'Sắp xếp',
      value: '0',
      options: [
        { label: 'Phổ biến nhất', value: '0' },
        { label: 'Mới nhất', value: '1' },
        { label: 'Số chữ', value: '2' },
      ],
    },
    gender: {
      type: FilterTypes.Picker,
      label: 'Đối tượng',
      value: '-1',
      options: [
        { label: 'Tất cả', value: '-1' },
        { label: 'Nam (Male)', value: '1' },
        { label: 'Nữ (Female)', value: '0' },
      ],
    },
    creation_status: {
      type: FilterTypes.Picker,
      label: 'Trạng thái',
      value: '-1',
      options: [
        { label: 'Tất cả', value: '-1' },
        { label: 'Hoàn thành', value: '0' },
        { label: 'Đang ra', value: '1' },
      ],
    },
    word_count: {
      type: FilterTypes.Picker,
      label: 'Số chữ',
      value: '-1',
      options: [
        { label: 'Tất cả', value: '-1' },
        { label: 'Dưới 300k', value: '0' },
        { label: '300k - 500k', value: '1' },
        { label: '500k - 1M', value: '2' },
        { label: '1M - 2M', value: '3' },
        { label: 'Trên 2M', value: '4' },
      ],
    },
    category_id: {
      type: FilterTypes.Picker,
      label: 'Thể loại',
      value: '-1',
      options: CATEGORY_OPTIONS,
    },
  } satisfies Filters;
}

// ─── Helpers (module-scope so they don't end up on `this`) ───────────────
function extractBookId(path: string): string {
  const m = /\/book\/(\d+)/.exec(path);
  return m ? m[1] : '';
}

function base64ToBytes(b64: string): Uint8Array {
  let s = (b64 || '').replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, '');
  while (s.length % 4) s += '=';
  return new Uint8Array(Buffer.from(s, 'base64'));
}

export default new TomatoMTLPlugin();
