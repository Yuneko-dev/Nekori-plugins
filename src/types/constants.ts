export const NovelStatus = {
  Unknown: 'Unknown',
  Ongoing: 'Ongoing',
  Completed: 'Completed',
  Licensed: 'Licensed',
  PublishingFinished: 'Publishing Finished',
  Cancelled: 'Cancelled',
  OnHiatus: 'On Hiatus',
  STUB: 'STUB',
  Inactive: 'Inactive',
} as const;

export const ContentWarning = {
  UNSPECIFIED: 0,
  SAFE: 1,
  MIXED: 2,
  NSFW: 3,
} as const;

export type ContentWarning =
  (typeof ContentWarning)[keyof typeof ContentWarning];

export const ContentType = {
  NOVEL: 'novel',
  IMAGE: 'image',
  VIDEO: 'video',
  MIXED: 'mixed',
} as const;

export type ContentType = (typeof ContentType)[keyof typeof ContentType];

export const defaultCover =
  'https://github.com/Yuneko-dev/Nekori-plugins/blob/master/public/static/coverNotAvailable.webp?raw=true';
