import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { NovelStatus } from '@libs/novelStatus';
import { defaultCover } from '@libs/defaultCover';
import { FilterTypes, Filters } from '@libs/filterInputs';
import { encodeHtmlEntities } from '@libs/utils';
import { ContentType, ContentWarning } from '@libs/pluginMetadata';

class PixivNovelPlugin implements Plugin.PagePlugin {
  id = 'pixiv.novel';
  name = 'Pixiv Novel';
  icon = 'src/jp/pixivnovel/icon.png';
  site = 'https://www.pixiv.net';
  version = '1.0.13';
  contentType = ContentType.NOVEL;
  contentWarning = ContentWarning.MIXED;

  get imageRequestInit() {
    return {
      headers: {
        'Referer': 'https://www.pixiv.net',
      },
      method: 'GET',
    };
  }

  private headers: Record<string, string> = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Referer': 'https://www.pixiv.net',
    'Accept': 'application/json',
  };

  /**
   * Fetch JSON from Pixiv AJAX API
   */
  private async fetchJson(url: string): Promise<any> {
    const result = await fetchApi(url, { headers: this.headers });
    const json = await result.json();
    if (json.error) {
      if (json.message === 'Ranking could not be found. Please try again.') {
        throw new Error(
          'Please log in to Pixiv via WebView to view R-18 content. / R-18コンテンツを閲覧するには、WebViewからPixivにログインしてください。',
        );
      }
      throw new Error(json.message || 'Pixiv API error');
    }
    return json.body;
  }

  /**
   * Get popular novel series from genre page
   * Supports genre-specific and R-18 sub-category URLs
   */
  async popularNovels(
    pageNo: number,
    options: Plugin.PopularNovelsOptions<Filters>,
  ): Promise<Plugin.NovelItem[]> {
    if (pageNo > 1) return [];

    const mode = (options.filters?.mode?.value as string) || 'safe';
    const genre = (options.filters?.genre?.value as string) || 'all';
    if (
      (mode == 'safe' && (genre == 'male' || genre == 'female')) ||
      (mode == 'r18' && (genre == 'all' || genre == 'for_kids'))
    ) {
      throw new Error(
        `The genre ${genre} does not exist in mode: ${mode == 'safe' ? 'all ages' : 'r18'}`,
      );
    }
    const url = new URL(`${this.site}/ajax/genre/novel/${genre}`);
    url.searchParams.set('mode', mode);
    url.searchParams.set('lang', 'en');
    const body = await this.fetchJson(url.toString());

    const novels: Plugin.NovelItem[] = [];
    const seriesList = body?.thumbnails?.novelSeries || [];

    for (const series of seriesList) {
      const coverUrl =
        series.cover?.urls?.['480mw'] ||
        series.cover?.urls?.['240mw'] ||
        defaultCover;
      const isOneshot = series.isOneshot === true;
      const path = isOneshot
        ? `/novel/show.php?id=${series.novelId}`
        : `/novel/series/${series.id}`;

      novels.push({
        name: series.title || 'Untitled',
        path,
        cover: coverUrl,
      });
    }

    return novels;
  }

  /**
   * Parse novel metadata - handles both series and oneshot novels
   */
  async parseNovel(
    novelPath: string,
  ): Promise<Plugin.SourceNovel & { totalPages: number }> {
    const seriesMatch = novelPath.match(/\/novel\/series\/(\d+)/);

    if (seriesMatch) {
      return this.parseSeriesNovel(seriesMatch[1], novelPath);
    }

    // Oneshot novel - /novel/show.php?id=XXX
    const novelIdMatch = novelPath.match(/id=(\d+)/);
    if (novelIdMatch) {
      return this.parseOneshotNovel(novelIdMatch[1], novelPath);
    }

    throw new Error('Invalid novel path');
  }

  /**
   * Parse a series novel with multiple chapters
   */
  private async parseSeriesNovel(
    seriesId: string,
    novelPath: string,
  ): Promise<Plugin.SourceNovel & { totalPages: number }> {
    // Get series metadata
    const seriesBody = await this.fetchJson(
      `${this.site}/ajax/novel/series/${seriesId}?lang=en`,
    );

    // Get first page of chapters (30 per page)
    const contentBody = await this.fetchJson(
      `${this.site}/ajax/novel/series_content/${seriesId}?limit=30&last_order=0&order_by=asc&lang=en`,
    );

    const coverUrl =
      seriesBody.cover?.urls?.['480mw'] ||
      seriesBody.cover?.urls?.['240mw'] ||
      seriesBody.firstEpisode?.url ||
      defaultCover;

    // Parse chapters from page.seriesContents
    const seriesContents = contentBody?.page?.seriesContents || [];
    const chapters: Plugin.ChapterItem[] = seriesContents.map(
      (item: any, index: number) => ({
        name: item.title
          ? `#${index + 1} ${item.title}`
          : `Chapter ${index + 1}`,
        path: `/ajax/novel/${item.id}`,
        chapterNumber: item.series?.contentOrder || index + 1,
        releaseTime: item.uploadTimestamp
          ? new Date(item.uploadTimestamp * 1000).toISOString()
          : '',
      }),
    );

    // Calculate total pages
    const totalEpisodes =
      seriesBody.publishedContentCount || seriesBody.total || chapters.length;
    const totalPages = Math.max(1, Math.ceil(totalEpisodes / 30));

    // Build tag/genre list
    const tags: string[] = seriesBody.tags || [];

    // Clean up caption HTML for summary
    let summary = seriesBody.caption || '';
    summary = summary.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');

    const novel: Plugin.SourceNovel & { totalPages: number } = {
      path: novelPath,
      name: seriesBody.title || 'Untitled',
      author: seriesBody.userName || 'Unknown',
      summary,
      genres: tags.join(','),
      cover: coverUrl,
      status: seriesBody.isConcluded
        ? NovelStatus.Completed
        : NovelStatus.Ongoing,
      chapters,
      totalPages,
    };

    return novel;
  }

  /**
   * Parse a oneshot (single-chapter) novel
   */
  private async parseOneshotNovel(
    novelId: string,
    novelPath: string,
  ): Promise<Plugin.SourceNovel & { totalPages: number }> {
    const body = await this.fetchJson(
      `${this.site}/ajax/novel/${novelId}?lang=en`,
    );

    const coverUrl = body.coverUrl || defaultCover;
    const tags: string[] = (body.tags?.tags || []).map((t: any) => t.tag || '');

    // Clean summary
    let summary = body.description || '';
    summary = summary.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');

    const novel: Plugin.SourceNovel & { totalPages: number } = {
      path: novelPath,
      name: body.title || 'Untitled',
      author: body.userName || 'Unknown',
      summary,
      genres: tags.join(','),
      cover: coverUrl,
      status: NovelStatus.Completed,
      chapters: [
        {
          name: body.title || 'Oneshot',
          path: `/ajax/novel/${novelId}`,
          releaseTime: body.createDate || '',
        },
      ],
      totalPages: 1,
    };

    return novel;
  }

  /**
   * Parse additional pages of chapters for series with 30+ chapters
   */
  async parsePage(novelPath: string, page: string): Promise<Plugin.SourcePage> {
    const seriesMatch = novelPath.match(/\/novel\/series\/(\d+)/);
    if (!seriesMatch) return { chapters: [] };

    const seriesId = seriesMatch[1];
    const pageNum = parseInt(page);
    const lastOrder = (pageNum - 1) * 30;

    const contentBody = await this.fetchJson(
      `${this.site}/ajax/novel/series_content/${seriesId}?limit=30&last_order=${lastOrder}&order_by=asc&lang=en`,
    );

    const seriesContents = contentBody?.page?.seriesContents || [];
    const chapters: Plugin.ChapterItem[] = seriesContents.map(
      (item: any, index: number) => ({
        name: item.title
          ? `#${lastOrder + index + 1} ${item.title}`
          : `Chapter ${lastOrder + index + 1}`,
        path: `/ajax/novel/${item.id}`,
        chapterNumber: item.series?.contentOrder || lastOrder + index + 1,
        releaseTime: item.uploadTimestamp
          ? new Date(item.uploadTimestamp * 1000).toISOString()
          : '',
      }),
    );

    return { chapters };
  }

  /**
   * Parse chapter content
   */
  async parseChapter(chapterPath: string): Promise<string> {
    const novelIdMatch = chapterPath.match(/\/ajax\/novel\/(\d+)/);
    if (!novelIdMatch) return '';

    const body = await this.fetchJson(
      `${this.site}/ajax/novel/${novelIdMatch[1]}?lang=en`,
    );

    const content = body?.content || '';
    return `<div>${content
      .split('\n')
      .filter((line: string) => line.trim().length > 0)
      .map((line: string) => `<p>${encodeHtmlEntities(line.trim())}</p>`)
      .join('<br/>')}</div>`;
  }

  /**
   * Search novels by keyword
   */
  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const encodedTerm = encodeURIComponent(searchTerm);
    const url = `${this.site}/ajax/search/novels/${encodedTerm}?word=${encodedTerm}&order=date_d&mode=all&p=${pageNo}&s_mode=s_tag&lang=en`;

    const body = await this.fetchJson(url);
    const novels: Plugin.NovelItem[] = [];

    // Novels from search results
    const data = body?.novel?.data || [];
    const seenPaths = new Set<string>();

    for (const item of data) {
      const path = item.seriesId
        ? `/novel/series/${item.seriesId}`
        : `/novel/show.php?id=${item.id}`;

      // Deduplicate series
      if (seenPaths.has(path)) continue;
      seenPaths.add(path);

      novels.push({
        name: item.title || 'Untitled',
        path,
        cover: item.url || defaultCover,
      });
    }

    return novels;
  }

  resolveUrl(path: string, isNovel?: boolean): string {
    if (isNovel) {
      return this.site + path;
    } else {
      // chapter path: /ajax/novel/<id> -> /novel/show.php?id=<id>
      return (
        this.site +
        `/novel/show.php?id=${path.replace('/ajax/novel/', '').trim()}`
      );
    }
  }

  get filters(): Filters {
    const getLabel = (jp: string, en: string) => `${jp} (${en})`;
    return {
      mode: {
        type: FilterTypes.Picker,
        label: getLabel('モード', 'Mode'),
        value: 'safe',
        options: [
          { label: getLabel('全年齢', 'All Ages'), value: 'safe' },
          {
            label: getLabel('R-18 (※要ログイン)', 'R-18 (Login Required)'),
            value: 'r18',
          },
        ],
      },
      genre: {
        type: FilterTypes.Picker,
        label: getLabel('ジャンル', 'Genre'),
        value: 'all',
        options: [
          {
            label: getLabel(
              'すべて (全年齢のみ)',
              'All Genres (All Ages Only)',
            ),
            value: 'all',
          },
          { label: getLabel('恋愛', 'Romance'), value: 'romance' },
          {
            label: getLabel('異世界ファンタジー', 'Isekai Fantasy'),
            value: 'isekai_fantasy',
          },
          {
            label: getLabel('現代ファンタジー', 'Contemporary Fantasy'),
            value: 'contemporary_fantasy',
          },
          { label: getLabel('ミステリー', 'Mystery'), value: 'mystery' },
          { label: getLabel('ホラー', 'Horror'), value: 'horror' },
          { label: getLabel('SF', 'Sci-Fi'), value: 'sci-fi' },
          { label: getLabel('純文学', 'Literature'), value: 'literature' },
          { label: getLabel('ヒューマンドラマ', 'Drama'), value: 'drama' },
          {
            label: getLabel('歴史・時代', 'Historical pieces'),
            value: 'historical_pieces',
          },
          { label: getLabel('ボーイズラブ', 'BL'), value: 'bl' },
          { label: getLabel('百合', 'Yuri'), value: 'yuri' },
          {
            label: getLabel('童話 (全年齢のみ)', 'For Kids (All Ages Only)'),
            value: 'for_kids',
          },
          { label: getLabel('詩', 'Poetry'), value: 'poetry' },
          {
            label: getLabel('ノンフィクション', 'Essays/non-fiction'),
            value: 'non_fiction',
          },
          { label: getLabel('脚本', 'Screenplays'), value: 'screenplays' },
          { label: getLabel('レビュー', 'Reviews'), value: 'reviews' },
          { label: getLabel('その他', 'Other'), value: 'other' },
          {
            label: getLabel(
              '男性に人気 (R18のみ)',
              'Popular with male (R18 Only)',
            ),
            value: 'male',
          },
          {
            label: getLabel(
              '女性に人気 (R18のみ)',
              'Popular with female (R18 Only)',
            ),
            value: 'female',
          },
        ],
      },
    } satisfies Filters;
  }
}

export default new PixivNovelPlugin();
