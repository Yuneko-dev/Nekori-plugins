import { fetchText } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';
import { FilterTypes, Filters } from '@libs/filterInputs';
import { decodeHtmlEntities, encodeHtmlEntities } from '@libs/utils';
import { isUrlAbsolute } from '@libs/isAbsoluteUrl';
import { ContentType, ContentWarning } from '@libs/pluginMetadata';

const SITE = 'https://cosplaytele.com';

const PHOTOS_SUFFIX = '#cosplaytele-photos';
const VIDEO_SUFFIX = '#cosplaytele-video';

const levelCosplayOptions = [
  { label: 'All', value: '' },
  { label: 'Cosplay Nude', value: `${SITE}/category/nude/` },
  { label: 'Cosplay Ero', value: `${SITE}/category/cosplay-ero/` },
  { label: 'Cosplay', value: `${SITE}/category/cosplay/` },
];

const topCosplayOptions = [
  { label: 'All', value: '' },
  { label: '24 hours', value: `${SITE}/24-hours/` },
  { label: '3 day', value: `${SITE}/3-day/` },
  { label: '7 Day', value: `${SITE}/7-day/` },
];

function cleanTitle(raw: string): string {
  let title = decodeHtmlEntities(raw).trim();
  title = title.replace(
    /\s*[“"']?(?:\d+\s+(?:photos?|videos?|gifs?)(?:,\s*|\s+and\s+)?)+[”"']?\s*$/i,
    '',
  );
  title = title.replace(/[“"”]/g, '').trim();
  return title;
}

function toPath(url: string): string {
  if (!url) return '/';
  if (!isUrlAbsolute(url)) return url.startsWith('/') ? url : `/${url}`;
  try {
    const u = new URL(url);
    if (u.origin === SITE) return `${u.pathname}${u.search}`;
    return url;
  } catch {
    return url;
  }
}

function buildListUrl(
  pageNo: number,
  levelCosplay: string,
  topCosplay: string,
): string {
  const base = levelCosplay || topCosplay || `${SITE}/`;
  const normalized = base.endsWith('/') ? base : `${base}/`;
  if (pageNo <= 1) return normalized;
  if (normalized === `${SITE}/`) {
    return `${SITE}/page/${pageNo}/`;
  }
  return `${normalized}page/${pageNo}/`;
}

function parseNovelCards(
  $: ReturnType<typeof loadCheerio>,
): Plugin.NovelItem[] {
  const novels: Plugin.NovelItem[] = [];
  const seen = new Set<string>();

  $('.large-10 .box-blog-post').each((_, box) => {
    const $box = $(box);
    const $link = $box.find('.post-title a, h5 a').first();
    const href = $link.attr('href');
    if (!href || href === '#') return;
    const path = toPath(href);
    if (seen.has(path)) return;
    seen.add(path);

    const rawName = $link.text().trim() || $link.attr('title') || '';
    const name = cleanTitle(rawName);
    if (!name) return;

    let cover =
      $box.find('.box-image img').attr('data-src') ||
      $box.find('.box-image img').attr('src') ||
      $box.find('img').first().attr('src') ||
      defaultCover;
    if (cover && !isUrlAbsolute(cover)) {
      cover = SITE + cover;
    }

    novels.push({ name, path, cover });
  });

  return novels;
}

function extractAuthor($: ReturnType<typeof loadCheerio>): string {
  const cosplayerLink = $('blockquote a[href*="/category/"]')
    .first()
    .text()
    .trim();
  if (cosplayerLink) return cosplayerLink;

  const block = $('blockquote').first().text();
  const match = block.match(/Cosplayer:\s*([^\n\r]+)/i);
  return match?.[1]?.trim() || '';
}

function extractDownloadSummary($: ReturnType<typeof loadCheerio>): string {
  const urls: {
    buttonText: string;
    url: string;
  }[] = [];
  const $content = $('.entry-content').first();

  $content.find('a.button, a[class*="button"]').each((_, el) => {
    const $a = $(el);
    const text = $a.find('span').first().text().trim() || $a.text().trim();
    if (!/download/i.test(text)) return;
    const href = ($a.attr('href') || '').trim();
    if (href && href !== '#') {
      urls.push({
        buttonText: text,
        url: href,
      });
    }
  });

  if (!urls.length) return '';
  return `## Download link:\n${urls.map(u => `- [${u.buttonText}](${u.url})`).join('\n')}`;
}

function collectPhotoUrls($: ReturnType<typeof loadCheerio>): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  const $content = $('.entry-content').first();

  $content.find('figure a[href]').each((_, el) => {
    const href = $(el).attr('href')?.trim();
    if (!href || !/\.(webp|jpe?g|png|gif)(\?|$)/i.test(href)) return;
    const full = isUrlAbsolute(href) ? href : SITE + href;
    if (seen.has(full)) return;
    seen.add(full);
    urls.push(full);
  });

  return urls;
}

function collectVideoEmbeds($: ReturnType<typeof loadCheerio>): string[] {
  const embeds: string[] = [];
  const seen = new Set<string>();
  const $content = $('.entry-content').first();

  $content.find('iframe[src]').each((_, el) => {
    const src = $(el).attr('src')?.trim();
    if (!src || /googletagmanager/i.test(src)) return;
    if (seen.has(src)) return;
    seen.add(src);
    embeds.push(src);
  });

  return embeds;
}

class CosplayTelePlugin implements Plugin.PluginBase {
  id = 'cosplaytele';
  name = 'CosplayTele';
  icon = 'src/en/cosplaytele/icon.png';
  site = SITE;
  version = '1.0.4';
  contentType = ContentType.MIXED;
  contentWarning = ContentWarning.NSFW;

  customJS = 'src/en/cosplaytele/custom.js';
  customCSS = 'src/en/cosplaytele/custom.css';

  imageRequestInit: Plugin.ImageRequestInit = {
    headers: {
      Referer: `${SITE}/`,
    },
  };

  filters = {
    levelCosplay: {
      label: 'Level Cosplay',
      type: FilterTypes.Picker,
      value: '',
      options: levelCosplayOptions,
    },
    topCosplay: {
      label: 'Top Cosplay',
      type: FilterTypes.Picker,
      value: '',
      options: topCosplayOptions,
    },
  } satisfies Filters;

  private async fetchPage(url: string): Promise<string> {
    return fetchText(url.startsWith('http') ? url : `${SITE}${url}`);
  }

  async popularNovels(
    pageNo: number,
    { filters }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const level = filters.levelCosplay.value as string;
    const top = filters.topCosplay.value as string;
    const url = buildListUrl(pageNo, level, top);
    const html = await this.fetchPage(url);
    const $ = loadCheerio(html);
    return parseNovelCards($);
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const term = encodeURIComponent(searchTerm.trim());
    const url =
      pageNo > 1 ? `${SITE}/page/${pageNo}/?s=${term}` : `${SITE}/?s=${term}`;
    const html = await this.fetchPage(url);
    const $ = loadCheerio(html);
    return parseNovelCards($);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const path = novelPath.split('#')[0];
    const html = await this.fetchPage(path);
    const $ = loadCheerio(html);

    const rawTitle =
      $('h1.entry-title').first().text().trim() ||
      $('meta[property="og:title"]').attr('content') ||
      'Untitled';
    const name = cleanTitle(rawTitle);

    const author = extractAuthor($);
    const genres: string[] = [];
    $('.entry-category a, h6.entry-category a').each((_, el) => {
      const g = $(el).text().trim();
      if (g) genres.push(g);
    });

    let cover =
      $('meta[property="og:image"]').attr('content') ||
      $('.entry-content figure img').first().attr('src') ||
      defaultCover;
    if (cover && !isUrlAbsolute(cover)) cover = SITE + cover;

    const summary = extractDownloadSummary($);
    const embeds = collectVideoEmbeds($);

    const chapters: Plugin.ChapterItem[] = [
      {
        name: 'Photos',
        path: `${path}${PHOTOS_SUFFIX}`,
        chapterNumber: 1,
      },
    ];

    if (embeds.length > 0) {
      chapters.push({
        name: 'Video',
        path: `${path}${VIDEO_SUFFIX}`,
        chapterNumber: 2,
      });
    }

    return {
      path,
      name,
      author,
      artist: author,
      cover,
      genres: genres.join(', '),
      status: NovelStatus.Completed,
      summary,
      chapters,
    };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    if (chapterPath.endsWith(PHOTOS_SUFFIX)) {
      const novelPath = chapterPath.slice(0, -PHOTOS_SUFFIX.length);
      const html = await this.fetchPage(novelPath);
      const $ = loadCheerio(html);
      const photos = collectPhotoUrls($);
      if (!photos.length) {
        return '<p>No photos found.</p>';
      }
      const imgs = photos
        .map(
          url =>
            `<figure style="margin:0 0 1rem;"><img src="${encodeHtmlEntities(url)}" alt="" style="max-width:100%;height:auto;display:block;margin:0 auto;" loading="lazy"/></figure>`,
        )
        .join('\n');
      return `<div class="cosplaytele-photos">${imgs}</div>`;
    }

    if (chapterPath.endsWith(VIDEO_SUFFIX)) {
      const novelPath = chapterPath.slice(0, -VIDEO_SUFFIX.length);
      const html = await this.fetchPage(novelPath);
      const $ = loadCheerio(html);
      const embeds = collectVideoEmbeds($);
      if (!embeds.length) {
        return '<p>No embedded video on this post.</p>';
      }

      const embedJson = encodeHtmlEntities(JSON.stringify(embeds));
      return [
        '<meta name="lnreader-chapter-type" content="video">',
        '<meta name="lnreader-video-mode" content="lazy">',
        `<div id="cosplaytele-player" data-embeds="${embedJson}" style="display:none"></div>`,
        '<meta id="no-cache-marker"/>',
        '<meta id="no-prefetch-marker"/>',
      ].join('\n');
    }

    return '<p>Unknown chapter.</p>';
  }

  resolveUrl(path: string, isNovel?: boolean): string {
    const clean = path.split('#')[0];
    if (isUrlAbsolute(clean)) return clean;
    return `${SITE}${clean.startsWith('/') ? clean : `/${clean}`}`;
  }
}

export default new CosplayTelePlugin();
