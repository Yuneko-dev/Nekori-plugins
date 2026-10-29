import type { ReaderHost, ReaderLayout } from '../protocol/reader-api.ts';
export interface InlineFeedback {
    show(payload: unknown): void;
    clear(): void;
    dispose(): void;
}
export declare function createInlineFeedback(root: HTMLElement, host: ReaderHost, layout: ReaderLayout | null): InlineFeedback;
