import { fetchApi } from '@libs/fetch';
import { load, type Cheerio, type CheerioAPI } from 'cheerio';
import type { Element } from 'domhandler';
import { Plugin } from '@/types/plugin';
import { NovelStatus } from '@libs/novelStatus';
import filters from './filters';
import { decryptImage, openChapter } from './NovelDecryptor';
import { NovelReaderConfig } from './interface';

const SITE = 'https://moetruyen.net';

function pathOf(value: string): string {
  try {
    return new URL(value, SITE).pathname + (new URL(value, SITE).search || '');
  } catch {
    return value;
  }
}

function statusOf(value: string): string {
  const status = value.toLowerCase();
  if (status.includes('hoàn thành')) return NovelStatus.Completed;
  if (status.includes('tạm dừng') || status.includes('tạm ngưng')) {
    return NovelStatus.OnHiatus;
  }
  if (status.includes('còn tiếp') || status.includes('đang')) {
    return NovelStatus.Ongoing;
  }
  return NovelStatus.Unknown;
}

function releaseDateOf(item: Cheerio<Element>): string | undefined {
  const time = item.find('.chapter-time, time').first();
  const datetime = time.attr('datetime');
  if (datetime) {
    const date = new Date(datetime);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  const title = time.attr('title')?.match(/(\d{1,2}:\d{2}:\d{2})\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (title) {
    const [, clock, day, month, year] = title;
    const date = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${clock}`);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return undefined;
}

function parseItems($: CheerioAPI): Plugin.NovelItem[] {
  const items: Plugin.NovelItem[] = [];
  $('article.manga-card a[href^="/novel/"]').each((_, element) => {
    const link = $(element);
    const path = link.attr('href');
    const name = link.find('h3[title]').attr('title')?.trim() ||
      link.text().replace(/Bìa|Thông tin truyện chữ|Còn tiếp|Tạm dừng/gi, '').trim();
    const cover = link.find('img').first().attr('src') || link.find('img').first().attr('data-src');
    if (path && name && !items.some(item => item.path === path)) {
      items.push({ name, path, cover });
    }
  });
  return items;
}

function parseChapters($: CheerioAPI): Plugin.ChapterItem[] {
  const chapters: Plugin.ChapterItem[] = [];
  const parseChapterList = (list: Cheerio<Element>, volume?: string) => {
    list.find('li').each((__, element) => {
      const item = $(element);
      const link = item.find('a.chapter-link').first();
      const path = link.attr('href');
      const number = Number(link.attr('data-chapter-number'));
      const title = item.find('.chapter-title').text().trim();
      const chapterLabel = item.find('.chapter-num').text().trim();
      const baseName = title && chapterLabel ? `${chapterLabel} - ${title}` : title || chapterLabel;
      const requiresComment = item.find('.chapter-lock-icon').length > 0;
      const name = requiresComment ? `🔒 ${baseName}` : baseName;
      if (path && name && !chapters.some(chapter => chapter.path === path)) {
        const chapter: Plugin.ChapterItem = {
          name,
          path: pathOf(path),
          releaseTime: releaseDateOf(item),
        };
        if (volume) chapter.page = volume;
        if (!Number.isNaN(number)) chapter.chapterNumber = number;
        chapters.push(chapter);
      }
    });
  };

  const volumes = $('.novel-volume');
  if (volumes.length) {
    volumes.each((_, volumeElement) => {
      const volume = $(volumeElement)
        .find('.novel-volume__name')
        .first()
        .text()
        .replace(/\s+/g, ' ')
        .trim();
      parseChapterList($(volumeElement).find('.chapter-list'), volume);
    });
  } else {
    parseChapterList($('.novel-loose-chapters .chapter-list').first());
  }
  return chapters;
}

class MoetruyenNovelPlugin implements Plugin.PluginBase {
  id = 'moetruyen.novel';
  name = 'Moetruyen Novel';
  icon = 'src/vi/moetruyen/icon.png';
  site = SITE;
  version = '1.0.0';
  filters = filters;

  async popularNovels(pageNo: number, options: Plugin.PopularNovelsOptions<typeof this.filters>) {
    const params = new URLSearchParams({ page: String(pageNo) });
    const sort = options.showLatestNovels ? 'updated_desc' : options.filters?.sort?.value || 'views_desc';
    if (sort) params.set('sort', sort);
    const status = options.filters?.status?.value;
    if (status) params.set('status', status);
    const genres = options.filters?.genre?.value;
    if (genres?.length) params.set('include', genres.join(','));
    return parseItems(load(await (await fetchApi(`${this.site}/novel?${params}`)).text()));
  }

  async searchNovels(searchTerm: string, pageNo: number) {
    if (pageNo > 1) return [];
    const url = new URL('/novel', this.site);
    url.searchParams.set('q', searchTerm);
    return parseItems(load(await (await fetchApi(url.toString())).text()));
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const html = await (await fetchApi(`${this.site}${novelPath}`)).text();
    const $ = load(html);
    const title = $('.manga-detail-title').first().text().trim();
    const author = $('.manga-detail-meta-line').filter((_, el) => $(el).text().includes('Tác giả')).find('a').map((_, el) => $(el).text().trim()).get().join(', ');
    const statusText = $('.manga-detail-meta-line').filter((_, el) => $(el).text().includes('Trạng thái')).text();
    const pages = $('a[href*="chapterPage="]')
      .map((_, el) => Number($(el).attr('href')?.match(/chapterPage=(\d+)/)?.[1]))
      .get()
      .filter(Number.isFinite);
    const chapters = parseChapters($);
    const totalPages = Math.max(1, ...pages);
    for (let page = 2; page <= totalPages; page++) {
      const url = new URL(novelPath, this.site);
      url.searchParams.set('chapterPage', String(page));
      const pageHtml = await (await fetchApi(url.toString())).text();
      chapters.push(...parseChapters(load(pageHtml)));
    }
    const siteDescription = $('[data-description-content]').text().trim();
    const alternateTitleValue = $('.manga-detail-meta-line')
      .filter((_, element) => $(element).find('.manga-detail-meta-label').text().trim().startsWith('Tên khác'))
      .find('.manga-detail-meta-value')
      .first()
      .text()
      .trim();
    const alternateTitle = alternateTitleValue ? `Tên khác: ${alternateTitleValue}` : '';
    const summary = [alternateTitle, siteDescription].filter(Boolean).join('\n\n');
    return { path: novelPath, name: title, author, cover: $('meta[property="og:image"]').attr('content'), genres: $('.manga-detail-tags a').map((_, el) => $(el).text().trim()).get().join(','), summary, status: statusOf(statusText || $('body').text()), chapters };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const chapterHtml = await (await fetchApi(`${this.site}${chapterPath}`)).text();
    const $ = load(chapterHtml);
    const configNode = $('#novel-reader-config');
    if (!configNode.length) {
      const lock = $('.novel-reader__lock').first();
      if (lock.length) {
        const title = lock.find('h2').first().text().trim();
        const description = lock
          .find('.novel-reader__lock-description')
          .first()
          .text()
          .trim();
        if (title && description) {
          return `<h2>${title}</h2>\n<p>${description}</p>`;
        }
      }
      throw new Error('Không tìm thấy nội dung chương.');
    }
    const config = JSON.parse(configNode.text().trim()) as NovelReaderConfig;
    const document = await openChapter(this.site, config);
    if (document.version !== 1 || !Array.isArray(document.blocks)) {
      throw new Error('Document chương không hợp lệ.');
    }
    const assets = new Map(config.assets.map(asset => [Number(asset.id), asset]));
    const escape = (value: string) => value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const renderRuns = (block: (typeof document.blocks)[number]) =>
      (block.runs?.length ? block.runs : [{ text: block.text || '' }])
        .map(run => escape(run.text || ''))
        .join('');
    const rendered: string[] = [];
    for (const block of document.blocks) {
      if (block.type === 'image') {
        const asset = assets.get(Number(block.assetId));
        if (!asset) throw new Error('Không tìm thấy ảnh của chương.');
        const image = await decryptImage(this.site, config, asset);
        rendered.push(`<figure><img src="data:image/webp;base64,${image}" alt="Minh họa trong chương"></figure>`);
      } else if (block.type === 'heading') {
        rendered.push(`<h2>${renderRuns(block)}</h2>`);
      } else if (block.type === 'quote') {
        rendered.push(`<blockquote>${renderRuns(block)}</blockquote>`);
      } else if (block.type === 'scene_break') {
        rendered.push('<p class="scene-break" style="text-align: center">* * *</p>');
      } else {
        rendered.push(`<p>${renderRuns(block)}</p>`);
      }
    }
    return rendered.join('\n');
  }
}

export default new MoetruyenNovelPlugin();