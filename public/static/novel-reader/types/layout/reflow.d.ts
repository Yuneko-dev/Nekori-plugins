import { type MeasuredChapter } from './page-map.ts';
import type { LayoutConfig } from './types.ts';
import type { RestorePoint } from './commands.ts';
export interface ReflowOptions {
    readonly root: HTMLElement;
    readonly config: LayoutConfig;
    readonly pageMap: readonly MeasuredChapter[];
    readonly currentUnit: number;
    readonly perUnit: 1 | 2;
    readonly viewport: number;
    readonly extent: () => number;
    readonly lastProgress: number | null;
    readonly restore: RestorePoint | null;
    readonly measure: () => MeasuredChapter[];
    readonly scrollToUnit: (unit: number) => void;
    readonly setPageMap: (chapters: MeasuredChapter[]) => void;
    readonly setTotalLeaves: (count: number) => void;
    readonly clearRestore: () => void;
    readonly clearLastProgress: () => void;
    readonly resetPositionKey: () => void;
    readonly emitPosition: (persist: boolean) => void;
}
export declare function performReflow(options: ReflowOptions): void;
