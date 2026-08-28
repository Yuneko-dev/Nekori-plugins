import { fetchApi } from '@libs/fetch';
import { Buffer, NodeCrypto } from '@libs/utils';
import { ChapterDocument, NovelAsset, NovelReaderConfig } from './interface';

function decodeBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  return new Uint8Array(Buffer.from(padded, 'base64'));
}

function unwrapKey(grantValue: string, storageKey: string) {
  const grant = JSON.parse(
    Buffer.from(decodeBase64Url(grantValue)).toString('utf8'),
  ) as {
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
    storageKey.trim().replace(/^\/+/, ''),
  ].join('.');
  const key = decodeBase64Url(grant.wrappedContentKey);
  if (key.byteLength !== 32) throw new Error('Khóa đọc nội dung không hợp lệ.');
  let state = 2166136261;
  for (const byte of new TextEncoder().encode(context)) {
    state = Math.imul(state ^ byte, 16777619) >>> 0;
  }
  state ||= 2654435769;
  for (let index = 0; index < key.length; index++) {
    if (index % 4 === 0) {
      state = (state + index + 2654435769) >>> 0;
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      state >>>= 0;
    }
    key[index] ^= (state >>> ((index % 4) * 8)) & 255;
  }
  return { key, grant };
}

export async function openChapter(
  site: string,
  config: NovelReaderConfig,
): Promise<ChapterDocument> {
  const response = await fetchApi(`${site}${config.contentUrl}`);
  if (!response.ok) throw new Error('Không thể mở nội dung chương.');
  const payload = new Uint8Array(await response.arrayBuffer());
  if (
    payload.length <= 33 ||
    String.fromCharCode(...payload.slice(0, 4)) !== 'NOVL' ||
    payload[4] !== 1
  ) {
    throw new Error('Nội dung chương bị lỗi.');
  }
  const { key } = unwrapKey(config.grant, config.storageKey);
  const tag = payload.subarray(payload.length - 16);
  const decipher = NodeCrypto.createDecipheriv(
    'aes-256-gcm',
    Buffer.from(key),
    Buffer.from(payload.subarray(5, 17)),
    { authTagLength: 16 },
  );
  decipher.setAAD(
    Buffer.from(
      `BFANG-NOVEL-v1.${config.storageKey.trim().replace(/^\/+/, '')}`,
    ),
  );
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([
    decipher.update(payload.subarray(17, payload.length - 16)),
    decipher.final(),
  ]);
  return JSON.parse(plain.toString('utf8')) as ChapterDocument;
}

export async function decryptImage(
  site: string,
  config: NovelReaderConfig,
  asset: NovelAsset,
): Promise<string> {
  const response = await fetchApi(
    `${site}${config.assetBaseUrl}${encodeURIComponent(String(asset.id))}.bin?t=${encodeURIComponent(String(config.assetCacheToken))}`,
  );
  if (!response.ok) throw new Error('Không thể mở ảnh chương.');
  const payload = new Uint8Array(await response.arrayBuffer());
  if (
    payload.length <= 41 ||
    String.fromCharCode(...payload.slice(0, 4)) !== 'IMGX' ||
    payload[4] !== 3
  ) {
    throw new Error('Ảnh chương không hợp lệ.');
  }
  const view = new DataView(
    payload.buffer,
    payload.byteOffset,
    payload.byteLength,
  );
  const width = view.getUint32(5, false);
  const height = view.getUint32(9, false);
  if (!width || !height) throw new Error('Kích thước ảnh không hợp lệ.');
  const grant = JSON.parse(
    Buffer.from(decodeBase64Url(asset.grant)).toString('utf8'),
  ) as { imageId: string };
  const { key } = unwrapKey(asset.grant, asset.storageKey);
  const decipher = NodeCrypto.createDecipheriv(
    'aes-256-gcm',
    Buffer.from(key),
    Buffer.from(payload.subarray(13, 25)),
    { authTagLength: 16 },
  );
  decipher.setAAD(
    Buffer.from(
      `IMGX-v3.${grant.imageId}.${asset.storageKey.trim().replace(/^\/+/, '')}.${width}.${height}`,
    ),
  );
  decipher.setAuthTag(payload.subarray(payload.length - 16));
  const image = Buffer.concat([
    decipher.update(payload.subarray(25, payload.length - 16)),
    decipher.final(),
  ]);
  return image.toString('base64');
}
