import type { ReaderHost, Unsubscribe } from '../protocol/reader-api.ts';
/** Execute source-owned customJS bytes as a document script, separate from native commands. */
export declare function executeSourceScript(code: string, document: Document): void;
export declare function registerSnippetCommand(host: ReaderHost): Unsubscribe;
