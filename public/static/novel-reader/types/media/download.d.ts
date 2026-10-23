import type { ReaderMediaHost, VideoDirective } from "./types.ts";
export declare class VideoDownloader {
    private readonly host;
    private readonly document;
    private readonly directive;
    private readonly endpoint;
    private readonly log;
    private readonly abortController;
    private download;
    constructor(host: ReaderMediaHost, directive: VideoDirective, endpoint: string, log: (message: string) => void);
    start(type: "m3u8" | "video-file", url: string, hlsConfig?: Record<string, unknown>): Promise<void>;
    cancel(): void;
    private downloadDirect;
    private downloadHls;
    private sourceFetch;
}
export declare function videoContainer(url: string, contentType: string | null, baseURI: string): string;
