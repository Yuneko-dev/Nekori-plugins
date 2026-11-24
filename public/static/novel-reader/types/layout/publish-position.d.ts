import type { MeasuredChapter } from './page-map.ts';
import type { LayoutConfig, LayoutHost, LayoutPosition } from './types.ts';
export interface PositionPublisherOptions {
    readonly host: LayoutHost;
    readonly getConfig: () => LayoutConfig;
    readonly getPageMap: () => readonly MeasuredChapter[];
    readonly getCurrentUnit: () => number;
    readonly perUnit: () => 1 | 2;
    readonly isSilent: () => boolean;
    readonly requestNext: (atBoundary: boolean) => void;
    readonly onProgress: (progress: number) => void;
}
export interface PositionPublisher {
    readonly position: LayoutPosition | null;
    readonly lastProgress: number | null;
    emitPosition(persist: boolean): void;
    setLastProgress(progress: number | null): void;
    resetPositionKey(): void;
}
export declare function createPositionPublisher(options: PositionPublisherOptions): PositionPublisher;
