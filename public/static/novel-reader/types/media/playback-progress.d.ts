import { type StringStorage } from "./progress.ts";
import type { ReaderMediaHost, VideoDirective } from "./types.ts";
export declare class PlaybackProgress {
    private readonly host;
    private readonly directive;
    private readonly storage;
    private readonly onResume;
    private readonly onDismissed;
    private readonly log;
    private readonly removeListeners;
    private hasSeekedInitial;
    private lastSaveTime;
    constructor(options: {
        host: ReaderMediaHost;
        directive: VideoDirective;
        storage: StringStorage | null;
        onResume: (video: HTMLMediaElement, seconds: number) => void;
        onDismissed: () => boolean;
        log: (message: string) => void;
    });
    attach(video: HTMLMediaElement, popup: HTMLElement | null, fail: (message: string) => void): void;
    dispose(): void;
    private listen;
}
