import { gcm } from '@libs/aes';
import { fetchApi, fetchText } from '@libs/fetch';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { NovelStatus } from '@libs/novelStatus';
import { storage } from '@libs/storage';
import { NekoriBasePlugin } from '@nekori/plugin';
import { ContentType } from '@nekori/pluginMetadata';
import { Buffer, encodeHtmlEntities, NodeCrypto } from '@nekori/utils';
import { load } from 'cheerio';

import { Plugin } from '@/types/plugin';

const SITE = 'https://phim.nguonc.com';
const API_BASE = SITE + '/api';

class NguonCPlugin extends NekoriBasePlugin {
  id = 'nguonc';
  name = 'NguonC';
  icon = 'icon.png';
  site = SITE;
  version = '1.2.1';
  minApiVersion = 2;
  customJS = 'player.js';
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
    playMode: {
      value: 'm3u8',
      label: 'Chế độ phát',
      type: 'Select',
      options: [
        { label: 'm3u8 (giải mã)', value: 'm3u8' },
        { label: 'Embed (iframe)', value: 'embed' },
      ],
    },
    enableDebug: {
      value: false,
      label: 'Bật debug',
      type: 'Switch',
    },
  };

  get playMode(): string {
    return (storage.get('playMode') as string) || 'm3u8';
  }

  get enableDebug(): boolean {
    return storage.get('enableDebug') as boolean;
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
        cover: item.thumb_url || item.poster_url || undefined,
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
      cover: movie.thumb_url || movie.poster_url || undefined,
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
    for (let srvIdx = 0; srvIdx < (movie.episodes || []).length; srvIdx++) {
      const server = movie.episodes[srvIdx];
      const serverName =
        server.server_name || server.name || `Server ${srvIdx + 1}`;
      for (let idx = 0; idx < (server.items || []).length; idx++) {
        const ep = server.items[idx];
        const epNum = parseFloat(ep.name);
        chapters.push({
          name: `Tập ${ep.name}`,
          path: `${novelPath}/${srvIdx}/${ep.slug}`,
          chapterNumber:
            (Number.isFinite(epNum) ? epNum : idx + 1) + srvIdx / 10,
          page: serverName,
        });
      }
    }
    novel.chapters = chapters;

    return novel;
  }

  // ---------- parseChapter ----------

  async parseChapter(chapterPath: string): Promise<Plugin.ChapterContent> {
    // path: <movieSlug>/<serverIdx>/<epSlug> (new) or <movieSlug>/<epSlug> (legacy)
    const parts = chapterPath.split('/');
    const movieSlug = parts[0];
    let serverIdx: number | null = null;
    let epSlug: string;
    if (parts.length >= 3) {
      serverIdx = parseInt(parts[1], 10);
      epSlug = parts.slice(2).join('/');
    } else {
      epSlug = parts[parts.length - 1];
    }

    const url = `${API_BASE}/film/${movieSlug}`;
    const data = await this.fetchJson(url);
    const movie = data.movie;

    const findEp = (server: any) =>
      (server?.items || []).find((ep: any) => ep.slug === epSlug);

    let ep: any = null;
    if (serverIdx !== null && movie?.episodes?.[serverIdx]) {
      ep = findEp(movie.episodes[serverIdx]);
    }
    if (!ep && movie?.episodes) {
      for (const server of movie.episodes) {
        ep = findEp(server);
        if (ep) break;
      }
    }

    if (ep) {
      return {
        state: 'ready',
        type: 'video',
        noCache: true,
        noPrefetch: true,
        html: await this.buildPlayerHtml({
          m3u8: ep.m3u8,
          embed: ep.embed || '',
        }),
      };
    }
    throw new Error('Không tìm thấy dữ liệu tập phim này');
  }

  // ---------- streamc embed: bootstrap flow ----------
  //
  // The embed page embeds <script id="stream-bootstrap">{"api": "..."}</script>.
  // POST {action:"bootstrap",...} to that api returns an AES-GCM sealed
  // envelope {format:"aesgcm-v1",iv,data}; the key is
  // sha256("stream-bootstrap-v1\n"+apiHref) and the same bytes are the AAD.
  // The opened payload carries a short-lived preissued playlist URL plus the
  // video hash. The playlist itself is another AES-GCM envelope
  // (#ENC-AESGCM;iv=..) keyed by HMAC-SHA256("stream-derive-v1", videoHash).

  private openBootstrapEnvelope(
    envelope: { format?: string; iv?: string; data?: string },
    apiHref: string,
  ): any {
    if (
      envelope?.format !== 'aesgcm-v1' ||
      !envelope.iv ||
      !envelope.data ||
      !/^[a-f0-9]{24}$/i.test(envelope.iv)
    ) {
      throw new Error('bad_bootstrap_envelope');
    }
    const aad = new TextEncoder().encode(`stream-bootstrap-v1\n${apiHref}`);
    const key = NodeCrypto.createHash('sha256').update(aad).digest();
    const plain = gcm(
      new Uint8Array(key),
      this.hexToBytes(envelope.iv),
      aad,
    ).decrypt(new Uint8Array(Buffer.from(envelope.data, 'base64')));
    return JSON.parse(new TextDecoder().decode(plain));
  }

  private hexToBytes(hex: string): Uint8Array {
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      out[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return out;
  }

  async getStreamDataFromEmbed(embedUrl: string): Promise<{
    playlist?: string;
    videoHash?: string;
    dataObf?: string;
  }> {
    const embedOrigin = new URL(embedUrl).origin;
    const html = await fetchText(embedUrl, {
      headers: { Referer: this.site + '/' },
    });
    const $ = load(html);

    // New flow: <script id="stream-bootstrap">{"api": "..."}</script>
    const bootstrapRaw = $('#stream-bootstrap').first().text().trim();
    if (bootstrapRaw) {
      const meta = JSON.parse(bootstrapRaw);
      const apiHref = meta?.api;
      if (!apiHref || new URL(apiHref).origin !== embedOrigin) {
        throw new Error('bootstrap api không hợp lệ');
      }
      const res = await fetchApi(apiHref, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: embedOrigin,
          Referer: embedUrl,
        },
        body: JSON.stringify({
          action: 'bootstrap',
          referrer: this.site + '/',
          frame_origins: [this.site],
          request_grant: true,
          playlist_format: 'aesgcm-v2',
          pretty_url: true,
          path_chunks: true,
          bootstrap_format: 'aesgcm-v1',
        }),
      });
      if (!res.ok) throw new Error('bootstrap_failed: HTTP ' + res.status);
      const envelope = await res.json();
      const opened =
        envelope?.format === 'aesgcm-v1'
          ? this.openBootstrapEnvelope(envelope, apiHref)
          : envelope;
      const playlist = opened?.preissued?.playlist;
      const videoHash =
        opened?.video || new URL(embedUrl).searchParams.get('hash') || '';
      if (playlist) return { playlist, videoHash };
      throw new Error('bootstrap không trả về playlist');
    }

    // Legacy flow: #player[data-obf] base64 → {sUb, hD}
    const dataObf = $('#player').attr('data-obf');
    if (dataObf) return { dataObf };
    throw new Error('Không tìm thấy dữ liệu player trên trang embed');
  }

  // ---------- buildPlayerHtml ----------

  private async buildPlayerHtml(opts: {
    m3u8?: string;
    embed?: string;
  }): Promise<string> {
    const esc = (s: string) => encodeHtmlEntities(s);
    const metas: string[] = [
      `<meta name="nekori-debug-mode" content="${Boolean(this.enableDebug)}">`,
    ];

    if (this.playMode === 'embed') {
      metas.push(
        '<meta name="nekori-video-mode" content="direct">',
        '<meta name="nekori-video-type" content="iframe">',
        `<meta name="nekori-video-url" content="${esc(opts.embed || '')}">`,
      );
      return metas.join('\n');
    }

    metas.push('<meta name="nekori-video-mode" content="lazy">');
    let stream: Awaited<ReturnType<typeof this.getStreamDataFromEmbed>> = {};
    try {
      stream = await this.getStreamDataFromEmbed(opts.embed!);
    } catch (e) {
      console.warn('[NguonC] stream bootstrap failed:', e);
    }
    const attrs: string[] = ['id="nguonc-player-container"'];
    attrs.push(`data-iframe="${esc(opts.embed || '')}"`);
    if (stream.playlist) attrs.push(`data-playlist="${esc(stream.playlist)}"`);
    if (stream.videoHash) attrs.push(`data-hash="${esc(stream.videoHash)}"`);
    if (stream.dataObf) attrs.push(`data-obf="${esc(stream.dataObf)}"`);
    metas.push(`<div ${attrs.join(' ')} style="display:none;"></div>`);

    return metas.join('\n');
  }

  resolveUrl(path: string, isNovel?: boolean): string {
    if (isNovel) return `${SITE}/phim/${path}`;
    return `${SITE}/phim/${path.split('/')[0]}`;
  }
}

export default new NguonCPlugin();
