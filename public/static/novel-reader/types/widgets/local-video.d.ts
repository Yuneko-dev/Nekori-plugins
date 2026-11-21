import type { ReaderHost, Unsubscribe } from '../protocol/reader-api.ts';
/** The host opens downloaded video files; the page owns only its replay control. */
export declare function installLocalVideoControl(host: ReaderHost): Unsubscribe;
