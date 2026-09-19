# Locally-generated ID format: spec for every PHC front-end

**Backend plan §N.** This is the contract for patient IDs and capture IDs generated **on a PHC device**, offline, by any front-end: the desktop PHC app today, the Expo mobile app next. The desktop app's implementation is `phc-local-app/backend/services/ids.js`. This page states the same format explicitly, so nobody has to reverse-engineer it from that file.

## The format

```
{PHC_CODE}-{base36 timestamp}-{4 random chars}
```

Example: `PHC001-lz3k9f-a2x9`

| Part | Rule |
|---|---|
| `PHC_CODE` | The site's code, e.g. `PHC001`. Unique per PHC and set per deployment. It is not generated. |
| separator | One ASCII hyphen `-`. |
| timestamp | `Date.now().toString(36)`: milliseconds since the Unix epoch, lowercase base 36, **no padding**. It is 8 characters today (`mtuss3yg`) and will stay 8 until the year 2059. |
| separator | One ASCII hyphen `-`. |
| suffix | **Exactly 4** characters from `abcdefghijklmnopqrstuvwxyz0123456789`: lowercase only, drawn from a cryptographically secure RNG **without modulo bias** (see below). |

The same generator is used for **both** patient IDs and capture IDs. There is no separate format for either.

A validating regex, if you want one (with PHC codes limited to letters and digits):

```
^[A-Za-z0-9]+-[0-9a-z]+-[0-9a-z]{4}$
```

## Rules that matter, and why

1. **IDs are always strings**, never numbers, in storage and in JSON (api-contracts.md, "Global ID rule").
2. **Never use `Math.random()`** for the suffix. The suffix exists to separate two IDs minted in the same millisecond, for example during a batch import. A weak or biased RNG raises exactly that collision rate.
3. **No modulo bias.** `256 % 36 = 4`, so `byte % 36` would favour `a`–`d`. Reject any byte `>= 252` (the largest multiple of 36 that fits in a byte) and draw again.
4. **The PHC code must be configured per site.** Two sites running the same default code (`PHC001`) can mint colliding IDs. Central rejects a duplicate patient ID and treats a repeated capture ID as a re-send of the same case (§C, idempotent ingestion). A real collision between two sites would therefore silently merge two patients' captures.
5. **Capture IDs are the idempotency key.** Central deduplicates on them: sending the same capture ID twice returns the existing case. So a capture ID must be minted **once**, when the capture is taken, and stored. Never regenerate it on retry.
6. **Length.** A capture ID is also used in the chunk-upload URL (`/api/v1/cases/:captureRef/chunks…`), which accepts 1–64 characters of letters, digits, `-` and `_`. The format above is about 20 characters, well within that limit. Keep PHC codes short and alphanumeric.

## Reference algorithm

```js
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const LIMIT = Math.floor(256 / ALPHABET.length) * ALPHABET.length;   // 252

function randomSuffix(randomBytes, n = 4) {
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

function generateLocalId(phcCode, randomBytes) {
  return `${phcCode}-${Date.now().toString(36)}-${randomSuffix(randomBytes, 4)}`;
}
```

## Porting to Expo / React Native (the two substitutions)

`ids.js` cannot be imported into the mobile app as it stands. It uses two Node-only things; replace them as follows and keep everything else identical.

| In `ids.js` (Node) | In the Expo app |
|---|---|
| `crypto.randomBytes(n)` | `getRandomBytes(n)` from **`expo-crypto`**. It returns a `Uint8Array`, which iterates the same way. Use the synchronous version in the ID generator. |
| `process.env.PHC_CODE` | **`process.env.EXPO_PUBLIC_PHC_CODE`**, Expo's public-env convention, inlined at build time. Alternatively, pass it in from app configuration (`app.config.js` → `extra.phcCode`, read via `expo-constants`). |

So in the mobile app:

```ts
import { getRandomBytes } from 'expo-crypto';
const PHC_CODE = process.env.EXPO_PUBLIC_PHC_CODE;   // required; no silent default
export const generateLocalId = () => generateLocalId_(PHC_CODE!, getRandomBytes);
```

Two notes for mobile:
- **Fail loudly if `EXPO_PUBLIC_PHC_CODE` is unset.** Don't default to `PHC001` the way the desktop's single-site demo does (rule 4).
- **The same device sends its PHC API key** (`EXPO_PUBLIC_PHC_API_KEY` or app config) as `X-PHC-Api-Key` on every central call. See api-contracts.md, "PHC device authentication".

## Self-check for a port

Any implementation should pass all of these:

- `generateLocalId('PHC001')` matches `^PHC001-[0-9a-z]+-[0-9a-z]{4}$`.
- The middle part parses back to the current time: `parseInt(mid, 36)` is within a second of `Date.now()`.
- IDs minted in **different milliseconds** never collide, because the timestamp differs.
- Within **one** millisecond only the 4-character suffix separates IDs. That gives 36⁴ ≈ 1.68M values, so collisions follow the birthday bound, roughly k²/3.4M for k IDs minted in the same millisecond.
  - Measured on the desktop generator: 100,000 IDs minted in a tight loop (hundreds per millisecond) gave **5 duplicates**. That is expected, not a porting bug.
  - At real capture rates (seconds to minutes apart) it never happens.
  - A bulk import that mints IDs in a loop should either space them by at least 1 ms or check each new ID against those already minted.
- Over 100,000 suffixes, each of the 36 characters appears at about 1/36 of positions (±5%). An implementation that shows `a`–`d` noticeably more often than the rest is using a plain modulo.
