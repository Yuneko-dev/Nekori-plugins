import type { ChapterLeafRange } from './math.ts';
export interface MeasuredChapter extends ChapterLeafRange {
    readonly element: HTMLElement;
}
export declare function leafForRect(rect: DOMRect, hostRect: DOMRect, offset: number, leafSize: number, vertical: boolean, direction: 'ltr' | 'rtl'): number;
export declare function measureChapterMap(root: HTMLElement, offset: number, leafSize: number, vertical: boolean, direction: 'ltr' | 'rtl'): MeasuredChapter[];
export declare function rebuildBlankLeaves(root: HTMLElement, chapters: readonly MeasuredChapter[], double: boolean): void;
