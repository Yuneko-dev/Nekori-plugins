import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export { bytesToUtf8, utf8ToBytes } from './nobleWrapper';

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
