import type { ReaderConfig } from '../protocol/reader-config.ts';
import type { ReaderApi, ReaderHost } from '../protocol/reader-api.ts';
export interface CreateReaderOptions {
    root: HTMLElement;
    host: ReaderHost;
    config: ReaderConfig;
}
export declare function createReader({ root, host, config }: CreateReaderOptions): ReaderApi;
