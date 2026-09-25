# Locally-generated ID format: spec for every PHC front-end

**Backend plan §N.** This is the contract for patient IDs and capture IDs generated **on a PHC device**, offline, by any front-end. There are two implementations and they must stay identical:

- the desktop PHC app's local backend: `phc-local-app/backend/services/ids.js`
- the Expo mobile app: `phc-local-app/mobile/netrasetu/lib/ids.ts`

`phc-local-app/mobile/test/unit.test.mjs` checks that both produce the same format.

> **Changed 2026-09-24: collision fix.** The suffix was 4 characters, and IDs minted in the same millisecond collided (~1% for 200 IDs in one millisecond, measured). There are two changes:
>
> - **The timestamp is now monotonic per process.** No device can mint the same ID twice.
> - **The suffix is now 8 characters.** A desktop and a phone of the same PHC, which share a PHC code, are separated by 36⁸ ≈ 2.8×10¹² values per millisecond.
>
> IDs minted before the change keep their 4-character suffix and stay valid everywhere.

## The format

```
{PHC_CODE}-{monotonic base36 timestamp}-{8 random chars}
```

Example: `PHC001-mtuss3yg-a2x9k7qp` (older IDs: `PHC001-lz3k9f-a2x9`)

| Part | Rule |
|---|---|
| `PHC_CODE` | The site's code, e.g. `PHC001`. It is unique per PHC, set per deployment, and not generated. |
| separator | One ASCII hyphen `-`. |
| timestamp | `Date.now().toString(36)`: milliseconds since the Unix epoch, lowercase base 36, **no padding**. It is 8 characters today and stays 8 until 2059. **Monotonic within one process:** if the clock hasn't advanced since the previous ID (or went backwards), use previous + 1 ms. |
| separator | One ASCII hyphen `-`. |
| suffix | **Exactly 8** characters from `abcdefghijklmnopqrstuvwxyz0123456789`: lowercase only, drawn from a cryptographically secure RNG **without modulo bias** (see below). |

The same generator is used for **both** patient IDs and capture IDs. There is no separate format for either.

A validating regex that accepts current and pre-2026-09-24 IDs (PHC codes limited to letters and digits):

```
^[A-Za-z0-9]+-[0-9a-z]+-(?:[0-9a-z]{8}|[0-9a-z]{4})$
```

## Rules that matter, and why

1. **IDs are always strings,** never numbers, in storage and in JSON (api-contracts.md, "Global ID rule").
2. **Never use `Math.random()`** for the suffix. The suffix separates IDs minted in the same millisecond by different devices of one PHC. A weak or biased RNG raises exactly that collision rate.
3. **No modulo bias.** `256 % 36 = 4`, so `byte % 36` would favour `a`–`d`. Reject any byte `>= 252` (the largest multiple of 36 that fits in a byte) and draw again.
4. **The timestamp never repeats within a process.** Keep the last value used, and if `Date.now()` is not greater than it, use last + 1. This makes a collision between two IDs from the same device impossible, however fast they are minted (bulk import, tests). If the clock is wrong and later corrected backwards, IDs keep increasing from the last value. They stay unique and are only a little ahead of wall time.
5. **The PHC code must be configured per site.** Two sites running the same default code (`PHC001`) share a namespace. Central rejects a duplicate patient ID and treats a repeated capture ID as a re-send of the same case (§C, idempotent ingestion). A collision between two sites would therefore silently merge two patients' captures.
6. **Capture IDs are the idempotency key.** Central deduplicates on them: sending the same capture ID twice returns the existing case. So a capture ID must be minted **once**, when the capture is taken, and stored. Never regenerate it on retry.
7. **Length.** A capture ID is also used in the chunk-upload URL (`/api/v1/cases/:captureRef/chunks…`), which accepts 1–64 characters of letters, digits, `-` and `_`. The format is about 24 characters. Keep PHC codes short and alphanumeric.

## Reference algorithm

```js
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const LIMIT = Math.floor(256 / ALPHABET.length) * ALPHABET.length;   // 252

function randomSuffix(randomBytes, n = 8) {
  let out = '';
  while (out.length < n) {
    for (const byte of randomBytes(n * 2)) {
      if (byte >= LIMIT) continue;           // reject: avoids modulo bias
      out += ALPHABET[byte % ALPHABET.length];
      if (out.length === n) break;
    }
  }
  return out;
}

let lastMs = 0;
function monotonicNow() {
  const now = Date.now();
  lastMs = now > lastMs ? now : lastMs + 1;
  return lastMs;
}

function generateLocalId(phcCode, randomBytes) {
  return `${phcCode}-${monotonicNow().toString(36)}-${randomSuffix(randomBytes, 8)}`;
}
```

## Porting to Expo / React Native (already done: `netrasetu/lib/ids.ts`)

| In `ids.js` (Node) | In the Expo app |
|---|---|
| `crypto.randomBytes(n)` | `getRandomBytes(n)` from **`expo-crypto`** (synchronous, returns a `Uint8Array`) |
| `process.env.PHC_CODE` | The device's configured site code (`EXPO_PUBLIC_PHC_CODE`, overridable in Device Settings) |

## Self-check for a port

Any implementation should pass all of these (the mobile unit tests check each one):

- `generateLocalId('PHC001')` matches `^PHC001-[0-9a-z]+-[0-9a-z]{8}$`.
- The middle part parses back to about the current time.
- **One million IDs minted back-to-back in one process are all distinct.**
- **With the clock frozen, 50,000 IDs are distinct and strictly increasing.**
- Suffixes of IDs minted by independent generators in the same millisecond collide at the birthday bound for 36⁸: about k²/5.6×10¹², i.e. about 0.007 expected collisions for k = 200,000.
- Over 20,000 IDs, each of the 36 characters appears at about 1/36 of suffix positions (±5%). A generator that shows `a`–`d` noticeably more often is using a plain modulo.
