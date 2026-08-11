/* eslint-disable no-useless-escape */

import { load as parseHTML } from 'cheerio';
import { fetchApi, fetchText } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { NovelStatus } from '@libs/novelStatus';
import { defaultCover } from '@libs/defaultCover';
import { storage } from '@libs/storage';
import { get, set, setFromResponse, removeSessionCookies } from '@libs/cookie';
import { decodeHtmlEntities, encodeHtmlEntities } from '@libs/utils';
import { solveCloudflareTurnstile } from '@libs/webview';
import filters from './filters';
import { STVChapterError } from './STVError';
import { HOST_PATTERNS, ABT_HOSTS, looksLikeExternalUrl } from './ExternalURL';
import { applyNameEngine } from './nameEngine';

const SITE = 'https://sangtacviet.app';

const GH_UPDATE =
  'https://raw.githubusercontent.com/sangtacviet/sangtacviet.github.io/main/update.json';

const DOMAIN_URLS = [
  'https://sangtacviet.app',
  'https://sangtacviet.xyz',
  'https://sangtacviet.pro',
  'https://dns1.stv-appdomain-00000001.org',
  'http://14.225.254.182', // ??? wtf
];
const DOMAINS = Object.fromEntries(DOMAIN_URLS.map(u => [new URL(u).host, u]));

function detectHostFromUrl(
  input: string,
): { host: string; bookid: string; chapterid?: string } | null {
  for (const host in HOST_PATTERNS) {
    for (const pat of HOST_PATTERNS[host]) {
      const m = new RegExp(pat, 'i').exec(input);
      if (!m) continue;
      if (m[2] !== undefined && m[2] !== m[1] && /^[\d_\-]+$/.test(m[2])) {
        if (m[1]) return { host, bookid: m[1], chapterid: m[2] };
      }
      if (m[1]) return { host, bookid: m[1] };
    }
  }
  return null;
}

