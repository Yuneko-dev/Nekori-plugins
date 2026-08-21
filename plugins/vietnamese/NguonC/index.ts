import { fetchApi, fetchText } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';
import { encodeHtmlEntities, Buffer } from '@libs/utils';
import { ContentType } from '@libs/pluginMetadata';
import { storage } from '@libs/storage';
import { load } from 'cheerio';

const SITE = 'https://phim.nguonc.com';
const API_BASE = SITE + '/api';

class NguonCPlugin implements Plugin.PluginBase {
  id = 'nguonc';
  name = 'NguonC';
  icon = 'src/vi/nguonc/icon.png';
  site = SITE;
  version = '1.0.11';
  customJS = 'src/vi/nguonc/player.js';
  contentType = ContentType.VIDEO;

  filters = {
    category: {
      type: FilterTypes.Picker,
      label: 'Danh sách',
      value: 'phim-moi-cap-nhat',
      options: [
        { label: 'Phim Mới Cập Nhật', value: 'phim-moi-cap-nhat' },
        { label: 'Phim Bộ', value: 'danh-sach/phim-bo' },
        { label: 'Phim Lẻ', value: 'danh-sach/phim-le' },
        { label: 'Phim Đang Chiếu', value: 'danh-sach/phim-dang-chieu' },
        { label: 'TV Shows', value: 'danh-sach/tv-shows' },
      ],
    },
    genre: {
      type: FilterTypes.Picker,
      label: 'Thể loại',
      value: '',
      options: [
        { label: 'Tất cả', value: '' },
        { label: 'Hành Động', value: 'hanh-dong' },
        { label: 'Phiêu Lưu', value: 'phieu-luu' },
        { label: 'Hoạt Hình', value: 'hoat-hinh' },
        { label: 'Hài', value: 'phim-hai' },
        { label: 'Hình Sự', value: 'hinh-su' },
        { label: 'Tài Liệu', value: 'tai-lieu' },
        { label: 'Chính Kịch', value: 'chinh-kich' },
        { label: 'Gia Đình', value: 'gia-dinh' },
        { label: 'Giả Tưởng', value: 'gia-tuong' },
        { label: 'Lịch Sử', value: 'lich-su' },
        { label: 'Kinh Dị', value: 'kinh-di' },
        { label: 'Nhạc', value: 'phim-nhac' },
        { label: 'Bí Ẩn', value: 'bi-an' },
        { label: 'Lãng Mạn', value: 'lang-man' },
        { label: 'Khoa Học Viễn Tưởng', value: 'khoa-hoc-vien-tuong' },
        { label: 'Gây Cấn', value: 'gay-can' },
        { label: 'Chiến Tranh', value: 'chien-tranh' },
        { label: 'Tâm Lý', value: 'tam-ly' },
        { label: 'Tình Cảm', value: 'tinh-cam' },
        { label: 'Cổ Trang', value: 'co-trang' },
        { label: 'Miền Tây', value: 'mien-tay' },
        { label: 'Phim 18+', value: 'phim-18' },
      ],
    },
    country: {
      type: FilterTypes.Picker,
      label: 'Quốc gia',
      value: '',
      options: [
        { label: 'Tất cả', value: '' },
        { label: 'Âu Mỹ', value: 'au-my' },
        { label: 'Anh', value: 'anh' },
        { label: 'Trung Quốc', value: 'trung-quoc' },
        { label: 'Indonesia', value: 'indonesia' },
        { label: 'Việt Nam', value: 'viet-nam' },
        { label: 'Pháp', value: 'phap' },
        { label: 'Hồng Kông', value: 'hong-kong' },
        { label: 'Hàn Quốc', value: 'han-quoc' },
        { label: 'Nhật Bản', value: 'nhat-ban' },
        { label: 'Thái Lan', value: 'thai-lan' },
        { label: 'Đài Loan', value: 'dai-loan' },
        { label: 'Nga', value: 'nga' },
        { label: 'Hà Lan', value: 'ha-lan' },
        { label: 'Philippines', value: 'philippines' },
        { label: 'Ấn Độ', value: 'an-do' },
        { label: 'Quốc Gia Khác', value: 'quoc-gia-khac' },
      ],
    },
    year: {
      type: FilterTypes.Picker,
      label: 'Năm',
      value: '',
      options: [
        { label: 'Tất cả', value: '' },
        { label: '2026', value: '2026' },
        { label: '2025', value: '2025' },
        { label: '2024', value: '2024' },
        { label: '2023', value: '2023' },
        { label: '2022', value: '2022' },
        { label: '2021', value: '2021' },
        { label: '2020', value: '2020' },
        { label: '2019', value: '2019' },
        { label: '2018', value: '2018' },
        { label: '2017', value: '2017' },
        { label: '2016', value: '2016' },
        { label: '2015', value: '2015' },
      ],
    },
  } satisfies Filters;

  pluginSettings: Plugin.PluginSettings = {
    enableEmbed: {
      value: false,
      label: 'Bật embed',
      type: 'Switch',
    },
  };

  get enableEmbed() {
    return storage.get('enableEmbed') as boolean;
  }

  // ---------- helpers ----------

  private async fetchJson(url: string): Promise<any> {
    const res = await fetchApi(url);
    return res.json();
  }

  private mapItems(items: any[]): Plugin.NovelItem[] {
    return (items || [])
      .map((item: any) => ({
        name: item.name || '',
        path: item.slug || '',
        cover: item.thumb_url || item.poster_url || defaultCover,
      }))
      .filter((n: Plugin.NovelItem) => n.name && n.path);
  }

  // ---------- popularNovels ----------

