import { type ReaderConfig } from '../protocol/reader-config.ts';
import type { ReaderHost } from '../protocol/reader-api.ts';
import type { NativeReaderTransport } from './session.ts';
export interface CreateRuntimeHostOptions {
    root: HTMLElement;
    config: ReaderConfig;
    transport: NativeReaderTransport;
}
export declare function createRuntimeHost({ root, config, transport }: CreateRuntimeHostOptions): ReaderHost;
