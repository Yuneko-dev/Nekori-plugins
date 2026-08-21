import type { FilterToValues, Filters } from '@libs/filterInputs';
import type { ContentType, ContentWarning } from './constants';
export namespace Plugin {
  export type ChapterItem = {
    name: string;
    path: string;
    /**
     * "YYYY-MM-DD" format or ISO string format
     * ```js
     * chapter.releaseTime = '2023-12-02';
     * chapter.releaseTime = new Date(2023, 12, 02).toISOString();
     * ```
     * or just a string
     */
    releaseTime?: string | null;
    chapterNumber?: number;
    /**
     * For novel without pages only
     */
    page?: string;
    scanlator?: string | string[];
  };
  export type NovelItem = {
    name: string;
    path: string;
    cover?: string;
  };
  export type SourceNovel = {
    /** Comma separated genre list -> "action,fantasy,romance" */
    genres?: string;
    summary?: string;
    author?: string;
    artist?: string;
    status?: string;
    /** Rating out of 5 as float */
    rating?: number;
    chapters?: ChapterItem[];
  } & NovelItem;

  export type SourcePage = {
    chapters: ChapterItem[];
  };

  export type PopularNovelsOptions<
    Q extends Filters | undefined = Filters | undefined,
  > = {
    showLatestNovels?: boolean;
    filters: Q extends undefined ? undefined : FilterToValues<Q>;
  };
  export type PluginItem = {
    id: string;
    name: string;
    version: string;
    icon: string;
    site: string;
    contentWarning?: ContentWarning;
    contentType?: ContentType;
  };
  export type ImageRequestInit = {
    [x: string]:
      | string
      | Record<string, string>
      | Headers
      | FormData
      | undefined;
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  };

  export type TextSetting = {
    value: string;
    label: string;
    type?: 'Text';
  };

  export type SwitchSetting = {
    value: boolean;
    label: string;
    type: 'Switch';
  };

  export type SelectOption = {
    label: string;
    value: string;
  };

  export type SelectSetting = {
    value: string;
    label: string;
    type: 'Select';
    options: SelectOption[];
  };

  export type CheckboxOption = {
    label: string;
    value: string;
  };

  export type CheckboxGroupSetting = {
    value: string[];
    label: string;
    type: 'CheckboxGroup';
    options: CheckboxOption[];
  };

  export type PluginSetting =
    | TextSetting
    | SwitchSetting
    | SelectSetting
    | CheckboxGroupSetting;

  export type PluginSettings = Record<string, PluginSetting>;

  export type PluginCommon = {
    id: string;
    name: string;
    /**
     * Relative path without static. E.g:
     * ```js
     * "src/vi/hakolightnovel/icon.png"
     * ```
     */
    icon: string;
    customJS?: string;
    customCSS?: string;
    site: string;
    contentWarning?: ContentWarning;
    contentType?: ContentType;
    imageRequestInit?: ImageRequestInit;
    filters?: Filters;
    version: string;
    //flag indicates whether access to LocalStorage, SesesionStorage is required.
    webStorageUtilized?: boolean;
    pluginSettings?: PluginSettings;

    popularNovels(
      pageNo: number,
      options: PopularNovelsOptions<Filters>,
    ): Promise<NovelItem[]>;
    /**
     *
     * @param novelPath
     * @returns novel metadata and its first page
     */
    parseNovel(novelPath: string): Promise<SourceNovel>;
    parseChapter(chapterPath: string): Promise<string>;
    searchNovels(searchTerm: string, pageNo: number): Promise<NovelItem[]>;
    resolveUrl?(path: string, isNovel?: boolean): string;
  };

  export type PluginBase = PluginCommon & {
    parsePage?: never;
  };

  export type PagePlugin = Omit<PluginCommon, 'parseNovel'> & {
    parseNovel(
      novelPath: string,
    ): Promise<SourceNovel & { totalPages: number }>;
    parsePage(novelPath: string, page: string): Promise<SourcePage>;
  };

  export type PluginSource = PluginBase | PagePlugin;
}

export namespace HTMLParser2Util {
  type HandlerBase = {
    onopentag?(name: string, attribs: Record<string, string>): void;
    ontext?(data: string): void;
    onclosetag?(name: string, isImplied: boolean): void;
  };

  export type Handler = {
    isStarted?: boolean;
    isDone?: boolean;
  } & HandlerBase;

  // route htmlparser2 event to handlers
  export type HandlerRouter<ActionType extends string> = {
    handlers: Record<ActionType, Handler | undefined>;
    action: ActionType;
  } & HandlerBase;
}
