/* eslint-disable */

/**
 * AnimeVietsub - WebView Video Player (customJS)
 *
 * Runs inside the WebView/browser context after parseChapter returns HTML.
 *
 * Priority:
 *   1. data-m3u8   → direct HLS.js playback (bypasses iframe adblock detection)
 *   2. data-sources → direct source playback
 *   3. data-iframe  → embed iframe
 *   4. data-hash    → AJAX /ajax/player fallback
 */
import { initUtils, debugLog, showError } from './utils';
import { fetchAjaxPlayer } from './ajax';
import { resolveGoogleApisCdn } from './google_cdn';
import type { PlayerConfig, ResolvedMedia } from './types';

function parseConfig(container: HTMLElement): PlayerConfig {
  return {
    mode: container.getAttribute('data-mode') || 'm3u8',
    playerType: container.getAttribute('data-player-type') || 'artplayer',
    debugEnabled: container.getAttribute('data-debug') === '1',
    m3u8: container.getAttribute('data-m3u8'),
    sourcesRaw: container.getAttribute('data-sources'),
    iframeSrc: container.getAttribute('data-iframe'),
    ajaxHash: container.getAttribute('data-hash'),
    ajaxId: container.getAttribute('data-id'),
    ajaxReferer: container.getAttribute('data-referer'),
    ajaxSite: container.getAttribute('data-site'),
    bannerUrl: container.getAttribute('data-banner'),
  };
}

async function resolveMedia(config: PlayerConfig): Promise<ResolvedMedia> {
  // 1. Direct M3u8
  if (config.m3u8) {
    debugLog('Resolver: Dùng trực tiếp M3U8.');
    return { type: 'sources', sources: [{ file: config.m3u8, type: 'hls' }] };
  }

  // 2. Parsed Sources
  if (config.sourcesRaw) {
    try {
      const sources = JSON.parse(config.sourcesRaw);
      debugLog('Resolver: Dùng parsed sources (' + sources.length + ' items).');
      return { type: 'sources', sources: sources };
    } catch (e) {
      debugLog('Resolver Warning: Không thể parse data-sources.');
    }
  }

  // 3. Iframe Embed (or GoogleApisCdn Decryption)
  if (config.iframeSrc) {
    if (
      config.iframeSrc.indexOf('googleapiscdn.com') !== -1 &&
      config.mode === 'm3u8'
    ) {
      debugLog('Resolver: Kích hoạt GoogleApisCdn Decryptor.');
      return await resolveGoogleApisCdn(config.iframeSrc);
    }
    debugLog('Resolver: Dùng Iframe nhúng trực tiếp.');
    return { type: 'iframe', iframeUrl: config.iframeSrc };
  }

  // 4. Ajax Fallback
  if (config.ajaxHash && config.ajaxSite) {
    debugLog('Resolver: Kích hoạt Ajax Fallback.');
    return await fetchAjaxPlayer(config);
  }

  throw new Error('Thiếu thông tin cấu hình, không thể xác định nguồn phát.');
}

function renderMedia(resolved: ResolvedMedia, config: PlayerConfig) {
  // @ts-ignore
  if (!window.LNReaderPlayer) return;
  // @ts-ignore
  const player = window.LNReaderPlayer;

  if (resolved.type === 'sources' && resolved.sources) {
    const s = resolved.sources[0];
    const file = (s.file || '').replace(/^&http/, 'http');
    if (s.type === 'hls' || /\\.m3u8(\\?|$)/i.test(file)) {
      player.log('[AVS] Playing M3U8: ' + file);
      player.playHls(file);
    } else {
      player.log('[AVS] Playing Direct: ' + file);
      player.playDirect(file);
    }
  } else if (resolved.type === 'iframe' && resolved.iframeUrl) {
    player.log('[AVS] Playing Iframe: ' + resolved.iframeUrl);
    player.playIframe(resolved.iframeUrl);
  } else {
    player.log(
      '[AVS] Error: Không nhận được định dạng phát hợp lệ từ Resolver.',
    );
  }
}

async function initPlayer() {
  const container = document.getElementById('avs-player-container');
  if (!container) return;

  const config = parseConfig(container);
  initUtils(container);

  try {
    const resolvedMedia = await resolveMedia(config);
    renderMedia(resolvedMedia, config);
  } catch (error: any) {
    showError(error.message || 'Lỗi không xác định.');
    console.error('[AVS] Pipeline Error:', error);
  }
}

initPlayer();
