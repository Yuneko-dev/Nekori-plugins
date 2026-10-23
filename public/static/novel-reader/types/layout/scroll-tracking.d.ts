import type { LayoutHost, ScrollTrackingConfig } from './types.ts';
export interface ScrollTrackingController {
    configure(config: ScrollTrackingConfig): void;
    setLoadingNext(loading: boolean): void;
    setNoMoreChapters(value: boolean): void;
    resetChapterTracking(): void;
    updateChapterBoundaries(): void;
    dispose(): void;
}
export interface ScrollTrackingOptions {
    readonly root: HTMLElement;
    readonly host: LayoutHost;
    readonly isPaged?: () => boolean;
}
export declare function createScrollTracking({ root, host, isPaged }: ScrollTrackingOptions): ScrollTrackingController;
