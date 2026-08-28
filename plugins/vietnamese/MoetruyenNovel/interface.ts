export type NovelAsset = {
  id: number;
  storageKey: string;
  grant: string;
};

export type NovelReaderConfig = {
  contentUrl: string;
  storageKey: string;
  grant: string;
  assetBaseUrl: string;
  assetCacheToken: number;
  assets: NovelAsset[];
};

export type ChapterRun = {
  text?: unknown;
  annotationId?: unknown;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
};

export type ChapterBlock = {
  type?: string;
  text?: string;
  assetId?: number;
  runs?: ChapterRun[];
  listStyle?: unknown;
  level?: unknown;
};

export type ChapterAnnotation = {
  id: string;
  text: string;
};

export type ChapterDocument = {
  version: number;
  blocks: ChapterBlock[];
  annotations?: ChapterAnnotation[];
};
