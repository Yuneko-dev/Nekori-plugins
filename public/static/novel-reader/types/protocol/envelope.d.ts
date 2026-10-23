export declare const READER_PROTOCOL_VERSION: 1;
export type ReaderMessageKind = 'boot' | 'ready' | 'command' | 'result' | 'event' | 'cancel';
export interface ReaderErrorPayload {
    code: string;
    message: string;
}
interface BaseEnvelope {
    protocolVersion: typeof READER_PROTOCOL_VERSION;
    documentId: string;
}
export interface ReaderLifecycleEnvelope extends BaseEnvelope {
    kind: 'boot' | 'ready';
    payload?: unknown;
}
export interface ReaderCommandEnvelope extends BaseEnvelope {
    kind: 'command';
    requestId: string;
    method: string;
    payload?: unknown;
}
export interface ReaderResultEnvelope extends BaseEnvelope {
    kind: 'result';
    requestId: string;
    payload?: unknown;
    error?: ReaderErrorPayload;
}
export interface ReaderEventEnvelope extends BaseEnvelope {
    kind: 'event';
    method: string;
    payload?: unknown;
}
export interface ReaderCancelEnvelope extends BaseEnvelope {
    kind: 'cancel';
    requestId: string;
}
export type ReaderEnvelope = ReaderLifecycleEnvelope | ReaderCommandEnvelope | ReaderResultEnvelope | ReaderEventEnvelope | ReaderCancelEnvelope;
export declare class ReaderProtocolError extends Error {
    constructor(message: string);
}
export declare function parseEnvelope(value: unknown, expectedDocumentId: string): ReaderEnvelope;
export declare function isRecord(value: unknown): value is Record<string, unknown>;
export {};
