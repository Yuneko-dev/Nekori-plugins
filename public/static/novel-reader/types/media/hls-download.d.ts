import { DownloadSink } from "./download-sink.ts";
import type { HlsConstructor } from "./hls-types.ts";
export type { HlsConstructor, HlsEngine, HlsEventData, HlsFragment, HlsInitSegment } from "./hls-types.ts";
export declare function downloadHls(options: {
    readonly Hls: HlsConstructor;
    readonly document: Document;
    readonly sink: DownloadSink;
    readonly url: string;
    readonly customConfig: Record<string, unknown>;
    readonly debug: boolean;
    readonly signal?: AbortSignal;
    readonly log: (message: string) => void;
}): Promise<void>;
