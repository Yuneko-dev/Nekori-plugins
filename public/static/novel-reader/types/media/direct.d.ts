import type { DashConfig, VideoType } from "./types.ts";
export declare const DIRECT_PLAYERS: Readonly<Record<VideoType, "playHls" | "playDash" | "playDirect" | "playIframe">>;
export interface HlsSource {
    readonly [key: string]: unknown;
    readonly preferPlayback: "mse";
    readonly type: "application/vnd.apple.mpegurl";
    readonly engine: {
        readonly hlsJs: Record<string, unknown>;
    };
}
export declare function buildHlsSource(_url: string, config: Record<string, unknown>, debug?: boolean): HlsSource;
export declare function buildHlsDownloadConfig(config: Record<string, unknown>, debug: boolean): Record<string, unknown>;
export declare function buildDashSource(settings?: Record<string, unknown>, protectionData?: Record<string, unknown>): DashConfig;