// ── Webfont glyph decode ─────────────────────────────
const GLYPH_MAP: Record<string, string> = {};
// prettier-ignore
([
  [0xE01B, 'A'], [0xE01E, 'y'], [0xE05F, '3'], [0xE063, 'z'], [0xE06B, 'K'], [0xE06C, 't'],
  [0xE089, 'l'], [0xE0D5, 'S'], [0xE0D6, 'T'], [0xE100, 'o'], [0xE101, 'P'], [0xE116, '4'],
  [0xE122, 'W'], [0xE124, 'Z'], [0xE14B, 'J'], [0xE160, 'e'], [0xE184, 'O'], [0xE186, 'D'],
  [0xE1A4, 'f'], [0xE1AD, 'e'], [0xE1B4, 'k'], [0xE1B8, 'f'], [0xE1BF, 'n'], [0xE1C0, 'Y'],
  [0xE1C1, '1'], [0xE1D8, 'K'], [0xE1E4, 'M'], [0xE1EA, 'Y'], [0xE215, 'C'], [0xE218, 'A'],
  [0xE22B, 'h'], [0xE240, 'x'], [0xE248, 'v'], [0xE257, 'G'], [0xE27E, 'b'], [0xE2A9, 'B'],
  [0xE2C5, 's'], [0xE2C7, 't'], [0xE2CA, 'G'], [0xE2E3, 'k'], [0xE2F8, 'q'], [0xE30F, 'F'],
  [0xE311, 'u'], [0xE32F, 'E'], [0xE334, '2'], [0xE34A, 'I'], [0xE37C, 'R'], [0xE38F, 'v'],
  [0xE39B, 'X'], [0xE3B0, 'l'], [0xE3B7, '7'], [0xE3F1, 'l'], [0xE41B, 'o'], [0xE41C, 'H'],
  [0xE426, 'S'], [0xE427, 'J'], [0xE43E, '6'], [0xE44E, 'X'], [0xE46A, 'b'], [0xE477, 'y'],
  [0xE49A, 'c'], [0xE4A3, '8'], [0xE4AE, '2'], [0xE4CC, 's'], [0xE4D3, '5'], [0xE4DB, 'L'],
  [0xE4DF, 'N'], [0xE4EC, '5'], [0xE4F3, 'r'], [0xE519, '0'], [0xE51F, 'g'], [0xE550, 'E'],
  [0xE557, 'h'], [0xE566, 'N'], [0xE571, 'F'], [0xE57B, 'O'], [0xE5BD, 'C'], [0xE5C1, 'd'],
  [0xE5C9, '8'], [0xE5D1, 'x'], [0xE5DC, 'm'], [0xE5E1, '9'], [0xE5F0, 'u'], [0xE5FA, 'm'],
  [0xE5FF, 'a'], [0xE603, 'U'], [0xE62A, 'w'], [0xE636, 'P'], [0xE63E, 'D'], [0xE648, '6'],
  [0xE65B, 'H'], [0xE65D, 'z'], [0xE660, '9'], [0xE68D, '1'], [0xE691, 'M'], [0xE6A4, 'q'],
  [0xE6A5, 'c'], [0xE6D7, 'W'], [0xE6E0, 'R'], [0xE6F1, 'T'], [0xE6F3, 'a'], [0xE6F5, 'g'],
  [0xE705, 'w'], [0xE71A, '3'], [0xE735, 'Z'], [0xE74F, 'Q'], [0xE762, 'r'], [0xE765, 'n'],
  [0xE775, 'V'], [0xE77A, 'd'], [0xE77D, 'L'], [0xE77E, '4'], [0xE7C7, 'U'], [0xE7E5, '0'],
  [0xE7F6, '7'], [0xE902, 'A'], [0xE915, 'O'], [0xE91F, 'e'], [0xE946, 'a'], [0xE95D, '2'],
  [0xE97B, 'f'], [0xE9A8, 'y'], [0xE9CC, 'P'], [0xE9D5, 'o'], [0xE9D7, 'r'], [0xE9F8, 'O'],
  [0xE9F9, 'K'], [0xEA15, 'e'], [0xEA20, 'Y'], [0xEA24, 'N'], [0xEA2D, 'v'], [0xEA2E, 'R'],
  [0xEA2F, 'C'], [0xEA43, '4'], [0xEA47, 'l'], [0xEA65, 'S'], [0xEA75, 'M'], [0xEA76, 'H'],
  [0xEA77, 'u'], [0xEA82, 'o'], [0xEAA1, 'k'], [0xEAA4, 'a'], [0xEAA5, 'x'], [0xEAA6, 'z'],
  [0xEAB2, '6'], [0xEAB4, 't'], [0xEABB, 'y'], [0xEAC5, 'w'], [0xEACF, 'b'], [0xEAD5, 'L'],
  [0xEAE3, 'A'], [0xEAED, 'F'], [0xEB02, 's'], [0xEB06, 's'], [0xEB0E, 'C'], [0xEB0F, 'R'],
  [0xEB18, 'w'], [0xEB27, 'D'], [0xEB62, 'l'], [0xEB63, '9'], [0xEB75, 'h'], [0xEB85, 'X'],
  [0xEBEC, 'k'], [0xEBF6, 'N'], [0xEC0F, 'q'], [0xEC19, 'J'], [0xEC50, '7'], [0xEC6D, 'g'],
  [0xEC75, 'd'], [0xEC85, 'n'], [0xECAD, 'V'], [0xECB4, 'S'], [0xECD4, 'L'], [0xECDB, 'Z'],
  [0xECE6, 'E'], [0xECF8, 'U'], [0xED07, 'V'], [0xED2C, 'Q'], [0xED35, 'l'], [0xED37, 'J'],
  [0xED48, 'W'], [0xED64, '5'], [0xED71, '2'], [0xED72, 'v'], [0xED8C, 'E'], [0xEDEB, 'Y'],
  [0xEDEC, '5'], [0xEDED, 'm'], [0xEE01, 'c'], [0xEE09, 'Q'], [0xEE0C, 'n'], [0xEE0F, 'u'],
  [0xEE47, 'W'], [0xEE5C, 'P'], [0xEE69, 'b'], [0xEE8D, '0'], [0xEEA1, 'X'], [0xEEBB, 'F'],
  [0xEEC1, 'I'], [0xEECC, 'B'], [0xEECF, 'c'], [0xEEDA, '1'], [0xEEDB, 'D'], [0xEEE3, 'G'],
  [0xEF1F, '8'], [0xEF26, 'K'], [0xEF35, 'x'], [0xEF37, '6'], [0xEF3A, 'd'], [0xEF57, 'H'],
  [0xEF5A, 'U'], [0xEF61, 'G'], [0xEF91, '8'], [0xEF94, 'T'], [0xEFC8, 'm'], [0xEFD4, '1'],
  [0xEFD7, 'Z'], [0xEFDA, 'h'], [0xEFEE, '3'], [0xEFEF, '4'], [0xEFF6, '3'], [0xF00A, 'q'],
  [0xF019, 'T'], [0xF050, 'B'], [0xF065, '0'], [0xF073, '7'], [0xF096, 'z'], [0xF0A6, 't'],
  [0xF0BA, 'r'], [0xF0BD, 'M'], [0xF0C0, 'g'], [0xF7A0, '0'], [0xF7A1, '1'], [0xF7A2, '2'],
  [0xF7A3, '3'], [0xF7A4, '4'], [0xF7A5, '5'], [0xF7A6, '6'], [0xF7A7, '7'], [0xF7A8, '8'],
  [0xF7A9, '9'], [0xF8FF, '*'],
] as [number, string][]).forEach(([code, ch]) => {
  GLYPH_MAP[String.fromCharCode(code)] = ch;
});

