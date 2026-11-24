import type { ReaderMediaHost, VideoDirective } from "./types.ts";
export { awaitPlayerElements, ELEMENT_DEFINE_TIMEOUT_MS, PLAYER_TAGS } from "./player-elements.ts";
export { NEXT_UP_WINDOW_SECONDS, updateNextUp } from "./player-timing.ts";
export interface PlayerDom {
    readonly resumeOverlay: HTMLDivElement | null;
    readonly nextUpPopup: HTMLDivElement | null;
    readonly root: HTMLElement;
    readonly media: HTMLMediaElement;
    readonly skin: HTMLElement;
}
export interface PlayerDomCallbacks {
    readonly onNext: () => void;
    readonly onDismissNext: () => void;
}
export declare class PlayerDomFactory {
    private readonly document;
    private readonly host;
    private readonly config;
    private readonly callbacks;
    constructor(host: ReaderMediaHost, config: VideoDirective, callbacks: PlayerDomCallbacks);
    createContainer(): HTMLDivElement;
    build(mediaTag: string, live: boolean): Promise<PlayerDom>;
}
export { stripUnsupportedControls } from "./player-controls.ts";
