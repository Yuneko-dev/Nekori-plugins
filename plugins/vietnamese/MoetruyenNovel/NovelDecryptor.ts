import { fetchApi } from '@libs/fetch';
import { Buffer } from '@libs/utils';
import { gcm } from '@libs/aes';
import { ChapterDocument, NovelAsset, NovelReaderConfig } from './interface';

const utf8Encoder = new TextEncoder();
const GOLDEN_RATIO_32 = 2654435769;

type Grant = {
  algorithm: string;
  wrappedContentKey: string;
  version: number;
  imageId: string;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
  keyNonce: string;
  signature: string;
};

function normalizeStorageKey(storageKey: string): string {
  return storageKey.trim().replace(/^\/+/, '');
}

function decodeBase64Url(value: string) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  return Buffer.from(padded, 'base64');
}

function asBufferView(bytes: Uint8Array): Buffer {
  return Buffer.from(
    bytes.buffer as ArrayBuffer,
    bytes.byteOffset,
    bytes.byteLength,
  );
}

function unwrapKey(grantValue: string, normalizedStorageKey: string) {
  const grant = JSON.parse(
    decodeBase64Url(grantValue).toString('utf8'),
  ) as Grant;

  const key = decodeBase64Url(grant.wrappedContentKey);
  if (key.byteLength !== 32) {
    throw new Error('Khóa đọc nội dung không hợp lệ.');
  }

  const context = [
    'IMGX-GRANT-WRAP-v1',
    grant.version,
    grant.algorithm,
    grant.imageId,
    grant.issuedAt,
    grant.expiresAt,
    grant.nonce,
    grant.keyNonce,
    grant.signature,
    normalizedStorageKey,
  ].join('.');

  let state = 2166136261;
  for (const byte of utf8Encoder.encode(context)) {
    state = Math.imul(state ^ byte, 16777619) >>> 0;
  }
  state ||= GOLDEN_RATIO_32;

  for (let index = 0; index < 32; index += 4) {
    state = (state + index + GOLDEN_RATIO_32) >>> 0;
    state ^= (state << 13) >>> 0;
    state ^= state >>> 17;
    state ^= (state << 5) >>> 0;
    state >>>= 0;

    key[index] ^= state & 0xff;
    key[index + 1] ^= (state >>> 8) & 0xff;
    key[index + 2] ^= (state >>> 16) & 0xff;
    key[index + 3] ^= (state >>> 24) & 0xff;
  }

  return { key, grant };
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] * 0x1000000 +
      (bytes[offset + 1] << 16) +
      (bytes[offset + 2] << 8) +
      bytes[offset + 3]) >>>
    0
  );
}

export async function openChapter(
  site: string,
  config: NovelReaderConfig,
): Promise<ChapterDocument> {
  const response = await fetchApi(`${site}${config.contentUrl}`);
  if (!response.ok) {
    throw new Error('Không thể mở nội dung chương.');
  }

  const payload = new Uint8Array(await response.arrayBuffer());
  if (
    payload.length <= 33 ||
    payload[0] !== 0x4e || // N
    payload[1] !== 0x4f || // O
    payload[2] !== 0x56 || // V
    payload[3] !== 0x4c || // L
    payload[4] !== 1
  ) {
    throw new Error('Nội dung chương bị lỗi.');
  }

  const storageKey = normalizeStorageKey(config.storageKey);
  const { key } = unwrapKey(config.grant, storageKey);

  const aad = utf8Encoder.encode(`BFANG-NOVEL-v1.${storageKey}`);

  const plain = gcm(key, payload.subarray(5, 17), aad).decrypt(
    payload.subarray(17),
  );

  return JSON.parse(asBufferView(plain).toString('utf8')) as ChapterDocument;
}

export async function decryptImage(
  site: string,
  config: NovelReaderConfig,
  asset: NovelAsset,
): Promise<string> {
  const response = await fetchApi(
    `${site}${config.assetBaseUrl}${encodeURIComponent(String(asset.id))}.bin?t=${encodeURIComponent(String(config.assetCacheToken))}`,
  );

  if (!response.ok) {
    throw new Error('Không thể mở ảnh chương.');
  }

  const payload = new Uint8Array(await response.arrayBuffer());
  if (
    payload.length <= 41 ||
    payload[0] !== 0x49 || // I
    payload[1] !== 0x4d || // M
    payload[2] !== 0x47 || // G
    payload[3] !== 0x58 || // X
    payload[4] !== 3
  ) {
    throw new Error('Ảnh chương không hợp lệ.');
  }

  const width = readUint32BE(payload, 5);
  const height = readUint32BE(payload, 9);
  if (!width || !height) {
    throw new Error('Kích thước ảnh không hợp lệ.');
  }

  const storageKey = normalizeStorageKey(asset.storageKey);
  const { key, grant } = unwrapKey(asset.grant, storageKey);

  const aad = utf8Encoder.encode(
    `IMGX-v3.${grant.imageId}.${storageKey}.${width}.${height}`,
  );

  // payload[25..] = ciphertext || 16-byte GCM tag.
  const image = gcm(key, payload.subarray(13, 25), aad).decrypt(
    payload.subarray(25),
  );

  const base64 = asBufferView(image).toString('base64');
  return base64;
}