function decodeGlyphs(text: string): string {
  let out = '';
  for (const ch of text) {
    out += GLYPH_MAP[ch] ?? ch;
  }
  return out;
}

// ── Content normalization  ─────────────────
function normalizeChapterHtml(
  host: string,
  raw: string,
  applyName?: boolean,
): string {
  let text = raw || '';
  if (!text) return '';
  const h = host.toLowerCase();

  if (h === 'sangtac' || h === 'dich') {
    text = decodeGlyphs(text);
  }

  // Convert any [img=w,h]{url}[/img] => <img>
  const regexImage = /\[img(=\d+,\d+)?\](.+)\[\/img\]/g;
  text = text.replace(regexImage, (match, dimensions, url) => {
    if (dimensions) {
      const [width, height] = dimensions.replace('=', '').split(',');
      return `<img src="${url}" width="${width}" height="${height}" />`;
    }
    return `<img src="${url}" />`;
  });

  const $ = parseHTML(text, null, false);

  if (h === 'fanqie') {
    $('header, footer').remove();
    $('*').removeAttr('idx');
  }

  // Detect & replace person names on the raw Hán tokens before they are
  // flattened into plain <p> text.
  if (applyName) applyNameEngine($);

  $('br').replaceWith('\n');

  const blockTags = [
    'p',
    'div',
    'article',
    'section',
    'li',
    'tr',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'blockquote',
    'ul',
    'ol',
  ];
  blockTags.forEach(tag => {
    $(tag).each((_, el) => {
      $(el).prepend('\n').append('\n');
    });
  });

  $('i').each((_, el) => {
    $(el).append(' ');
  });

  let output = '';
  function walk(node: any) {
    if (node.type === 'text') {
      output += node.data;
    } else if (node.type === 'tag') {
      if (node.name === 'img') {
        const src = node.attribs.src;
        if (src) {
          output += `\n__IMG__${src}__IMG__\n`;
        }
      } else {
        if (node.children) node.children.forEach(walk);
      }
    }
  }

  $.root().contents().toArray().forEach(walk);

  let t = decodeHtmlEntities(output);
  t = t.replace(/[\t\f\v ]+/g, ' ');
  t = t.replace(
    / +([,.;:!?%\)\]\}\u3002\uff0c\u3001\uff01\uff1f\uff1b\uff1a\u201d\u2019\u300d\u300f\u3011\u300b])/g,
    '$1',
  );
  t = t.replace(
    /\n+([,.;:!?%\)\]\}\u3002\uff0c\u3001\uff01\uff1f\uff1b\uff1a\u201d\u2019\u300d\u300f\u3011\u300b])/g,
    '$1',
  );
  t = t
    .replace(/[ ]*\n[ ]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return t;
}

function wrapWithParagraphs(rawText: string): string {
  if (!rawText) return '';
  const paragraphs = rawText.split('\n');
  const htmlResult = paragraphs
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => {
      if (line.startsWith('__IMG__') && line.endsWith('__IMG__')) {
        const src = line.substring(7, line.length - 7);
        return `<img src="${src}">`;
      }
      const parts = line.split(/(__IMG__.*?__IMG__)/);
      const inner = parts
        .map(part => {
          if (part.startsWith('__IMG__') && part.endsWith('__IMG__')) {
            const src = part.substring(7, part.length - 7);
            return `<img src="${src}">`;
          }
          return encodeHtmlEntities(part);
        })
        .join('');
      return `<p>${inner}</p>`;
    })
    .join('\n');
  return htmlResult;
}

