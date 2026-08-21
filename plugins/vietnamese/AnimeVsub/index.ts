import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';
import { encodeHtmlEntities } from '@libs/utils';
import { ContentType } from '@libs/pluginMetadata';

const SITE = 'https://animevsub.app';

class AnimeVsubPlugin implements Plugin.PluginBase {
  id = 'yuneko.animevsub';
  name = 'AnimeVsub';
  icon = 'src/vi/animevsub/icon.png';
  site = SITE;
  version = '1.0.2';
  contentType = ContentType.VIDEO;

  filters = {
    tab: {
      type: FilterTypes.Picker,
      label: 'Chuyên mục',
      value: '',
      options: [
        { label: '🔥 ANIME MỚI CẬP NHẬT', value: '' },
        { label: '📺 ANIME ĐANG CHIẾU', value: '/anime-dang-chieu' },
        { label: '🎬 ANIME LẺ', value: '/anime-le' },
        { label: '📦 ANIME TRỌN BỘ', value: '/anime-tron-bo' },
      ],
    },
    genre: {
      type: FilterTypes.Picker,
      label: 'Thể loại',
      value: '',
      options: [
        { label: 'Tất cả', value: '' },
        { label: 'Hành Động', value: '/action' },
        { label: 'Phiêu Lưu', value: '/adventure' },
        { label: 'Hài Hước', value: '/comedy' },
        { label: 'Kịch Tính', value: '/drama' },
        { label: 'Huyền Ảo', value: '/fantasy' },
        { label: 'Harem', value: '/harem' },
        { label: 'Lịch Sử', value: '/historical' },
        { label: 'Kinh Dị', value: '/horror' },
        { label: 'Magic', value: '/magic' },
        { label: 'Mecha', value: '/mecha' },
        { label: 'Quân Đội', value: '/military' },
        { label: 'Âm Nhạc', value: '/music' },
        { label: 'Bí Ẩn', value: '/mystery' },
        { label: 'Lãng Mạn', value: '/romance' },
        { label: 'Học Đường', value: '/school' },
        { label: 'Đời Thường', value: '/slice-of-life' },
        { label: 'Thể Thao', value: '/sport' },
        { label: 'Siêu Nhiên', value: '/supernatural' },
      ],
    },
  } satisfies Filters;

  private normalizeUrl(url: string): string {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    if (url.startsWith('//')) return 'https:' + url;
    if (url.startsWith('/')) return SITE + url;
    return SITE + '/' + url;
  }

