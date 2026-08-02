import { load as loadCheerio } from 'cheerio';
import { fetchText } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { defaultCover } from '@libs/defaultCover';
import { FilterTypes, Filters } from '@libs/filterInputs';
import { NovelStatus } from '@libs/novelStatus';
import { get, set } from '@libs/cookie';
import { ContentType, ContentWarning } from '@libs/pluginMetadata';

// Because the selector was debugged on a computer, it must use a Windows user agent.
const UserAgent =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';

class NocSyosetu implements Plugin.PagePlugin {
  id = 'noc.syosetu';
  name = 'NocSyosetu';
  icon = 'src/jp/nocsyosetu/icon.png';
  site = 'https://noc.syosetu.com';
  version = '1.1.21';
  contentType = ContentType.NOVEL;
  contentWarning = ContentWarning.NSFW;

  private async checkR18Cookie(url: string) {
    const urlObj = new URL(url);
    // check over18 cookie
    const cookies = await get(urlObj.origin);
    if (!cookies.over18 || cookies.over18.value !== 'yes') {
      await set(urlObj.origin, {
        name: 'over18',
        value: 'yes',
        domain: `.${urlObj.host}`,
      });
    }
  }

  get filters(): Filters {
    const getLabel = (jp: string, en: string) => `${jp} (${en})`;
    return {
      order: {
        label: getLabel('並び替え', 'Order By'),
        type: FilterTypes.Picker,
        value: 'new',
        options: [
          {
            label: getLabel('最新掲載順', 'Most Recently Updated'),
            value: 'new',
          },
          {
            label: getLabel(
              '週間ユニークアクセスが多い順',
              'Most Weekly Unique Accesses',
            ),
            value: 'weekly',
          },
          {
            label: getLabel('ブックマーク登録の多い順', 'Most Bookmarks'),
            value: 'favnovelcnt',
          },
          {
            label: getLabel('レビューの多い順', 'Most Reviews'),
            value: 'reviewcnt',
          },
          {
            label: getLabel('総合ポイントの高い順', 'Highest Total Points'),
            value: 'hyoka',
          },
          {
            label: getLabel('日間ポイントの高い順', 'Highest Daily Points'),
            value: 'dailypoint',
          },
          {
            label: getLabel('週間ポイントの高い順', 'Highest Weekly Points'),
            value: 'weeklypoint',
          },
          {
            label: getLabel('月間ポイントの高い順', 'Highest Monthly Points'),
            value: 'monthlypoint',
          },
          {
            label: getLabel(
              '四半期ポイントの高い順',
              'Highest Quarterly Points',
            ),
            value: 'quarterlypoint',
          },
          {
            label: getLabel('年間ポイントの高い順', 'Highest Yearly Points'),
            value: 'yearlypoint',
          },
          {
            label: getLabel('評価者数の多い順', 'Most Ratings'),
            value: 'hyokacnt',
          },
          {
            label: getLabel('文字数の多い順', 'Highest Character Count'),
            value: 'lengthdesc',
          },
          {
            label: getLabel('初回掲載順', 'Initial Publication Order'),
            value: 'generalfirstup',
          },
          {
            label: getLabel('更新が古い順', 'Least Recently Updated'),
            value: 'old',
          },
        ],
      },
      type: {
        label: getLabel('作品種別', 'Novel Type'),
        type: FilterTypes.Picker,
        value: '',
        options: [
          { label: getLabel('全て', 'All'), value: '' },
          { label: getLabel('短編', 'Short Story'), value: 't' },
          { label: getLabel('連載', 'Serialization'), value: 're' },
          { label: getLabel('完結のみ', 'Completed'), value: 'er' },
          { label: getLabel('連載中のみ', 'Ongoing'), value: 'r' },
        ],
      },
      scope: {
        label: getLabel('検索範囲', 'Search Scope'),
        type: FilterTypes.CheckboxGroup,
        value: [],
        options: [
          { label: getLabel('作品タイトル', 'Title'), value: 'title' },
          { label: getLabel('あらすじ', 'Synopsis'), value: 'ex' },
          { label: getLabel('キーワード', 'Keywords'), value: 'keyword' },
          { label: getLabel('作者名', 'Author'), value: 'wname' },
        ],
      },
      tags: {
        label: getLabel('特殊タグ', 'Special Tags'),
        type: FilterTypes.CheckboxGroup,
        value: ['ispickup'],
        options: [
          {
            label: getLabel('残酷な描写あり', 'Cruel Content'),
            value: 'iszankoku',
          },
          { label: getLabel('ボーイズラブ', 'Boys Love'), value: 'isbl' },
          { label: getLabel('ガールズラブ', 'Girls Love'), value: 'isgl' },
          {
            label: getLabel('異世界転生', 'Isekai Reincarnation'),
            value: 'istensei',
          },
          {
            label: getLabel('異世界転移', 'Isekai Transfer'),
            value: 'istenni',
          },
          {
            label: getLabel('挿絵のある作品', 'With Illustrations'),
            value: 'sasie',
          },
          {
            label: getLabel('小説PickUp！対象作品', 'Pickup'),
            value: 'ispickup',
          },
        ],
      },
      tag: {
        label: getLabel('除外タグ', 'Exclude Tags'),
        type: FilterTypes.CheckboxGroup,
        value: [],
        options: [
          {
            label: getLabel(
              '長期連載停止中の作品',
              'Long-term Suspended Serialization',
            ),
            value: 'stop',
          },
          {
            label: getLabel('残酷な描写あり', 'Cruel Content'),
            value: 'notzankoku',
          },
          { label: getLabel('ボーイズラブ', 'Boys Love'), value: 'notbl' },
          { label: getLabel('ガールズラブ', 'Girls Love'), value: 'notgl' },
          {
            label: getLabel('異世界転生', 'Isekai Reincarnation'),
            value: 'nottensei',
          },
          {
            label: getLabel('異世界転移', 'Isekai Transfer'),
            value: 'nottenni',
          },
        ],
      },
    } satisfies Filters;
  }

