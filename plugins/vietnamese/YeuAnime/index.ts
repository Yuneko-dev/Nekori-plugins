import { fetchText } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';
import { ContentType } from '@libs/pluginMetadata';

class YeuAnimePlugin implements Plugin.PluginBase {
  id = 'yuneko.yeuanime';
  name = 'Yêu Anime';
  icon = 'src/vi/yeuanime/icon.png';
  site = 'https://yeuanime.xyz';
  version = '1.0.3';
  contentType = ContentType.VIDEO;

  imageRequestInit: Plugin.ImageRequestInit = {
    headers: {
      Referer: this.site + '/',
    },
  };

  private extractNextData(html: string) {
    const regex = /self\.__next_f\.push\(\[1,"(.*?)"\]\)/g;
    let match;
    let fullData = '';
    while ((match = regex.exec(html)) !== null) {
      fullData += match[1];
    }
    return fullData
      .replace(/\\"/g, '"')
      .replace(/\\\//g, '/')
      .replace(/\\\\/g, '\\')
      .replace(/\\u0022/g, '"')
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, grp) =>
        String.fromCharCode(parseInt(grp, 16)),
      );
  }

  private extractJson(text: string, key: string) {
    if (!text) return null;
    const searchStr = '"' + key + '":';
    let start = text.indexOf(searchStr);
    if (start === -1) return null;
    start += searchStr.length;
    let count = 0;
    let end = -1;
    let foundStart = false;
    for (let i = start; i < text.length; i++) {
      const c = text.charAt(i);
      if (c === '{' || c === '[') {
        count++;
        foundStart = true;
      } else if (c === '}' || c === ']') {
        count--;
      }
      if (foundStart && count === 0) {
        end = i + 1;
        break;
      }
    }
    if (end !== -1) {
      try {
        const jsonStr = text.substring(start, end);
        return JSON.parse(jsonStr);
      } catch (e) {
        //
      }
    }
    return null;
  }

  private extractJsonAll(text: string, key: string) {
    const resultList: any[] = [];
    if (!text) return resultList;
    const searchStr = '"' + key + '":';
    let start = 0;
    while ((start = text.indexOf(searchStr, start)) !== -1) {
      const pStart = start + searchStr.length;
      let count = 0;
      let end = -1;
      let foundStart = false;
      for (let i = pStart; i < text.length; i++) {
        const c = text.charAt(i);
        if (c === '{' || c === '[') {
          count++;
          foundStart = true;
        } else if (c === '}' || c === ']') {
          count--;
        }
        if (foundStart && count === 0) {
          end = i + 1;
          break;
        }
      }
      if (end !== -1) {
        try {
          const jsonStr = text.substring(pStart, end);
          const parsed = JSON.parse(jsonStr);
          if (Array.isArray(parsed)) {
            resultList.push(...parsed);
          } else if (parsed && typeof parsed === 'object') {
            resultList.push(parsed);
          }
        } catch (e) {
          //
        }
      }
      start += searchStr.length;
    }
    return resultList;
  }

