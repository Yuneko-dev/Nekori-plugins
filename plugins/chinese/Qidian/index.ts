import { fetchApi } from '@libs/fetch';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { NovelStatus } from '@libs/novelStatus';
import { get as getCookies, set as setCookie } from '@nekori/cookie';
import { NekoriBasePlugin } from '@nekori/plugin';
import { ContentType, ContentWarning } from '@nekori/pluginMetadata';
import { load as loadCheerio } from 'cheerio';

import { Plugin } from '@/types/plugin';

const FEMALE_CATEGORIES = new Set([
  '80',
  '81',
  '82',
  '83',
  '84',
  '85',
  '86',
  '87',
  '88',
  '30083',
  '30120',
]);

const CSRF_CHARS =
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

class QidianPlugin extends NekoriBasePlugin {
  id = 'qidian.com';
  name = 'Qidian';
  icon = 'icon.svg';
  site = 'https://www.qidian.com';
  version = '1.0.2';
  contentType = ContentType.NOVEL;
  contentWarning = ContentWarning.UNSPECIFIED;

  private cachedCsrfToken: string | undefined;

  filters = {
    keyword: {
      type: FilterTypes.TextInput,
      label: '关键词搜索 (Search Keyword)',
      value: '',
    },
    category: {
      type: FilterTypes.Picker,
      label: '分类 (Category)',
      value: '',
      options: [
        { label: '全部 / 默认玄幻 (All / Default)', value: '' },
        { label: '男频·玄幻 (Male - Xuanhuan)', value: '21' },
        { label: '男频·奇幻 (Male - Fantasy)', value: '1' },
        { label: '男频·武侠 (Male - Wuxia)', value: '2' },
        { label: '男频·仙侠 (Male - Xianxia)', value: '22' },
        { label: '男频·都市 (Male - Urban)', value: '4' },
        { label: '男频·现实 (Male - Realistic Fiction)', value: '15' },
        { label: '男频·军事 (Male - Military)', value: '6' },
        { label: '男频·历史 (Male - Historical)', value: '5' },
        { label: '男频·游戏 (Male - Gaming)', value: '7' },
        { label: '男频·体育 (Male - Sports)', value: '8' },
        { label: '男频·科幻 (Male - Science Fiction)', value: '9' },
        { label: '男频·悬疑灵异 (Male - Mystery)', value: '10' },
        { label: '男频·诸天无限 (Male - Endless Worlds)', value: '20109' },
        { label: '男频·轻小说 (Male - Light Novel)', value: '12' },
        { label: '男频·短篇 (Male - Short Stories)', value: '20076' },
        { label: '女频·古代言情 (Female - Ancient Romance)', value: '80' },
        { label: '女频·仙侠奇缘 (Female - Immortal Romance)', value: '81' },
        { label: '女频·现代言情 (Female - Modern Romance)', value: '82' },
        { label: '女频·浪漫青春 (Female - Romantic Youth)', value: '83' },
        { label: '女频·玄幻言情 (Female - Fantasy Romance)', value: '84' },
        { label: '女频·悬疑推理 (Female - Mystery & Suspense)', value: '85' },
        { label: '女频·科幻空间 (Female - Sci-Fi Space)', value: '86' },
        { label: '女频·轻小说 (Female - Light Novel)', value: '87' },
        { label: '女频·游戏竞技 (Female - Gaming & Sports)', value: '88' },
        { label: '女频·现实生活 (Female - Realistic Life)', value: '30120' },
        { label: '女频·短篇 (Female - Short Stories)', value: '30083' },
      ],
    },
    gender: {
      type: FilterTypes.Picker,
      label: '频道 (Audience)',
      value: '',
      options: [
        { label: '全部 / 默认男频 (All / Default Male)', value: '' },
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
        { label: '周推荐 (Weekly Recommendations)', value: '9' },
        { label: '月推荐 (Monthly Recommendations)', value: '10' },
        { label: '总推荐 (Total Recommendations)', value: '2' },
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

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private absoluteUrl(path: string): string {
    if (/^https?:\/\//i.test(path)) return path;
    if (path.startsWith('//')) return `https:${path}`;
    return `${this.site}${path.startsWith('/') ? path : `/${path}`}`;
  }

  private normalizeCover(
    path: string | undefined,
    bookId?: string,
  ): string | undefined {
    const raw =
      path ||
      (bookId ? `//bookcover.yuewen.com/qdbimg/349573/${bookId}/180` : '');
    return raw ? this.absoluteUrl(raw) : undefined;
  }

  private parseNovelId(path: string): string | undefined {
    return path.match(/\/(?:book|chapter)\/(\d+)/)?.[1];
  }

  private generateCsrfToken(): string {
    let token = '';
    for (let i = 0; i < 40; i += 1) {
      token += CSRF_CHARS[Math.floor(Math.random() * CSRF_CHARS.length)];
    }
    return token;
  }

  private updateCsrfFromResponse(response: Response): void {
    const setCookieHeader =
      response.headers.get('set-cookie') || response.headers.get('Set-Cookie');
    const match = setCookieHeader?.match(/(?:^|[,;\s])_csrfToken=([^;,\s]+)/);
    if (match?.[1]) {
      this.cachedCsrfToken = match[1];
    }
  }

  private async resolveCsrfToken(): Promise<{
    token: string;
    fromJar: boolean;
  }> {
    try {
      const cookies = await getCookies(this.site);
      const token = cookies?.['_csrfToken']?.value?.trim();
      if (token) {
        this.cachedCsrfToken = token;
        return { token, fromJar: true };
      }
    } catch {
      // Fallback when host cookie reader is unavailable
    }

    if (!this.cachedCsrfToken) {
      this.cachedCsrfToken = this.generateCsrfToken();
      try {
        await setCookie(this.site, {
          name: '_csrfToken',
          value: this.cachedCsrfToken,
          domain: '.qidian.com',
          path: '/',
        });
        return { token: this.cachedCsrfToken, fromJar: true };
      } catch {
        // Fallback to manual Cookie header
      }
    }

    return { token: this.cachedCsrfToken, fromJar: false };
  }

  private async requestWebcommon(
    endpointPath: string,
    params: URLSearchParams,
    referer = `${this.site}/`,
  ): Promise<Record<string, unknown>> {
    const csrf = await this.resolveCsrfToken();
    params.set('_csrfToken', csrf.token);
    const headers: Record<string, string> = { Referer: referer };
    if (!csrf.fromJar) {
      headers.Cookie = `_csrfToken=${csrf.token}`;
    }

    let response = await fetchApi(
      `${this.site}${endpointPath}?${params.toString()}`,
      { headers },
    );
    this.updateCsrfFromResponse(response);

    if (response.status === 403) {
      this.cachedCsrfToken = this.generateCsrfToken();
      await setCookie(this.site, {
        name: '_csrfToken',
        value: this.cachedCsrfToken,
        domain: '.qidian.com',
        path: '/',
      }).catch(() => undefined);

      params.set('_csrfToken', this.cachedCsrfToken);
      response = await fetchApi(
        `${this.site}${endpointPath}?${params.toString()}`,
        {
          headers: {
            Referer: referer,
            Cookie: `_csrfToken=${this.cachedCsrfToken}`,
          },
        },
      );
      this.updateCsrfFromResponse(response);
    }

    if (!response.ok) {
      throw new Error(
        `Qidian API request failed (${endpointPath}): HTTP ${response.status}`,
      );
    }

    let payload: unknown;
    try {
      payload = JSON.parse(await response.text());
    } catch {
      throw new Error('Qidian returned invalid JSON data');
    }

    if (!this.isRecord(payload) || payload.code !== 0) {
      const message =
        this.isRecord(payload) && typeof payload.msg === 'string'
          ? payload.msg
          : 'Unknown response';
      throw new Error(`Qidian API error: ${message}`);
    }

    return this.isRecord(payload.data) ? payload.data : {};
  }

  private parseRecordsToNovels(records: unknown[]): Plugin.NovelItem[] {
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
        typeof record.imgUrl === 'string' ? record.imgUrl : undefined;
      novels.push({
        name,
        path: `/book/${id}/`,
        cover: this.normalizeCover(image, id),
      });
    }
    return novels;
  }

  private async fetchSearchResults(
    term: string,
    pageNo: number,
    filters?: Plugin.PopularNovelsOptions<typeof this.filters>['filters'],
  ): Promise<Plugin.NovelItem[]> {
    const params = new URLSearchParams({
      kw: term,
      pageNum: String(pageNo),
    });

    if (filters) {
      const selectedCategory = filters.category?.value || '';
      const selectedGender = filters.gender?.value || '';
      const isFemaleCategory = FEMALE_CATEGORIES.has(selectedCategory);

      if (selectedGender === 'female' || isFemaleCategory) {
        params.set('siteid', '0');
      } else if (selectedGender === 'male') {
        params.set('siteid', '1');
      }

      if (selectedCategory) {
        const compatibleCategory =
          selectedGender === 'female' && !isFemaleCategory
            ? ''
            : selectedCategory;
        if (compatibleCategory) params.set('catId', compatibleCategory);
      }

      if (filters.sort?.value) params.set('orderBy', filters.sort.value);
      if (filters.access?.value) params.set('vip', filters.access.value);
      if (filters.length?.value) params.set('size', filters.length.value);
      if (filters.status?.value) params.set('state', filters.status.value);
      if (filters.quality?.value) params.set('sign', filters.quality.value);
      if (filters.updated?.value) params.set('update', filters.updated.value);
    }

    const referer = `${this.site}/so/${encodeURIComponent(term)}.html`;
    const data = await this.requestWebcommon(
      '/webcommon/search/list',
      params,
      referer,
    );
    const bookInfo = this.isRecord(data.bookInfo) ? data.bookInfo : undefined;
    if (!bookInfo || !Array.isArray(bookInfo.records)) {
      throw new Error('Qidian search response did not contain novel records');
    }

    return this.parseRecordsToNovels(bookInfo.records);
  }

  async popularNovels(
    pageNo: number,
    options: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const filters = options?.filters;
    const keyword = filters?.keyword?.value?.trim() || '';
    if (keyword) {
      return this.fetchSearchResults(keyword, pageNo, filters);
    }

    const selectedCategory = filters?.category?.value || '';
    const selectedGender = filters?.gender?.value || 'male';
    const isFemaleCategory = FEMALE_CATEGORIES.has(selectedCategory);
    const category =
      selectedGender === 'female' && !isFemaleCategory
        ? '80'
        : selectedCategory || '21';
    const gender = FEMALE_CATEGORIES.has(category) ? 'female' : 'male';

    const params = new URLSearchParams({
      catId: category,
      gender,
      pageNum: String(pageNo),
    });
    if (filters?.sort?.value) params.set('orderBy', filters.sort.value);
    if (filters?.access?.value) params.set('isvip', filters.access.value);
    if (filters?.length?.value) params.set('size', filters.length.value);
    if (filters?.status?.value) params.set('isfinish', filters.status.value);
    if (filters?.quality?.value) params.set('sign', filters.quality.value);
    if (filters?.updated?.value) params.set('update', filters.updated.value);

    const referer =
      gender === 'female'
        ? `${this.site}/mm/all/chanId${category}/`
        : `${this.site}/all/chanId${category}/`;

    const data = await this.requestWebcommon(
      '/webcommon/category/list',
      params,
      referer,
    );
    if (!Array.isArray(data.records)) {
      throw new Error('Qidian category response did not contain novel records');
    }

    return this.parseRecordsToNovels(data.records);
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const term = searchTerm.trim();
    if (!term) return [];
    return this.fetchSearchResults(term, pageNo);
  }

  private formatDescription(rawDesc: string): string {
    if (!rawDesc) return '';
    return loadCheerio(`<div>${rawDesc.replace(/<br\s*\/?>/gi, '\n')}</div>`)
      .text()
      .split('\n')
      .map(line => line.replace(/^[\s\u3000]+/, '').trim())
      .filter(Boolean)
      .join('\n');
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const bookId = this.parseNovelId(novelPath);
    if (!bookId) throw new Error(`Invalid Qidian novel path: ${novelPath}`);

    const referer = `${this.site}/book/${bookId}/`;
    const catalogData = await this.requestWebcommon(
      '/webcommon/book/mCategory',
      new URLSearchParams({ bookId }),
      referer,
    );

    const chapters: Plugin.ChapterItem[] = [];
    const seen = new Set<string>();
    let firstChapterId: string | undefined;

    if (Array.isArray(catalogData.vs)) {
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
          if (!firstChapterId) firstChapterId = cid;

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

    let bookInfo: Record<string, unknown> | undefined;
    if (firstChapterId) {
      const chapterData = await this.requestWebcommon(
        '/webcommon/chapter/getMChapterInfo',
        new URLSearchParams({ bookId, chapterId: firstChapterId }),
        referer,
      ).catch(() => undefined);
      if (chapterData && this.isRecord(chapterData.bookInfo)) {
        bookInfo = chapterData.bookInfo;
      }
    }

    const name =
      (typeof bookInfo?.bookName === 'string' && bookInfo.bookName.trim()) ||
      (typeof catalogData.bookName === 'string' &&
        catalogData.bookName.trim()) ||
      `Qidian ${bookId}`;
    const author =
      (typeof bookInfo?.authorName === 'string' &&
        bookInfo.authorName.trim()) ||
      (this.isRecord(catalogData.authorInfo) &&
      typeof catalogData.authorInfo.authorName === 'string'
        ? catalogData.authorInfo.authorName.trim()
        : '');
    const summary =
      typeof bookInfo?.desc === 'string'
        ? this.formatDescription(bookInfo.desc.trim())
        : '';

    const genresSet = new Set<string>();
    const addGenre = (value: unknown) => {
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed) genresSet.add(trimmed);
      }
    };
    addGenre(bookInfo?.chanName);
    addGenre(bookInfo?.subCateName);
    if (this.isRecord(bookInfo?.bookTag)) {
      addGenre(bookInfo.bookTag.tagName);
    }
    if (Array.isArray(bookInfo?.bookLabels)) {
      for (const label of bookInfo.bookLabels) {
        if (this.isRecord(label)) {
          addGenre(label.tag);
        }
      }
    }

    const statusText =
      (typeof bookInfo?.bookStatus === 'string' && bookInfo.bookStatus) ||
      (typeof bookInfo?.actionStatus === 'string' && bookInfo.actionStatus) ||
      (typeof catalogData.bookStatus === 'string' && catalogData.bookStatus) ||
      (typeof catalogData.actionStatus === 'string' &&
        catalogData.actionStatus) ||
      '';
    const isCompleted = /完结|完本/.test(statusText);

    return {
      name,
      path: `/book/${bookId}/`,
      cover: this.normalizeCover(undefined, bookId),
      author: author || undefined,
      summary: summary || undefined,
      genres: genresSet.size ? [...genresSet].join(', ') : undefined,
      status: isCompleted ? NovelStatus.Completed : NovelStatus.Ongoing,
      chapters,
    };
  }

  async parseChapter(
    chapterPath: string,
  ): Promise<{ state: 'ready'; type: 'novel'; html: string }> {
    const match = chapterPath.match(/\/chapter\/(\d+)\/(\d+)/);
    if (!match) throw new Error(`Invalid Qidian chapter path: ${chapterPath}`);

    const [, bookId, chapterId] = match;
    const data = await this.requestWebcommon(
      '/webcommon/chapter/getMChapterInfo',
      new URLSearchParams({ bookId, chapterId }),
      `${this.site}/chapter/${bookId}/${chapterId}/`,
    );

    const chapterInfo = this.isRecord(data.chapterInfo)
      ? data.chapterInfo
      : undefined;
    const rawContent =
      typeof chapterInfo?.content === 'string'
        ? chapterInfo.content.trim()
        : '';

    const $ = loadCheerio(`<div>${rawContent}</div>`);
    const paragraphs: string[] = [];
    $('p').each((_index, element) => {
      const text = $(element)
        .text()
        .replace(/[\u00a0\u3000]+/g, ' ')
        .trim();
      if (text) paragraphs.push(text);
    });

    if (!paragraphs.length && rawContent) {
      for (const line of $.text().split('\n')) {
        const text = line.replace(/[\u00a0\u3000]+/g, ' ').trim();
        if (text) paragraphs.push(text);
      }
    }

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
