/// <reference types="webview" />

const SITE = 'https://cosplaytele.com';

type EmbedPlayerWindow = Window & {
  LNReaderPlayer?: {
    log: (msg: string) => void;
    playHls: (url: string, customHlsConfig?: Record<string, any>) => void;
    playIframe: (url: string) => void;
    playDirect: (url: string) => void;
  };
  reader?: {
    // eslint-disable-next-line
    fetch: (url: string, init?: RequestInit) => Promise<Response>;
  };
};

function log(msg: string) {
  const w = window as EmbedPlayerWindow;
  w.LNReaderPlayer?.log(`[CosplayTele] ${msg}`);
}

async function fetchText(url: string, referer: string): Promise<string> {
  const w = window as EmbedPlayerWindow;
  // eslint-disable-next-line
  const init: RequestInit = {
    headers: {
      Referer: referer,
      'User-Agent': navigator.userAgent,
    },
  };
  if (w.reader?.fetch) {
    const res = await w.reader.fetch(url, init);
    return res.text();
  }
  const res = await fetch(url, init);
  return res.text();
}

function extractM3u8FromHtml(html: string): string | null {
  const patterns = [
    /file:\s*['"]([^'"]+\.m3u8[^'"]*)['"]/i,
    /['"](https?:\/\/[^'"]+\.m3u8[^'"]*)['"]/i,
    /(https?:\/\/[^\s"'<>]+\/index\.m3u8[^\s"'<>]*)/i,
    /(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return m[1].replace(/\\u002F/g, '/');
  }
  return null;
}

function extractEncryptedPayload(html: string): {
  ciphertext: string;
  key: string;
} | null {
  const payload = html.match(/const\s+videoURL\s*=\s*['"]([^'"]+)['"]/);
  const key = html.match(
    /decryptLink\s*\(\s*videoURL\s*,\s*['"]([0-9a-f]{32})['"]\s*\)/i,
  );
  if (!payload?.[1] || !key?.[1]) return null;
  return { ciphertext: payload[1], key: key[1] };
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** cossora.stream embed: AES-CBC (CryptoJS-compatible) with IV prepended to ciphertext */
async function decryptCossoraLink(
  encryptedB64: string,
  keyUtf8: string,
): Promise<string | null> {
  try {
    const raw = base64ToBytes(encryptedB64);
    if (raw.length < 32) return null;
    const iv = raw.slice(0, 16);
    const data = raw.slice(16);
    const keyBytes = new TextEncoder().encode(keyUtf8);
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'AES-CBC' },
      false,
      ['decrypt'],
    );
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-CBC', iv },
      cryptoKey,
      data,
    );
    const url = new TextDecoder().decode(plain).trim();
    return url || null;
  } catch {
    return null;
  }
}

async function resolveEmbedM3u8(embedUrl: string): Promise<string | null> {
  const html = await fetchText(embedUrl, `${SITE}/`);
  const direct = extractM3u8FromHtml(html);
  if (direct) return direct;

  const encrypted = extractEncryptedPayload(html);
  if (encrypted) {
    const decrypted = await decryptCossoraLink(
      encrypted.ciphertext,
      encrypted.key,
    );
    if (decrypted && /\.m3u8/i.test(decrypted)) return decrypted;
    if (decrypted && /^https?:\/\//i.test(decrypted)) return decrypted;
  }

  return null;
}

/**
 * Fetch m3u8 sub-playlist via reader.fetch to bypass CORS,
 * create blob URL, and use custom loader for segments.
 * Skips the master m3u8 — passes the media playlist directly.
 */
async function playHlsViaReader(
  m3u8Url: string,
  embedUrl: string,
): Promise<void> {
  const w = window as EmbedPlayerWindow;
  if (!w.LNReaderPlayer) return;

  const referer = new URL(embedUrl).origin + '/';

  // Fetch the master m3u8 to find the sub-playlist URL
  const masterText = await fetchText(m3u8Url, referer);
  log(`Master m3u8 length: ${masterText.length}`);

  // Parse sub-playlist URL from master
  let subUrl = '';
  const lines = masterText.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && /^https?:\/\//i.test(trimmed)) {
      subUrl = trimmed;
      break;
    }
  }

  if (!subUrl) {
    log('No sub-playlist found in master, trying master as media playlist');
    // Master might already be a media playlist — use it directly
    await playMediaPlaylist(masterText, m3u8Url, referer);
    return;
  }

  // Fetch the sub-playlist (media playlist) via reader.fetch
  const subText = await fetchText(subUrl, referer);
  log(`Sub-playlist length: ${subText.length}`);

  await playMediaPlaylist(subText, subUrl, referer);
}

/**
 * Take a media playlist text, rewrite relative URIs to absolute,
 * create a blob URL, and start playback with CORS-bypassing loaders.
 */
async function playMediaPlaylist(
  playlistText: string,
  playlistUrl: string,
  referer: string,
): Promise<void> {
  const w = window as EmbedPlayerWindow;
  if (!w.LNReaderPlayer) return;

  const subUrlObj = new URL(playlistUrl);
  const subBase =
    subUrlObj.origin + subUrlObj.pathname.replace(/\/[^/]*$/, '/');

  // Step 1: Pre-fetch AES-128 key(s) via reader.fetch → blob URLs
  // hls.js loads keys through its own internal loader (not fLoader),
  // so we must replace key URIs with blob URLs to avoid CORS.
  const keyBlobMap = new Map<string, string>();
  // @ts-expect-error
  for (const [, rawUri] of playlistText.matchAll(/URI="([^"]+)"/gi)) {
    if (keyBlobMap.has(rawUri)) continue;
    const absoluteKeyUrl = /^https?:\/\//i.test(rawUri)
      ? rawUri
      : subBase + rawUri;
    try {
      const res = await window.reader?.fetch(absoluteKeyUrl, {
        headers: { Referer: referer },
      });
      if (res?.ok) {
        const buf = await res.arrayBuffer();
        const blobUrl = URL.createObjectURL(new Blob([buf]));
        keyBlobMap.set(rawUri, blobUrl);
        log(`Key fetched → blob: ${blobUrl.substring(0, 50)}...`);
      }
    } catch (err) {
      log(`Key fetch failed: ${(err as Error).message}`);
    }
  }

  // Step 2: Replace key URIs with blob URLs in playlist text
  let rewritten = playlistText;
  // @ts-expect-error
  for (const [rawUri, blobUrl] of keyBlobMap) {
    rewritten = rewritten.replace(rawUri, blobUrl);
  }

  // Create blob URL for the media playlist
  const blobUrl = URL.createObjectURL(
    new Blob([rewritten], { type: 'application/vnd.apple.mpegurl' }),
  );
  log(`Media playlist blob URL: ${blobUrl.substring(0, 50)}...`);

  // Custom loader that fetches via reader.fetch to bypass CORS
  class ProxyLoader {
    _config: any;
    _controller: AbortController | null = null;
    context: any = null;
    stats = {
      aborted: false,
      loaded: 0,
      retry: 0,
      total: 0,
      chunkCount: 0,
      bwEstimate: 0,
      loading: { start: 0, first: 0, end: 0 },
      parsing: { start: 0, end: 0 },
      buffering: { start: 0, first: 0, end: 0 },
    };

    constructor(config: any) {
      this._config = config;
    }

    destroy() {
      this.abort();
    }

    abort() {
      this._controller?.abort();
      this._controller = null;
    }

    load(ctx: any, _cfg: any, cbs: any) {
      this.context = ctx;
      this.stats.loading.start = performance.now();

      window.reader
        ?.fetch(ctx.url, {
          method: 'GET',
          headers: { Referer: referer },
          referrer: referer,
        })
        .then(resp => {
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          this.stats.loading.first = performance.now();
          return resp.arrayBuffer();
        })
        .then(buf => {
          this.stats.loading.end = performance.now();
          this.stats.loaded = buf.byteLength;
          this.stats.total = buf.byteLength;
          cbs.onSuccess({ data: buf }, this.stats, ctx, null);
        })
        .catch(err => {
          if (err.name === 'AbortError') return;
          this.stats.loading.end = performance.now();
          cbs.onError({ code: 0, text: err.message }, ctx, null, this.stats);
        });
    }

    getResponseData(xhr: any) {
      return xhr.response;
    }
  }

  w.LNReaderPlayer.playHls(blobUrl, {
    fLoader: ProxyLoader,
  });

  log('HLS player started with CORS-bypassing loaders');
}

(async function main() {
  const w = window as EmbedPlayerWindow;
  if (!w.LNReaderPlayer) return;

  const root = document.getElementById('cosplaytele-player');
  if (!root) {
    log('Missing player root.');
    return;
  }

  let embeds: string[] = [];
  try {
    const raw = root.getAttribute('data-embeds') || '[]';
    embeds = JSON.parse(raw) as string[];
  } catch (e) {
    log(`Invalid embed list: ${(e as Error).message}`);
    return;
  }

  if (!embeds.length) {
    log('No embed URLs.');
    return;
  }

  for (let i = 0; i < embeds.length; i++) {
    const embed = embeds[i];
    log(`Resolving embed ${i + 1}/${embeds.length}...`);
    try {
      const m3u8Url = await resolveEmbedM3u8(embed);
      if (m3u8Url) {
        log(`Playing HLS: ${m3u8Url}`);
        await playHlsViaReader(m3u8Url, embed);
        return;
      }
      log(`Fallback iframe: ${embed}`);
      w.LNReaderPlayer.playIframe(embed);
      return;
    } catch (err) {
      log(`Embed failed: ${(err as Error).message}`);
    }
  }

  log('All video sources failed.');
})();
