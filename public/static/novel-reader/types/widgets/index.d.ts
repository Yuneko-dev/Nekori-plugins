import type { ReaderConfig } from '../protocol/reader-config.ts';
import type { ReaderHost, ReaderLayout } from '../protocol/reader-api.ts';
export { installGestureOwnership } from '../interactions/gestures.ts';
export interface CreateWidgetsOptions {
    root: HTMLElement;
    host: ReaderHost;
    config: ReaderConfig;
    layout: ReaderLayout | null;
}
export interface WidgetsController {
    refresh(): void;
    dispose(): void;
}
export declare function createWidgets({ root, host, config, layout }: CreateWidgetsOptions): WidgetsController;
