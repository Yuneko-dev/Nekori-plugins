export interface DownloadSinkHost {
    fetchNative(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
    emit(name: string, payload?: unknown): void;
}
export declare class DownloadSink {
    private readonly endpoint;
    private readonly host;
    private readonly signal;
    constructor(host: DownloadSinkHost, endpoint: string, signal?: AbortSignal);
    start(task: () => Promise<void>, errorCode?: string): Promise<void>;
    request(route: string, init: RequestInit, label?: string, useSignal?: boolean): Promise<Response>;
    delete(): Promise<void>;
    ready(container: string): Promise<void>;
    put(bytes: Uint8Array): Promise<void>;
    commit(): Promise<void>;
    progress(current: number, total: number): void;
    activity(): void;
}
export declare function writeResponseToSink(response: Response, sink: DownloadSink, totalBytes: number, signal?: AbortSignal): Promise<number>;
