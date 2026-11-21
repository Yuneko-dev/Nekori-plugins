import { fetchApi } from '@libs/fetch';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { NovelStatus } from '@libs/novelStatus';
import { NekoriBasePlugin } from '@nekori/plugin';
import { ContentType, ContentWarning } from '@nekori/pluginMetadata';
import { load as loadCheerio } from 'cheerio';

import { Plugin } from '@/types/plugin';

class QidianPlugin extends NekoriBasePlugin {
  id = 'qidian.com';
  name = 'Qidian';
  icon = 'icon.svg';
  site = 'https://www.qidian.com';
  version = '1.0.0';
  contentType = ContentType.NOVEL;
  contentWarning = ContentWarning.UNSPECIFIED;

  private readonly mobileSite = 'https://m.qidian.com';
  private readonly csrfToken = '1234567890abcdef1234567890abcdef12345678';

  filters = {
    category: {
      type: FilterTypes.Picker,
      label: '分类 (Category)',
      value: '21',
      options: [
        { label: '玄幻 (Fantasy)', value: '21' },
        { label: '奇幻 (Fantasy)', value: '1' },
        { label: '武侠 (Wuxia)', value: '5' },
        { label: '仙侠 (Xianxia)', value: '22' },
        { label: '都市 (Urban)', value: '4' },
        { label: '现实 (Realistic Fiction)', value: '15' },
        { label: '军事 (Military)', value: '6' },
        { label: '历史 (Historical)', value: '7' },
        { label: '游戏 (Gaming)', value: '8' },
        { label: '体育 (Sports)', value: '9' },
        { label: '科幻 (Science Fiction)', value: '10' },
        { label: '悬疑 (Mystery)', value: '11' },
        { label: '轻小说 (Light Novel)', value: '12' },
        { label: '短篇 (Short Stories)', value: '13' },
      ],
    },
    gender: {
      type: FilterTypes.Picker,
      label: '频道 (Audience)',
      value: 'male',
      options: [
        { label: '男频 (Male-Oriented)', value: 'male' },
        { label: '女频 (Female-Oriented)', value: 'female' },
      ],
    },
    sort: {
      type: FilterTypes.Picker,
      label: '排序 (Sort By)',
      value: '',
      options: [
        { label: '人气 (Popularity)', value: '' },
        { label: '时间 (Recently Updated)', value: '4' },
        { label: '字数 (Word Count)', value: '3' },
        { label: '收藏 (Favorites)', value: '11' },
        { label: '推荐 (Recommendations)', value: '9' },
        { label: '月票 (Monthly Tickets)', value: '12' },
        { label: '点击 (Views)', value: '1' },
      ],
    },
    access: {
      type: FilterTypes.Picker,
      label: '收费类型 (Access)',
      value: '',
      options: [
        { label: '全部 (All)', value: '' },
        { label: '免费 (Free)', value: '0' },
        { label: 'VIP (VIP)', value: '1' },
      ],
    },
    length: {
      type: FilterTypes.Picker,
      label: '字数 (Length)',
      value: '',
      options: [
        { label: '不限 (Any Length)', value: '' },
        { label: '30万字以下 (Under 300K)', value: '1' },
        { label: '30万–50万字 (300K–500K)', value: '2' },
        { label: '50万–100万字 (500K–1M)', value: '3' },
        { label: '100万–200万字 (1M–2M)', value: '4' },
        { label: '200万字以上 (Over 2M)', value: '5' },
      ],
    },
    status: {
      type: FilterTypes.Picker,
      label: '状态 (Status)',
      value: '',
      options: [
        { label: '全部 (All)', value: '' },
        { label: '连载 (Ongoing)', value: '0' },
        { label: '完本 (Completed)', value: '1' },
      ],
    },
    quality: {
      type: FilterTypes.Picker,
      label: '作品品质 (Quality)',
      value: '',
      options: [
        { label: '不限 (Any)', value: '' },
        { label: '签约作品 (Contracted)', value: '1' },
        { label: "精品小说 (Editor's Choice)", value: '2' },
      ],
    },
    updated: {
      type: FilterTypes.Picker,
      label: '更新时间 (Updated Within)',
      value: '',
      options: [
        { label: '不限 (Any Time)', value: '' },
        { label: '三日内 (3 Days)', value: '1' },
        { label: '七日内 (7 Days)', value: '2' },
        { label: '半月内 (15 Days)', value: '3' },
        { label: '一月内 (30 Days)', value: '4' },
      ],
    },
  } satisfies Filters;

