export declare const CHAPTER_TAG_NAME = "nekori-chapter";
export declare const CHAPTER_ID_ATTR = "data-nekori-chapter-id";
export declare const CHAPTER_TITLE_ATTR = "data-nekori-chapter-name";
export declare const CHAPTER_NUMBER_ATTR = "data-nekori-chapter-number";
export declare const CHAPTER_PATH_ATTR = "data-nekori-chapter-path";
export declare const CHAPTER_URL_ATTR = "data-nekori-chapter-url";
export declare const CHAPTER_DIVIDER_CLASS = "nekori-chapter-divider";
export declare const CHAPTER_CLASS = "nekori-chapter";
export declare const PLAIN_TEXT_CLASS = "nekori-plain-text";
export declare const PLAIN_TEXT_ATTR = "data-nekori-plain-text";
export interface ChapterMetadata {
    readonly id: string;
    readonly name: string;
    readonly number: number;
    /** Opaque source identity; preserve exactly as returned by the source. */
    readonly path: string;
    readonly url: string;
    readonly direction?: 'ltr' | 'rtl';
    readonly language?: string;
}
export interface ChapterNodes {
    readonly element: HTMLElement;
    readonly divider: HTMLDivElement;
}
