import type { ReaderConfig } from '../protocol/reader-config.ts';
import type { ReaderCommandHandler } from '../protocol/reader-api.ts';
export interface NativeReaderTransport {
    postMessage(message: string): void;
    onmessage: ((event: {
        data: unknown;
    }) => void) | null;
}
export interface RuntimeSession {
    readonly pendingRequestCount: number;
    readonly lastProtocolError: Error | null;
    boot(): void;
    start(initializers?: Array<() => void | Promise<void>>): Promise<void>;
    emit(name: string, payload?: unknown): void;
    request(name: string, payload?: unknown, signal?: AbortSignal): Promise<unknown>;
    onEvent(name: string, listener: (payload: unknown) => void): () => void;
    registerCommand(name: string, handler: ReaderCommandHandler): () => void;
    dispose(): void;
}
export declare function createRuntimeSession(config: Pick<ReaderConfig, 'documentId'>, transport: NativeReaderTransport): RuntimeSession;
