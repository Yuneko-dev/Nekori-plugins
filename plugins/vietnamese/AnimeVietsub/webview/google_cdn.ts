import { b64urlDecode, descramble, stringUnshuffle } from './crypto';
import { nativeFetch } from './fetch';
import type { ResolvedMedia } from './types';
import { cleanupIframe, debugLog } from './utils';

/**
 * Decrypt googleapiscdn player playlists into playable HLS sources.
 *
 * 1) Join split avsToken string literals on the player page
 * 2) GET the player HTML + encrypted playlist (up to 3 attempts)
 * 3) AES-GCM decrypt the concatenated `_t` fragments (envelope cn/sk/ts/uid)
 * 4) url-cipher AES-CTR on `/hls/?e=` → real http segment URLs
 *    (lh3.googleusercontent segments are MPEG-TS wrapped in a fake PNG shell)
 * 5) Build a data: m3u8 with #EXTM3U / #EXTINF preserved
 */

export function getAvsUa(): string {
  return typeof navigator !== 'undefined' && navigator.userAgent
    ? navigator.userAgent
    : '';
}

function bypassHeaders(referer?: string): Record<string, string> {
  const h: Record<string, string> = {
    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'vi,en-US;q=0.9,en;q=0.8',
    'Upgrade-Insecure-Requests': '1',
    'User-Agent': getAvsUa(),
  };
  if (referer) h.Referer = referer;
  return h;
}

/** Join all `"…"` chunks after `const avsToken =` into one JWT. */
export function extractAvsToken(html: string): string | null {
  const decl = html.match(
    /const\s+avsToken\s*=\s*((?:"(?:[^"\\]|\\.)*"\s*\+?\s*)+)\s*;/,
  );
  if (decl && decl[1]) {
    const parts = decl[1].match(/"((?:[^"\\]|\\.)*)"/g);
    if (parts && parts.length) {
      const joined = parts.map(p => p.slice(1, -1)).join('');
      if (joined) {
        debugLog(
          'avsToken concat parts=' +
            parts.length +
            ' lens=' +
            parts.map(p => p.length - 2).join(',') +
            ' joined=' +
            joined.length,
        );
        return joined;
      }
    }
  }
  const single = html.match(/const\s+avsToken\s*=\s*"([^"]+)"/);
  if (single && single[1]) return single[1];
  return null;
}

function b64urlToString(b64: string): string {
  let s = b64.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4 !== 0) s += '=';
  return atob(s);
}

