import type { ReaderMediaHost, SubtitleTrack } from "./types.ts";
export interface PreparedSubtitle {
    readonly label: string;
    readonly lang: string;
    readonly src: string;
    readonly default: boolean;
}
export declare function toWebVtt(text: string): string;
export declare class SubtitleManager {
    private readonly prepared;
    private readonly objectUrls;
    private readonly host;
    private readonly document;
    private readonly log;
    private readonly abortController;
    private disposed;
    constructor(host: ReaderMediaHost, document: Document, log: (message: string) => void);
    add(tracks: SubtitleTrack | readonly SubtitleTrack[], media?: HTMLMediaElement | null): Promise<void>;
    attach(media: HTMLMediaElement): void;
    dispose(): void;
    private append;
}
