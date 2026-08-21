/* eslint-disable */

import { fetchText } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

class AnimeHayPlugin implements Plugin.PluginBase {
  id = 'yuneko.animehay';
  name = '🎞 AnimeHay';
  icon = 'src/vi/animehay/icon.png';
  site = 'https://animevietsub.ac'; // 'https://animehay.fm';
  version = '1.0.0';

  imageRequestInit: Plugin.ImageRequestInit = {
    headers: {
      Referer: this.site + '/',
    },
  };

  async popularNovels(
    pageNo: number,
    options: Plugin.PopularNovelsOptions<any>,
  ): Promise<Plugin.NovelItem[]> {
    const url = `${this.site}/danh-sach/${pageNo}`;
    const html = await fetchText(url);
    const $ = loadCheerio(html);

    const novels: Plugin.NovelItem[] = [];

    // Unified selector matching both main grid items and movie-card recommendations
    $('a[href*="/phim/"]').each((_, el) => {
      const $el = $(el);
      if ($el.find('img').length === 0) return;

      const path = $el.attr('href')?.replace(this.site, '') || '';
      if (!path) return;

      let name = $el.attr('title') || '';
      if (!name) name = $el.find('h3').first().text();
      if (!name) name = $el.find('p.font-medium').first().text();
      name = name.trim();

      if (!name) return;

      const $img = $el.find('img').first();
      let cover =
        $img.attr('src') ||
        $img.attr('data-src') ||
        $img.attr('data-lazy-src') ||
        defaultCover;

      if (!cover.startsWith('http')) {
        cover = this.site + cover;
      }

      novels.push({
        name,
        path,
        cover,
      });
    });

    return novels;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    throw new Error('Web này không hỗ trợ search');
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const url = this.site + novelPath;
    const html = await fetchText(url);
    const $ = loadCheerio(html);

    const name =
      $('h1').first().text().trim() ||
      $('meta[property="og:title"]')
        .attr('content')
        ?.replace(/\s*-\s*Anime Vietsub.*$/i, '')
        .trim() ||
      '';

    let cover = $('meta[property="og:image"]').attr('content') || '';
    if (!cover) {
      cover =
        $('img[alt*="Poster"]').first().attr('src') ||
        $('.rounded-lg img').first().attr('src') ||
        defaultCover;
    }
    if (cover && !cover.startsWith('http')) {
      cover = this.site + cover;
    }

    const summary =
      $('.prose-invert').first().text().trim() ||
      $('article#content').first().text().trim() ||
      $('meta[property="og:description"]').attr('content') ||
      '';

    const genres: string[] = [];
    $('div.mb-4:contains(Thể loại) a[href*="/the-loai/"]').each((_, el) => {
      const gName = $(el).text().trim();
      if (gName && gName.toLowerCase() !== 'thể loại') {
        genres.push(gName);
      }
    });

    let status: string = NovelStatus.Unknown;
    const infoSpans =
      $('.flex.items-center.gap-4 span').length > 0
        ? $('.flex.items-center.gap-4 span')
        : $('span');

    infoSpans.each((_, el) => {
      const txt = $(el).text().trim();
      if (txt.includes('Tập') && txt.includes('/')) {
        const epMatch = txt.match(/(\d+)\s*\/\s*(\d+)/);
        if (epMatch && parseInt(epMatch[1]) < parseInt(epMatch[2])) {
          status = NovelStatus.Ongoing;
        } else if (epMatch && parseInt(epMatch[1]) >= parseInt(epMatch[2])) {
          status = NovelStatus.Completed;
        }
      } else if (
        txt.toLowerCase().includes('hoàn thành') ||
        txt.toLowerCase().includes('trọn bộ')
      ) {
        status = NovelStatus.Completed;
      }
    });

    const chapters: Plugin.ChapterItem[] = [];

    const slugMatch = url.match(/\/phim\/([^\/\?]+)/);
    const movieSlug = slugMatch ? slugMatch[1] : '';

    const seenEp = new Set<string>();

    const pattern =
      /"name"\s*:\s*"([^"]+)"\s*,\s*"slug"\s*:\s*"([^"]+)"\s*,\s*"type"\s*:\s*"m3u8"/g;
    let match;

    while ((match = pattern.exec(html)) !== null) {
      const epName = match[1];
      const epSlug = match[2];

      if (seenEp.has(epSlug)) continue;
      seenEp.add(epSlug);

      chapters.push({
        name: epName,
        path: `/phim/${movieSlug}/${epSlug}`,
      });
    }

    if (chapters.length === 0) {
      const escPattern =
        /\\?"name\\?"\s*:\s*\\?"([^"\\]+)\\?"\s*,\s*\\?"slug\\?"\s*:\s*\\?"([^"\\]+)\\?"\s*,\s*\\?"type\\?"\s*:\s*\\?"m3u8\\?"/g;
      while ((match = escPattern.exec(html)) !== null) {
        const epName = match[1];
        const epSlug = match[2];

        if (seenEp.has(epSlug)) continue;
        seenEp.add(epSlug);

        chapters.push({
          name: epName,
          path: `/phim/${movieSlug}/${epSlug}`,
        });
      }
    }

    return {
      path: novelPath,
      name,
      cover,
      summary,
      author: 'AnimeHay',
      genres: genres.join(', '),
      status,
      chapters,
    };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const url = this.site + chapterPath;
    const html = await fetchText(url);

    const epSlugMatch = url.match(/\/(tap-[^\/\?]+)/);
    const epSlug = epSlugMatch ? epSlugMatch[1] : '';

    let videoUrl = '';
    let isIframe = false;

    // Pattern: "server":"#Hà Nội (Vietsub)","name":"Tập 01","slug":"tap-01","type":"m3u8","link":"https://..."
    const pattern =
      /"server"\s*:\s*"([^"]+)"\s*,\s*"name"\s*:\s*"([^"]+)"\s*,\s*"slug"\s*:\s*"([^"]+)"\s*,\s*"type"\s*:\s*"([^"]+)"\s*,\s*"link"\s*:\s*"([^"]+)"/g;
    let match;

    while ((match = pattern.exec(html)) !== null) {
      const slug = match[3];
      const type = match[4];
      const link = match[5].replace(/\\\//g, '/');

      if (slug !== epSlug) continue;

      if (type === 'm3u8') {
        videoUrl = link;
        break; // Priority 1
      } else if (type === 'embed' && !videoUrl) {
        videoUrl = link;
        isIframe = true;
      }
    }

    if (!videoUrl) {
      const escPattern =
        /\\?"server\\?"\s*:\\s*\\?"([^"\\]+)\\?"\s*,\s*\\?"name\\?"\s*:\\s*\\?"([^"\\]+)\\?"\s*,\s*\\?"slug\\?"\s*:\\s*\\?"([^"\\]+)\\?"\s*,\s*\\?"type\\?"\s*:\\s*\\?"([^"\\]+)\\?"\s*,\s*\\?"link\\?"\s*:\\s*\\?"([^"\\]+)\\?"/g;
      while ((match = escPattern.exec(html)) !== null) {
        const slug = match[3];
        const type = match[4];
        const link = match[5].replace(/\\\//g, '/');

        if (slug !== epSlug) continue;

        if (type === 'm3u8') {
          videoUrl = link;
          isIframe = false;
          break;
        } else if (type === 'embed' && !videoUrl) {
          videoUrl = link;
          isIframe = true;
        }
      }
    }

    if (!videoUrl) {
      return '<p style="text-align:center;padding:16px;">Không tìm thấy video.</p><meta id="no-cache-marker"/><meta id="no-prefetch-marker"/>';
    }

    const videoType = isIframe ? 'iframe' : 'm3u8';

    return [
      '<meta name="lnreader-chapter-type" content="video">',
      '<meta name="lnreader-video-mode" content="direct">',
      `<meta name="lnreader-video-type" content="${videoType}">`,
      `<meta name="lnreader-video-url" content="${videoUrl}">`,
      '<meta id="no-cache-marker"/>',
      '<meta id="no-prefetch-marker"/>',
    ].join('\n');
  }

  resolveUrl(path: string, isNovel?: boolean): string {
    return this.site + path;
  }
}

export default new AnimeHayPlugin();
