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
  text?: string;
};

export type ChapterBlock = {
  type?: string;
  text?: string;
  assetId?: number;
  runs?: ChapterRun[];
};

export type ChapterDocument = {
  version: number;
  blocks: ChapterBlock[];
};
