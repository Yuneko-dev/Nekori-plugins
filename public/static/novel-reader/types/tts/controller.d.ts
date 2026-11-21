import type { ReaderHost } from '../protocol/reader-api.ts';
import type { ReaderConfig } from '../protocol/reader-config.ts';
export interface TtsController {
    refresh(): void;
    setEnabled(enabled: boolean): void;
    setLabel(label: string): void;
    dispose(): void;
}
export declare function createTtsController(root: HTMLElement, host: ReaderHost, config: ReaderConfig): TtsController;
