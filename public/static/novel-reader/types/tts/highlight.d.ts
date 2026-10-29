import type { ReaderHost, Unsubscribe } from '../protocol/reader-api.ts';
import type { ReaderLayout } from '../protocol/reader-api.ts';
export declare function registerTtsDomCommands(host: ReaderHost, layout: ReaderLayout | null): Unsubscribe[];
export declare function clearHighlight(root: HTMLElement): void;
