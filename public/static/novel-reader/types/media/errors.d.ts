import type { VideoMode } from "./types.ts";
export interface PlayerFailureHost {
    emit(name: string, payload?: unknown): void;
    fetchNative(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}
export declare function reportPlayerFailure(options: {
    readonly mode: VideoMode;
    readonly downloadEndpoint?: string;
    readonly emit: PlayerFailureHost["emit"];
    readonly fetchNative: PlayerFailureHost["fetchNative"];
}, message: string, code?: string): Promise<void>;
