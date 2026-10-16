export interface ChapterBoundary {
    readonly chapterId: string;
    readonly startOffset: number;
    readonly height: number;
}
export interface VerticalProgress {
    readonly progress: number;
    readonly chapterProgress: number;
    readonly boundaryIndex: number;
    readonly chapterId: string | null;
    readonly isLast: boolean;
}
export declare function computeVerticalProgress(scrollTop: number, documentHeight: number, viewportHeight: number, boundaries: readonly ChapterBoundary[], enabled: boolean, doneThreshold: number): VerticalProgress;
export declare function shouldLoadNextChapter(state: VerticalProgress, boundaries: readonly ChapterBoundary[], threshold: number): boolean;
export declare function boundariesFromOffsets(chapterIds: readonly string[], offsets: readonly number[], documentEnd: number): ChapterBoundary[];
