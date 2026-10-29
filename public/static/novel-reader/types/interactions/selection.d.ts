import type { ReaderHost, Unsubscribe } from '../protocol/reader-api.ts';
export declare function registerSelectionCommands(host: ReaderHost): Unsubscribe[];
export declare function findChapter(root: ParentNode, chapterId: string): HTMLElement | null;