class SangTacVietPlugin implements Plugin.PluginBase {
  id = 'sangtacviet';
  name = 'Sáng Tác Việt';
  icon = 'src/vi/sangtacviet/icon.png';
  customJS = 'src/vi/sangtacviet/custom.js';
  filters = filters;

  get site() {
    return DOMAINS[this.selectedDomain] || SITE;
  }
  version = '1.0.32';
  webStorageUtilized = true;

  pluginSettings: Plugin.PluginSettings = {
    selectedDomain: {
      type: 'Select',
      label: 'Tên miền',
      value: 'sangtacviet.app',
      options: Object.keys(DOMAINS).map(h => ({ label: h, value: h })),
    },
    translateEnabled: {
      type: 'Switch',
      label: 'Dịch truyện (Mở/Tắt)',
      value: true,
    },
    translateEngine: {
      type: 'Select',
      label: 'Công cụ dịch (Tiếng Việt)',
      value: 'convert',
      options: [
        { label: 'Convert', value: 'convert' },
        { label: 'Bing', value: 'bing' },
        { label: 'Google', value: 'google' },
      ],
    },
    removeSystemMessage: {
      type: 'Switch',
      label: 'Tự động xóa một số tin nhắn hệ thống của STV',
      value: false,
    },
    autoRetry: {
      type: 'Switch',
      label:
        'Tự động thử lại khi tải chương thất bại (Tối đa 10 lần, cách nhau 1 giây)',
      value: false,
    },
    forceFetch: {
      type: 'Switch',
      label: 'Bắt buộc yêu cầu máy chủ tải lại chương (rescan)',
      value: false,
    },
    autoName: {
      type: 'Switch',
      label: 'Tự động nhận diện & thay tên riêng (theo bảng họ + tần suất)',
      value: false,
    },
  };

  get selectedDomain(): string {
    return (storage.get('selectedDomain') as string) || 'sangtacviet.app';
  }

  get translateEnabled(): boolean {
    return Boolean(storage.get('translateEnabled'));
  }

  get translateEngine(): string {
    return (storage.get('translateEngine') as string) || 'convert';
  }

  get autoRetry() {
    return storage.get('autoRetry') as boolean;
  }

  get removeSystemMessage() {
    return storage.get('removeSystemMessage') as boolean;
  }

  get autoName() {
    return storage.get('autoName') as boolean;
  }

  get forceFetch() {
    return storage.get('forceFetch') as boolean;
  }

  async applyTranslationCookies(origin: string): Promise<void> {
    let transmode: string;
    let foreignlang: string;

    if (!this.translateEnabled) {
      transmode = 'chinese';
      foreignlang = 'vi';
    } else {
      switch (this.translateEngine) {
        case 'bing':
          transmode = 'tfms';
          foreignlang = 'vi';
          break;
        case 'google':
          transmode = 'name';
          foreignlang = 'gg_vi';
          break;
        case 'convert':
        default:
          transmode = 'name';
          foreignlang = 'vi';
          break;
      }
    }

    await set(origin, { name: 'transmode', value: transmode });
    await set(origin, { name: 'foreignlang', value: foreignlang });
  }

  private async _cookieHeader(origin: string): Promise<Record<string, string>> {
    const jar = await get(origin);
    const parts: string[] = [];
    for (const k in jar) {
      const c = jar[k];
      const v = typeof c === 'string' ? c : c && c.value;
      if (v) parts.push(k + '=' + v);
    }
    return parts.length ? { Cookie: parts.join('; ') } : {};
  }

  parseNovelsFromHTML(html: string): Plugin.NovelItem[] {
    const novels: Plugin.NovelItem[] = [];
    const $ = parseHTML(html);
    $('a.booksearch').each((_, el) => {
      const href = $(el).attr('href') || '';
      const name = $(el).find('.searchbooktitle').text().trim();
      const cover = $(el).find('img').attr('src') || defaultCover;
      if (href && name) {
        novels.push({ name, cover, path: href });
      }
    });
    return novels;
  }

