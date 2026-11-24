import type { PlayerConfig } from '../media/types.ts';
import type { LayoutConfig, ScrollTrackingConfig } from '../layout/types.ts';
export interface ReaderContext {
    documentId: string;
    mode: 'reader' | 'download' | 'error';
    novel: ReaderNovel;
    chapter: ReaderChapter;
    nextChapter: ReaderChapter | null;
    chapters: readonly ReaderChapter[];
    runtime: ReaderRuntimeState;
    strings: Readonly<Record<string, string>>;
    ui: ReaderConfig['ui'];
    style: ReaderConfig['style'];
    layout: ReaderConfig['layout'];
    player: ReaderConfig['player'];
    sourceBaseUrl: string | undefined;
    novelId: string | undefined;
    chapterId: string | undefined;
    sourceId: string | undefined;
}
export interface ReaderNovel {
    id: string;
    name: string;
    path: string;
}
export interface ReaderChapter {
    id: string;
    name: string;
    path: string;
    progress: number;
    url?: string;
    number?: number;
}
export interface ReaderInitialContent {
    kind: 'plainText';
    text: string;
}
export interface ReaderRuntimeState {
    editing: boolean;
    infinite: boolean;
    textSelectionBlocked: boolean;
    forcedLowercase: boolean;
    menuVisible: boolean;
    immersive: boolean;
    ttsState: 'playing' | 'paused' | 'stopped' | 'starting';
    loadingChapter: boolean;
    loadingNext: boolean;
    noMoreChapters: boolean;
}
export interface ReaderConfig {
    documentId: string;
    mode: 'reader' | 'download' | 'error';
    novel: ReaderNovel;
    chapter: ReaderChapter;
    nextChapter: ReaderChapter | null;
    strings: Record<string, string>;
    autoSaveInterval: number;
    proxyEndpoint?: string;
    runtime: ReaderRuntimeState;
    chapters: ReaderChapter[];
    initialContent?: ReaderInitialContent;
    layout?: LayoutConfig;
    ui?: {
        bionicEnabled: boolean;
        ttsEnabled: boolean;
        labels: {
            tts: string;
            imageClose: string;
        };
    };
    style?: Record<string, unknown>;
    scrollTracking?: ScrollTrackingConfig;
    player?: PlayerConfig;
    markShortChapterAsRead?: boolean;
    /** Native text rules keep omitted paragraphs and highlight indices aligned with its speech queue. */
    ttsNormalizationRules?: ReadonlyArray<{
        pattern: string;
        replacement: string;
    }>;
    pluginJavaScript?: string;
    context?: Partial<ReaderContext>;
}
export declare class ReaderConfigError extends Error {
    constructor(message: string);
}
export declare function parseReaderConfig(value: unknown): ReaderConfig;
export declare function readReaderConfig(root: ParentNode): ReaderConfig;
