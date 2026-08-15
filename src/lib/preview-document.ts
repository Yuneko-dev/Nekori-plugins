import { readerMockScript } from './reader-mock';
import corePlayerRaw from './core-player.js?raw';
import corePlayerCss from './core-player.css?raw';

type PreviewDocumentOptions = {
  /** Chapter HTML returned by `plugin.parseChapter`. */
  html: string;
  /** Shown as the preview window title, e.g. "Novel name - Chapter name". */
  title?: string;
  customCSS?: string;
  customJS?: string;
  dark?: boolean;
};

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    char =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[char] as string,
  );

/** Plugin assets are served by the renderer's own origin, so make them absolute. */
const staticUrl = (relative: string) =>
  new URL('/public/static/' + relative, window.location.origin).href;

export const isVideoChapter = (html: string) =>
  /<meta\s+name=["']lnreader-chapter-type["']\s+content=["']video["']/i.test(
    html,
  );

/**
 * Assembles the document handed to the preview tab. Element ids and the
 * CSS-then-chapter-then-JS order mirror the real reader WebView, so custom JS
 * that queries `#LNReader-chapter` behaves the same here.
 */
export function buildPreviewDocument({
  html,
  title,
  customCSS,
  customJS,
  dark,
}: PreviewDocumentOptions): string {
  const video = isVideoChapter(html);

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title || 'Chapter Preview')}</title>
    <style>
      body {
        font-family: system-ui, -apple-system, sans-serif;
        color: ${dark ? '#e5e7eb' : '#1f2937'};
        background: ${dark ? '#0b0f19' : '#ffffff'};
        margin: 0;
        padding: 16px;
        line-height: 1.6;
      }
      img, video, iframe { max-width: 100%; height: auto; }
      a { color: #3b82f6; }
      ${video ? corePlayerCss : ''}
    </style>
    <script src="https://cdn.jsdelivr.net/npm/hls.js@1.6.15/dist/hls.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/dashjs@5.2.0/dist/legacy/umd/dash.all.min.js"></script>
    <script type="module" src="https://cdn.jsdelivr.net/npm/@videojs/html@10.0.0-beta.26/cdn/video.js"></script>
    <script type="module" src="https://cdn.jsdelivr.net/npm/@videojs/html@10.0.0-beta.26/cdn/live-video.js"></script>
    <script type="module" src="https://cdn.jsdelivr.net/npm/@videojs/html@10.0.0-beta.26/cdn/media/hlsjs-video.js"></script>
    <script type="module" src="https://cdn.jsdelivr.net/npm/@videojs/html@10.0.0-beta.26/cdn/media/dash-video.js"></script>
    ${readerMockScript}
    ${video ? `<script>${corePlayerRaw}</script>` : ''}
    ${customCSS ? `<link rel="stylesheet" href="${staticUrl(customCSS)}">` : ''}
  </head>
  <body>
    <div id="LNReader-chapter">${html}</div>
    ${customJS ? `<script src="${staticUrl(customJS)}"></script>` : ''}
  </body>
</html>`;
}
