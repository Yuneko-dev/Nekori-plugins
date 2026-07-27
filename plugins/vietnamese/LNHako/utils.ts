import { bytesToUtf8, Buffer } from '@libs/utils';
import { isUrlAbsolute } from '@libs/isAbsoluteUrl';
import { NodeHtmlMarkdown } from 'node-html-markdown';

export const htmlToMarkdown = (html: string): string => {
  if (html.length === 0) {
    return '';
  }
  return NodeHtmlMarkdown.translate(html, {
    blockElements: [
      // Metadata
      'head',
      'title',
      'meta',
      'base',
      'link',

      // Script
      'script',
      'noscript',

      // Style
      'style',

      // Embedded content
      'iframe',
      'object',
      'embed',
      'applet',

      // SVG / Canvas
      'svg',
      'canvas',

      // Media source
      'source',
      'track',

      // Template
      'template',

      // Param
      'param',

      // Media
      'audio',
      'video',

      // Other
      'wbr',
    ],
  });
};

export function urlToPath(url: string): string {
  if (!isUrlAbsolute(url)) {
    return url;
  } else {
    const parsed = new URL(url);
    return url.slice(parsed.origin.length);
  }
}

export const decodeXorChunk = (encoded: string, key: string): string => {
  const input = Buffer.from(encoded, 'base64');
  if (!key) {
    return bytesToUtf8(input);
  }

  const output: number[] = [];
  for (let i = 0; i < input.length; i++) {
    output.push(input[i] ^ key.charCodeAt(i % key.length));
  }
  return bytesToUtf8(new Uint8Array(output));
};

export const parseProtectedChunks = (raw: string): string[] => {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === 'string');
    }
  } catch {
    // fallback to single-chunk payload
  }

  return [raw];
};

export const decodeProtectedContent = (
  mode: string,
  key: string,
  chunks: string[],
): string => {
  if (!chunks.length) {
    return '';
  }

  const sortedChunks = [...chunks].sort((a, b) => {
    const ai = Number.parseInt(a.substring(0, 4), 10);
    const bi = Number.parseInt(b.substring(0, 4), 10);
    if (Number.isNaN(ai) || Number.isNaN(bi)) {
      return 0;
    }
    return ai - bi;
  });

  let content = '';

  for (const chunk of sortedChunks) {
    const payload = /^\d{4}/.test(chunk) ? chunk.substring(4) : chunk;

    if (mode === 'xor_shuffle') {
      content += decodeXorChunk(payload, key);
    } else if (mode === 'base64_reverse') {
      content += Buffer.from(
        payload.split('').reverse().join(''),
        'base64',
      ).toString('utf-8');
    } else {
      content += Buffer.from(payload, 'base64').toString('utf-8');
    }
  }

  return content.replace(
    /\[note(\d+)]/gi,
    '<span id="anchor-note$1" class="note-icon none-print inline note-tooltip" data-tooltip-content="#note$1 .note-content" data-note-id="note$1"><i class="fas fa-sticky-note"></i></span><a id="anchor-note$1" class="inline-print none" href="#note$1">[note]</a>',
  );
};

export const parseDmyToIso = (value: string): string | undefined => {
  const matched = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!matched) {
    return undefined;
  }

  const day = Number(matched[1]);
  const month = Number(matched[2]) - 1;
  const year = Number(matched[3]);
  const date = new Date(year, month, day);

  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return date.toISOString();
};
