import { fetchApi, fetchText } from '@libs/fetch';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';
import { ContentType } from '@libs/pluginMetadata';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { Plugin } from '@/types/plugin';
import { feedPath, parseFeed, parsePost } from './parser';

const SITE = 'https://truyentranhphapbi.blogspot.com';
const PAGE_SIZE = 20;
const LABELS = [
  'Anh-Pháp',
  'Asterix',
  'Benoit',
  'Classic',
  'Clifton',
  'Demon Slayer',
  'Donald',
  'Doremon',
  'Doremon dài',
  'Dragon Ball',
  'Dragon Ball Super',
  'EgoVox',
  'Ekho',
  'Gil Jourdan',
  'Golam',
  'Iznogoud',
  'Johan',
  'Les Géants',
  'Louca',
  'Lucky Luke',
  'Ly kỳ',
  'Magic',
  'Manga',
  'Marsupilami',
  'Merlin',
  'Mosaik',
  'New',
  'Ngộ Không',
  'Nhóc Spirou',
  'Papyrus',
  'Petzi',
  'Rantanplan',
  'Sci-fi',
  'Spirou',
  'Spy Family',
  'Sybil',
  'Tintin',
  'Tổng hợp',
  'Truyện lẻ',
  'Winx',
  'Xì trum',
  'Yakari',
  'Yoko Tsuno',
];

class TruyenTranhPhapBiPlugin implements Plugin.PluginBase {
  id = 'truyentranhphapbi.blogspot.com';
  name = 'Truyện Tranh Pháp Bỉ';
  icon = 'src/vi/truyentranhphapbi/icon.jpg';
  customCSS = 'src/vi/truyentranhphapbi/reader.css';
  site = SITE;
  version = '1.0.0';
  contentType = ContentType.IMAGE;
  filters = {
    category: {
      label: 'Chuyên mục',
      type: FilterTypes.Picker,
      value: '',
      options: [
        { label: 'Tất cả', value: '' },
        ...LABELS.map(label => ({ label, value: label })),
      ],
    },
  } satisfies Filters;

  private async list(pageNo: number, searchTerm?: string, label?: string) {
    const params = new URLSearchParams({
      alt: 'json',
      'max-results': String(PAGE_SIZE),
      'start-index': String((pageNo - 1) * PAGE_SIZE + 1),
    });
    if (searchTerm) params.set('q', searchTerm);

    const response = await fetchApi(`${SITE}${feedPath(label)}?${params}`);
    if (!response.ok) throw new Error(`Blogger feed: HTTP ${response.status}`);
    return parseFeed(await response.json());
  }

  popularNovels(
    pageNo: number,
    { filters }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    return this.list(pageNo, undefined, filters?.category.value);
  }

  searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    return this.list(pageNo, searchTerm.trim());
  }

  private async getPost(path: string) {
    const post = parsePost(await fetchText(this.resolveUrl(path)));
    if (!post.name || !post.content)
      throw new Error('Không tìm thấy nội dung truyện');
    return post;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const post = await this.getPost(novelPath);
    return {
      name: post.name,
      path: novelPath,
      cover: post.cover || defaultCover,
      summary: post.summary,
      author: 'Truyện Tranh Pháp Bỉ',
      genres: post.genres,
      status: NovelStatus.Completed,
      chapters: [
        {
          name: 'Đọc truyện',
          path: novelPath,
          chapterNumber: 1,
        },
      ],
    };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    return (await this.getPost(chapterPath)).content;
  }

  resolveUrl(path: string): string {
    return path.startsWith('http') ? path : SITE + path;
  }
}

export default new TruyenTranhPhapBiPlugin();
