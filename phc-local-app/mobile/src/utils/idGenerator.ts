import * as Crypto from 'expo-crypto';

const PHC_CODE = process.env.EXPO_PUBLIC_PHC_CODE || 'PHC001';
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

function randomSuffix(n = 4): string {
  const limit = Math.floor(256 / ALPHABET.length) * ALPHABET.length;
  let out = '';
  
  while (out.length < n) {
    const bytes = Crypto.getRandomBytes(n * 2);
    for (const byte of bytes) {
      if (byte >= limit) continue;
      out += ALPHABET[byte % ALPHABET.length];
      if (out.length === n) break;
    }
  }
  
  return out;
}

export function generateLocalId(phcCode = PHC_CODE): string {
  return `${phcCode}-${Date.now().toString(36)}-${randomSuffix(4)}`;
}
