import type { HlsEngine } from "./hls-types.ts";
import type { DownloadSink } from "./download-sink.ts";
export declare function watchHlsActivity(view: Window, hls: HlsEngine, sink: DownloadSink): () => void;