  async popularNovels(
    pageNo: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    let apiPath = 'films/phim-moi-cap-nhat';

    if (!showLatestNovels) {
      const genre = filters?.genre?.value || '';
      const country = filters?.country?.value || '';
      const year = filters?.year?.value || '';
      const category = filters?.category?.value || 'phim-moi-cap-nhat';

      if (genre) {
        apiPath = `films/the-loai/${genre}`;
      } else if (country) {
        apiPath = `films/quoc-gia/${country}`;
      } else if (year) {
        apiPath = `films/nam-phat-hanh/${year}`;
      } else {
        apiPath = `films/${category}`;
      }
    }

    const url = `${API_BASE}/${apiPath}?page=${pageNo}`;
    try {
      const data = await this.fetchJson(url);
      if (data.status !== 'success' || !data.items) return [];
      return this.mapItems(data.items);
    } catch {
      return [];
    }
  }

  // ---------- searchNovels ----------

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const url = `${API_BASE}/films/search?keyword=${encodeURIComponent(searchTerm.trim())}&page=${pageNo}`;
    try {
      const data = await this.fetchJson(url);
      if (data.status !== 'success' || !data.items) return [];
      return this.mapItems(data.items);
    } catch {
      return [];
    }
  }

  // ---------- parseNovel ----------

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const url = `${API_BASE}/film/${novelPath}`;
    const data = await this.fetchJson(url);
    const movie = data.movie;

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: movie.name || '',
      cover: movie.thumb_url || movie.poster_url || defaultCover,
      summary: movie.description || '',
      author: movie.director || '',
    };

    const genres: string[] = [];
    if (movie.category) {
      for (const key of Object.keys(movie.category)) {
        const group = movie.category[key];
        if (group.group?.name === 'Thể loại') {
          for (const item of group.list || []) {
            if (item.name) genres.push(item.name);
          }
        }
      }
    }
    if (genres.length) novel.genres = genres.join(', ');

    const currentEp = movie.current_episode || '';
    if (/full/i.test(currentEp)) {
      novel.status = NovelStatus.Completed;
    } else {
      let isAiring = false;
      if (movie.category) {
        for (const key of Object.keys(movie.category)) {
          const group = movie.category[key];
          if (group.group?.name === 'Định dạng') {
            for (const item of group.list || []) {
              if (/đang chiếu/i.test(item.name)) isAiring = true;
            }
          }
        }
      }
      novel.status = isAiring ? NovelStatus.Ongoing : NovelStatus.Unknown;
    }

    const chapters: Plugin.ChapterItem[] = [];
    if (movie.episodes && movie.episodes.length > 0) {
      const server = movie.episodes[0];
      for (let idx = 0; idx < (server.items || []).length; idx++) {
        const ep = server.items[idx];
        const epNum = parseFloat(ep.name);
        chapters.push({
          name: `Tập ${ep.name}`,
          path: `${novelPath}/${ep.slug}`,
          chapterNumber: Number.isFinite(epNum) ? epNum : idx + 1,
        });
      }
    }
    novel.chapters = chapters;

    return novel;
  }

  // ---------- parseChapter ----------

  async parseChapter(chapterPath: string): Promise<string> {
    const lastSlash = chapterPath.lastIndexOf('/');
    const movieSlug = chapterPath.substring(0, lastSlash);
    const epSlug = chapterPath.substring(lastSlash + 1);

    const url = `${API_BASE}/film/${movieSlug}`;
    const data = await this.fetchJson(url);
    const movie = data.movie;

    if (movie?.episodes) {
      for (const server of movie.episodes) {
        for (const ep of server.items || []) {
          if (ep.slug === epSlug) {
            return this.buildPlayerHtml({
              m3u8: ep.m3u8,
              embed: ep.embed || '',
            });
          }
        }
      }
    }
    throw new Error('Không tìm thấy dữ liệu tập phim này');
  }

  async getM3u8DataFromEmbed(url: string) {
    const html = await fetchText(url);
    const $ = load(html);
    const div = $('#player');
    const dataObf = div.attr('data-obf')!;
    const obf = JSON.parse(Buffer.from(dataObf, 'base64').toString()) as {
      sUb: string;
      hD: string;
      kX?: string;
    };
    return { hD: obf.hD, dataObf };
  }

  // ---------- buildPlayerHtml ----------

  private async buildPlayerHtml(opts: {
    m3u8?: string;
    embed?: string;
  }): Promise<string> {
    const metas: string[] = [
      '<meta name="lnreader-chapter-type" content="video">',
      '<meta name="lnreader-debug-mode" content="false">',
      '<meta id="no-cache-marker"/>',
      '<meta id="no-prefetch-marker"/>',
    ];

    if (this.enableEmbed) {
      metas.push(
        '<meta name="lnreader-video-mode" content="direct">',
        '<meta name="lnreader-video-type" content="iframe">',
      );
      metas.push(
        `<meta name="lnreader-video-url" content="${encodeHtmlEntities(opts.embed)}">`,
      );
    } else {
      metas.push('<meta name="lnreader-video-mode" content="lazy">');
      const iframeObf = await this.getM3u8DataFromEmbed(opts.embed!);
      const attrs: string[] = ['id="nguonc-player-container"'];
      attrs.push(`data-iframe="${encodeHtmlEntities(opts.embed)}"`);
      attrs.push(`data-obf="${encodeHtmlEntities(iframeObf?.dataObf || '')}"`);
      metas.push(`<div ${attrs.join(' ')} style="display:none;"></div>`);
    }

    return metas.join('\n');
  }

  resolveUrl(path: string, isNovel?: boolean): string {
    if (isNovel) return `${SITE}/phim/${path}`;
    return `${SITE}/phim/${path.split('/')[0]}`;
  }
}

export default new NguonCPlugin();
