import type { ReaderHost, Unsubscribe } from '../protocol/reader-api.ts';
/** Install during document boot, before plugin scripts can stop propagation on owned controls. */
export declare function installGestureOwnership(host: ReaderHost): Unsubscribe;
