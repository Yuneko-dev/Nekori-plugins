import type { Filters, FilterToValues } from '@libs/filterInputs';

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
     * Bare filename, automatically placed under src/<id>/ when loaded. E.g:
     * ```js
     * "icon.png"
     * ```
     * Legacy paths relative to public/static are also supported.
     */
    icon: string;
    /** Output filename; source is webview/index.ts or webview/index.js. */
    customJS?: string;
    /** Output filename; source is webview/style.css. */
    customCSS?: string;
    site: string;
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
    searchNovels(searchTerm: string, pageNo: number): Promise<NovelItem[]>;
    resolveUrl?(path: string, isNovel?: boolean): string;
  };

  export type PluginBase = PluginCommon & {
    isNekoriPlugin?: false;
    parsePage?: never;
    parseChapter(chapterPath: string): Promise<string>;
  };

  export type PagePlugin = Omit<PluginCommon, 'parseNovel'> & {
    isNekoriPlugin?: false;
    parseNovel(
      novelPath: string,
    ): Promise<SourceNovel & { totalPages: number }>;
    parsePage(novelPath: string, page: string): Promise<SourcePage>;
    parseChapter(chapterPath: string): Promise<string>;
  };

  export type ChapterContentType = 'novel' | 'mixed' | 'image' | 'video';

  /** HTML is rendered unchanged. Checkpoint content is transient and must never be downloaded. */
  export type ChapterContent =
    | {
        state: 'ready';
        type: ChapterContentType;
        html: string;
        /** Do not reuse this response in reader or source caches; downloads remain allowed. */
        noCache?: boolean;
        /** Stop automatic read-ahead from this chapter. */
        noPrefetch?: boolean;
      }
    | {
        state: 'checkpoint';
        type: ChapterContentType;
        html: string;
        /** Optional explanation shown by checks and download failures. HTML may contain interactive UI. */
        checkpointMessage?: string;
        noCache: true;
        noPrefetch: true;
      };

  export type NekoriMetadata = {
    readonly isNekoriPlugin: true;
    readonly minApiVersion: number;
    contentType: ContentType;
    contentWarning: ContentWarning;
    outputTarget: 'hermes' | 'js' | 'all';
  };

  export type NekoriBasePlugin = PluginCommon &
    NekoriMetadata & {
      parsePage?: never;
      parseChapter(chapterPath: string): Promise<ChapterContent>;
    };

  export type NekoriPagePlugin = Omit<PluginCommon, 'parseNovel'> &
    NekoriMetadata & {
      parseNovel(
        novelPath: string,
      ): Promise<SourceNovel & { totalPages: number }>;
      parsePage(novelPath: string, page: string): Promise<SourcePage>;
      parseChapter(chapterPath: string): Promise<ChapterContent>;
    };

  export type PluginSource =
    | PluginBase
    | PagePlugin
    | NekoriBasePlugin
    | NekoriPagePlugin;
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
