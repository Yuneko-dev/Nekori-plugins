import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import crypto from 'crypto';

export { utf8ToBytes, bytesToUtf8 } from '@noble/ciphers/utils.js';

/**
 * Merges Tailwind CSS classes with clsx
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Checks if a URL is absolute
 */
export const isUrlAbsolute = (url: string) => {
  if (url) {
    if (url.indexOf('//') === 0) {
      return true;
    } // URL is protocol-relative (= absolute)
    if (url.indexOf('://') === -1) {
      return false;
    } // URL has no protocol (= relative)
    if (url.indexOf('.') === -1) {
      return false;
    } // URL does not contain a dot, i.e. no TLD (= relative, possibly REST)
    if (url.indexOf('/') === -1) {
      return false;
    } // URL does not contain a single slash (= relative)
    if (url.indexOf(':') > url.indexOf('/')) {
      return false;
    } // The first colon comes after the first slash (= relative)
    if (url.indexOf('://') < url.indexOf('.')) {
      return true;
    } // Protocol is defined before first dot (= absolute)
  }
  return false; // Anything else must be relative
};

export const Buffer = globalThis.Buffer;

export const NodeCrypto = crypto;

/**
 * Get a default UserAgent string to be used in plugins.
 * @returns {string} Default value used as a placeholder. In the application, the UserAgent will be retrieved with the actual value from the device.
 */
export const getUserAgent = () =>
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';
