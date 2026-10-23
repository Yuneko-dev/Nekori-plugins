export declare const PLAYER_TAGS: {
    readonly live: {
        readonly player: "live-video-player";
        readonly skin: "live-video-skin";
    };
    readonly vod: {
        readonly player: "video-player";
        readonly skin: "video-skin";
    };
};
export declare const ELEMENT_DEFINE_TIMEOUT_MS = 10000;
export declare function awaitPlayerElements(registry: CustomElementRegistry, tags: readonly string[], timeoutMs?: number): Promise<void>;