  private absoluteUrl(path: string): string {
    if (/^https?:\/\//i.test(path)) return path;
    if (path.startsWith('//')) return `https:${path}`;
    return `${this.mobileSite}${path.startsWith('/') ? path : `/${path}`}`;
  }

  private normalizeCover(path: string | undefined): string | undefined {
    if (!path) return undefined;
    return this.absoluteUrl(path);
  }

  private parseNovelId(path: string): string | undefined {
    const match = path.match(/\/(?:book|chapter)\/(\d+)/);
    return match?.[1];
  }

  private parseNovelList(body: string): Plugin.NovelItem[] {
    const $ = loadCheerio(body);
    const novels: Plugin.NovelItem[] = [];
    const seen = new Set<string>();

    $('a[href]').each((_index, element) => {
      const link = $(element);
      const href = link.attr('href');
      if (!href) return;

      const bookId = this.parseNovelId(href);
      if (!bookId) return;

      const path = `/book/${bookId}/`;
      if (seen.has(path)) return;

      const name =
        link.find('h2').first().text().trim() ||
        link
          .attr('title')
          ?.replace(/最新章节在线阅读|在线阅读/g, '')
          .trim();
      if (!name) return;

      const image =
        link.find('img').first().attr('data-src') ||
        link.find('img').first().attr('data-original') ||
        link.find('img').first().attr('src');

      seen.add(path);
      novels.push({
        name,
        path,
        cover: this.normalizeCover(image),
      });
    });

    return novels;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private parseApiNovelList(
    body: string,
    searchResults = false,
  ): Plugin.NovelItem[] {
    let payload: unknown;
    try {
      payload = JSON.parse(body);
    } catch {
      throw new Error('Qidian returned invalid pagination data');
    }

    if (!this.isRecord(payload) || payload.code !== 0) {
      const message =
        this.isRecord(payload) && typeof payload.msg === 'string'
          ? payload.msg
          : 'Unknown response';
      throw new Error(`Qidian pagination failed: ${message}`);
    }

    const data = payload.data;
    const bookInfo =
      searchResults && this.isRecord(data) ? data.bookInfo : undefined;
    const records = this.isRecord(bookInfo)
      ? bookInfo.records
      : this.isRecord(data)
        ? data.records
        : undefined;

    if (!Array.isArray(records)) {
      throw new Error(
        'Qidian pagination response did not contain novel records',
      );
    }

    const novels: Plugin.NovelItem[] = [];
    for (const record of records) {
      if (!this.isRecord(record)) continue;
      const idValue = record.bid ?? record.bookId;
      const id =
        typeof idValue === 'number' || typeof idValue === 'string'
          ? String(idValue)
          : '';
      const name = typeof record.bName === 'string' ? record.bName.trim() : '';
      if (!/^\d+$/.test(id) || !name) continue;

      const image =
        (typeof record.imgUrl === 'string' && record.imgUrl) ||
        `//bookcover.yuewen.com/qdbimg/349573/${id}/180`;
      novels.push({
        name,
        path: `/book/${id}/`,
        cover: this.normalizeCover(image),
      });
    }

    return novels;
  }

  async popularNovels(
    pageNo: number,
    options: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const filters = options?.filters;
    const category = filters?.category?.value || '21';
    const routeFilters = [
      filters?.sort?.value ? `orderby${filters.sort.value}` : '',
      filters?.access?.value ? `isvip${filters.access.value}` : '',
      filters?.length?.value ? `size${filters.length.value}` : '',
      filters?.status?.value ? `isfinish${filters.status.value}` : '',
      filters?.quality?.value ? `sign${filters.quality.value}` : '',
      filters?.updated?.value ? `update${filters.updated.value}` : '',
    ].filter(Boolean);
    routeFilters.push(filters?.gender?.value || 'male');
    const route = routeFilters.join('-');
    if (pageNo <= 1) {
      const url = `${this.mobileSite}/category/catid${category}/${route}/`;
      const response = await fetchApi(url);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch popular novels: HTTP ${response.status}`,
        );
      }
      return this.parseNovelList(await response.text());
    }

    const params = new URLSearchParams({
      catId: category,
      gender: filters?.gender?.value || 'male',
      pageNum: String(pageNo),
      _csrfToken: this.csrfToken,
    });
    if (filters?.sort?.value) params.set('orderBy', filters.sort.value);
    if (filters?.access?.value) params.set('isvip', filters.access.value);
    if (filters?.length?.value) params.set('size', filters.length.value);
    if (filters?.status?.value) params.set('isfinish', filters.status.value);
    if (filters?.quality?.value) params.set('sign', filters.quality.value);
    if (filters?.updated?.value) params.set('update', filters.updated.value);

    const response = await fetchApi(
      `${this.mobileSite}/webcommon/category/list?${params.toString()}`,
      {
        headers: {
          Cookie: `_csrfToken=${this.csrfToken}`,
          Referer: `${this.mobileSite}/category/catid${category}/${route}/`,
        },
      },
    );
    if (!response.ok) {
      throw new Error(
        `Failed to fetch popular novels: HTTP ${response.status}`,
      );
    }
    return this.parseApiNovelList(await response.text());
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const term = searchTerm.trim();
    if (!term) return [];

    if (pageNo <= 1) {
      const url = `${this.mobileSite}/soushu/${encodeURIComponent(term)}.html`;
      const response = await fetchApi(url);
      if (!response.ok) {
        throw new Error(`Failed to search novels: HTTP ${response.status}`);
      }
      return this.parseNovelList(await response.text());
    }

    const params = new URLSearchParams({
      kw: term,
      pageNum: String(pageNo),
      _csrfToken: this.csrfToken,
    });
    const response = await fetchApi(
      `${this.mobileSite}/webcommon/search/list?${params.toString()}`,
      {
        headers: {
          Cookie: `_csrfToken=${this.csrfToken}`,
          Referer: `${this.mobileSite}/soushu/${encodeURIComponent(term)}.html`,
        },
      },
    );
    if (!response.ok) {
      throw new Error(`Failed to search novels: HTTP ${response.status}`);
    }
    return this.parseApiNovelList(await response.text(), true);
  }

  private extractPageData(body: string): Record<string, unknown> | undefined {
    const $ = loadCheerio(body);
    const raw = $('script#vite-plugin-ssr_pageContext').text().trim();
    if (!raw) return undefined;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!this.isRecord(parsed)) return undefined;
      const pageContext = parsed.pageContext;
      if (!this.isRecord(pageContext)) return undefined;
      const pageProps = pageContext.pageProps;
      if (!this.isRecord(pageProps)) return undefined;
      const pageData = pageProps.pageData;
      return this.isRecord(pageData) ? pageData : undefined;
    } catch {
      return undefined;
    }
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const bookId = this.parseNovelId(novelPath);
    if (!bookId) throw new Error(`Invalid Qidian novel path: ${novelPath}`);

    const [detailResponse, catalogResponse] = await Promise.all([
      fetchApi(`${this.mobileSite}/book/${bookId}/`),
      fetchApi(`${this.mobileSite}/book/${bookId}/catalog/`),
    ]);
    if (!detailResponse.ok) {
      throw new Error(`Failed to fetch novel: HTTP ${detailResponse.status}`);
    }
    if (!catalogResponse.ok) {
      throw new Error(
        `Failed to fetch catalog: HTTP ${catalogResponse.status}`,
      );
    }

    const detailBody = await detailResponse.text();
    const catalogBody = await catalogResponse.text();
    const $ = loadCheerio(detailBody);
    const detailData = this.extractPageData(detailBody);
    const catalogData = this.extractPageData(catalogBody);
    const bookInfo =
      detailData && this.isRecord(detailData.bookInfo)
        ? detailData.bookInfo
        : undefined;

    const name =
      (typeof bookInfo?.bookName === 'string' && bookInfo.bookName.trim()) ||
      $('meta[property="og:title"]').attr('content')?.trim() ||
      $('h1').first().text().trim() ||
      `Qidian ${bookId}`;
    const author =
      (typeof bookInfo?.authorName === 'string' &&
        bookInfo.authorName.trim()) ||
      $('meta[name="author"]').attr('content')?.trim() ||
      detailBody.match(/"authorName":"([^"]+)"/)?.[1] ||
      $('a[href*="/author"]').first().text().trim();

    const rawDesc =
      typeof bookInfo?.desc === 'string' ? bookInfo.desc.trim() : '';
    const descFromBookInfo = rawDesc
      ? loadCheerio(`<div>${rawDesc.replace(/<br\s*\/?>/gi, '\n')}</div>`)
          .text()
          .split('\n')
          .map(line => line.replace(/^[\s\u3000]+/, '').trim())
          .filter(Boolean)
          .join('\n')
      : '';
    const summary =
      descFromBookInfo ||
      $('meta[name="description"]').attr('content')?.trim() ||
      $('meta[property="og:description"]').attr('content')?.trim();
    const cover =
      $('meta[property="og:image"]').attr('content') ||
      $('link[rel="preload"][as="image"]').attr('href') ||
      $('img').first().attr('src');

    const genresList: string[] = [];
    if (typeof bookInfo?.chanName === 'string' && bookInfo.chanName.trim()) {
      genresList.push(bookInfo.chanName.trim());
    }
    if (
      typeof bookInfo?.subCateName === 'string' &&
      bookInfo.subCateName.trim()
    ) {
      genresList.push(bookInfo.subCateName.trim());
    }
    if (Array.isArray(bookInfo?.bookLabels)) {
      for (const label of bookInfo.bookLabels) {
        if (
          this.isRecord(label) &&
          typeof label.tag === 'string' &&
          label.tag.trim()
        ) {
          genresList.push(label.tag.trim());
        }
      }
    }

    const statusText =
      (typeof bookInfo?.bookStatus === 'string' && bookInfo.bookStatus) ||
      (typeof bookInfo?.actionStatus === 'string' && bookInfo.actionStatus) ||
      (typeof catalogData?.bookStatus === 'string' && catalogData.bookStatus) ||
      (typeof catalogData?.actionStatus === 'string' &&
        catalogData.actionStatus) ||
      '';
    const isCompleted = statusText
      ? /完结|完本/.test(statusText)
      : /"bookStatus":"完本"|"actionStatus":"完本"/.test(detailBody);

    const chapters: Plugin.ChapterItem[] = [];
    const seen = new Set<string>();

    if (catalogData && Array.isArray(catalogData.vs)) {
      for (const volume of catalogData.vs) {
        if (!this.isRecord(volume) || !Array.isArray(volume.cs)) continue;
        const isVipVolume = volume.vS === 1;
        for (const chap of volume.cs) {
          if (!this.isRecord(chap)) continue;
          const cid =
            typeof chap.id === 'number' || typeof chap.id === 'string'
              ? String(chap.id)
              : '';
          const cName = typeof chap.cN === 'string' ? chap.cN.trim() : '';
          if (!cid || !cName || seen.has(cid)) continue;
          seen.add(cid);
          const isLocked = chap.sS === 0 || (isVipVolume && chap.sS !== 1);
          const releaseTime =
            typeof chap.uT === 'string' && chap.uT.trim()
              ? chap.uT.trim()
              : null;
          chapters.push({
            name: isLocked ? `🔒 ${cName}` : cName,
            path: `/chapter/${bookId}/${cid}/`,
            releaseTime,
          });
        }
      }
    }

    if (!chapters.length) {
      const $catalog = loadCheerio(catalogBody);
      $catalog('.y-list__content a[href*="/chapter/"]').each(
        (_index, element) => {
          const link = $catalog(element);
          const href = link.attr('href');
          const cid = href ? this.parseChapterId(href) : undefined;
          if (!cid || seen.has(cid)) return;
          const chapterName =
            link.find('h2').first().text().trim() ||
            link
              .attr('title')
              ?.replace(/.*?\s/, '')
              .replace(/在线阅读$/, '')
              .trim();
          if (!chapterName) return;
          seen.add(cid);

          const className = link.attr('class') || '';
          const isLocked = className.includes('_unPay_');
          const alt = link.attr('alt') || '';
          const releaseMatch = alt.match(
            /首发时间:\s*(\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2}:\d{2})?)/,
          );
          chapters.push({
            name: isLocked ? `🔒 ${chapterName}` : chapterName,
            path: `/chapter/${bookId}/${cid}/`,
            releaseTime: releaseMatch?.[1] || null,
          });
        },
      );
    }

    return {
      name,
      path: `/book/${bookId}/`,
      cover: this.normalizeCover(cover),
      author: author || undefined,
      summary: summary || undefined,
      genres: genresList.length ? genresList.join(', ') : undefined,
      status: isCompleted ? NovelStatus.Completed : NovelStatus.Ongoing,
      chapters,
    };
  }

  private parseChapterId(path: string): string | undefined {
    const match = path.match(/\/chapter\/\d+\/(\d+)/);
    return match?.[1];
  }

  async parseChapter(
    chapterPath: string,
  ): Promise<{ state: 'ready'; type: 'novel'; html: string }> {
    const match = chapterPath.match(/\/chapter\/(\d+)\/(\d+)/);
    if (!match) throw new Error(`Invalid Qidian chapter path: ${chapterPath}`);

    const [, bookId, chapterId] = match;
    const response = await fetchApi(
      `${this.mobileSite}/chapter/${bookId}/${chapterId}/`,
    );
    if (!response.ok) {
      throw new Error(`Failed to fetch chapter: HTTP ${response.status}`);
    }

    const $ = loadCheerio(await response.text());
    const paragraphs: string[] = [];
    $('p').each((_index, element) => {
      const text = $(element)
        .text()
        .replace(/\u00a0/g, ' ')
        .trim();
      if (text && text.length >= 2) paragraphs.push(text);
    });

    if (!paragraphs.length) {
      throw new Error('Qidian chapter content was empty or unavailable');
    }

    const html = paragraphs
      .map(
        text =>
          `<p>${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`,
      )
      .join('');
    return { state: 'ready', type: 'novel', html };
  }

  resolveUrl(path: string, isNovel = true): string {
    const value = path.startsWith('/') ? path : `/${path}`;
    if (isNovel) {
      const bookId = this.parseNovelId(value);
      if (bookId) return `${this.site}/book/${bookId}/`;
    }
    const chapter = value.match(/\/chapter\/(\d+)\/(\d+)/);
    if (chapter) {
      return `${this.site}/chapter/${chapter[1]}/${chapter[2]}/`;
    }
    return `${this.site}${value}`;
  }
}

export default new QidianPlugin();
