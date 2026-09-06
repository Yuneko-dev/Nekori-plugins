import { ipcMain, BrowserWindow } from 'electron';
import { customSession } from '../main';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function getIframeRectViaCDP(win: BrowserWindow) {
  try {
    const { root } = await win.webContents.debugger.sendCommand(
      'DOM.getDocument',
      { depth: -1, pierce: true },
    );

    let targetNodeId: number | null = null;
    function traverse(node: any) {
      if (node.nodeName.toLowerCase() === 'iframe' && node.attributes) {
        const srcIdx = node.attributes.indexOf('src');
        if (srcIdx !== -1) {
          const src = node.attributes[srcIdx + 1];
          if (
            src.includes('challenges.cloudflare.com') ||
            src.includes('turnstile')
          ) {
            targetNodeId = node.nodeId;
            return;
          }
        }
      }
      if (node.children) {
        for (const child of node.children) traverse(child);
      }
      if (node.shadowRoots) {
        for (const shadow of node.shadowRoots) traverse(shadow);
      }
    }
    traverse(root);

    if (targetNodeId) {
      try {
        const { object } = await win.webContents.debugger.sendCommand(
          'DOM.resolveNode',
          { nodeId: targetNodeId },
        );
        if (object && object.objectId) {
          await win.webContents.debugger.sendCommand('Runtime.callFunctionOn', {
            objectId: object.objectId,
            functionDeclaration:
              'function() { this.scrollIntoView({ behavior: "instant", block: "center", inline: "center" }); }',
          });
          await sleep(50);
        }
      } catch (scrollErr) {
        console.error('[CDP Scroll Error]', scrollErr);
      }

      const { model } = await win.webContents.debugger.sendCommand(
        'DOM.getBoxModel',
        { nodeId: targetNodeId },
      );
      const content = model.content;
      return {
        x: Math.round(content[0]),
        y: Math.round(content[1]),
        width: Math.round(content[2] - content[0]),
        height: Math.round(content[5] - content[1]),
      };
    }
  } catch (e) {
    console.error('[CDP Error]', e);
  }
  return null;
}

function createCloudflareWindow() {
  if (process.env.NEKORI_PLUGIN_CHECKS) {
    throw new Error(
      'CHECK_BLOCKED: Cloudflare challenge requires an interactive browser session',
    );
  }
  return new BrowserWindow({
    width: 800,
    height: 600,
    show: true,
    webPreferences: {
      session: customSession,
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
    },
  });
}

async function waitForIframe(win: BrowserWindow) {
  let iframeRect = null;
  let attempts = 0;
  while (attempts < 15) {
    if (win.isDestroyed()) return null;
    iframeRect = await getIframeRectViaCDP(win);
    if (iframeRect && iframeRect.width > 5 && iframeRect.height > 5) {
      return iframeRect;
    }
    iframeRect = null;
    await sleep(1000);
    attempts++;
  }
  return null;
}

async function performClickAndVerify<T>(
  win: BrowserWindow,
  iframeRect: any,
  logPrefix: string,
  verificationFn: () => Promise<T | null>,
): Promise<T | null> {
  const clickX = iframeRect.x + Math.floor(iframeRect.width / 2);
  const clickY = iframeRect.y + Math.floor(iframeRect.height / 2);

  await sleep(4000);

  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      console.log(`${logPrefix} Retrying click (attempt ${attempt + 1})...`);
      await sleep(2000);
    }

    if (win.isDestroyed()) return null;

    try {
      await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: clickX,
        y: clickY,
      });
      await sleep(50);
      await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x: clickX,
        y: clickY,
        button: 'left',
        clickCount: 1,
      });
      await sleep(50);
      await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: clickX,
        y: clickY,
        button: 'left',
        clickCount: 1,
      });
      console.log(`${logPrefix} CDP Clicked iframe center:`, clickX, clickY);
    } catch (e) {
      console.error(`${logPrefix} CDP Click failed:`, e);
    }

    for (let i = 0; i < 7; i++) {
      await sleep(1000);
      if (win.isDestroyed()) return null;

      const result = await verificationFn();
      if (result !== null) {
        return result;
      }
    }
  }

  return null;
}

