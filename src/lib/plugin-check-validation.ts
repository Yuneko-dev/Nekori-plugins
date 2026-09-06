import type { Plugin } from '@/types/plugin';

export type CheckStatus =
  | 'passed'
  | 'failed'
  | 'empty'
  | 'blocked'
  | 'skipped'
  | 'timeout';

export type MethodCheck = {
  method: string;
  status: CheckStatus;
  durationMs: number;
  startedAt: number;
  finishedAt: number;
  reason?: string;
  count?: number;
  args?: unknown;
  result?: unknown;
  stack?: string;
};

export function validateNovelList(value: unknown): Plugin.NovelItem[] {
  if (!Array.isArray(value)) throw new Error('expected an array of novels');
  for (const novel of value) {
    if (!isText(novel?.name) || !isText(novel?.path)) {
      throw new Error('novel items require name and path strings');
    }
  }
  return value as Plugin.NovelItem[];
}

export function validateNovel(value: unknown): Plugin.SourceNovel & {
  totalPages?: number;
  content?: string;
} {
  if (!value || typeof value !== 'object')
    throw new Error('expected a novel object');
  const novel = value as Record<string, unknown>;
  if (!isText(novel.name) || !isText(novel.path)) {
    throw new Error('novel requires name and path strings');
  }
  if ('chapters' in novel) {
    if (!Array.isArray(novel.chapters))
      throw new Error('novel chapters must be an array');
    for (const chapter of novel.chapters) {
      if (!isText(chapter?.name) || !isText(chapter?.path)) {
        throw new Error('chapter items require name and path strings');
      }
    }
  }
  if (
    'totalPages' in novel &&
    (!Number.isInteger(novel.totalPages) || Number(novel.totalPages) < 1)
  ) {
    throw new Error('totalPages must be a positive integer');
  }
  if ('content' in novel && !isText(novel.content)) {
    throw new Error('novel content must be a string');
  }
  return value as Plugin.SourceNovel & {
    totalPages?: number;
    content?: string;
  };
}

export function validatePage(value: unknown): Plugin.SourcePage {
  if (
    !value ||
    typeof value !== 'object' ||
    !Array.isArray((value as any).chapters)
  ) {
    throw new Error('page requires a chapters array');
  }
  validateNovel({
    name: 'page',
    path: 'page',
    chapters: (value as any).chapters,
  });
  return value as Plugin.SourcePage;
}

export function validateChapter(value: unknown): string {
  if (!isText(value) || !value.trim())
    throw new Error('chapter content is empty');
  if (
    /<title[^>]*>[^<]*(?:just a moment|attention required)[^<]*<\/title>|<(?:script|iframe)[^>]+(?:\/cdn-cgi\/challenge-platform\/|challenges\.cloudflare\.com)/i.test(
      value,
    )
  ) {
    throw new Error('CHECK_BLOCKED challenge HTML returned as chapter content');
  }
  return value;
}

export function classifyError(error: unknown): CheckStatus {
  const message = error instanceof Error ? error.message : String(error);
  const text = message.toLowerCase();
  if (text.includes('check_blocked')) return 'blocked';
  if (
    /captcha|cloudflare|challenge|access denied|forbidden|\b403\b|\b429\b|robot|rate limit|login required|unauthori[sz]ed|sign in/.test(
      text,
    )
  )
    return 'blocked';
  return 'failed';
}

export function errorReason(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/[\r\n]+/g, ' ').slice(0, 240) || 'operation failed';
}

const SECRET_KEY =
  /(authorization|cookie|password|passwd|secret|token|api[-_]?key|session)/i;

/** Return a small, redacted value suitable for a diagnostic report. */
export function diagnosticPreview(
  value: unknown,
  depth = 0,
  result = false,
): unknown {
  if (result && depth === 0 && typeof value === 'string')
    return { type: 'string', length: value.length };
  if (typeof value === 'string') {
    const safe = redactText(value);
    return safe.length > 160 ? `${safe.slice(0, 157)}...` : safe;
  }
  if (value === null || typeof value === 'number' || typeof value === 'boolean')
    return value;
  if (depth > 2) return '[depth limit]';
  if (Array.isArray(value))
    return value
      .slice(0, 10)
      .map(item => diagnosticPreview(item, depth + 1, result));
  if (typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(
      value as Record<string, unknown>,
    ).slice(0, 20)) {
      output[key] = SECRET_KEY.test(key)
        ? '[redacted]'
        : result &&
            /^(content|body|html)$/i.test(key) &&
            typeof item === 'string'
          ? { type: 'string', length: item.length }
          : diagnosticPreview(item, depth + 1, result);
    }
    return output;
  }
  return `[${typeof value}]`;
}

export function diagnosticStack(error: unknown): string | undefined {
  const stack = error instanceof Error ? error.stack : undefined;
  return stack
    ? redactText(stack.replace(/[\r\n]+/g, '\n')).slice(0, 2000)
    : undefined;
}

export function diagnosticErrorReason(error: unknown): string {
  return redactText(errorReason(error));
}

function redactText(value: string): string {
  return value
    .replace(/(https?:\/\/)([^\s/@]+):([^\s/@]+)@/gi, '$1[redacted]@')
    .replace(
      /([?&](?:token|key|secret|password|authorization|auth|session)[^=]*=)[^&#\s]*/gi,
      '$1[redacted]',
    )
    .replace(/(Bearer\s+)[^\s]+/gi, '$1[redacted]');
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
