import crypto from 'node:crypto';

export const CryptoDigestAlgorithm = { SHA256: 'SHA-256' };
export function getRandomBytes(n) { return new Uint8Array(crypto.randomBytes(n)); }
export async function digest(_algorithm, data) {
  const buf = Buffer.from(data.buffer ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : data);
  const out = crypto.createHash('sha256').update(buf).digest();
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
}
