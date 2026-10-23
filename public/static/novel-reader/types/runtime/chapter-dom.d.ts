import type { ReaderHost, ReaderLayout } from '../protocol/reader-api.ts';
import type { ScrollTrackingController } from '../layout/index.ts';
import type { ReaderConfig } from '../protocol/reader-config.ts';
export declare function initializeInitialContent(root: HTMLElement, config: ReaderConfig): void;
export declare function appendChapter(host: ReaderHost, root: HTMLElement, payload: unknown, layout: ReaderLayout, tracking: ScrollTrackingController | null, refreshWidgets: (() => void) | null): boolean;
export declare function removeChapter(root: HTMLElement, payload: unknown, layout: ReaderLayout, tracking: ScrollTrackingController | null, refreshWidgets: (() => void) | null): boolean;
