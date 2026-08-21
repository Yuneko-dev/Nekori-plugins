import { fetchText } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';
import { ContentType } from '@libs/pluginMetadata';

class MotchillPlugin implements Plugin.PluginBase {
  id = 'yuneko.motchill';
  name = 'Motchill';
  icon = 'src/vi/motchill/icon.png';
  site = 'https://envasion.net';
  version = '1.0.2';
  contentType = ContentType.VIDEO;

  imageRequestInit: Plugin.ImageRequestInit = {
    headers: {
      Referer: this.site + '/',
    },
  };

  async popularNovels(
    pageNo: number,
    options: Plugin.PopularNovelsOptions<any>,
  ): Promise<Plugin.NovelItem[]> {
    const url = `${this.site}/phim-bo${pageNo > 1 ? `/page/${pageNo}` : ''}`;
    const html = await fetchText(url);
    const $ = loadCheerio(html);

    const novels: Plugin.NovelItem[] = [];

    $('#featured-titles').remove();

    $('.result-item, .item, article').each((_, el) => {
      const $el = $(el);
      const $a = $el.find('a').first();
      const path = $a.attr('href')?.replace(this.site, '') || '';
      if (!path || path === '/') return;

      let name =
        $el.find('.title').first().text() ||
        $a.attr('title') ||
        $el.find('h3').first().text();
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
    const term = encodeURIComponent(searchTerm.trim());
    const url = `${this.site}${pageNo > 1 ? `/page/${pageNo}` : '/'}?s=${term}}`;
    const html = await fetchText(url);
    const $ = loadCheerio(html);

    const novels: Plugin.NovelItem[] = [];

    const clearDuplicate = new Set<string>();

    $('.result-item, .item, article').each((_, el) => {
      const $el = $(el);
      const $a = $el.find('a').first();
      const path = $a.attr('href')?.replace(this.site, '') || '';
      if (!path || path === '/') return;
      if (clearDuplicate.has(path)) return;
      clearDuplicate.add(path);

      let name =
        $el.find('.title').first().text() ||
        $a.attr('title') ||
        $el.find('h3').first().text();
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

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const url = this.site + novelPath;
    const html = await fetchText(url);
    const $ = loadCheerio(html);

    let name =
      $('.sheader .data h1').first().text().trim() ||
      $('meta[property="og:title"]').attr('content')?.trim() ||
      '';

    name = name.replace(/\s*Full\s+HD\s+Vietsub\s*-\s*Motchill\s*$/i, '');
    name = name.replace(/\s*-\s*Motchill\s*$/i, '');

    let cover = $('.sheader .poster img').first().attr('src') || '';
    if (!cover) {
      cover = $('meta[property="og:image"]').attr('content') || defaultCover;
    }

    const summary =
      $('#info .wp-content p, .wp-content p').first().text().trim() ||
      $('meta[name="description"]').attr('content') ||
      '';

    const genres: string[] = [];
    $(".sheader .sgeneros a[href*='/the-loai/']").each((_, el) => {
      const title = $(el).text().trim();
      if (title) genres.push(title);
    });

    const episodeCount = $('.sheader .item-label').first().text().toLowerCase();
    let status: string = NovelStatus.Unknown;

    if (
      episodeCount.includes('hoàn tất') ||
      episodeCount.includes('full') ||
      episodeCount.includes('completed')
    ) {
      status = NovelStatus.Completed;
    } else if (
      episodeCount.includes('tập') ||
      episodeCount.includes('đang') ||
      episodeCount.includes('ongoing')
    ) {
      status = NovelStatus.Ongoing;
    }

    const author =
      $('#cast .persons .person .name a').first().text().trim() ||
      'Đang cập nhật';

    const chapters: Plugin.ChapterItem[] = [];

    // Parse TOC
    let watchUrl = url
      .replace(/\/phim-/, '/watch/')
      .replace(/\/phim\//, '/watch/');
    if (watchUrl === url) {
      watchUrl = url.replace(/\/$/, '') + '/watch/';
    }

    const watchHtml = await fetchText(watchUrl);
    const $watch = loadCheerio(watchHtml);

    let episodeNodes = $watch('.episodios li a');
    if (episodeNodes.length === 0) {
      episodeNodes = $watch("a[href*='/xem-phim/']");
    }

    episodeNodes.each((_, el) => {
      const epName = $(el).text().trim();
      const href = $(el).attr('href') || '';
      if (epName && href) {
        chapters.push({
          name: epName,
          path: href.replace(this.site, ''),
        });
      }
    });

    if (chapters.length === 0) {
      chapters.push({
        name: 'Full',
        path: watchUrl.replace(this.site, ''),
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
    const url = this.site + chapterPath;
    const html = await fetchText(url);
    const $ = loadCheerio(html);

    // Get the first server using dooplay ajax
    const $server = $('.dooplay_player_option').first();
    const post = $server.attr('data-post');
    const nume = $server.attr('data-nume');
    const type = $server.attr('data-type') || 'tv';

    let videoUrl = '';

    if (post && nume) {
      const ajaxUrl = this.site + '/wp-admin/admin-ajax.php';
      const body = `action=doo_player_ajax&post=${post}&nume=${nume}&type=${type}`;
      try {
        const responseText = await fetchText(ajaxUrl, {
          method: 'POST',
          headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'Content-Type': 'application/x-www-form-urlencoded',
            Referer: url,
          },
          body,
        });
        const m = responseText.match(/src=["']([^"']+)["']/i);
        if (m) {
          videoUrl = m[1];
        } else {
          const urlMatch = responseText.match(/https?:\/\/[^"'\s<>]+/i);
          if (urlMatch) videoUrl = urlMatch[0];
        }
        if (!videoUrl) {
          const json = JSON.parse(responseText);
          if (json.type === 'iframe') videoUrl = json.embed_url;
        }
      } catch (e) {
        console.error('Motchill fetch error', e);
      }
    }

    if (!videoUrl) {
      return '<p style="text-align:center;padding:16px;">Không tìm thấy video.</p><meta id="no-cache-marker"/><meta id="no-prefetch-marker"/>';
    }

    return [
      '<meta name="lnreader-chapter-type" content="video">',
      '<meta name="lnreader-video-mode" content="direct">',
      '<meta name="lnreader-video-type" content="iframe">',
      `<meta name="lnreader-video-url" content="${videoUrl}">`,
      '<meta id="no-cache-marker"/>',
      '<meta id="no-prefetch-marker"/>',
    ].join('\n');
  }

  resolveUrl(path: string, isNovel?: boolean): string {
    return this.site + path;
  }
}

export default new MotchillPlugin();
