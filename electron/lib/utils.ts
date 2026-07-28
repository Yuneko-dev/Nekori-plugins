import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import crypto from 'crypto';

export { utf8ToBytes, bytesToUtf8 } from '@noble/ciphers/utils.js';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const isUrlAbsolute = (url: string) => {
  if (url) {
    if (url.indexOf('//') === 0) return true;
    if (url.indexOf('://') === -1) return false;
    if (url.indexOf('.') === -1) return false;
    if (url.indexOf('/') === -1) return false;
    if (url.indexOf(':') > url.indexOf('/')) return false;
    if (url.indexOf('://') < url.indexOf('.')) return true;
  }
  return false;
};

export const Buffer = globalThis.Buffer;
export const NodeCrypto = crypto;

let cachedUA =
  'Mozilla/5.0 (Linux; Android 13; SM-S901B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36';

if (typeof window !== 'undefined' && window.electronAPI) {
  window.electronAPI.invoke('settings:get-user-agent').then((ua: string) => {
    if (ua) cachedUA = ua;
  });
}

export const getUserAgent = () => cachedUA;

export {
  encode as encodeHtmlEntities,
  decode as decodeHtmlEntities,
} from 'html-entities';