function parseEnvelope(envB64: string): { cn: string; sk: string; ts: string; uid: string } | null {
  try {
    const bytes = b64urlDecode(envB64);
    if (bytes.length < 11) return null;
    if (bytes[0] !== 85 || bytes[1] !== 83 || bytes[2] !== 68 || bytes[3] !== 75) {
      return null;
    }
    if (bytes[4] !== 1) return null;
    const payloadLen = ((bytes[5] & 0xff) << 8) | (bytes[6] & 0xff);
    if (bytes.length < 7 + payloadLen + 4) return null;
    const payload = bytes.subarray(7, 7 + payloadLen);
    let iso = '';
    for (const b of payload) iso += String.fromCharCode(b);
    const decoded = decodeURIComponent(iso);
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

function buildM3u8DataUri(m3u8Text: string): string {
  const lines = m3u8Text.split('\n').map(l => l.trim()).filter(Boolean);
  const headers: string[] = [];
  const media: string[] = [];
  for (const line of lines) {
    if (/^#EXT-X-KEY/i.test(line) || /urn:avs:shield/i.test(line)) continue;
    if (/\/hls\/[0-9a-f]{24}\.ts/i.test(line)) continue;
    if (line.startsWith('#')) {
      if (/^#EXTINF:/i.test(line) || /^#EXT-X-(VERSION|TARGETDURATION|MEDIA-SEQUENCE|PLAYLIST-TYPE)/i.test(line)) {
        if (/^#EXTINF:/i.test(line)) media.push(line);
        else headers.push(line);
      }
      continue;
    }
    if (/^https?:\/\//i.test(line)) media.push(line);
  }

  // Nekori/hls.js require the format identifier as the first line.
  const out: string[] = ['#EXTM3U'];
  for (const h of headers) {
    if (/^#EXTM3U/i.test(h)) continue;
    out.push(h);
  }
  for (const item of media) {
    if (/^#EXTINF:/i.test(item)) {
      out.push(item);
      continue;
    }
    const prev = out[out.length - 1];
    if (!prev || !/^#EXTINF:/i.test(prev)) out.push('#EXTINF:10.0,');
    out.push(item);
  }
  if (!out.some(l => /^#EXT-X-ENDLIST/i.test(l))) out.push('#EXT-X-ENDLIST');
  const body = out.join('\n');
  const segs = out.filter(l => /^https?:/i.test(l)).length;
  debugLog(
    'm3u8 data uri segs=' +
      segs +
      ' extinf=' +
      out.filter(l => /^#EXTINF:/i.test(l)).length +
      ' bodyLen=' +
      body.length +
      ' head=' +
      out[0] +
      ' first=' +
      (out.find(l => /^https?:/i.test(l)) || '').slice(0, 70),
  );
  return (
    'data:application/vnd.apple.mpegurl;charset=utf-8,' + encodeURIComponent(body)
  );
}

/** Rewrite `/hls/<fileId>.ts?e=` lines to http URLs via HMAC(jtiOdd)+AES-CTR; keep #EXTINF. */
async function decryptM3u8SegmentUrls(
  intermediateM3u8: string,
  jtiOdd: string,
): Promise<string> {
  const lines = intermediateM3u8.split('\n');
  const outLines = lines.slice();
  const hlsRe = /\/hls\/([0-9a-f]{24})\.ts/i;
  let replaced = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(hlsRe);
    if (!m) continue;
    try {
      const fileId = m[1];
      const qIdx = line.indexOf('?');
      const params: Record<string, string> = {};
      if (qIdx >= 0) {
        for (const p of line.slice(qIdx + 1).split('&')) {
          const eq = p.indexOf('=');
          if (eq >= 0) params[p.slice(0, eq)] = p.slice(eq + 1);
        }
      }
      const eParam = params.e || '';
      const iParam = parseInt(params.i || '0', 10) || 0;
      if (!eParam) continue;

      const hmacKey = new TextEncoder().encode(jtiOdd);
      const k = await crypto.subtle.importKey(
        'raw',
        hmacKey as never,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
      );
      const aesKeyRaw = await crypto.subtle.sign(
        'HMAC',
        k,
        new TextEncoder().encode('url-cipher|' + fileId) as never,
      );
      const ctrKey = await crypto.subtle.importKey(
        'raw',
        aesKeyRaw as never,
        { name: 'AES-CTR' },
        false,
        ['decrypt'],
      );
      const counter = new Uint8Array(16);
      counter[12] = (iParam >>> 24) & 0xff;
      counter[13] = (iParam >>> 16) & 0xff;
      counter[14] = (iParam >>> 8) & 0xff;
      counter[15] = iParam & 0xff;
      const dec = await crypto.subtle.decrypt(
        { name: 'AES-CTR', counter: counter as never, length: 64 },
        ctrKey,
        b64urlDecode(eParam) as never,
      );
      const url = new TextDecoder().decode(dec);
      if (/^https?:\/\//i.test(url)) {
        outLines[i] = url;
        replaced++;
      }
    } catch {
      //
    }
  }

  const clean = outLines.filter(
    l =>
      l &&
      !l.includes('urn:avs:shield') &&
      !/\/hls\/[0-9a-f]{24}\.ts/i.test(l),
  );
  debugLog('decryptM3u8SegmentUrls replaced=' + replaced + ' lines=' + clean.length);
  return clean.join('\n');
}

/** Decrypt an encrypted server playlist using envelope headers + `_t` GCM blob. */
async function processEncryptedM3u8(
  m3u8Text: string,
  m3u8Headers: Record<string, string>,
  avsToken: string,
): Promise<string | null> {
  const jwtParts = avsToken.split('.');
  if (jwtParts.length < 2) return null;

  let jti = '';
  try {
    const payload = JSON.parse(b64urlToString(jwtParts[1]));
    jti = String(payload.jti || '');
  } catch {
    debugLog('JWT payload parse fail');
  }
  if (!jti) return null;

  let jtiOdd = '';
  for (let i = 0; i < jti.length; i++) {
    if (i % 2 === 1) jtiOdd += jti[i];
  }
  debugLog('jtiOdd len=' + jtiOdd.length);

  let cn = '';
  let sk = '';
  let ts = '0';
  let uid = 'anon';

  const envHeader =
    m3u8Headers['x-envelope'] ||
    m3u8Headers['x-avs-envelope'] ||
    m3u8Headers['x-stream-envelope'] ||
    '';
  if (envHeader) {
    const envJson = parseEnvelope(envHeader);
    if (envJson) {
      cn = envJson.cn || '';
      sk = envJson.sk || '';
      ts = envJson.ts || '0';
      uid = envJson.uid || 'anon';
      debugLog('envelope ok cn=' + cn.slice(0, 12));
    }
  }
  if (!cn) cn = m3u8Headers['x-edge-tag'] || '';
  if (!sk) sk = m3u8Headers['x-cache-node'] || '';
  if (!ts || ts === '0') ts = m3u8Headers['x-request-trace'] || '0';
  if (uid === 'anon') {
    const pd = m3u8Headers['x-proxy-digest'];
    if (pd) {
      try {
        uid = decodeURIComponent(pd);
      } catch {
        uid = pd;
      }
    }
  }
  if (!cn || !sk) {
    debugLog('missing cn/sk');
    return null;
  }

  const lines = m3u8Text.split('\n');
  const tValues: string[] = [];
  const headerLines: string[] = [];
  for (const rawLine of lines) {
    const line = rawLine;
    if (line.startsWith('#') || line.trim() === '') {
      if (
        !/^#EXTINF:/i.test(line) &&
        !/^#EXT-X-ENDLIST/i.test(line) &&
        !/^#EXT-X-KEY/i.test(line)
      ) {
        headerLines.push(line);
      }
    } else {
      const tm = line.match(/[?&]_t=([^&\s]+)/);
      if (tm) tValues.push(tm[1]);
    }
  }
  if (!tValues.length) {
    debugLog('no _t values');
    return null;
  }
  debugLog('_t count=' + tValues.length + ' cn=' + cn.slice(0, 10) + ' sk=' + sk.slice(0, 10));

  const concatenated = tValues.join('');
  const cnBytes = b64urlDecode(cn);
  const iv = cnBytes.slice(0, Math.min(12, cnBytes.length));

  const unshuffleFns: ((s: string) => string)[] = [
    s => stringUnshuffle(s, sk),
    s => s,
  ];
  const hmacFormats = [uid + ':' + ts + ':' + sk + ':0', uid + ':' + ts + ':' + sk];

  for (const unshuffleFn of unshuffleFns) {
    for (const hmacData of hmacFormats) {
      try {
        const unshuffled = unshuffleFn(concatenated);
        const encryptedBlob = b64urlDecode(unshuffled);
        const macKey = await crypto.subtle.importKey(
          'raw',
          cnBytes as never,
          { name: 'HMAC', hash: 'SHA-256' },
          false,
          ['sign'],
        );
        const gcmKeyRaw = await crypto.subtle.sign(
          'HMAC',
          macKey,
          new TextEncoder().encode(hmacData) as never,
        );
        const gcmKey = await crypto.subtle.importKey(
          'raw',
          gcmKeyRaw as never,
          { name: 'AES-GCM' },
          false,
          ['decrypt'],
        );
        const rawResult = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: iv as never, tagLength: 128 },
          gcmKey,
          encryptedBlob as never,
        );
        const rawBytes = new Uint8Array(rawResult);
        let m3u8Body = new TextDecoder().decode(rawBytes);
        if (!m3u8Body.includes('#EXTINF') && !m3u8Body.includes('/hls/')) {
          m3u8Body = new TextDecoder().decode(descramble(rawBytes, sk, ts));
        }

        let fullM3u8Text = headerLines.join('\n') + '\n' + m3u8Body;
        if (!/^#EXTM3U/m.test(fullM3u8Text.trimStart())) {
          fullM3u8Text = '#EXTM3U\n' + fullM3u8Text.replace(/^#EXTM3U[^\n]*\n?/i, '');
        }
        if (!fullM3u8Text.includes('#EXT-X-ENDLIST')) {
          fullM3u8Text += '\n#EXT-X-ENDLIST';
        }

        if (/\/hls\/[0-9a-f]{24}\.ts\?e=/i.test(fullM3u8Text) && jtiOdd) {
          debugLog('GCM ok → url-cipher path');
          return await decryptM3u8SegmentUrls(fullM3u8Text, jtiOdd);
        }
        if (m3u8Body.includes('#EXTINF')) {
          debugLog('GCM ok → plaintext m3u8 body');
          return fullM3u8Text;
        }
      } catch {
        // next unshuffle / hmac combo
      }
    }
  }

  debugLog('GCM decrypt failed all combos');
  return null;
}

export async function resolveGoogleApisCdn(
  playerUrl: string,
): Promise<ResolvedMedia> {
  const iframe = document.createElement('iframe');
  iframe.style.cssText =
    'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;';
  iframe.src = playerUrl;
  (document.body || document.documentElement).appendChild(iframe);

  const cfWait = 1500;
  debugLog('Đợi CF ' + cfWait + 'ms…');
  await new Promise(resolve => setTimeout(resolve, cfWait));
  debugLog('CF done, fetching page…');

  try {
    return await decryptGoogleApisCdn(playerUrl, iframe);
  } catch (err: any) {
    cleanupIframe(iframe);
    throw err;
  }
}

/** Fetch player page + playlist, decrypt, return HLS sources (up to 3 attempts). */
async function decryptGoogleApisCdn(
  playerUrl: string,
  iframe: HTMLIFrameElement,
): Promise<ResolvedMedia> {
  const videoHash = (playerUrl.match(/\/player\/([0-9a-f]+)/) || [])[1];
  const baseUrl = (playerUrl.match(/^(https?:\/\/[^/]+)/) || [])[1];
  if (!videoHash || !baseUrl) {
    throw new Error('Không tìm thấy video hash/baseUrl trong URL player.');
  }

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const playerRes = await nativeFetch(playerUrl, bypassHeaders(playerUrl));
      const html = playerRes.text;
      const avsToken = extractAvsToken(html);
      if (!avsToken) {
        debugLog(
          'player page no avsToken attempt=' +
            attempt +
            ' HTTP=' +
            playerRes.status +
            ' html=' +
            html.length,
        );
        continue;
      }
      debugLog(
        'token ok attempt=' + attempt + ' len=' + avsToken.length + ' html=' + html.length,
      );

      const m3u8Url =
        baseUrl +
        '/playlist/' +
        videoHash +
        '/playlist.m3u8?token=' +
        encodeURIComponent(avsToken);
      const m3u8Res = await nativeFetch(
        m3u8Url,
        Object.assign({ Referer: playerUrl }, bypassHeaders()),
      );
      const m3u8Text = m3u8Res.text;
      debugLog('playlist HTTP=' + m3u8Res.status + ' size=' + m3u8Text.length);

      const decrypted = await processEncryptedM3u8(
        m3u8Text,
        m3u8Res.headers || {},
        avsToken,
      );
      if (decrypted && decrypted.trim()) {
        const segCount = decrypted
          .split('\n')
          .filter(l => l.trim().startsWith('http')).length;
        debugLog('decrypt OK, ' + segCount + ' segments');
        cleanupIframe(iframe);
        return {
          type: 'sources',
          sources: [
            { file: buildM3u8DataUri(decrypted), type: 'hls' },
          ],
        };
      }
      debugLog('decrypt FAILED attempt=' + attempt);
    } catch (e: any) {
      debugLog('attempt ' + attempt + ' error: ' + (e && e.message));
    }
  }

  cleanupIframe(iframe);
  throw new Error('Giải mã googleapis thất bại.');
}
