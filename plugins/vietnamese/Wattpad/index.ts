import { fetchApi, fetchText } from '@libs/fetch';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';
import { ContentType, ContentWarning } from '@libs/pluginMetadata';
import { FilterTypes } from '@libs/filterInputs';
import type { Filters } from '@libs/filterInputs';
import { load as loadCheerio } from 'cheerio';
import { Plugin } from '@/types/plugin';

const SITE = 'https://www.wattpad.com';
const PAGE_SIZE = 20;
const VIETNAMESE_LANGUAGE_ID = 19;
const VIETNAMESE_UNIQUE_CHARACTERS = /[ăâđôơư]/i;
const VIETNAMESE_TERMS = [
  'truyện',
  'tiếng việt',
  'ngôn tình',
  'tình yêu',
  'người',
  'không',
  'được',
  'một',
  'những',
  'chàng',
  'nàng',
];

const WATTPAD_GENRES = [
  { label: 'Tất cả', value: '' },
  { label: 'Romance', value: 'romance' },
  { label: 'Fanfiction', value: 'fanfiction' },
  { label: 'LGBTQ+', value: 'lgbt' },
  { label: 'Werewolf', value: 'werewolf' },
  { label: 'New Adult', value: 'newadult' },
  { label: 'Fantasy', value: 'fantasy' },
  { label: 'Short Story', value: 'shortstory' },
  { label: 'Teen Fiction', value: 'teenfiction' },
  { label: 'Historical Fiction', value: 'historicalfiction' },
  { label: 'Paranormal', value: 'paranormal' },
  { label: 'Humor', value: 'humor' },
  { label: 'Horror', value: 'horror' },
  { label: 'Contemporary Lit', value: 'contemporarylit' },
  { label: 'Diverse Lit', value: 'diverselit' },
  { label: 'Mystery', value: 'mystery' },
  { label: 'Thriller', value: 'thriller' },
  { label: 'Science Fiction', value: 'sciencefiction' },
  { label: 'Adventure', value: 'adventure' },
  { label: 'Non-Fiction', value: 'nonfiction' },
  { label: 'Poetry', value: 'poetry' },
];

const WATTPAD_LANGUAGES = [
  { label: 'Tiếng Việt', value: '19' },
  { label: 'Tất cả ngôn ngữ', value: '' },
];

type WattpadPart = {
  id: string | number;
  title?: string;
  createDate?: string;
  draft?: boolean;
};

