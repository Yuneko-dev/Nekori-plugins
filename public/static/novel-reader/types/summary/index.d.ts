import type { ReaderHost, Unsubscribe } from '../protocol/reader-api.ts';
import type { ReaderLayout } from '../protocol/reader-api.ts';
export type SummaryState = 'loading' | 'ready' | 'failed' | 'cancelled';
export declare function registerSummaryCommands(host: ReaderHost, layout: ReaderLayout | null): Unsubscribe[];
