import { type ChapterMetadata, type ChapterNodes } from './metadata.ts';
export declare function createChapterElements(document: Document, chapter: ChapterMetadata): ChapterNodes;
export interface PrependOptions {
    readonly scrollContainer?: HTMLElement;
    readonly anchor?: Element | null;
}
export declare function appendChapter(root: HTMLElement, nodes: ChapterNodes): void;
/** Inserts before existing chapters and compensates for document scroll anchoring. */
export declare function prependChapter(root: HTMLElement, nodes: ChapterNodes, options?: PrependOptions): void;
export declare function removeChapter(root: HTMLElement, chapterId: string): boolean;
/** Plain text is inserted only through Text nodes, so source text cannot become markup. */
export declare function replaceChapterText(document: Document, chapter: HTMLElement, text: string): void;
/** Preserve HTML chapter semantics, including the current WebView setHTMLUnsafe path. */
export declare function setChapterHtml(chapter: HTMLElement, html: string): void;
export type ProcessedContent = {
    readonly kind: 'plainText';
    readonly text: string;
} | {
    readonly kind: 'html';
    readonly html: string;
};
/** Applies runtime content with plain text kept inert and HTML kept in the HTML path. */
export declare function applyProcessedContent(document: Document, chapter: HTMLElement, content: ProcessedContent): void;
