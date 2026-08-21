import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';
import { ContentType } from '@libs/pluginMetadata';

class OPhimPlugin implements Plugin.PluginBase {
  id = 'yuneko.ophim';
  name = 'OPhim';
  icon = 'src/vi/ophim/icon.png';
  site = 'https://ophim17.cc';
  version = '1.0.2';
  apiUrl = 'https://ophim1.com/v1/api';
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
    const url = `${this.apiUrl}/danh-sach/phim-moi-cap-nhat?page=${pageNo}`;
    const response = await fetchApi(url);
    const res: any = await response.json();

    const novels: Plugin.NovelItem[] = [];
    const list = res.items || (res.data && res.data.items) || [];
    const domain =
      res.pathImage ||
      (res.data && res.data.params && res.data.params.cdnDataRoot) ||
      'https://img.ophim.live/uploads/movies/';

    list.forEach((node: any) => {
      let cover = node.thumb_url;
      if (cover && !cover.startsWith('http')) {
        cover = domain + cover;
      }

      novels.push({
        name: node.name,
        path: `/phim/${node.slug}`,
        cover: cover || defaultCover,
      });
    });

    return novels;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const term = encodeURIComponent(searchTerm.trim());
    // OPhim api search
    const url = `https://ophim1.com/v1/api/tim-kiem?keyword=${term}&page=${pageNo}`;
    const response = await fetchApi(url);
    const res: any = await response.json();

    const novels: Plugin.NovelItem[] = [];
    const list = res.data?.items || [];
    const domain = 'https://img.ophim.live/uploads/movies/';

    list.forEach((node: any) => {
      let cover = node.thumb_url;
      if (cover && !cover.startsWith('http')) {
        cover = domain + cover;
      }

      novels.push({
        name: node.name,
        path: `/phim/${node.slug}`,
        cover: cover || defaultCover,
      });
    });

    return novels;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const slug = novelPath.split('/').pop()?.replace('.html', '');
    const url = `${this.apiUrl}/phim/${slug}`;

    const response = await fetchApi(url);
    const resJson: any = await response.json();
    if (!resJson || !resJson.data || !resJson.data.item) {
      throw new Error('Cannot fetch novel from OPhim API');
    }

    const movie = resJson.data.item;

    const tags: string[] = [];
    if (movie.category) {
      movie.category.forEach((c: any) => tags.push(c.name));
    }
    if (movie.country) {
      movie.country.forEach((c: any) => tags.push(c.name));
    }

    const summary = movie.content ? movie.content.replace(/<[^>]*>/g, '') : '';

    const status =
      movie.status !== 'completed'
        ? NovelStatus.Ongoing
        : NovelStatus.Completed;

    const chapters: Plugin.ChapterItem[] = [];

    if (movie.episodes) {
      movie.episodes.forEach((server: any) => {
        const pageName = server.server_name;
        server.server_data.forEach((ep: any) => {
          let displayName = ep.name;
          if (displayName.toLowerCase().indexOf('tập') === -1) {
            displayName = 'Tập ' + displayName;
          }
          chapters.push({
            name: displayName,
            path: ep.link_m3u8 || ep.link_embed,
            page: pageName,
          });
        });
      });
    }

    let cover = movie.thumb_url;
    if (cover && !cover.startsWith('http')) {
      cover = 'https://img.ophim.live/uploads/movies/' + cover;
    }

    return {
      path: novelPath,
      name: movie.name,
      cover: cover || defaultCover,
      summary: summary,
      author:
        movie.director && movie.director.length > 0 && movie.director[0] !== ''
          ? movie.director.join(', ')
          : 'Đang cập nhật',
      genres: tags.join(', '),
      status,
      chapters,
    };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    // For OPhim, chapterPath is the actual video URL because we set it in parseNovel
    const videoUrl = chapterPath;
    const isIframe = videoUrl.includes('.m3u8') ? false : true;

    return [
      '<meta name="lnreader-chapter-type" content="video">',
      '<meta name="lnreader-video-mode" content="direct">',
      `<meta name="lnreader-video-type" content="${isIframe ? 'iframe' : 'm3u8'}">`,
      `<meta name="lnreader-video-url" content="${videoUrl}">`,
      '<meta id="no-cache-marker"/>',
      '<meta id="no-prefetch-marker"/>',
    ].join('\n');
  }

  resolveUrl(path: string, isNovel?: boolean): string {
    if (path.startsWith('http')) return path;
    return this.site + path;
  }
}

export default new OPhimPlugin();
