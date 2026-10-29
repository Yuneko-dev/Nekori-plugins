import { type MeasuredChapter } from './page-map.ts';
import type { LayoutConfig, LayoutController } from './types.ts';
export interface RestorePoint {
    readonly chapterId: string;
    readonly progress: number;
    readonly unitIndex?: number;
}
export interface LayoutTransitions {
    silent: boolean;
    restore: RestorePoint | null;
    silentSourceUnit: number | null;
    lastChapterProgress: number | null;
}
export interface LayoutCommandOptions {
    readonly root: HTMLElement;
    readonly getConfig: () => LayoutConfig;
    readonly getPageMap: () => readonly MeasuredChapter[];
    readonly getTotalLeaves: () => number;
    readonly getCurrentUnit: () => number;
    readonly perUnit: () => 1 | 2;
    readonly viewport: () => number;
    readonly scrollToUnit: (unit: number, behavior?: ScrollBehavior) => void;
    readonly requestNext: (atBoundary: boolean) => void;
    readonly scheduleReflow: () => void;
    readonly emitPosition: (persist: boolean) => void;
    readonly onProgress: (progress: number) => void;
    readonly transitions: LayoutTransitions;
}
type LayoutCommands = Pick<LayoutController, 'moveBy' | 'seekUnit' | 'seekPercent' | 'revealElement' | 'reflow' | 'prepareSilentTurn' | 'finishSilentTurn'>;
export declare function createLayoutCommands(options: LayoutCommandOptions): LayoutCommands;
export {};
