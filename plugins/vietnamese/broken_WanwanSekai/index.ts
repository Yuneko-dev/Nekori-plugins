import { fetchApi } from '@libs/fetch';
import { NovelStatus } from '@libs/novelStatus';
import { Plugin } from '@/types/plugin';
import { load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';

class WanwanSekaiPlugin implements Plugin.PluginBase {
  id = 'wanwansekai';
  name = 'WanwanSekai';
  icon = 'src/vi/wanwansekai/icon.png';
  site = 'https://wanwansekai.com';
  version = '1.0.4';

  private allNovels: Plugin.NovelItem[] = [];

  async popularNovels(
    pageNo: number,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    { filters, showLatestNovels }: Plugin.PopularNovelsOptions,
  ): Promise<Plugin.NovelItem[]> {
    if (pageNo > 1) {
      return [];
    }

    if (this.allNovels.length === 0) {
      await this.fetchAllNovels();
    }

    return this.allNovels;
  }

  private async fetchAllNovels() {
    const res = await fetchApi(this.site);
    const html = await res.text();
    const $ = loadCheerio(html);

    const novels: Plugin.NovelItem[] = [];

    $('.page-item-detail').each((i, el) => {
      const name = $(el).find('.post-title a').text().trim();
      const path = $(el).find('.post-title a').attr('href');
      const cover =
        $(el).find('.item-thumb img').attr('data-src') ||
        $(el).find('.item-thumb img').attr('data-srcset')?.split(' ')[0] ||
        $(el).find('.item-thumb img').attr('src');

      if (name && path) {
        novels.push({
          name,
          cover: cover || defaultCover,
          path: path.replace(this.site, ''),
        });
      }
    });

    this.allNovels = novels;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    if (pageNo > 1) {
      return [];
    }

    if (this.allNovels.length === 0) {
      await this.fetchAllNovels();
    }

    return this.allNovels.filter(novel =>
      novel.name.toLowerCase().includes(searchTerm.toLowerCase()),
    );
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const res = await fetchApi(this.site + novelPath);
    const html = await res.text();
    const $ = loadCheerio(html);

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: $('.post-title h1').text().trim() || 'Untitled',
      cover:
        $('.summary_image img').attr('data-src') ||
        $('.summary_image img').attr('data-srcset')?.split(' ')[0] ||
        $('.summary_image img').attr('src') ||
        defaultCover,
      summary: $('.summary__content').text().trim(),
      author: $('.author-content a')
        .map((i, el) => $(el).text().trim())
        .get()
        .join(', '),
      artist: $('.artist-content a')
        .map((i, el) => $(el).text().trim())
        .get()
        .join(', '),
      status: this.parseStatus($('.post-status').text()),
      genres: $('.genres-content a')
        .map((i, el) => $(el).text().trim())
        .get()
        .join(', '),
      chapters: [],
    };

    const chaptersRes = await fetchApi(
      this.site + novelPath + 'ajax/chapters/',
      {
        method: 'POST',
      },
    );
    const chaptersHtml = await chaptersRes.text();
    const $chapters = loadCheerio(chaptersHtml);

    const chapters: Plugin.ChapterItem[] = [];
    $chapters('.wp-manga-chapter').each((i, el) => {
      const name = $(el).find('a').text().trim();
      const path = $(el).find('a').attr('href');
      const releaseTime = $(el).find('.chapter-release-date').text().trim();

      if (name && path) {
        chapters.push({
          name,
          path: path.replace(this.site, ''),
          releaseTime,
        });
      }
    });

    novel.chapters = chapters.reverse();

    return novel;
  }

  private parseStatus(statusContent: string) {
    if (
      statusContent.includes('OnGoing') ||
      statusContent.includes('Đang Tiến Hành')
    ) {
      return NovelStatus.Ongoing;
    }
    if (
      statusContent.includes('Completed') ||
      statusContent.includes('Hoàn Thành')
    ) {
      return NovelStatus.Completed;
    }
    return NovelStatus.Unknown;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const res = await fetchApi(this.site + chapterPath);
    const html = await res.text();
    const $ = loadCheerio(html);

    $('.reading-content script').remove();

    return $('.reading-content').html() || '';
  }

  resolveUrl(path: string, isNovel?: boolean): string {
    return this.site + path;
  }
}

export default new WanwanSekaiPlugin();