  async popularNovels(
    pageNo: number,
    options: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const { filters } = options;
    let sort = options.showLatestNovels ? 'update' : 'view';
    let minc = '0';
    let category = '';
    let type = '';
    let step = '';
    let host = '';
    let tag = '';

    if (filters) {
      if (filters.sort?.value) sort = filters.sort.value;
      minc = filters.minc?.value || '0';
      category = filters.category?.value || '';
      type = filters.type?.value || '';
      step = filters.step?.value || '';
      host = filters.host?.value || '';
      tag = filters.tag?.value?.join(',') || '';
    }

    const url = new URL(`${this.site}/io/searchtp/searchBooks`);
    url.searchParams.set('find', '');
    url.searchParams.set('minc', minc);
    url.searchParams.set('sort', sort);
    url.searchParams.set('tag', tag);
    if (category) url.searchParams.set('category', category);
    if (type) url.searchParams.set('type', type);
    if (step) url.searchParams.set('step', step);
    if (host) url.searchParams.set('host', host);
    url.searchParams.set('p', String(pageNo));

    const html = await fetchText(url.toString());
    return this.parseNovelsFromHTML(html);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    // Extract host and bookid from path: /truyen/{host}/{sty}/{bookid}/
    const pathParts = novelPath.replace(/^\/|\/$/g, '').split('/');
    const bookHost = pathParts[1] || '';
    const bookId = pathParts[3] || '';

    const headers = {
      'x-stv-transport': 'app',
      'x-requested-with': 'com.sangtacviet.mobilereader',
      Referer: `${this.site}/truyen/${bookHost}/${pathParts[2]}/${bookId}/`,
    };

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: 'Không có tiêu đề',
    };

    // Step 1: Fetch novel info via JSON API
    if (bookHost && bookId) {
      const infoUrl = new URL(`${this.site}/mobile/bookinfo.php`);
      infoUrl.searchParams.set('host', bookHost);
      infoUrl.searchParams.set('hid', bookId);
      const infoRes = await fetchApi(infoUrl.toString(), { headers });
      const infoJson = await infoRes.json();

      if (infoJson.code === 100 && infoJson.book) {
        console.log('infoJson.book', infoJson.book);
        const book = infoJson.book;
        novel.name = (book.tname || book.name || 'Không có tiêu đề').trim();
        novel.author = (book.hauthor || book.author || '').trim();
        novel.summary = decodeHtmlEntities(book.info || '')
          .replace(/<br\s*\/?>/gi, '\n') // <br>, <br/>, <br />
          .replace(/\t/g, ' ')
          .replace(/\r\n|\r/g, '\n')
          .replace(/\n{3,}/g, '\n\n')
          .trim();
        novel.genres = (book.category || '').trim();
        novel.cover = book.thumb
          ? book.thumb.startsWith('http')
            ? book.thumb
            : `${this.site}${book.thumb}`
          : defaultCover;

        const st = String(book.status || '')
          .trim()
          .toLowerCase();
        if (st === '0' || st === 'hoàn thành')
          novel.status = NovelStatus.Completed;
        else if (st === '1' || st === 'còn tiếp')
          novel.status = NovelStatus.Ongoing;
        else if (st === '2' || st === 'tạm ngưng')
          novel.status = NovelStatus.OnHiatus;
        else novel.status = NovelStatus.Unknown;
      } else {
        // Fallback to HTML scraping if JSON API fails
        const res = await fetchApi(this.site + novelPath, { headers });
        const html = await res.text();
        const $ = parseHTML(html);
        novel.name =
          $('meta[property="og:novel:book_name"]').attr('content') ||
          $('#book_name2').text().trim() ||
          'Không có tiêu đề';
        novel.cover =
          $('meta[property="og:image"]').attr('content') || defaultCover;
        novel.author =
          $('meta[property="og:novel:author"]').attr('content') ||
          $('h2').first().text().trim();
        novel.summary = (
          $('meta[property="og:description"]').attr('content') ||
          $('.textzoom').text().trim()
        ).replace(/\\n/g, '\n');
        novel.genres = (
          $('meta[property="og:novel:category"]').attr('content') || ''
        ).trim();
        const statusText = (
          $('meta[property="og:novel:status"]').attr('content') || ''
        ).trim();
        if (statusText === 'Hoàn thành') novel.status = NovelStatus.Completed;
        else if (statusText === 'Còn tiếp') novel.status = NovelStatus.Ongoing;
        else if (statusText === 'Tạm ngưng')
          novel.status = NovelStatus.OnHiatus;
        else novel.status = NovelStatus.Unknown;
      }
    }

