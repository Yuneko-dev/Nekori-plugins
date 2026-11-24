export type Spread = 'single' | 'double';
export type Direction = 'ltr' | 'rtl';
export interface ChapterLeafRange {
    readonly chapterId: string;
    readonly startLeaf: number;
    readonly leafCount: number;
}
export interface LeafRange {
    readonly firstLeaf: number;
    readonly lastLeaf: number;
}
export declare function leavesPerUnit(spread: Spread): 1 | 2;
export declare function unitCount(leafCount: number, spread: Spread): number;
export declare function unitFromOffset(offset: number, viewport: number, count: number): number;
export declare function unitFromProgress(progress: number, count: number): number;
export declare function progressForUnit(unit: number, count: number): number;
export declare function leafRange(unit: number, leafCount: number, spread: Spread): LeafRange;
export declare function logicalOffset(scrollLeft: number, direction: Direction): number;
export declare function physicalOffset(offset: number, direction: Direction): number;
export declare function chapterForLeaf<T extends ChapterLeafRange>(chapters: readonly T[], leaf: number): T | null;
