/**
 * Mirrors the preview tab's web storage into the renderer.
 *
 * `@libs/storage`'s `localStorage` / `sessionStorage` are read-only in plugin
 * code: in the real app the reader WebView writes them and LNReader hands the
 * snapshot to the plugin. The preview tab plays the WebView role here, so what
 * its custom JS wrote has to land under the keys the Electron storage shim
 * reads — `<pluginId>_LocalStorage` and `<pluginId>_SessionStorage`.
 */
const WEBVIEW_LOCAL_STORAGE = '_LocalStorage';
const WEBVIEW_SESSION_STORAGE = '_SessionStorage';

type WebStoragePush = {
  pluginId: string;
  local: Record<string, string>;
  session: Record<string, string>;
};

export function registerPreviewStorageBridge() {
  const api = window.electronAPI;
  if (!api?.on) return;

  api.on('preview:webstorage', (payload: WebStoragePush) => {
    const { pluginId, local, session } = payload || {};
    if (!pluginId) return;
    window.localStorage.setItem(
      pluginId + WEBVIEW_LOCAL_STORAGE,
      JSON.stringify(local ?? {}),
    );
    window.localStorage.setItem(
      pluginId + WEBVIEW_SESSION_STORAGE,
      JSON.stringify(session ?? {}),
    );
  });
}
