import { createHash } from 'node:crypto';

export enum CryptoDigestAlgorithm {
  SHA256 = 'SHA-256',
}

export enum CryptoEncoding {
  HEX = 'hex',
}

export function digestStringAsync(
  _algorithm: CryptoDigestAlgorithm,
  data: string,
): Promise<string> {
  return Promise.resolve(createHash('sha256').update(data).digest('hex'));
}

export function digest(
  _algorithm: CryptoDigestAlgorithm,
  data: BufferSource,
): Promise<ArrayBuffer> {
  const view = ArrayBuffer.isView(data)
    ? Buffer.from(data.buffer, data.byteOffset, data.byteLength)
    : Buffer.from(data);
  const hash = createHash('sha256').update(view).digest();
  return Promise.resolve(hash.buffer.slice(hash.byteOffset, hash.byteOffset + hash.byteLength));
}