  async popularNovels(
    pageNo: number,
    { filters }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    let url = SITE;

    if (filters?.genre?.value) {
      url += filters.genre.value;
    } else if (filters?.tab?.value) {
      url += filters.tab.value;
    }

    if (pageNo > 1) {
      return []; // ?
    }

    const res = await fetchApi(url);
    if (!res.ok) return [];

    const html = await res.text();
    const $ = loadCheerio(html);

    const novels: Plugin.NovelItem[] = [];
    $('.movie-item').each((_, el) => {
      const name = $(el).find('.movie-title a').text().trim();
      const link = $(el).find('.movie-title a').attr('href');
      const imgEl = $(el).find('.movie-poster img');
      const cover =
        imgEl.attr('src') ||
        imgEl.attr('data-src') ||
        imgEl.attr('data-lazy-src') ||
        defaultCover;
      const ep = $(el).find('.movie-episode-last').text().trim();

      if (name && link) {
        novels.push({
          name: ep ? `[${ep}] ${name}` : name,
          path: link.replace(SITE, ''),
          cover: this.normalizeUrl(cover),
        });
      }
    });

    return novels;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const url = this.normalizeUrl(novelPath);
    const res = await fetchApi(url);
    const html = await res.text();
    const $ = loadCheerio(html);

    let name =
      $('h1.movie-title-detail').text().trim() ||
      $('meta[property="og:title"]').attr('content') ||
      '';
    name = name
      .replace(/^phim\s+/i, '')
      .replace(/\s*(tập\s*\d+.*|vietsub.*)$/i, '')
      .replace(/\s*HD\s*Vietsub.*$/i, '')
      .trim();

    const originalName = $('h2.movie-original-title').text().trim();
    let cover =
      $('.movie-box-img img.thumbnail').attr('src') ||
      $('meta[property="og:image"]').attr('content');
    cover = this.normalizeUrl(cover || defaultCover);

    const descEl = $('.content-detail').first();
    descEl.find('h2').remove();
    const description =
      descEl.text().trim() ||
      $('meta[property="og:description"]').attr('content') ||
      '';

    let status = NovelStatus.Unknown as string;
    const author = originalName || 'AnimeVsub';

    $('.meta-item').each((_, el) => {
      const label = $(el).find('.meta-label').text().trim();
      const value = $(el).find('.meta-value').text().trim();

      if (label.includes('Trạng thái')) {
        if (
          value.toLowerCase().includes('đang chiếu') ||
          value.toLowerCase().includes('ongoing')
        ) {
          status = NovelStatus.Ongoing;
        } else if (
          value.toLowerCase().includes('kết thúc') ||
          value.toLowerCase().includes('hoàn thành')
        ) {
          status = NovelStatus.Completed;
        }
      }
    });

    const chapters: Plugin.ChapterItem[] = [];
    $('.episodes-grid a').each((_, el) => {
      const epName =
        $(el).find('.episode-number').text().trim() || $(el).text().trim();
      const epUrl = $(el).attr('href');
      if (epName && epUrl) {
        chapters.push({
          name: epName,
          path: epUrl.replace(SITE, ''),
          chapterNumber: chapters.length + 1,
        });
      }
    });

    return {
      path: novelPath,
      name: name || 'Unknown',
      cover: cover,
      summary: description,
      author: author,
      status: status,
      chapters: chapters,
    };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const url = this.normalizeUrl(chapterPath);
    const res = await fetchApi(url);
    const html = await res.text();

    const match = html.match(/all_sources\s*=\s*\[\s*["']([^"']+)["']/);
    if (!match) throw new Error('Không tìm thấy link video trên trang này!');

    const streamUrl = match[1];

    const isM3u8 = streamUrl.includes('.m3u8');
    const isMp4 = streamUrl.includes('.mp4');
    const type = isM3u8 ? 'm3u8' : isMp4 ? 'video-file' : 'iframe';

    return [
      '<meta name="lnreader-chapter-type" content="video">',
      '<meta name="lnreader-video-mode" content="direct">',
      `<meta name="lnreader-video-type" content="${type}">`,
      `<meta name="lnreader-video-url" content="${encodeHtmlEntities(streamUrl)}">`,
      '<meta id="no-cache-marker"/>',
      '<meta id="no-prefetch-marker"/>',
    ].join('\n');
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    let url = `${SITE}/?s=${encodeURIComponent(searchTerm)}`;
    if (pageNo > 1) {
      url = `${SITE}/page/${pageNo}/?s=${encodeURIComponent(searchTerm)}`;
    }

    const res = await fetchApi(url);
    if (!res.ok) return [];

    const html = await res.text();
    const $ = loadCheerio(html);

    const novels: Plugin.NovelItem[] = [];
    $('.movie-item').each((_, el) => {
      const name = $(el).find('.movie-title a').text().trim();
      const link = $(el).find('.movie-title a').attr('href');
      const imgEl = $(el).find('.movie-poster img');
      const cover =
        imgEl.attr('src') ||
        imgEl.attr('data-src') ||
        imgEl.attr('data-lazy-src') ||
        defaultCover;
      const ep = $(el).find('.movie-episode-last').text().trim();

      if (name && link) {
        novels.push({
          name: ep ? `[${ep}] ${name}` : name,
          path: link.replace(SITE, ''),
          cover: this.normalizeUrl(cover),
        });
      }
    });

    return novels;
  }
}

export default new AnimeVsubPlugin();
