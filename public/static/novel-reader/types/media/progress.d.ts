export declare const VIDEO_FRACTION_KEY = "__tsundoku_video_fraction";
export type FractionMap = Record<string, number>;
export interface StringStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}
export declare function readFractions(storage: StringStorage): FractionMap;
export declare function writeFraction(storage: StringStorage, path: string, fraction: number): void;
export declare function combineResumeProgress(progress: number, path: string, fractions: FractionMap): number;
export declare function formatClock(seconds: number): string;
