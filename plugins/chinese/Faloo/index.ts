import { fetchApi } from '@libs/fetch';
import { type Filters, FilterTypes } from '@libs/filterInputs';
import { NovelStatus } from '@libs/novelStatus';
import { bytesToUtf8 } from '@libs/utils';
import { NekoriBasePlugin } from '@nekori/plugin';
import { ContentType, ContentWarning } from '@nekori/pluginMetadata';
import { load as loadCheerio } from 'cheerio';

import { Plugin } from '@/types/plugin';

import { decodeGbk } from './gbk';

const PC_BASE = 'https://b.faloo.com';

const LETTER_OPTIONS = [
  { label: '不限 (Any)', value: '0' },
  ...'abcdefghijklmnopqrstuvwxyz'
    .split('')
    .map(ch => ({ label: `[${ch.toUpperCase()}]`, value: ch })),
];

/**
 * Encodes a search string using legacy JS `escape()` format (`%uXXXX` / `%XX`)
 * expected by Faloo's PC search endpoints (`/l/0/1.html?t=...&k=...`).
 */
function encodeFalooSearch(term: string): string {
  let out = '';
  for (let i = 0; i < term.length; i += 1) {
    const code = term.charCodeAt(i);
    if (
      (code >= 0x30 && code <= 0x39) ||
      (code >= 0x41 && code <= 0x5a) ||
      (code >= 0x61 && code <= 0x7a) ||
      '@*_+-./'.includes(term[i])
    ) {
      out += term[i];
    } else if (code < 0x100) {
      out += '%' + code.toString(16).toUpperCase().padStart(2, '0');
    } else {
      out += '%u' + code.toString(16).toUpperCase().padStart(4, '0');
    }
  }
  return out;
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

class FalooPlugin extends NekoriBasePlugin {
  id = 'faloo.com';
  name = 'Faloo';
  icon = 'icon.png';
  site = 'https://www.faloo.com';
  version = '1.0.1';
  contentType = ContentType.NOVEL;
  contentWarning = ContentWarning.UNSPECIFIED;

  imageRequestInit: Plugin.ImageRequestInit = {
    headers: {
      Referer: `${PC_BASE}/`,
    },
  };

  filters = {
    keyword: {
      type: FilterTypes.TextInput,
      label: '关键词搜索 (Search Keyword)',
      value: '',
    },
    searchType: {
      type: FilterTypes.Picker,
      label: '搜索方式 (Search By)',
      value: '1',
      options: [
        { label: '书名 (Title)', value: '1' },
        { label: '作者 (Author)', value: '2' },
      ],
    },
    category: {
      type: FilterTypes.Picker,
      label: '分类 (Category)',
      value: '0',
      options: [
        { label: '全部 / 原创书库 (All Categories)', value: '0' },
        { label: '玄幻奇幻 (Fantasy)', value: '1' },
        { label: '武侠仙侠 (Wuxia & Xianxia)', value: '6' },
        { label: '同人小说 (Fan Fiction)', value: '44' },
        { label: '都市言情 (Urban & Romance)', value: '4' },
        { label: '军事历史 (Military & History)', value: '3' },
        { label: '科幻网游 (Sci-Fi & Gaming)', value: '2' },
        { label: '恐怖灵异 (Horror & Supernatural)', value: '5' },
        { label: '青春校园 (Youth & Campus)', value: '7' },
        { label: '轻小说 (Light Novel)', value: '97' },
        { label: '女生小说 (Female-Oriented)', value: '54' },
        { label: '短篇其他 (Short Stories & Other)', value: '9' },
      ],
    },
    sort: {
      type: FilterTypes.Picker,
      label: '排序 (Sort By)',
      value: '1',
      options: [
        { label: '周点击 (Weekly Clicks)', value: '1' },
        { label: '最新更新 (Latest Updates)', value: '0' },
        { label: '月点击 (Monthly Clicks)', value: '2' },
        { label: '总点击 (Total Clicks)', value: '3' },
        { label: '周鲜花 (Weekly Flowers)', value: '4' },
        { label: '月鲜花 (Monthly Flowers)', value: '5' },
        { label: '总鲜花 (Total Flowers)', value: '6' },
        { label: '周收藏 (Weekly Favorites)', value: '7' },
        { label: '月收藏 (Monthly Favorites)', value: '8' },
        { label: '总收藏 (Total Favorites)', value: '9' },
        { label: '周打赏 (Weekly Rewards)', value: '13' },
        { label: '月打赏 (Monthly Rewards)', value: '17' },
        { label: '总打赏 (Total Rewards)', value: '18' },
        { label: '催更榜 (Update Requests)', value: '19' },
        { label: '月字数 (Monthly Words)', value: '12' },
        { label: '总字数 (Total Words)', value: '10' },
        { label: '新书PK榜 (New Book PK)', value: '66' },
        { label: '月票 (Monthly Tickets)', value: '15' },
      ],
    },
    status: {
      type: FilterTypes.Picker,
      label: '状态/类型 (Status & Type)',
      value: '0',
      options: [
        { label: '全部 (All)', value: '0' },
        { label: '连载中 (Ongoing)', value: '1' },
        { label: '已经完本 (Completed)', value: '2' },
        { label: '新书入库 (New Arrivals)', value: '9' },
        { label: 'VIP小说 (VIP)', value: '3' },
        { label: '免费小说 (Free)', value: '6' },
        { label: '出版专栏 (Published)', value: '5' },
        { label: '飞卢强推 (Featured)', value: '8' },
      ],
    },
    length: {
      type: FilterTypes.Picker,
      label: '字数 (Word Count)',
      value: '0',
      options: [
        { label: '全部 (Any Length)', value: '0' },
        { label: '30万以下 (Under 300K)', value: '11' },
        { label: '30万-50万 (300K–500K)', value: '12' },
        { label: '50万-100万 (500K–1M)', value: '3' },
        { label: '100万-200万 (1M–2M)', value: '14' },
        { label: '50万以上 (Over 500K)', value: '9' },
        { label: '100万以上 (Over 1M)', value: '4' },
        { label: '200万以上 (Over 2M)', value: '17' },
      ],
    },
    letter: {
      type: FilterTypes.Picker,
      label: '首字母 (Initial Letter)',
      value: '0',
      options: LETTER_OPTIONS,
    },
  } satisfies Filters;

  private normalizePcUrl(raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed) return '';
    if (trimmed.startsWith('//')) return `https:${trimmed}`;
    if (/^http:\/\/(?:www|b|img|s)\.faloo\.com/i.test(trimmed)) {
      return trimmed.replace(/^http:\/\//i, 'https://');
    }
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `${PC_BASE}${trimmed.startsWith('/') ? trimmed : `/${trimmed}`}`;
  }

  private normalizeCover(raw: string | undefined): string | undefined {
    if (!raw) return undefined;
    return this.normalizePcUrl(raw) || undefined;
  }

  private parseNovelId(path: string): string | undefined {
    const clean = path.trim();
    const directMatch = clean.match(/^\d+$/);
    if (directMatch) return directMatch[0];
    return clean.match(/\/(\d+)(?:_\d+)?\.html/i)?.[1];
  }

  private parseChapterIds(
    path: string,
  ): { novelId: string; chapterId: string } | undefined {
    const match = path.trim().match(/\/?(\d+)_(\d+)\.html/i);
    if (!match) return undefined;
    return { novelId: match[1], chapterId: match[2] };
  }

  private async fetchHtml(
    url: string,
    referer = `${PC_BASE}/`,
  ): Promise<string> {
    const response = await fetchApi(url, {
      headers: {
        Referer: referer,
      },
    });
    if (!response.ok) {
      throw new Error(`Faloo request failed (${url}): HTTP ${response.status}`);
    }
    const contentType = response.headers.get('content-type') || '';
    const bytes = new Uint8Array(await response.arrayBuffer());
    return /utf-8/i.test(contentType) ? bytesToUtf8(bytes) : decodeGbk(bytes);
  }

  private parseNovelList(html: string): Plugin.NovelItem[] {
    const $ = loadCheerio(html);
    const novels: Plugin.NovelItem[] = [];
    const seen = new Set<string>();

    $('.TwoBox02_02').each((_index, element) => {
      const card = $(element);
      const linkEl = card.find('.TwoBox02_08 a').first();
      const href = linkEl.attr('href') || '';
      const novelId = this.parseNovelId(href);
      const name = (linkEl.text() || linkEl.attr('title') || '').trim();
      if (!novelId || !name || seen.has(novelId)) return;
      seen.add(novelId);

      const imgEl = card.find('.TwoBox02_03 img').first();
      const rawCover = imgEl.attr('data-original') || imgEl.attr('src');

      novels.push({
        name,
        path: `/${novelId}.html`,
        cover: this.normalizeCover(rawCover),
      });
    });

    return novels;
  }

  private async fetchSearch(
    term: string,
    pageNo: number,
    searchType = '1',
  ): Promise<Plugin.NovelItem[]> {
    const safePage = Math.max(1, pageNo);
    const encoded = encodeFalooSearch(term);
    const url = `${PC_BASE}/l/0/${safePage}.html?t=${encodeURIComponent(searchType)}&k=${encoded}`;
    const html = await this.fetchHtml(url);
    return this.parseNovelList(html);
  }

  async popularNovels(
    pageNo: number,
    options: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const filters = options?.filters;
    const keyword = filters?.keyword?.value?.trim() || '';
    const searchType = filters?.searchType?.value || '1';
    if (keyword) {
      return this.fetchSearch(keyword, pageNo, searchType);
    }

    const safePage = Math.max(1, pageNo);
    const category = filters?.category?.value || '0';
    const letter = filters?.letter?.value || '0';
    const length = filters?.length?.value || '0';
    const status = filters?.status?.value || '0';
    const sort =
      options?.showLatestNovels &&
      (!filters?.sort?.value || filters.sort.value === '1')
        ? '0'
        : filters?.sort?.value || '1';

    const url = `${PC_BASE}/y_${category}_0_${letter}_${length}_${status}_${sort}_${safePage}.html`;
    const html = await this.fetchHtml(url);
    return this.parseNovelList(html);
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const term = searchTerm.trim();
    if (!term) return [];
    return this.fetchSearch(term, pageNo, '1');
  }

  private stripChapterPrefix(rawTitle: string, novelName: string): string {
    let cleaned = rawTitle.replace(/\r?\n[\s\S]*$/, '').trim();
    if (novelName) {
      if (cleaned.startsWith(`${novelName}:`)) {
        cleaned = cleaned.slice(novelName.length + 1).trim();
      } else if (cleaned.startsWith(`${novelName}：`)) {
        cleaned = cleaned.slice(novelName.length + 1).trim();
      } else if (cleaned.startsWith(`${novelName} `)) {
        cleaned = cleaned.slice(novelName.length + 1).trim();
      }
    }
    return cleaned;
  }

  private parseReleaseTime(rawTitle: string | undefined): string | null {
    if (!rawTitle) return null;
    const match = rawTitle.match(/更新[:：]\s*(\d{2,4})年(\d{1,2})月/);
    if (!match) return null;
    const year = match[1].length === 2 ? `20${match[1]}` : match[1];
    const month = match[2].padStart(2, '0');
    return `${year}-${month}`;
  }

  private parseDirectoryChapters(
    dirHtml: string,
    novelName: string,
  ): { chapters: Plugin.ChapterItem[]; isCompleted: boolean } {
    const $ = loadCheerio(dirHtml);
    const isCompleted = /更新时间[:：]\s*已完结/.test(dirHtml);
    const chapters: Plugin.ChapterItem[] = [];
    const seen = new Set<string>();
    let inVipSection = false;

    $('.c_con_free, .c_con_viptitle, .c_con_vipdesc, .c_con_list').each(
      (_index, element) => {
        const el = $(element);
        if (el.hasClass('c_con_free')) {
          inVipSection = false;
          return;
        }
        if (el.hasClass('c_con_viptitle') || el.hasClass('c_con_vipdesc')) {
          inVipSection = true;
          return;
        }

        el.find('a[href]').each((_idx, anchor) => {
          const a = $(anchor);
          const ids = this.parseChapterIds(a.attr('href') || '');
          if (!ids) return;
          const key = `${ids.novelId}_${ids.chapterId}`;
          if (seen.has(key)) return;
          seen.add(key);

          const rawTitle = a.attr('title');
          const textName = a.text().trim();
          const titleName = rawTitle
            ? this.stripChapterPrefix(rawTitle, novelName)
            : '';
          const baseName = textName || titleName;
          if (!baseName) return;

          chapters.push({
            name: inVipSection ? `🔒 ${baseName}` : baseName,
            path: `/${key}.html`,
            releaseTime: this.parseReleaseTime(rawTitle),
          });
        });
      },
    );

    return { chapters, isCompleted };
  }

  private parseFallbackTableChapters(
    detailHtml: string,
    novelName: string,
  ): Plugin.ChapterItem[] {
    const $ = loadCheerio(detailHtml);
    const chapters: Plugin.ChapterItem[] = [];
    const seen = new Set<string>();

    $('.DivTable').each((tableIndex, tableEl) => {
      const table = $(tableEl);
      table.find('a[href]').each((_idx, anchor) => {
        const a = $(anchor);
        const ids = this.parseChapterIds(a.attr('href') || '');
        if (!ids) return;
        const key = `${ids.novelId}_${ids.chapterId}`;
        if (seen.has(key)) return;
        seen.add(key);

        const isVip = a.parent().hasClass('DivTd') || tableIndex > 0;
        const rawTitle = a.attr('title');
        const fullFromTitle = rawTitle
          ? this.stripChapterPrefix(rawTitle, novelName)
          : '';
        const textName = a.text().trim();
        const baseName = fullFromTitle || textName;
        if (!baseName) return;

        chapters.push({
          name: isVip ? `🔒 ${baseName}` : baseName,
          path: `/${key}.html`,
          releaseTime: this.parseReleaseTime(rawTitle),
        });
      });
    });

    return chapters;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const novelId = this.parseNovelId(novelPath);
    if (!novelId) {
      throw new Error(`Invalid Faloo novel path: ${novelPath}`);
    }

    const detailUrl = `${PC_BASE}/${novelId}.html`;
    const html = await this.fetchHtml(detailUrl);
    const $ = loadCheerio(html);

    const name = $('#novelName').first().text().trim() || `Faloo ${novelId}`;
    const author =
      $('.T-L-O-Z-Box1 a[href*="t=2"]').first().text().trim() ||
      $('.T-L-O-Z-Box1 a[title]').first().text().trim() ||
      undefined;

    const rawCover =
      $('.T-L-T-Img img.imgcss').first().attr('src') ||
      $('.T-L-T-Img img').first().attr('src');
    const cover = this.normalizeCover(rawCover);

    const summaryLines: string[] = [];
    $('.T-L-T-C-Box1 p').each((_index, element) => {
      const text = $(element)
        .text()
        .replace(/[\u00a0\u3000]+/g, ' ')
        .trim();
      if (text) summaryLines.push(text);
    });
    const summary = summaryLines.length
      ? summaryLines.join('\n')
      : $('.T-L-T-C-Box1').first().text().trim() || undefined;

    const genresSet = new Set<string>();
    $('.T-R-T-Box2 a').each((_index, element) => {
      const tag = $(element).text().trim();
      if (tag) genresSet.add(tag);
    });
    const genres = genresSet.size ? [...genresSet].join(', ') : undefined;

    const rawRating = parseFloat($('.T-L-O-You .fs35').first().text().trim());
    const rating =
      !Number.isNaN(rawRating) && rawRating > 0
        ? Math.min(5, Math.round((rawRating / 2) * 100) / 100)
        : undefined;

    const dirHref =
      $('.T-L-T-Img a[href*="html_"]').first().attr('href') ||
      $('.T-L-T-C-Box2 a[href*="html_"]').first().attr('href');
    const dirUrl = dirHref
      ? this.normalizePcUrl(dirHref)
      : `${PC_BASE}/html_${Math.floor(Number(novelId) / 1000)}_${novelId}/`;

    let chapters: Plugin.ChapterItem[] = [];
    let isCompleted = false;

    try {
      const dirHtml = await this.fetchHtml(dirUrl, detailUrl);
      const parsedDir = this.parseDirectoryChapters(dirHtml, name);
      chapters = parsedDir.chapters;
      isCompleted = parsedDir.isCompleted;
    } catch {
      // Fall back to the chapter table embedded in the main novel page
    }

    if (!chapters.length) {
      chapters = this.parseFallbackTableChapters(html, name);
    }

    return {
      name,
      path: `/${novelId}.html`,
      cover,
      author,
      summary,
      genres,
      rating,
      status: isCompleted ? NovelStatus.Completed : NovelStatus.Ongoing,
      chapters,
    };
  }

  async parseChapter(chapterPath: string): Promise<Plugin.ChapterContent> {
    const ids = this.parseChapterIds(chapterPath);
    if (!ids) {
      throw new Error(`Invalid Faloo chapter path: ${chapterPath}`);
    }

    const chapterUrl = `${PC_BASE}/${ids.novelId}_${ids.chapterId}.html`;
    const html = await this.fetchHtml(
      chapterUrl,
      `${PC_BASE}/${ids.novelId}.html`,
    );
    const $ = loadCheerio(html);
    const contentEl = $('.noveContent').first();

    if (!contentEl.length) {
      throw new Error('Faloo chapter container (.noveContent) was not found');
    }

    const hasCheckpointUi =
      contentEl.find('.c_c1, .c_c3, .c_c4').length > 0 ||
      /您还没有登录|请登录后在继续阅读|升级VIP会员/.test(contentEl.text());

    const paragraphs: string[] = [];
    contentEl.find('p').each((_index, element) => {
      const text = $(element)
        .text()
        .replace(/[\u00a0\u3000]+/g, ' ')
        .trim();
      if (text) paragraphs.push(text);
    });

    const imageUrls: string[] = [];
    contentEl.find('img').each((_index, element) => {
      const rawSrc =
        $(element).attr('data-original') || $(element).attr('src') || '';
      const src = this.normalizePcUrl(rawSrc);
      if (src && !/\/novel2\//i.test(src)) {
        imageUrls.push(src);
      }
    });

    if (hasCheckpointUi && !paragraphs.length && !imageUrls.length) {
      return {
        state: 'checkpoint',
        type: 'novel',
        html:
          '<p>此章节为VIP付费章节，请在飞卢小说网登录并订阅后阅读。</p>' +
          '<p>This VIP chapter requires logging into Faloo and subscribing to read.</p>',
        checkpointMessage: 'VIP chapter requires Faloo login and subscription',
        noCache: true,
        noPrefetch: true,
      };
    }

    const textHtml = paragraphs
      .map(text => `<p>${escapeHtml(text)}</p>`)
      .join('');
    const imageHtml = imageUrls
      .map(src => `<img src="${escapeAttr(src)}" />`)
      .join('');

    if (textHtml && imageHtml) {
      return { state: 'ready', type: 'mixed', html: `${textHtml}${imageHtml}` };
    }
    if (imageHtml) {
      return { state: 'ready', type: 'image', html: imageHtml };
    }
    if (textHtml) {
      return { state: 'ready', type: 'novel', html: textHtml };
    }

    throw new Error('Faloo chapter content was empty or unavailable');
  }

  resolveUrl(path: string, isNovel = true): string {
    if (isNovel) {
      const novelId = this.parseNovelId(path);
      if (novelId) return `${PC_BASE}/${novelId}.html`;
    }
    const chapterIds = this.parseChapterIds(path);
    if (chapterIds) {
      return `${PC_BASE}/${chapterIds.novelId}_${chapterIds.chapterId}.html`;
    }
    return this.normalizePcUrl(path);
  }
}

export default new FalooPlugin();