    // Step 2: Fetch chapter list
    if (bookHost && bookId) {
      const chapUrl = new URL(`${this.site}/index.php`);
      chapUrl.searchParams.set('ngmar', 'chapterlist');
      chapUrl.searchParams.set('h', bookHost);
      chapUrl.searchParams.set('bookid', bookId);
      chapUrl.searchParams.set('sajax', 'getchapterlist');
      chapUrl.searchParams.set('force', 'true');
      const chapRes = await fetchApi(chapUrl.toString(), { headers });
      const chapJson = (await chapRes.json()) as {
        code: number;
        enckey?: string; // Unknown purpose
        data: string;
        oridata?: string;
        unlocked?: null | Record<string, any>;
        unvip?: number;
        val?: number;
      };
      if (chapJson.code === 1 && chapJson.data) {
        const chapters: Plugin.ChapterItem[] = [];
        const seen: Record<string, boolean> = {};
        const rows = chapJson.data.split('-//-');
        let chapterNum = 0;
        rows.forEach(row => {
          const trimmed = row.trim();
          if (!trimmed) return;
          const cols = trimmed.split('-/-');
          if (cols.length < 3) return;
          const chapId = cols[1].trim();
          const chapName = cols[2].trim();
          if (!chapId || !chapName) return;
          const dedup = chapId + '|' + chapName;
          if (seen[dedup]) return;
          seen[dedup] = true;
          chapterNum++;
          const check_vip = cols[3];
          const isVip =
            check_vip &&
            check_vip !== 'unvip' &&
            check_vip !== 'unvip\n' &&
            !(chapJson.unlocked && chapJson.unlocked[chapId as string]);
          chapters.push({
            name: isVip ? `[VIP] ${chapName}` : chapName,
            path: `/truyen/${bookHost}/${cols[0]}/${bookId}/${chapId}/`,
            chapterNumber: chapterNum,
          });
        });
        // idk
        if (bookHost === 'uukanshu') {
          chapters.reverse();
        }
        novel.chapters = chapters;
      } else if (chapJson.code === 2) {
        throw new Error('Truyện đã bị xóa hoặc không có nội dung');
      } else {
        throw new Error(`Lỗi không xác định: ${JSON.stringify(chapJson)}`);
      }
    }

    novel.genres = `${bookHost},${novel.genres
      ?.split(',')
      .map(g => g.trim())
      .filter(g => g)
      .join(',')}`;

    novel.summary = decodeHtmlEntities(novel.summary || '');

