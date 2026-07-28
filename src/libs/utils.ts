/**
 * Backward compatibility for 3.0.0 - Re-exports from new location
 * TODO: Remove in 4.0.0
 */
export {
  utf8ToBytes,
  bytesToUtf8,
  Buffer,
  NodeCrypto,
  getUserAgent,
} from '../lib/utils';
export { encodeHtmlEntities, decodeHtmlEntities } from '../lib/html-entities';