type WattpadStory = {
  id: string | number;
  title?: string;
  cover?: string;
  description?: string;
  tags?: string[];
  completed?: boolean;
  language?: { id?: number | string; name?: string };
  user?: { name?: string };
  parts?: WattpadPart[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isWattpadStory(value: unknown): value is WattpadStory {
  if (!isRecord(value)) return false;
  const id = value.id;
  return (
    (typeof id === 'string' || typeof id === 'number') &&
    String(id).length > 0 &&
    (value.title === undefined || typeof value.title === 'string') &&
    (value.description === undefined ||
      typeof value.description === 'string') &&
    (value.tags === undefined || Array.isArray(value.tags)) &&
    (value.parts === undefined || Array.isArray(value.parts)) &&
    (value.language === undefined ||
      (isRecord(value.language) &&
        (value.language.id === undefined ||
          typeof value.language.id === 'number' ||
          typeof value.language.id === 'string') &&
        (value.language.name === undefined ||
          typeof value.language.name === 'string')))
  );
}

function isWattpadPart(value: unknown): value is WattpadPart {
  if (!isRecord(value)) return false;
  const id = value.id;
  return (
    (typeof id === 'string' || typeof id === 'number') &&
    String(id).length > 0 &&
    (value.title === undefined || typeof value.title === 'string') &&
    (value.createDate === undefined || typeof value.createDate === 'string') &&
    (value.draft === undefined || typeof value.draft === 'boolean')
  );
}

function getStories(response: unknown): WattpadStory[] {
  if (!isRecord(response) || !Array.isArray(response.stories)) return [];
  return response.stories.filter(isWattpadStory);
}

function getParts(parts: unknown): WattpadPart[] {
  if (!Array.isArray(parts)) return [];
  return parts.filter(isWattpadPart);
}

function getId(path: string): string {
  const value = path.trim();

  try {
    const url = new URL(value, SITE);
    const queryId = url.searchParams.get('id');
    if (queryId) return queryId;

    const storyId = url.pathname.match(/\/story\/(\d+)/)?.[1];
    if (storyId) return storyId;

    const pathId = url.pathname
      .split('/')
      .reverse()
      .find(segment => /^\d+(?:-|$)/.test(segment))
      ?.match(/^\d+/)?.[0];
    if (pathId) return pathId;
  } catch {
    // Fall back to the raw plugin path when it is not URL-shaped.
  }

  return value.match(/^\d+/)?.[0] ?? value;
}

function getVietnameseScore(story: WattpadStory): number {
  const declaredLanguage =
    typeof story.language?.name === 'string'
      ? story.language.name.toLowerCase()
      : '';
  let score =
    (story.language?.id != null &&
      Number(story.language.id) === VIETNAMESE_LANGUAGE_ID) ||
    declaredLanguage.includes('vietnam') ||
    declaredLanguage.includes('việt')
      ? 100
      : 0;
  const tags = Array.isArray(story.tags)
    ? story.tags.filter(tag => typeof tag === 'string')
    : [];
  const searchableText = [story.title, story.description, ...tags]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();

  if (VIETNAMESE_UNIQUE_CHARACTERS.test(searchableText)) score += 20;
  score += VIETNAMESE_TERMS.filter(term =>
    searchableText.includes(term),
  ).length;
  return score;
}

function parseBrowseStories(html: string): WattpadStory[] {
  const $ = loadCheerio(html);
  const stories = new Map<string, WattpadStory>();

  $('a[href*="/story/"]').each((_, element) => {
    const href = $(element).attr('href');
    const storyId = href?.match(/\/story\/(\d+)/)?.[1];
    if (!storyId) return;

    const title = $(element).text().replace(/\s+/g, ' ').trim();
    const image = $(element).find('img').first();
    const cover =
      image.attr('src') ||
      image.attr('data-src') ||
      image.attr('data-original');
    const current = stories.get(storyId);

    if (!current && !title && !cover) return;
    stories.set(storyId, {
      id: storyId,
      title: title || current?.title,
      cover: cover || current?.cover,
    });
  });

  return [...stories.values()];
}

class WattpadPlugin implements Plugin.PluginBase {
  id = 'wattpad';
  name = 'Wattpad';
  icon = 'src/vi/wattpad/icon.png';
  site = SITE;
  version = '1.0.0';
  contentType = ContentType.NOVEL;
  contentWarning = ContentWarning.MIXED;

  filters = {
    language: {
      label: 'Ngôn ngữ truyện',
      type: FilterTypes.Picker,
      value: String(VIETNAMESE_LANGUAGE_ID),
      options: WATTPAD_LANGUAGES,
    },
    genre: {
      label: 'Thể loại',
      type: FilterTypes.Picker,
      value: '',
      options: WATTPAD_GENRES,
    },
  } satisfies Filters;

  private async fetchJson(url: string): Promise<unknown> {
    const response = await fetchApi(url);
    if (!response.ok)
      throw new Error(`Wattpad request failed: HTTP ${response.status}`);
    return response.json();
  }

  private getStoriesUrl(
    pageNo: number,
    query?: string,
    language?: string,
  ): string {
    const offset = Math.max(pageNo - 1, 0) * PAGE_SIZE;
    const params = new URLSearchParams({
      offset: String(offset),
      limit: String(PAGE_SIZE),
    });
    if (query) params.set('query', query);
    if (language) params.set('language', language);
    return `${SITE}/api/v3/stories?${params.toString()}`;
  }

  private getBrowseUrl(pageNo: number, genre: string): string {
    const url = new URL(`/stories/${encodeURIComponent(genre)}`, SITE);
    if (pageNo > 1) url.searchParams.set('page', String(pageNo));
    return url.toString();
  }

  private async fetchBrowseStories(
    pageNo: number,
    genre: string,
  ): Promise<WattpadStory[]> {
    const html = await fetchText(this.getBrowseUrl(pageNo, genre));
    return parseBrowseStories(html);
  }

  private mapStories(stories: WattpadStory[]): Plugin.NovelItem[] {
    return [...stories]
      .sort(
        (storyA, storyB) =>
          getVietnameseScore(storyB) - getVietnameseScore(storyA),
      )
      .flatMap(story => {
        if (!story.title || story.id == null) return [];
        return [
          {
            name: story.title,
            path: String(story.id),
            cover: story.cover || defaultCover,
          },
        ];
      });
  }

  async popularNovels(
    pageNo: number,
    options: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const genre = options?.filters?.genre?.value as string | undefined;
    const language =
      (options?.filters?.language?.value as string | undefined) ??
      String(VIETNAMESE_LANGUAGE_ID);
    if (genre) {
      return this.mapStories(await this.fetchBrowseStories(pageNo, genre));
    }

    const response = await this.fetchJson(
      this.getStoriesUrl(pageNo, undefined, language),
    );
    return this.mapStories(getStories(response));
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const storyId = getId(novelPath);
    const response = await this.fetchJson(
      `${SITE}/api/v3/stories/${encodeURIComponent(storyId)}`,
    );
    if (!isWattpadStory(response)) {
      throw new Error('Invalid Wattpad story response');
    }
    const story = response;
    const chapters = getParts(story.parts)
      .filter(part => part.draft !== true && Boolean(part.title))
      .map((part, index) => ({
        name: part.title as string,
        path: String(part.id),
        chapterNumber: index + 1,
        ...(part.createDate ? { releaseTime: part.createDate } : {}),
      }));

    return {
      name: story.title ?? storyId,
      path: String(story.id),
      cover: story.cover || defaultCover,
      author: story.user?.name,
      summary: story.description,
      genres: Array.isArray(story.tags) ? story.tags.join(', ') : undefined,
      status: story.completed ? NovelStatus.Completed : NovelStatus.Ongoing,
      chapters,
    };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const chapterId = getId(chapterPath);
    const response = await fetchApi(
      `${SITE}/apiv2/storytext?id=${encodeURIComponent(chapterId)}`,
    );
    if (!response.ok) {
      throw new Error(
        `Wattpad chapter request failed: HTTP ${response.status}`,
      );
    }
    return response.text();
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const response = await this.fetchJson(
      this.getStoriesUrl(pageNo, searchTerm),
    );
    return this.mapStories(getStories(response));
  }

  resolveUrl(path: string, isNovel?: boolean): string {
    const id = getId(path);
    return isNovel ? `${SITE}/story/${id}` : `${SITE}/${id}`;
  }
}

export default new WattpadPlugin();
