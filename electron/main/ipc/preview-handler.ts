import { BrowserWindow, ipcMain } from 'electron';
import { customSession } from '../main.js';

type PreviewPayload = {
  pluginId: string;
  /** Full chapter document, already assembled by the renderer. */
  html: string;
  /** "Novel name - Chapter name". The document carries the same `<title>`. */
  title?: string;
  /** Plugin `site` — mirrors react-native-webview's `source.baseUrl`. */
  baseUrl?: string;
};

/**
 * Reads both web storages of the preview tab. The app hands plugins whatever
 * the reader WebView wrote, so custom JS running here has to be mirrored back
 * into the renderer for `@libs/storage`'s localStorage/sessionStorage.
 */
const READ_WEB_STORAGE = `(() => {
  const dump = s => {
    const out = {};
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k !== null) out[k] = s.getItem(k);
    }
    return out;
  };
  return { local: dump(window.localStorage), session: dump(window.sessionStorage) };
})()`;

let previewWindow: BrowserWindow | null = null;

async function syncWebStorage(
  win: BrowserWindow,
  sender: Electron.WebContents,
  pluginId: string,
) {
  if (win.isDestroyed() || sender.isDestroyed()) return;
  try {
    const data = await win.webContents.executeJavaScript(
      READ_WEB_STORAGE,
      true,
    );
    if (sender.isDestroyed()) return;
    sender.send('preview:webstorage', { pluginId, ...data });
  } catch {
    // Tab navigated or closed mid-read — next tick picks it up.
  }
}

ipcMain.handle('preview:open', (event, payload: PreviewPayload) => {
  const { pluginId, html, title, baseUrl } = payload;
  const sender = event.sender;

  if (previewWindow && !previewWindow.isDestroyed()) previewWindow.destroy();

  previewWindow = new BrowserWindow({
    width: 900,
    height: 1000,
    // Shown until the document's own <title> takes over.
    title: title || 'Chapter Preview',
    webPreferences: {
      session: customSession,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // Dev playground: the real reader runs the chapter at the plugin's own
      // origin, so custom JS may fetch the site directly. Keeping Chromium's
      // CORS on would block what works in the app.
      webSecurity: false,
    },
  });

  const win = previewWindow;

  // `baseURLForDataURL` is Electron's equivalent of the WebView `baseUrl`:
  // relative URLs in the chapter resolve against the plugin site.
  // ponytail: data: URL caps out around a couple of MB; swap to a
  // protocol.handle route if a chapter ever exceeds it.
  const base = baseUrl
    ? baseUrl.endsWith('/')
      ? baseUrl
      : baseUrl + '/'
    : undefined;

  win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html), {
    baseURLForDataURL: base,
  });

  const sync = () => syncWebStorage(win, sender, pluginId);

  // Custom JS writes storage as it runs, and there is no event for "the plugin
  // finished touching storage" — so poll while the tab is open, plus on the
  // moments that matter (load done, focus lost, closing).
  // ponytail: 2s poll; switch to an injected preload bridge if it ever
  // needs to be immediate.
  const timer = setInterval(sync, 2000);

  win.webContents.on('did-finish-load', () => setTimeout(sync, 300));
  win.on('blur', sync);
  win.on('close', sync);
  win.on('closed', () => {
    clearInterval(timer);
    if (previewWindow === win) previewWindow = null;
  });

  win.webContents.on('before-input-event', (_e, input) => {
    if (input.key === 'F12' && input.type === 'keyDown') {
      win.webContents.toggleDevTools();
    }
  });

  return true;
});
