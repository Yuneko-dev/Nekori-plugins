import type { ReaderHost } from '../protocol/reader-api.ts';
export declare function createReaderBackground(host: ReaderHost): {
    apply(value: unknown): void;
    dispose(): void;
};
