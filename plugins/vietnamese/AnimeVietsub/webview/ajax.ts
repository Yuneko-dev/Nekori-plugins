import { resolveGoogleApisCdn } from './google_cdn';
import type { PlayerConfig, ResolvedMedia } from './types';
import { debugLog } from './utils';

export async function fetchAjaxPlayer(
  config: PlayerConfig,
): Promise<ResolvedMedia> {
  if (!config.ajaxHash || !config.ajaxSite) {
    throw new Error('Thiếu thông tin tập phim (hash hoặc site).');
  }

  let postBody = 'link=' + encodeURIComponent(config.ajaxHash);
  if (config.ajaxId) postBody += '&id=' + encodeURIComponent(config.ajaxId);

  debugLog('AJAX fallback: calling /ajax/player…');

  const res = await fetch(config.ajaxSite + '/ajax/player', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      Accept: 'application/json, text/javascript, */*; q=0.01',
      Referer: config.ajaxReferer || config.ajaxSite + '/',
      Origin: config.ajaxSite,
    },
    body: postBody,
    credentials: 'include',
  });

  const text = await res.text();
  debugLog('/ajax/player response: ' + text.slice(0, 300));

  type AjaxPlayerJson = {
    success?: boolean;
    playTech?: string;
    link?: string | { file?: string; type?: string; label?: string }[];
  };

  let json: AjaxPlayerJson;
  try {
    json = JSON.parse(text) as AjaxPlayerJson;
  } catch {
    throw new Error(
      'Không thể phân tích phản hồi từ server (không phải JSON).',
    );
  }

  if (!json || !json.success) {
    throw new Error('Server trả về lỗi (success = false).');
  }

  return parsePlayerResponse(json, config.mode);
}

async function parsePlayerResponse(
  json: {
    success?: boolean;
    playTech?: string;
    link?: string | { file?: string; type?: string; label?: string }[];
  },
  mode: string,
): Promise<ResolvedMedia> {
  if (json.playTech === 'iframe' && typeof json.link === 'string') {
    if (json.link.indexOf('googleapiscdn.com') !== -1 && mode === 'm3u8') {
      return await resolveGoogleApisCdn(json.link);
    }
    return { type: 'iframe', iframeUrl: json.link };
  }

  if (Array.isArray(json.link)) {
    return {
      type: 'sources',
      sources: json.link.map(s => ({
        file: s.file || '',
        type: s.type,
        label: s.label,
      })),
    };
  }

  if (typeof json.link === 'string') {
    const link = json.link.replace(/^&http/, 'http');
    if (/\.m3u8(\?|$)/i.test(link)) {
      return { type: 'sources', sources: [{ file: link, type: 'hls' }] };
    } else if (/\.(mp4|webm)(\?|$)/i.test(link)) {
      return { type: 'sources', sources: [{ file: link }] };
    } else {
      return { type: 'iframe', iframeUrl: link };
    }
  }

  throw new Error('Định dạng phát không được hỗ trợ.');
}
