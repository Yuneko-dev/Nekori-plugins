import { b64urlDecode, descramble, stringUnshuffle } from './crypto';
import { nativeFetch } from './fetch';
import type { ResolvedMedia } from './types';
import { cleanupIframe, debugLog } from './utils';

export async function resolveGoogleApisCdn(
  playerUrl: string,
): Promise<ResolvedMedia> {
  const iframe = document.createElement('iframe');
  iframe.style.cssText =
    'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;';
  iframe.src = playerUrl;
  (document.body || document.documentElement).appendChild(iframe);

  const cfWait = 1000;
  debugLog('Đợi CF ' + cfWait + 'ms…');

  await new Promise(resolve => setTimeout(resolve, cfWait));
  debugLog('CF done, fetching page…');

  return await fetchPlayerPage(playerUrl, iframe);
}

async function fetchPlayerPage(
  playerUrl: string,
  iframe: HTMLIFrameElement,
): Promise<ResolvedMedia> {
  try {
    const res = await nativeFetch(playerUrl, { Referer: playerUrl });
    if (res.status !== 200) {
      debugLog('Body: ' + (res.text || '').substring(0, 100));
      throw new Error(
        'HTTP ' + res.status + ' (len=' + (res.text || '').length + ')',
      );
    }

    const html = res.text;
    debugLog('Page OK, size=' + html.length);
    cleanupIframe(iframe);

    const tokenMatch = html.match(/const\s+avsToken\s*=\s*"([^"]+)"/);
    if (!tokenMatch) {
      throw new Error('Không tìm thấy avsToken trong HTML.');
    }
    const avsToken = tokenMatch[1];
    debugLog('Token: ' + avsToken.substring(0, 30) + '…');

    const hashMatch = playerUrl.match(/\/player\/([0-9a-f]+)/);
    if (!hashMatch) {
      throw new Error('Không tìm thấy video hash trong URL.');
    }
    const videoHash = hashMatch[1];

    debugLog('Fetching m3u8…');
    const baseUrlMatch = playerUrl.match(/^(https?:\/\/[^/]+)/);
    if (!baseUrlMatch) throw new Error('Không lấy được baseUrl.');
    const baseUrl = baseUrlMatch[1];

    const m3u8Url =
      baseUrl +
      '/playlist/' +
      videoHash +
      '/playlist.m3u8?token=' +
      encodeURIComponent(avsToken);

    const m3u8Res = await nativeFetch(m3u8Url, { Referer: playerUrl });
    const m3u8Text = m3u8Res.text;
    const m3u8Headers = m3u8Res.headers || {};
    debugLog('m3u8 OK, size=' + m3u8Text.length);

    return await processEncryptedM3u8(m3u8Text, m3u8Headers, avsToken);
  } catch (err: any) {
    cleanupIframe(iframe);
    debugLog('Fetch fail: ' + err.message);
    throw err;
  }
}