  async popularNovels(
    pageNo: number,
    options: Plugin.PopularNovelsOptions<any>,
  ): Promise<Plugin.NovelItem[]> {
    const url = `${this.site}/loc-phim?sort=updated_at&order=desc${pageNo > 1 ? `&page=${pageNo}` : ''}`;
    const html = await fetchText(url);
    const $ = loadCheerio(html);

    const novels: Plugin.NovelItem[] = [];
    const addedLinks = new Set<string>();

    const nextDataText = this.extractNextData(html);
    const results = this.extractJsonAll(nextDataText, 'results');
    const movies = this.extractJsonAll(nextDataText, 'movies');
    const moviehots = this.extractJsonAll(nextDataText, 'moviehots');
    const allMovies = [...movies, ...moviehots, ...results];

    allMovies.forEach((m: any) => {
      if (m.slug && m.name) {
        const path = `/phim/${m.slug}`;
        if (!addedLinks.has(path)) {
          addedLinks.add(path);
          const tag = m.episode_current || m.display_status || m.status || '';
          const mName = m.name
            .toString()
            .trim()
            .replace(/^.*?Xem chi tiết phim\s+/i, '')
            .trim();
          novels.push({
            name: tag && tag !== mName ? `${mName} (${tag})` : mName,
            path: path,
            cover: m.poster_url || m.thumb_url || m.image || defaultCover,
          });
        }
      }
    });

    if (novels.length === 0) {
      $('a[href^="/phim/"]').each((_, el) => {
        const $a = $(el);
        let name =
          $a.find('h3, .title, span').first().text() || $a.attr('title') || '';
        name = name
          .trim()
          .replace(/^.*?Xem chi tiết phim\s+/i, '')
          .trim();
        const cover = $a.find('img').attr('src');
        const path =
          $a
            .attr('href')
            ?.replace(this.site, '')
            .replace('https://yeuanime.net', '') || '';

        if (name && path && path.includes('/phim/')) {
          let tag = '';
          const tagEl = $a
            .find(
              '.episode, .status, .badge, span.absolute, div.absolute, [class*="absolute"], [class*="badge"]',
            )
            .first();
          if (tagEl.length > 0) {
            tag = tagEl.text().trim();
          }
          if (!addedLinks.has(path)) {
            addedLinks.add(path);
            novels.push({
              name: tag && tag !== name ? `${name} (${tag})` : name,
              path,
              cover: cover?.startsWith('http')
                ? cover
                : this.site + cover || defaultCover,
            });
          }
        }
      });
    }

    return novels;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const term = encodeURIComponent(searchTerm.trim());
    const url = `${this.site}/tim-kiem?keyword=${term}${pageNo > 1 ? `&page=${pageNo}` : ''}`;
    const html = await fetchText(url);
    const $ = loadCheerio(html);

    const novels: Plugin.NovelItem[] = [];
    const addedLinks = new Set<string>();

    const nextDataText = this.extractNextData(html);
    const results = this.extractJsonAll(nextDataText, 'results');
    const movies = this.extractJsonAll(nextDataText, 'movies');
    const allMovies = [...movies, ...results];

    allMovies.forEach((m: any) => {
      if (m.slug && m.name) {
        const path = `/phim/${m.slug}`;
        if (!addedLinks.has(path)) {
          addedLinks.add(path);
          const tag = m.episode_current || m.display_status || m.status || '';
          const mName = m.name
            .toString()
            .trim()
            .replace(/^.*?Xem chi tiết phim\s+/i, '')
            .trim();
          novels.push({
            name: tag && tag !== mName ? `${mName} (${tag})` : mName,
            path: path,
            cover: m.poster_url || m.thumb_url || m.image || defaultCover,
          });
        }
      }
    });

    if (novels.length === 0) {
      $('a[href^="/phim/"]').each((_, el) => {
        const $a = $(el);
        let name =
          $a.find('h3, .title, span').first().text() || $a.attr('title') || '';
        name = name
          .trim()
          .replace(/^.*?Xem chi tiết phim\s+/i, '')
          .trim();
        const cover = $a.find('img').attr('src');
        const path =
          $a
            .attr('href')
            ?.replace(this.site, '')
            .replace('https://yeuanime.net', '') || '';

        if (name && path && path.includes('/phim/')) {
          let tag = '';
          const tagEl = $a
            .find(
              '.episode, .status, .badge, span.absolute, div.absolute, [class*="absolute"], [class*="badge"]',
            )
            .first();
          if (tagEl.length > 0) {
            tag = tagEl.text().trim();
          }
          if (!addedLinks.has(path)) {
            addedLinks.add(path);
            novels.push({
              name: tag && tag !== name ? `${name} (${tag})` : name,
              path,
              cover: cover?.startsWith('http')
                ? cover
                : this.site + cover || defaultCover,
            });
          }
        }
      });
    }

    return novels;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const url = novelPath.startsWith('http')
      ? novelPath
      : this.site + novelPath;
    const html = await fetchText(url);
    const $ = loadCheerio(html);

    const nextDataText = this.extractNextData(html);
    const movie = this.extractJson(nextDataText, 'movie') || {};

    let name = movie.name || '';
    if (name)
      name = name
        .toString()
        .trim()
        .replace(/^.*?Xem chi tiết phim\s+/i, '')
        .trim();

    let cover = movie.poster_url || movie.thumb_url || movie.image || '';
    if (cover && !cover.startsWith('http')) cover = this.site + cover;

    let summary = movie.description || '';
    const author =
      movie.director && movie.director !== 'Đang cập nhật'
        ? movie.director
        : 'Yêu Anime';

    const genres: string[] = [];
    if (movie.genres && Array.isArray(movie.genres)) {
      movie.genres.forEach((g: any) => {
        if (g.name) genres.push(g.name);
      });
    }

    // Fallbacks
    if (!name) {
      name = $('h1')
        .first()
        .text()
        .trim()
        .replace(/^.*?Xem chi tiết phim\s+/i, '')
        .trim();
    }
    if (!name) {
      name = $('meta[property="og:title"]').attr('content')?.trim() || '';
    }
    if (!cover) {
      cover =
        $(`img[alt="${name}"]`).attr('src') ||
        $('img[src*="/posters/"]').attr('src') ||
        defaultCover;
      if (cover && !cover.startsWith('http')) cover = this.site + cover;
    }
    if (!summary) {
      summary =
        $('p.line-clamp-3').first().text().trim() ||
        $('.description').first().text().trim() ||
        $('meta[property="og:description"]').attr('content') ||
        '';
    }
    if (genres.length === 0) {
      $('a[href*="/the-loai/"]').each((_, el) => {
        const gName = $(el).text().trim();
        if (gName) genres.push(gName);
      });
    }

    let status: string = NovelStatus.Unknown;
    let format = 'series';
    if (
      movie.episode_total === 1 ||
      movie.movie_type_id === 1 ||
      (movie.type?.name && movie.type.name.toLowerCase().includes('lẻ')) ||
      (movie.display_status &&
        movie.display_status.toLowerCase().includes('trọn bộ') &&
        !movie.display_status.toLowerCase().includes('tập'))
    ) {
      format = 'movie';
    }

    const statusLower = (
      movie.display_status ||
      movie.status ||
      ''
    ).toLowerCase();
    if (
      statusLower.includes('hoàn thành') ||
      statusLower.includes('trọn bộ') ||
      statusLower.includes('full') ||
      statusLower.includes('hoàn tất') ||
      format === 'movie'
    ) {
      status = NovelStatus.Completed;
    } else {
      status = NovelStatus.Ongoing;
    }

    const chapters: Plugin.ChapterItem[] = [];
    const addedSlugs = new Set<string>();
    const movieSlug = url.split('/').pop()?.split('?')[0];

    const episodes = this.extractJson(nextDataText, 'episodes');
    if (episodes && Array.isArray(episodes)) {
      episodes.forEach((ep: any) => {
        if (ep.slug && !addedSlugs.has(ep.slug)) {
          addedSlugs.add(ep.slug);
          const epName = ep.episode_label || ep.name;
          const epUrl = `/xem-phim/${movieSlug}/${ep.slug}/${ep.language || 'vietsub'}`;
          chapters.push({
            name: epName,
            path: epUrl,
          });
        }
      });
    }

    if (chapters.length === 0) {
      $('.grid a[href*="/xem-phim/"]').each((_, el) => {
        const $a = $(el);
        let epName =
          $a.find('span').first().text() || $a.attr('title') || $a.text();
        epName = epName.trim();
        if (epName && epName.toLowerCase() !== 'xem ngay') {
          epName = epName.split(' - ')[0];
          let epUrl = $a.attr('href') || '';
          epUrl = epUrl
            .replace(this.site, '')
            .replace('https://yeuanime.net', '');
          const parts = epUrl.split('?')[0].split('/');
          const epSlug = parts.length > 2 ? parts[parts.length - 2] : '';

          if (epSlug && !addedSlugs.has(epSlug)) {
            addedSlugs.add(epSlug);
            chapters.push({
              name: epName,
              path: epUrl,
            });
          }
        }
      });
    }

    return {
      path: novelPath,
      name,
      cover,
      summary,
      author,
      genres: genres.join(', '),
      status,
      chapters,
    };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const url = chapterPath.startsWith('http')
      ? chapterPath
      : this.site + chapterPath;
    const html = await fetchText(url);

    const nextDataText = this.extractNextData(html);

    let currentStreamUrl = '';
    const match =
      /"(?:m3u8Url|link_m3u8|embedUrl|link_embed)"\s*:\s*"([^"]+)"/i.exec(
        nextDataText,
      );
    if (match) {
      currentStreamUrl = match[1].replace(/\\\//g, '/').replace(/\\/g, '');
    }

    const currentServerMatch =
      /"currentSource"\s*:\s*\{"server"\s*:\s*\{[^}]*"slug"\s*:\s*"([^"]+)"/i.exec(
        nextDataText,
      );
    const currentServerSlug = currentServerMatch ? currentServerMatch[1] : '';

    const sources = this.extractJson(nextDataText, 'availableSources');
    const validTracks: any[] = [];

    // Fallback if no sources array found
    if (!sources || !Array.isArray(sources) || sources.length === 0) {
      let videoUrl = currentStreamUrl;
      if (!videoUrl) {
        const raw =
          /(?:m3u8Url|link_m3u8|embedUrl|link_embed)\\?":\s*\\?"(https?:\/\/[^"\\]+)\\?"/i.exec(
            html,
          );
        if (raw) videoUrl = raw[1].replace(/\\\//g, '/').replace(/\\/g, '');
      }
      if (videoUrl) {
        validTracks.push({ url: videoUrl });
      }
    } else {
      const addedUrls = new Set<string>();
      for (const src of sources) {
        if (!src.server_slug || !src.server_name) continue;
        let streamUrl = '';
        if (src.server_slug === currentServerSlug && currentStreamUrl) {
          streamUrl = currentStreamUrl;
        } else {
          const parts = url.split('?')[0].split('/');
          if (parts.length > 0 && src.language_slug) {
            parts[parts.length - 1] = src.language_slug;
          }
          const serverUrl = parts.join('/') + '?server=' + src.server_slug;
          const serverHtml = await fetchText(serverUrl);
          const serverNextData = this.extractNextData(serverHtml);
          const sMatch =
            /"(?:m3u8Url|link_m3u8|embedUrl|link_embed)"\s*:\s*"([^"]+)"/i.exec(
              serverNextData,
            );
          if (sMatch)
            streamUrl = sMatch[1].replace(/\\\//g, '/').replace(/\\/g, '');
          if (!streamUrl) {
            const raw =
              /(?:m3u8Url|link_m3u8|embedUrl|link_embed)\\?":\s*\\?"(https?:\/\/[^"\\]+)\\?"/i.exec(
                serverHtml,
              );
            if (raw)
              streamUrl = raw[1].replace(/\\\//g, '/').replace(/\\/g, '');
          }
        }
        if (streamUrl && !addedUrls.has(streamUrl)) {
          addedUrls.add(streamUrl);
          validTracks.push({
            title: `${src.server_name} (${src.language_name || 'Vietsub'})`,
            url: streamUrl,
          });
        }
      }
    }

    if (validTracks.length === 0) {
      return '<p style="text-align:center;padding:16px;">Không tìm thấy video.</p><meta id="no-cache-marker"/><meta id="no-prefetch-marker"/>';
    }

    // ! todo: multi source
    const primaryVideoUrl = validTracks[0].url;
    const isIframe =
      !primaryVideoUrl.includes('.m3u8') ||
      primaryVideoUrl.split('https://').length > 1;

    return [
      '<meta name="lnreader-chapter-type" content="video">',
      '<meta name="lnreader-video-mode" content="direct">',
      `<meta name="lnreader-video-type" content="${isIframe ? 'iframe' : 'm3u8'}">`,
      `<meta name="lnreader-video-url" content="${primaryVideoUrl}">`,
      '<meta id="no-cache-marker"/>',
      '<meta id="no-prefetch-marker"/>',
    ].join('\n');
  }

  resolveUrl(path: string, isNovel?: boolean): string {
    return path.startsWith('http') ? path : this.site + path;
  }
}

export default new YeuAnimePlugin();
