import { load } from 'cheerio';

import type { Plugin } from '@/types/plugin';
type ChapterContent = Plugin.ChapterContent;

/** Normalize legacy LNReader strings upward into the official Nekori chapter contract. */
export function normalizeChapterContent(
  value: unknown,
  isNekoriPlugin?: boolean,
): ChapterContent {
  if (typeof value === 'string' && isNekoriPlugin !== true) {
    const $ = load(value);
    const type =
      $('meta[name="lnreader-chapter-type"]').attr('content') === 'video'
        ? 'video'
        : 'novel';
    return {
      state: 'ready',
      type,
      html: value,
      noCache: $('meta#no-cache-marker').length > 0,
      noPrefetch: $('meta#no-prefetch-marker').length > 0,
    };
  }
  if (isNekoriPlugin === false || !value || typeof value !== 'object')
    throw new Error('Invalid chapter response');
  const chapter = value as ChapterContent & { checkpointMessage?: string };
  if (
    (chapter.state !== 'ready' && chapter.state !== 'checkpoint') ||
    typeof chapter.type !== 'string' ||
    !['novel', 'mixed', 'image', 'video'].includes(chapter.type) ||
    typeof chapter.html !== 'string' ||
    (chapter.noCache !== undefined && typeof chapter.noCache !== 'boolean') ||
    (chapter.noPrefetch !== undefined &&
      typeof chapter.noPrefetch !== 'boolean') ||
    (chapter.checkpointMessage !== undefined &&
      typeof chapter.checkpointMessage !== 'string')
  ) {
    throw new Error('Invalid chapter response');
  }
  return chapter.state === 'checkpoint'
    ? { ...chapter, noCache: true, noPrefetch: true }
    : chapter;
}

export function requireReadyChapter(
  value: unknown,
  isNekoriPlugin?: boolean,
): string {
  const chapter = normalizeChapterContent(value, isNekoriPlugin);
  if (chapter.state === 'checkpoint')
    throw new Error(
      'CHECK_BLOCKED ' +
        (chapter.checkpointMessage || 'Chapter requires interaction'),
    );
  return chapter.html;
}
