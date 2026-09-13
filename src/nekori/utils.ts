/**
 * Nekori utilities. Electron uses Node crypto; Android uses crypto-browserify.
 * Only algorithms implemented by both runtimes are portable.
 */
import crypto from 'crypto';

/** Binary conversion using the host Buffer implementation. */
export const Buffer = globalThis.Buffer;
/** Node-compatible crypto API; algorithm availability depends on the host. */
export const NodeCrypto = crypto;

let cachedUA =
  'Mozilla/5.0 (Linux; Android 13; SM-S901B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36';

if (typeof window !== 'undefined' && window.electronAPI) {
  window.electronAPI.invoke('settings:get-user-agent').then((ua: string) => {
    if (ua) cachedUA = ua;
  });
}

/** Current configured user agent (Electron hydrates it asynchronously at startup). */
export const getUserAgent = () => cachedUA;

export {
  decode as decodeHtmlEntities,
  encode as encodeHtmlEntities,
} from 'html-entities';
