import type { LayoutHost } from './types.ts';
export interface ObserveShortChapterOptions {
    readonly host: LayoutHost & {
        readonly root: HTMLElement;
    };
    readonly enabled: boolean;
}
/** Marks an initially non-scrollable, non-paged chapter after its first layout settles. */
export declare function observeShortChapter({ host, enabled }: ObserveShortChapterOptions): () => void;
