import { Filters } from '@libs/filterInputs';

import { Plugin } from '@/types/plugin';

import { ContentType, ContentWarning } from '../types/constants';

type PluginOptionalProperties = Pick<
  Plugin.PluginCommon,
  | 'customCSS'
  | 'customJS'
  | 'filters'
  | 'imageRequestInit'
  | 'pluginSettings'
  | 'webStorageUtilized'
>;

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions, @typescript-eslint/no-empty-interface, @typescript-eslint/no-unsafe-declaration-merging
interface NekoriBasePlugin extends PluginOptionalProperties {}

/** API v1 source with a complete chapter list. Metadata is read from the exported instance. */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
abstract class NekoriBasePlugin implements Plugin.NekoriBasePlugin {
  // Required properties
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly version: string;
  abstract readonly icon: string;
  abstract readonly site: string;
  contentType: ContentType = ContentType.NOVEL;
  contentWarning: ContentWarning = ContentWarning.UNSPECIFIED;
  // Optional properties
  /** Minimum Nekori core API level required to run this plugin.  */
  readonly minApiVersion = 1; // Repository-wide API floor; bump here for every Nekori plugin.
  /**
   * Specifies the build output target format:
   * - `'js'`: Standard bundled JavaScript (default).
   * - `'hermes'`: Precompiled Hermes Bytecode (HBC).
   * - `'all'`: Generates both JS and Hermes Bytecode builds.
   * Reserved only: all values currently build JavaScript.
   */
  outputTarget: 'hermes' | 'js' | 'all' = 'js';
  readonly isNekoriPlugin = true as const;
  abstract popularNovels(
    pageNo: number,
    options: Plugin.PopularNovelsOptions<Filters>,
  ): Promise<Plugin.NovelItem[]>;
  abstract parseNovel(novelPath: string): Promise<Plugin.SourceNovel>;
  /** Return ready HTML or a transient checkpoint; throw for failures with no useful UI. */
  abstract parseChapter(chapterPath: string): Promise<Plugin.ChapterContent>;
  abstract searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]>;
  resolveUrl(path: string, isNovel?: boolean): string {
    return this.site + path;
  }
}

/** API v1 source with numbered pages; parseNovel includes totalPages and parsePage loads each page. */
abstract class NekoriPagePlugin
  extends NekoriBasePlugin
  implements Plugin.NekoriPagePlugin
{
  abstract override parseNovel(
    novelPath: string,
  ): Promise<Plugin.SourceNovel & { totalPages: number }>;
  abstract parsePage(
    novelPath: string,
    page: string,
  ): Promise<Plugin.SourcePage>;
}

export { NekoriBasePlugin, NekoriPagePlugin };
