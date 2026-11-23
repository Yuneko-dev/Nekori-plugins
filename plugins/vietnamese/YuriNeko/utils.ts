import { Buffer } from '@nekori/utils';

const UUID_REGEX =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Extract the manga UUID embedded in a novel/manga detail page. */
export function extractMangaId(html: string): string | null {
  const byCover = html.match(/covers\/([0-9a-f-]{36})\//i);
  if (byCover?.[1]) return byCover[1];

  const byApi = html.match(/mangas\/([0-9a-f-]{36})/i);
  if (byApi?.[1]) return byApi[1];

  return html.match(UUID_REGEX)?.[0] ?? null;
}

/**
 * Extract signed `/api/img?...` URLs from a chapter page (RSC payload).
 * URLs appear as `"url":"/api/img?d=...&s=..."` with escapes.
 */
export function extractSignedImageUrls(html: string): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];
  const regex = /\/api\/img\?d=([^"\\\s&]+?)(?:&|\\u0026)s=([^"\\\s&]+)/g;
  for (const match of html.matchAll(regex)) {
    const url = `/api/img?d=${match[1]}&s=${match[2]}`;
    if (!seen.has(url)) {
      seen.add(url);
      urls.push(url);
    }
  }
  return urls;
}

/** Extract the XOR hex key from a signed /api/img `d` param. */
export function extractImageKey(signedUrl: string): string | null {
  const d = new URLSearchParams(signedUrl.split('?')[1] ?? '').get('d');
  if (!d) return null;
  const decoded = b64UrlDecode(d);
  const key = decoded.split('|')[1];
  return key && /^[0-9a-f]+$/i.test(key) ? key : null;
}

export function b64UrlDecode(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return Buffer.from(padded, 'base64').toString('utf-8');
}

export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
