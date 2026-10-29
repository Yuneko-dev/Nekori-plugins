import type { ReaderMediaHost, VideoDirective } from "./types.ts";
export interface PlayerSkinControls {
    readonly resume: HTMLDivElement | null;
    readonly next: HTMLDivElement | null;
}
export interface PlayerSkinCallbacks {
    readonly onNext: () => void;
    readonly onDismissNext: () => void;
}
export declare function decoratePlayerSkin(skin: HTMLElement, media: HTMLMediaElement, document: Document, host: ReaderMediaHost, config: VideoDirective, callbacks: PlayerSkinCallbacks): PlayerSkinControls;
export declare function stripUnsupportedControls(skin: HTMLElement): void;