async function processEncryptedM3u8(
  m3u8Text: string,
  m3u8Headers: Record<string, string>,
  avsToken: string,
): Promise<ResolvedMedia> {
  debugLog('Decrypting (2-layer)…');

  const jwtParts = avsToken.split('.');
  let payload: any;
  try {
    payload = JSON.parse(atob(jwtParts[1]));
  } catch (e) {
    debugLog('JWT parse failed');
    throw new Error('Không thể phân tích token.');
  }
  const jti = payload.jti as string;
  debugLog('JTI: ' + jti.substring(0, 20) + '…');

  let jtiOdd = '';
  for (let k = 0; k < jti.length; k++) {
    if (k % 2 === 1) jtiOdd += jti[k];
  }

  function parseEnvelope(envB64: string): any {
    const bytes = b64urlDecode(envB64);
    if (bytes.length < 11) return null;
    if (
      bytes[0] !== 85 ||
      bytes[1] !== 83 ||
      bytes[2] !== 68 ||
      bytes[3] !== 75
    )
      return null;
    if (bytes[4] !== 1) return null;
    const payloadLen = (bytes[5] << 8) | bytes[6];
    if (bytes.length < 7 + payloadLen + 4) return null;
    const payload = bytes.subarray(7, 7 + payloadLen);
    let str = '';
    // eslint-disable-next-line
    for (let i = 0; i < payload.length; i++)
      str += String.fromCharCode(payload[i]);
    str = decodeURIComponent(escape(str));
    return JSON.parse(str);
  }

  let cn = '',
    sk = '',
    ts = '0',
    uid = 'anon';

  const envHeader =
    m3u8Headers['x-envelope'] ||
    m3u8Headers['x-avs-envelope'] ||
    m3u8Headers['x-stream-envelope'] ||
    '';
  if (envHeader) {
    try {
      const envJson = parseEnvelope(envHeader);
      if (envJson) {
        debugLog('envelope=' + JSON.stringify(envJson).substring(0, 200));
        cn = envJson.cn || '';
        sk = envJson.sk || '';
        ts = envJson.ts || '0';
        uid = envJson.uid || 'anon';
      }
    } catch (e: any) {
      debugLog('envelope parse fail: ' + (e.message || e));
    }
  }

  if (!cn) cn = m3u8Headers['x-edge-tag'] || '';
  if (!sk) sk = m3u8Headers['x-cache-node'] || '';
  if (!ts || ts === '0') ts = m3u8Headers['x-request-trace'] || '0';
  if (uid === 'anon') {
    try {
      const pd = m3u8Headers['x-proxy-digest'];
      if (pd) uid = decodeURIComponent(pd);
    } catch (e) {
      //
    }
  }

  debugLog('cn=' + cn + ' sk=' + sk);
  debugLog('ts=' + ts + ' uid=' + uid);

  if (!cn || !sk) {
    throw new Error('Thiếu thông tin giải mã (cn/sk).');
  }

  const lines = m3u8Text.split('\n');
  const tValues: string[] = [];
  const headerLines: string[] = [];
  // eslint-disable-next-line
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('#') || line.trim() === '') {
      if (
        !line.match(/^#EXTINF:/) &&
        !line.match(/^#EXT-X-ENDLIST/) &&
        !line.match(/^#EXT-X-KEY/)
      ) {
        headerLines.push(line);
      }
    } else {
      const tm = line.match(/[?&]_t=([^&\s]+)/);
      if (tm) tValues.push(tm[1]);
    }
  }

  debugLog('_t segments: ' + tValues.length);

  if (tValues.length === 0) {
    throw new Error('Không tìm thấy dữ liệu mã hóa trong m3u8.');
  }

  const concatenated = tValues.join('');
  const cnBytes = b64urlDecode(cn);
  const iv = cnBytes.slice(0, 12);

  const unshuffleMethods = [
    { name: 'lcg', fn: (s: string) => stringUnshuffle(s, sk) },
    { name: 'noShuffle', fn: (s: string) => s },
  ];
  const hmacFormats = [
    { name: 'harden', data: uid + ':' + ts + ':' + sk + ':0' },
    { name: 'plain', data: uid + ':' + ts + ':' + sk },
  ];

  const attempts: {
    unshuffle: { name: string; fn: (s: string) => string };
    hmac: { name: string; data: string };
  }[] = [];
  // eslint-disable-next-line
  for (let ui = 0; ui < unshuffleMethods.length; ui++) {
    // eslint-disable-next-line
    for (let hi = 0; hi < hmacFormats.length; hi++) {
      attempts.push({ unshuffle: unshuffleMethods[ui], hmac: hmacFormats[hi] });
    }
  }

  // eslint-disable-next-line
  for (let idx = 0; idx < attempts.length; idx++) {
    const attempt = attempts[idx];
    const unshuffled = attempt.unshuffle.fn(concatenated);
    let encryptedBlob: Uint8Array;
    try {
      encryptedBlob = b64urlDecode(unshuffled);
    } catch (e) {
      continue;
    }

    try {
      const hmacData = new TextEncoder().encode(attempt.hmac.data);
      const hmacKey = await crypto.subtle.importKey(
        'raw',
        // eslint-disable-next-line
        cnBytes as unknown as BufferSource,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
      );
      const gcmKeyBuf = await crypto.subtle.sign(
        'HMAC',
        hmacKey,
        // eslint-disable-next-line
        hmacData as unknown as BufferSource,
      );
      const gcmKey = await crypto.subtle.importKey(
        'raw',
        // eslint-disable-next-line
        gcmKeyBuf as unknown as BufferSource,
        { name: 'AES-GCM' },
        false,
        ['decrypt'],
      );
      const rawResult = await crypto.subtle.decrypt(
        // eslint-disable-next-line
        { name: 'AES-GCM', iv: iv as unknown as BufferSource },
        gcmKey,
        // eslint-disable-next-line
        encryptedBlob as unknown as BufferSource,
      );

      const rawBytes = new Uint8Array(rawResult);
      let m3u8Body = new TextDecoder().decode(rawBytes);

      if (
        m3u8Body.indexOf('#EXTINF') === -1 &&
        m3u8Body.indexOf('/hls/') === -1
      ) {
        const descrambled = descramble(rawBytes, sk, ts);
        m3u8Body = new TextDecoder().decode(descrambled);
      }

      let fullM3u8Text = headerLines.join('\n') + '\n' + m3u8Body;
      if (fullM3u8Text.indexOf('#EXT-X-ENDLIST') === -1)
        fullM3u8Text += '\n#EXT-X-ENDLIST';
      console.log('m3u8 file:', fullM3u8Text);
      debugLog('Full m3u8: ' + fullM3u8Text.length + 'ch');

      const hasEncryptedUrls = /\/hls\/[0-9a-f]{24}\.ts\?e=/.test(fullM3u8Text);

      if (hasEncryptedUrls) {
        debugLog(
          'Layer 2: decrypting ' + fullM3u8Text.split('\n').length + ' lines',
        );
        return await decryptSegmentUrls(fullM3u8Text, headerLines, jtiOdd);
      }

      if (fullM3u8Text.indexOf('#EXTINF') !== -1) {
        debugLog('Decryption OK! Building blob m3u8 player');
        const blob = new Blob([fullM3u8Text], {
          type: 'application/vnd.apple.mpegurl',
        });
        const blobUrl = URL.createObjectURL(blob);
        return { type: 'sources', sources: [{ file: blobUrl, type: 'hls' }] };
      }

      throw new Error('Nội dung giải mã không phải m3u8 hợp lệ.');
    } catch (e) {
      // Tiếp tục thử attempt tiếp theo nếu lỗi
    }
  }

  throw new Error('Giải mã thất bại sau ' + attempts.length + ' lần thử.');
}

async function decryptSegmentUrls(
  intermediateM3u8: string,
  headerLines: string[],
  jtiOdd: string,
): Promise<ResolvedMedia> {
  const lines = intermediateM3u8.split('\n');
  const segments: { fileId: string; e: string; i: number; lineIdx: number }[] =
    [];

  const hlsRe = /\/hls\/([0-9a-f]{24})\.ts[^#\s]*/;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('#') || line === '') continue;

    const m = line.match(hlsRe);
    if (m) {
      const qIdx = line.indexOf('?');
      const params: Record<string, string> = {};
      if (qIdx !== -1) {
        line
          .substring(qIdx + 1)
          .split('&')
          .forEach(function (p) {
            const eq = p.indexOf('=');
            if (eq !== -1) params[p.substring(0, eq)] = p.substring(eq + 1);
          });
      }
      segments.push({
        fileId: m[1],
        e: params.e || '',
        i: parseInt(params.i || '0', 10),
        lineIdx: i,
      });
    }
  }

  debugLog('Segments to decrypt: ' + segments.length);

  if (segments.length === 0) {
    throw new Error('Không tìm thấy segment trong m3u8 trung gian.');
  }

  const hmacKeyBytes = new TextEncoder().encode(jtiOdd);
  const keyCache: Record<string, CryptoKey> = {};

  async function deriveCtrKey(fileId: string): Promise<CryptoKey> {
    if (keyCache[fileId]) return keyCache[fileId];

    const signData = new TextEncoder().encode('url-cipher|' + fileId);
    const k = await crypto.subtle.importKey(
      'raw',
      // eslint-disable-next-line
      hmacKeyBytes as unknown as BufferSource,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const buf = await crypto.subtle.sign(
      'HMAC',
      k,
      // eslint-disable-next-line
      signData as unknown as BufferSource,
    );
    const ctrKey = await crypto.subtle.importKey(
      'raw',
      // eslint-disable-next-line
      buf as unknown as BufferSource,
      { name: 'AES-CTR' },
      false,
      ['decrypt'],
    );

    keyCache[fileId] = ctrKey;
    return ctrKey;
  }

  const promises = segments.map(async seg => {
    const ctrKey = await deriveCtrKey(seg.fileId);
    const encrypted = b64urlDecode(seg.e);
    const counter = new Uint8Array(16);
    const idx = seg.i;
    counter[12] = (idx >>> 24) & 0xff;
    counter[13] = (idx >>> 16) & 0xff;
    counter[14] = (idx >>> 8) & 0xff;
    counter[15] = idx & 0xff;

    const dec = await crypto.subtle.decrypt(
      {
        name: 'AES-CTR',
        // eslint-disable-next-line
        counter: counter as unknown as BufferSource,
        length: 64,
      },
      ctrKey,
      // eslint-disable-next-line
      encrypted as unknown as BufferSource,
    );
    return { lineIdx: seg.lineIdx, url: new TextDecoder().decode(dec) };
  });

  const results = await Promise.all(promises);
  let validCount = 0;
  const outLines = lines.slice();

  results.forEach(function (r) {
    if (r.url.indexOf('http') === 0) {
      outLines[r.lineIdx] = r.url;
      validCount++;
    }
  });

  debugLog('Decrypted ' + validCount + '/' + results.length + ' URLs');
  if (validCount === 0) {
    throw new Error('Không giải mã được URL segment nào.');
  }

  const cleanLines: string[] = [];
  // eslint-disable-next-line
  for (let i = 0; i < outLines.length; i++) {
    const l = outLines[i];
    if (!l) continue;
    if (l.indexOf('#EXT-X-KEY:') === 0 && l.indexOf('urn:avs:shield') !== -1)
      continue;
    if (l.match(/\/hls\/[0-9a-f]{24}\.ts/)) continue;
    cleanLines.push(l);
  }

  const cleanM3u8 = cleanLines.join('\n');
  const blob = new Blob([cleanM3u8], { type: 'application/vnd.apple.mpegurl' });
  const blobUrl = URL.createObjectURL(blob);

  return { type: 'sources', sources: [{ file: blobUrl, type: 'hls' }] };
}