    return novel;
  }

  extractCookiesFromHtml(html: string): Record<string, string> {
    const cookies: Record<string, string> = {};
    // Inline JS the page ships looks like: document.cookie = "_ac=...; path=/";
    const re = /document\.cookie\s*=\s*["']([^"';]+)/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const idx = m[1].indexOf('=');
      if (idx <= 0) continue;
      const key = m[1].substring(0, idx).trim();
      const value = m[1].substring(idx + 1).trim();
      if (key && value) cookies[key] = value;
    }
    return cookies;
  }

  parseLooseJson(text: string): {
    code?: string | number;
    data?: string;
    chaptername?: string;
    bookhost?: string;
    err?: string;
  } | null {
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      const idx = text.indexOf('{');
      if (idx < 0) return null;
      try {
        return JSON.parse(text.substring(idx));
      } catch {
        return null;
      }
    }
  }

  // @ts-expect-error - public method with auto-retry wrapper
  async parseChapter(chapterPath: string): Promise<string> {
    const maxRetries = this.autoRetry ? 10 : 1;
    let attempt = 0;
    while (attempt < maxRetries) {
      try {
        return await this._parseChapter(chapterPath);
      } catch (err) {
        if (err instanceof STVChapterError && err.shouldStopRetry) {
          throw err;
        }
        attempt++;
        if (attempt >= maxRetries) {
          throw err;
        }
        console.warn(`Failed to load chapter (attempt ${attempt}):`, err);
        await new Promise(res => setTimeout(res, 1000));
      }
    }
  }

  private async _parseChapter(chapterPath: string, cfCount = 0): Promise<string> {
    // Path: /truyen/{host}/{sty}/{bookid}/{chapterId}/
    const pathParts = chapterPath.replace(/^\/|\/$/g, '').split('/');
    const bookHost = pathParts[1] || '';
    const bookId = pathParts[3] || '';
    const chapterId = pathParts[4] || '';
    const referer = `${this.site}${chapterPath}`;

    const origin = new URL(this.site).origin;

    // Step 0: clear session cookies but preserve translation preference.
    const oldCookies = await get(origin);
    for (const k in oldCookies) {
      await set(origin, { name: k, value: '' });
    }
    await removeSessionCookies();

    // Set translation cookies BEFORE Step 1 so the server sees them
    // on the very first request (session creation).
    await this.applyTranslationCookies(origin);

    // Step 1: prime the session — sends translation cookies with the GET.
    try {
      const pageRes = await fetchApi(referer, {
        headers: { ...(await this._cookieHeader(origin)) },
      });
      const html = await pageRes.text();
      const firstCookies = this.extractCookiesFromHtml(html);
      for (const k in firstCookies) {
        await set(origin, {
          name: k,
          value: firstCookies[k],
        });
      }
      if (pageRes.headers.get('set-cookie')) {
        await setFromResponse(origin, pageRes.headers.get('set-cookie')!);
      }
    } catch {
      // continue — server may still recognise the WebView's cookie jar
    }

    // Re-apply translation cookies in case Step 1's Set-Cookie overwrote them.
    await this.applyTranslationCookies(origin);

    const apiUrl = new URL(`${this.site}/index.php`);
    apiUrl.searchParams.set('bookid', bookId);
    apiUrl.searchParams.set('h', bookHost);
    apiUrl.searchParams.set('c', chapterId);
    apiUrl.searchParams.set('ngmar', 'readc');
    apiUrl.searchParams.set('sajax', 'readchapter');
    apiUrl.searchParams.set('sty', '1');
    apiUrl.searchParams.set('exts', '');

    // Step 2: probe POST that rotates `_ac`.
    // The browser sends the current `_ac` cookie value as the POST body.
    // Sending an empty body triggers the anti-bot heuristic (code 21).
    try {
      const jar = await get(origin);
      const acValue =
        (jar._ac && (typeof jar._ac === 'string' ? jar._ac : jar._ac.value)) ||
        '';
      const probeRes = await fetchApi(apiUrl.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Requested-With': 'XmlHttpRequest',
          Referer: referer,
          ...(await this._cookieHeader(origin)),
        },
        body: acValue,
      });
      await probeRes.text();
      if (probeRes.headers.get('set-cookie')) {
        await setFromResponse(origin, probeRes.headers.get('set-cookie')!);
      }
    } catch {
      // probe is best-effort; carry on
    }

    // Step 3: actual chapter fetch using the rotated cookies.
    const chapRes = await fetchApi(apiUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: referer,
        ...(await this._cookieHeader(origin)),
      },
      body: this.forceFetch ? 'rescan=true&k=' : '',
    });
    const data = this.parseLooseJson(await chapRes.text());
    if (!data) {
      throw new Error(
        'Bạn đang tải chương quá nhanh. Hãy thử lại sau vài giây.\nReason: null',
      );
    }
    if (String(data.code) === '0' && data.data) {
      const host = data.bookhost || bookHost;
      const rawData = this.removeSystemMessageFromChapterContent(
        String(data.data),
      );
      const applyName = this.autoName && this.translateEnabled;
      const content = normalizeChapterHtml(host, rawData, applyName);
      const title = data.chaptername?.trim();
      return (title ? `<h2>${title}</h2>` : '') + wrapWithParagraphs(content);
    } else {
      console.warn('Unexpected chapter API response', data);
      switch (String(data.code)) {
        case '21': {
          // return "<div id='captcha-placeholder'></div><meta id='no-cache-marker'/><meta id='no-prefetch-marker'/>";
          // Test Cloudflare Captcha
          try {
            if (cfCount > 2) {
              throw new Error('Too many Cloudflare captcha attempts. Aborting.');
            }
            const captchaToken = await solveCloudflareTurnstile(
              `${this.site}${chapterPath}`,
              '0x4AAAAAABVjME7NHipdnj-c',
            );
            if (!captchaToken) {
              throw new Error('Captcha solving failed or was cancelled.');
            }
            const body = new URLSearchParams();
            body.set('ajax', 'verifycaptcha');
            body.set('token', captchaToken);
            body.set('purpose', 'read');
            body.set('provider', 'cloudflare');
            // Verify the captcha token with the server
            const respCaptcha = await fetchApi(
              `${this.site}/index.php?ngmar=verifyca`,
              {
                headers: {
                  accept: '*/*',
                  'accept-language': 'vi',
                  'content-type': 'application/x-www-form-urlencoded',
                  pragma: 'no-cache',
                  referer: `${this.site}${chapterPath}`,
                },
                body: body.toString(),
                method: 'POST',
              },
            );
            console.log(
              'Captcha verification response:',
              await respCaptcha.text(),
            );
            return this._parseChapter(chapterPath, cfCount + 1); // Retry after captcha
          } catch (e) {
            console.error('Captcha solving error:', e);
            return "<div id='captcha-placeholder'></div><meta id='no-cache-marker'/><meta id='no-prefetch-marker'/>";
          }
        }
        default: {
          throw new STVChapterError(Number(data.code), data);
        }
      }
    }
  }

  private removeSystemMessageFromChapterContent(ori: string): string {
    if (!this.removeSystemMessage) return ori;
    return ori
      .replace('@Bạn đang đọc bản lưu trong hệ thống', '')
      .replace(
        'Bạn đang xem văn bản gốc chưa dịch, có thể kéo xuống cuối trang để chọn bản dịch.',
        '',
      )
      .replace(
        'Vì vấn đề nội dung, nguồn này không hỗ trợ xem văn bản gốc.',
        '',
      );
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const trimmed = searchTerm.trim();
    if (pageNo === 1 && looksLikeExternalUrl(trimmed)) {
      const detected = detectHostFromUrl(trimmed);
      if (detected) {
        let bookid = detected.bookid;
        if (ABT_HOSTS.has(detected.host)) {
          try {
            const abtUrl = new URL(`${this.site}/index.php`);
            abtUrl.searchParams.set('sajax', 'tryaddabtrecord');
            abtUrl.searchParams.set('host', detected.host);
            abtUrl.searchParams.set('abtbookid', bookid);
            const txt = (await fetchText(abtUrl.toString())).trim();
            const num = /^[0-9]+/.exec(txt);
            if (!num) return [];
            bookid = num[0];
          } catch {
            return [];
          }
        }
        const path = `/truyen/${detected.host}/1/${bookid}/`;
        let name = `${detected.host} | ${bookid}`;
        let cover: string = defaultCover;
        try {
          const infoUrl = new URL(`${this.site}/mobile/bookinfo.php`);
          infoUrl.searchParams.set('host', detected.host);
          infoUrl.searchParams.set('hid', bookid);
          const infoRes = await fetchApi(infoUrl.toString(), {
            headers: {
              'x-stv-transport': 'app',
              'x-requested-with': 'com.sangtacviet.mobilereader',
              Referer: `${this.site}${path}`,
            },
          });
          const infoJson = await infoRes.json();
          if (infoJson?.code === 100 && infoJson.book) {
            const b = infoJson.book;
            name = (b.tname || b.name || name).trim();
            if (b.thumb) {
              cover = b.thumb.startsWith('http')
                ? b.thumb
                : `${this.site}${b.thumb}`;
            }
          }
        } catch {
          // best-effort enrichment; fall back to placeholder name/cover
        }
        return [{ name, cover, path }];
      }
    }
    const url = new URL(`${this.site}/io/searchtp/searchBooks`);
    url.searchParams.set('find', searchTerm); // Tìm trong mô tả
    url.searchParams.set('findinname', searchTerm); // Tìm tên truyện
    url.searchParams.set('minc', '0');
    url.searchParams.set('sort', '');
    url.searchParams.set('tag', '');
    url.searchParams.set('p', String(pageNo));
    const html = await fetchText(url.toString());
    return this.parseNovelsFromHTML(html);
  }

  resolveUrl(path: string, isNovel?: boolean): string {
    return this.site + path;
  }
}

export default new SangTacVietPlugin();