export async function solveCloudflare(
  url: string,
  type: 'interstitial' | 'turnstile' = 'turnstile',
): Promise<boolean> {
  const win = createCloudflareWindow();
  const logPrefix = '[solveCloudflare]';

  try {
    win.webContents.debugger.attach('1.3');
  } catch (err) {
    console.error(`${logPrefix} Debugger attach failed:`, err);
  }

  try {
    await win.loadURL(url);

    let iframeRect = null;
    let attempts = 0;
    while (attempts < 15) {
      if (win.isDestroyed()) return false;
      if (type === 'interstitial') {
        let scriptExists = true;
        try {
          scriptExists = await win.webContents.executeJavaScript(`
              !!document.querySelector('script[src*="/cdn-cgi/challenge-platform/"]')
           `);
        } catch (e) {
          scriptExists = false;
        }
        if (!scriptExists) {
          console.log(
            `${logPrefix} Interstitial challenge passed automatically.`,
          );
          win.webContents.debugger.detach();
          win.close();
          return true;
        }
      }

      iframeRect = await getIframeRectViaCDP(win);
      if (iframeRect && iframeRect.width > 5 && iframeRect.height > 5) {
        break;
      }
      iframeRect = null;
      await sleep(1000);
      attempts++;
    }

    if (!iframeRect) {
      console.error(`${logPrefix} Cloudflare iframe not found or not visible.`);
      win.webContents.debugger.detach();
      win.close();
      return false;
    }

    console.log(`${logPrefix} Found iframe at:`, iframeRect);

    const result = await performClickAndVerify<boolean>(
      win,
      iframeRect,
      logPrefix,
      async () => {
        let isNavigatingOrSolved = false;

        try {
          const indicators = await win.webContents.executeJavaScript(`
          (() => {
             const hasScript = !!document.querySelector('script[src*="/cdn-cgi/challenge-platform/"]');
             const hasTurnstile = !!document.querySelector('script[src*="challenges.cloudflare.com/turnstile/v0"]') || !!document.querySelector('input[name="cf-turnstile-response"]');
             const input = document.querySelector('input[name="cf-turnstile-response"]');
             const turnstileValue = input ? input.value : null;
             return { hasScript, hasTurnstile, turnstileValue };
          })();
        `);

          if (type === 'turnstile') {
            if (
              indicators.turnstileValue &&
              indicators.turnstileValue.length > 0
            ) {
              console.log(`${logPrefix} Turnstile response token found.`);
              isNavigatingOrSolved = true;
            } else if (!indicators.hasTurnstile) {
              console.log(
                `${logPrefix} Turnstile indicators no longer present.`,
              );
              isNavigatingOrSolved = true;
            }
          } else {
            if (!indicators.hasScript) {
              console.log(`${logPrefix} Interstitial challenge passed.`);
              isNavigatingOrSolved = true;
            }
          }
        } catch (e) {
          console.log(
            `${logPrefix} Context destroyed, assuming navigated/solved.`,
          );
          isNavigatingOrSolved = true;
        }

        if (!isNavigatingOrSolved && type === 'turnstile') {
          try {
            const { root } = await win.webContents.debugger.sendCommand(
              'DOM.getDocument',
              { depth: -1, pierce: true },
            );
            let success = false;
            function traverse(node: any) {
              if (success) return;
              if (
                node.nodeName &&
                node.nodeName.toLowerCase() === 'div' &&
                node.attributes
              ) {
                const idIdx = node.attributes.indexOf('id');
                if (idIdx !== -1 && node.attributes[idIdx + 1] === 'success') {
                  success = true;
                  return;
                }
              }
              if (node.children) {
                for (const child of node.children) traverse(child);
              }
              if (node.shadowRoots) {
                for (const shadow of node.shadowRoots) traverse(shadow);
              }
            }
            traverse(root);
            if (success) {
              console.log(
                `${logPrefix} Turnstile success div found inside shadow DOM.`,
              );
              isNavigatingOrSolved = true;
            }
          } catch (e) {
            // Ignore CDP errors
          }
        }

        if (isNavigatingOrSolved) {
          await sleep(2000);
          return true;
        }
        return null;
      },
    );

    if (result) {
      console.log(`${logPrefix} Challenge solved successfully.`);
    } else {
      console.error(`${logPrefix} Failed to solve challenge (timeout).`);
    }

    await sleep(2000);
    win.webContents.debugger.detach();
    win.close();
    return result || false;
  } catch (err) {
    console.error(`${logPrefix} Error:`, err);
    if (!win.isDestroyed()) {
      try {
        win.webContents.debugger.detach();
      } catch {
        /* The debugger may already be detached. */
      }
      win.close();
    }
    return false;
  }
}

export async function solveCloudflareTurnstile(
  url: string,
  sitekey: string,
): Promise<string> {
  const win = createCloudflareWindow();
  const logPrefix = '[solveCloudflareTurnstile]';

  try {
    const html = `<!DOCTYPE html>
<html>
<head>
  <script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=myCallback" async defer></script>
</head>
<body style="display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #fff;">
  <div id="captcha"></div>
  <script>
    window.turnstileToken = null;
    window.myCallback = function() {
      turnstile.render('#captcha', {
        sitekey: ${JSON.stringify(sitekey)},
        callback: function(token) {
          window.turnstileToken = token;
        }
      });
    };
  </script>
</body>
</html>`;

    const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;

    await win.loadURL(dataUrl, {
      baseURLForDataURL: url,
    });

    win.webContents.debugger.attach('1.3');

    const iframeRect = await waitForIframe(win);

    if (!iframeRect) {
      console.log(`${logPrefix} Cloudflare iframe not found or not visible.`);
      win.webContents.debugger.detach();
      win.close();
      return '';
    }

    console.log(`${logPrefix} Found iframe at:`, iframeRect);

    const token = await performClickAndVerify<string>(
      win,
      iframeRect,
      logPrefix,
      async () => {
        try {
          const evalRes = await win.webContents.executeJavaScript(
            `window.turnstileToken`,
          );
          if (evalRes && typeof evalRes === 'string' && evalRes.length > 0) {
            console.log(`${logPrefix} Turnstile token retrieved!`);
            return evalRes;
          }
        } catch (e) {
          // ignore
        }
        return null;
      },
    );

    if (!win.isDestroyed()) {
      win.webContents.debugger.detach();
      win.close();
    }
    return token || '';
  } catch (err) {
    console.error(`${logPrefix} Error:`, err);
    if (!win.isDestroyed()) {
      try {
        win.webContents.debugger.detach();
      } catch {
        /* The debugger may already be detached. */
      }
      win.close();
    }
    return '';
  }
}

ipcMain.handle('cloudflare:solve', (_, url, type) =>
  solveCloudflare(url, type),
);
ipcMain.handle('cloudflare:solve-turnstile', (_, url, sitekey) =>
  solveCloudflareTurnstile(url, sitekey),
);