  private parseNovels($: any): Plugin.NovelItem[] {
    const novels: Plugin.NovelItem[] = [];

    $('.searchkekka_box, .trackback_list').each((i: number, el: any) => {
      const $el = $(el);
      const titleAnchor = $el
        .find('.novel_h a, .trackback_listdiv a, a.tl')
        .first();
      if (titleAnchor.length === 0) return;

      const name = titleAnchor
        .text()
        .trim()
        .replace(/\([^)]*\)$/, '')
        .trim();
      let novelUrl = titleAnchor.attr('href');

      if (name && novelUrl) {
        novelUrl = this.normalizeNovelUrl(novelUrl);

        novels.push({
          name,
          path: novelUrl,
          cover: defaultCover,
        });
      }
    });

    return novels;
  }

  fetchTextWithUA(url: string) {
    return fetchText(url, {
      headers: {
        'User-Agent': UserAgent,
      },
    });
  }

  async popularNovels(
    pageNo: number,
    options: Plugin.PopularNovelsOptions<Filters>,
  ): Promise<Plugin.NovelItem[]> {
    const { filters, showLatestNovels } = options;

    const urlObject = new URL(`${this.site}/search/search/search.php`);
    const params = urlObject.searchParams;

    params.set('order_former', 'search');
    params.set('p', pageNo.toString());
    params.set('word', '');

    const isCustomFilter =
      !showLatestNovels &&
      filters &&
      (filters.order?.value !== 'new' ||
        filters.type?.value ||
        (filters.scope?.value as any[])?.length ||
        (filters.tags?.value as any[])?.length ||
        (filters.tag?.value as any[])?.length);

    if (isCustomFilter) {
      if (filters.order?.value)
        params.set('order', filters.order.value as string);
      if (filters.type?.value) params.set('type', filters.type.value as string);

      ['scope', 'tags', 'tag'].forEach(key => {
        const arr = filters[key]?.value;
        if (Array.isArray(arr)) {
          arr.forEach(val => params.set(val as string, '1'));
        }
      });
    } else {
      params.set('order', 'new');
      params.set('ispickup', '1');
      params.set('type', '');
    }

    const url = urlObject.toString();

    await this.checkR18Cookie(url);

    const body = await this.fetchTextWithUA(url);

    const $ = loadCheerio(body);

    const pageNovels = this.parseNovels($);

    if (pageNovels.length === 0) {
      this.checkCacheR18(body);
    }

    return pageNovels;
  }

  parseChapters($page: any): Plugin.ChapterItem[] {
    const chapters: Plugin.ChapterItem[] = [];

    $page('.p-eplist__sublist').each((i: number, element: any) => {
      const chapterLink = $page(element).find('a');
      const chapterUrl = chapterLink.attr('href');
      const chapterName = chapterLink.text().trim();
      const releaseDate = $page(element)
        .find('.p-eplist__update')
        .text()
        .trim()
        .split(' ')[0]
        .replace(/\//g, '-');

      if (chapterUrl) {
        chapters.push({
          name: chapterName,
          releaseTime: releaseDate,
          path: this.normalizeNovelUrl(chapterUrl),
        });
      }
    });

    return chapters;
  }

  private normalizeNovelUrl(url: string): string {
    if (url.startsWith('http')) {
      return url;
    } else if (url.startsWith('/')) {
      return `https://novel18.syosetu.com${url}`;
    } else {
      return `https://novel18.syosetu.com/${url}`;
    }
  }

  async parseNovel(
    novelUrl: string,
  ): Promise<Plugin.SourceNovel & { totalPages: number }> {
    await this.checkR18Cookie(novelUrl);

    const body = await this.fetchTextWithUA(novelUrl);

    this.checkCacheR18(body);

    const $ = loadCheerio(body);

    // Parse status
    let status = 'Unknown';
    if (
      $('.c-announce').text().includes('連載中') ||
      $('.c-announce').text().includes('未完結')
    ) {
      status = NovelStatus.Ongoing;
    } else if ($('.c-announce').text().includes('更新されていません')) {
      status = NovelStatus.OnHiatus;
    } else if ($('.c-announce').text().includes('完結')) {
      status = NovelStatus.Completed;
    }

    let lastPageNum = 1;
    const lastPageHref = $('.c-pager__item--last').attr('href');
    if (lastPageHref) {
      const match = lastPageHref.match(/\?p=(\d+)/);
      if (match && match[1]) {
        lastPageNum = parseInt(match[1]);
      }
    }

    const name =
      $('.p-novel__title').text().trim() ||
      $('title').text().replace('ノクターンノベルズ', '').trim();
    const summary = ($('#novel_ex').html() || '').replace(/<br>/g, '\n').trim();
    const genres = $('meta[property="og:description"]')
      .attr('content')
      ?.split(' ')
      .join(',');

    const chapters = this.parseChapters($);
    if (chapters.length === 0 && $('.p-novel__body').length > 0) {
      // YYYY/MM/DD
      const date = $('.p-novel__date-published')
        .text()
        .trim()
        .match(/(\d{4}\/\d{2}\/\d{2})/)?.[1];
      // Convert to YYYY-MM-DD
      const releaseTime = date ? date.replace(/\//g, '-') : '';
      chapters.push({
        name,
        path: novelUrl,
        releaseTime,
      });
    }

    const novel: Plugin.SourceNovel & { totalPages: number } = {
      path: novelUrl,
      name,
      author: $('.p-novel__author').text().replace('作者：', '').trim(),
      summary,
      artist: '',
      genres,
      cover: defaultCover,
      status,
      chapters,
      totalPages: lastPageNum,
    };

    return novel;
  }

  async parsePage(novelPath: string, page: string): Promise<Plugin.SourcePage> {
    const url = new URL(novelPath);
    url.searchParams.set('p', page);

    await this.checkR18Cookie(url.toString());

    const body = await this.fetchTextWithUA(url.toString());
    const $ = loadCheerio(body);

    return {
      chapters: this.parseChapters($),
    };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    await this.checkR18Cookie(chapterPath);

    const body = await this.fetchTextWithUA(chapterPath);

    const cheerioQuery = loadCheerio(body);
    this.checkCacheR18(body);
    // Get the chapter title
    const chapterTitle = cheerioQuery('.p-novel__title').html() || '';

    // Get the chapter content
    const chapterContent =
      cheerioQuery(
        '.p-novel__body .p-novel__text:not([class*="p-novel__text--"])',
      ).html() || '';

    // Combine title and content with proper HTML structure
    return `<h1>${chapterTitle}</h1>${chapterContent}`;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const url = `${this.site}/search/search/search.php?order_former=search&word=${encodeURIComponent(
      searchTerm,
    )}${
      pageNo !== undefined
        ? `&p=${pageNo <= 1 || pageNo > 100 ? '1' : pageNo}` // check if pagenum is between 1 and 100
        : '' // if isn't don't set ?p
    }`;

    await this.checkR18Cookie(url);

    const body = await this.fetchTextWithUA(url);

    const cheerioQuery = loadCheerio(body);

    const pageNovels = this.parseNovels(cheerioQuery);

    if (pageNovels.length === 0 && pageNo === 1) {
      this.checkCacheR18(body);
    }

    return pageNovels;
  }

  checkCacheR18(body: string): void {
    body = body.toLowerCase();
    if (
      ['javascript', 'cookie', 'ご利用ください。', '18歳以上'].every(word =>
        body.includes(word),
      )
    ) {
      throw new Error(
        'Failed to load novels. Please check the age gate in WebView. / 小説の読み込みに失敗しました。WebViewでの年齢確認をご確認ください。',
      );
    }
  }

  resolveUrl(path: string, isNovel?: boolean): string {
    return path;
  }
}

export default new NocSyosetu();
