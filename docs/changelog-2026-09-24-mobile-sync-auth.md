# Change log — mobile app rebuild, offline sync, auth, encryption

**Date:** 2026-09-24. **Scope:** everything changed in one working session with Claude Code (requested by Tanuj). Each entry names the files it touched and how it was verified.

Status key: ✅ done and verified · 🟡 done, verification limited (stated) · ❌ not done (reason given)

---

## 1. Mobile app (Expo), `phc-local-app/mobile`

| # | Change | Files | Status |
|---|---|---|---|
| 1.1 | Rebuilt as the mobile version of the desktop PHC frontend: login, 4-section registration with duplicate check, 3-step capture, local queue, case report, settings. The previous code isn't imported any more; `src/` stays only because it was locked during the session and is safe to delete. | `netrasetu/**`, `App.tsx`, `tsconfig.json`, `babel.config.js`, `app.json` | ✅ type-check + Android bundle |
| 1.2 | Talks to the **central backend directly** with the PHC key. SQLite store per §4.3; background sync (summary first, then image; chunked above 2 MB; capture ID as idempotency key; urgency-then-age order). | `netrasetu/api/central.ts`, `netrasetu/sync/*`, `netrasetu/db/*` | ✅ `npm run test:sync` 9/9 against real central |
| 1.3 | On-device quality gate ported from `qualityGateMain.m` (not the disabled JS fallback), at full resolution. | `netrasetu/lib/quality/*` | ✅ 35/35 MATLAB parity (§3.1) |
| 1.4 | New feature: **fundus-lens capture** (in-app camera, torch, zoom, pupil guide), tagged `mobile_lens` → `mobile_lens` preset. | `netrasetu/screens/LensCameraScreen.tsx` | 🟡 not run on a device (no Android SDK here) |
| 1.5 | Test harness: the real TypeScript runs under `node:test`; only device APIs are shimmed (`node:sqlite`, `fs`, `node:crypto`, in-memory keystore). | `test/**` | ✅ |
| 1.6 | Dependencies. Removed: axios, @expo/ngrok, expo-media-library, Roboto, AsyncStorage. Added: react-native-svg, expo-print, expo-asset, expo-secure-store, fonts, i18next, fast-png, @noble/ciphers, @noble/hashes. | `package.json` | ✅ |
| 1.7 | **Offline sync with the PHC PC** (§6): pairing screen (QR scan or paste), replication pass in every sync cycle, upload ownership, bundle export/import in the menu. | `netrasetu/peer/*`, `netrasetu/screens/PairingScreen.tsx`, `netrasetu/db/database.ts` (migration v2), `netrasetu/db/captures.ts`, `netrasetu/sync/syncManager.ts`, `netrasetu/components/AppHeader.tsx` | ✅ `npm run test:peer` 12/12 |
| 1.8 | **Real technician login** (§5): through the PC over the sealed channel, then an offline PBKDF2 verifier for power cuts. Built-in demo account only in dev builds before pairing. | `netrasetu/auth/*`, `netrasetu/screens/LoginScreen.tsx` | ✅ in `test:peer` |
| 1.9 | Pairing key and PC session token moved into the **OS keystore** (expo-secure-store), out of SQLite. | `netrasetu/lib/secrets.ts`, `netrasetu/peer/pairing.ts`, `netrasetu/auth/AuthContext.tsx` | ✅ regression test |

## 2. Central backend, `central-system/backend`

| # | Change | Files | Status |
|---|---|---|---|
| 2.1 | New PHC-key endpoints `GET /api/v1/phc/cases/:captureRef/report` and `…/gradcam` (own cases only; another site's case returns 404). | `routes/phc.js`, `docs/api-contracts.md` | ✅ e2e + `test:sync`; 🟡 cross-site check not tested with two provisioned keys |
| 2.2 | Applied pending migrations 0016–0018 to the local dev DB (without them grading failed and `GET /cases/:id` returned 500). | DB only | ✅ |
| 2.3 | Auth review: bcrypt with dummy-hash compare, login lockout, JWT HS256 pinned, CSRF inside the signed token, timing-safe compares, API keys stored as SHA-256, Twilio webhook HMAC fails closed. No defects found. | — | ✅ `verify_backend_auth.js` ALL PASSED |

## 3. MATLAB

| # | Change | Files | Status |
|---|---|---|---|
| 3.1 | Parity test: mobile gate vs MATLAB `qualityGateMain.m`, 17 images × 2 presets, every decision branch, including the two images where the lens preset changes the answer. | `verify_mobile_quality_gate_parity.mjs` | ✅ 35/35; scores within 1e-11 (occlusion 2.4e-3) |
| 3.2 | Installed **MATLAB Compiler** (R2026a) into `D:\` with `mpm`. The OS-registration step needs admin rights and failed (file associations only). Added the four compiler folders (`\toolbox\compiler`, `\deploy`, `\mltall`, `\runtime`) to `D:\toolbox\local\pathdef.m`, which that step would have done. The original is backed up at `db-backups/pathdef.m.before-compiler`. | MATLAB install | ✅ `mcc` available, license checks out |
| 3.3 | Built the desktop gate exe `phc-local-app/backend/quality-gate-matlab/dist/qualityGate.exe`. | `dist/` (build output) | see §9 |

## 4. Local IDs

| # | Change | Files | Status |
|---|---|---|---|
| 4.1 | **Collision fix.** Monotonic timestamp per process (no same-device collision is possible) and an 8-char suffix (cross-device ≈ 7e-9 at 200/ms). Old 4-char IDs stay valid. | `phc-local-app/backend/services/ids.js`, `mobile/netrasetu/lib/ids.ts`, `docs/id-format-spec.md` | ✅ 1M IDs with zero collisions; frozen clock unique; formats identical |

## 5. Auth (design doc §11.1)

| # | Change | Files | Status |
|---|---|---|---|
| 5.1 | **PHC local backend had no auth at all.** Added technician accounts (scrypt), bearer sessions (only the SHA-256 is stored, 12 h), `/auth/login`, `/auth/me`, `/auth/logout`, lockout after 10 failures, the same answer for unknown user and wrong password, access log on every read of patient data, and the `requireTechnician` guard on `/patients`, `/captures`, `/sync`. | `db/localDb.js`, `services/passwords.js`, `services/localAuth.js`, `middleware/requireTechnician.js`, `routes/auth.js`, `server.js` | ✅ `npm test` (backend) |
| 5.2 | Admin CLI: `npm run technician -- add|reset|deactivate|list`. | `phc-local-app/backend/scripts/technician.js` | ✅ used by the tests |
| 5.3 | Rollout flag `LOCAL_AUTH_ENABLED` (default **false**, like central's `AUTH_ENABLED`): without a token a request passes; an invalid token is always rejected. | `services/localAuth.js` | ✅ tested with it on |
| 5.4 | Desktop web app: in real-backend mode the login calls `/auth/login` and every call sends the bearer token. Mock mode is unchanged. | `phc-local-app/frontend/src/components/screens/LoginScreen.jsx`, `src/api/localApiClient.js` | 🟡 builds; real mode not exercised (desktop integration deferred) |
| 5.5 | Mobile login (see 1.8). | | ✅ |
| 5.6 | Central config: `JWT_SECRET` generated into `.env`; `PHC_API_KEY` provisioned for PHC Kharadi; `PHC_AUTH_ENABLED=true`. `AUTH_ENABLED` stays false until the central web app has real login (it's still mock). | `.env` (not committed) | see §9 |

## 6. Desktop ↔ phone offline sync

| # | Change | Files | Status |
|---|---|---|---|
| 6.1 | Protocol spec: pairing, sealed channel, change feed, merge rules, ownership, bundles. | `docs/peer-sync-protocol.md` | ✅ |
| 6.2 | PC side: change-feed triggers, `peer_devices`, `/peer/*` routes (hello, login, pull, push, image get/put, bundle), pairing limited to localhost or a PHC admin, upload ownership in the local sync manager, and the central case ID now recorded after upload. | `db/localDb.js`, `services/peerCrypto.js`, `services/peerSync.js`, `services/peerBundle.js`, `routes/peer.js`, `services/syncManager.js`, `services/captureHandler.js` (`LOCAL_STORAGE_DIR`) | ✅ backend `npm test` 24/24 |
| 6.3 | PC CLI: `npm run peer -- pair|devices|revoke|import|export` (pairing prints a QR code). | `scripts/peer.js`, `package.json` (+ `qrcode`) | ✅ used by `test:peer` |
| 6.4 | Phone side: see 1.7. The power-cut scenario (PC process killed and restarted) passes end to end. | | ✅ |

## 7. Encryption

| # | Check or change | Result |
|---|---|---|
| 7.1 | TLS on central (`TLS_KEY_PATH`/`TLS_CERT_PATH`): TLS 1.2/1.3 served; 1.0/1.1 and plain HTTP refused | ✅ `verify_tls.js` |
| 7.2 | **Added** TLS to the PHC local backend (`LOCAL_TLS_KEY_PATH`/`LOCAL_TLS_CERT_PATH`), same checks | ✅ `verify_tls.js` + backend test |
| 7.3 | **Added** AES-256-GCM sealed channel for phone ↔ PC (context-bound AAD, single-use nonce, clock window). Checks: wrong key, tampering, replay, stale clock, cross-endpoint replay and revoked device are all rejected. node:crypto ↔ @noble interop tested both ways. | ✅ |
| 7.4 | **Added** encrypted bundle files for hand-carry (USB/SD): tampered, mis-addressed and wrong-key bundles are refused, and the file contains no readable patient data. | ✅ |
| 7.5 | At-rest hashes: technician passwords (scrypt), PC session tokens (SHA-256), phone offline verifiers (PBKDF2-SHA256), central passwords (bcrypt) and API keys (SHA-256). | ✅ tested |
| 7.6 | Phone secrets in the OS keystore (1.9); phone files are covered by Android file-based encryption (on by default since Android 10). | ✅ / 🟡 OS feature |
| 7.7 | **Encryption at rest on the PC and central (databases, images): NOT in place on this machine.** The plan's mechanism is OS disk encryption, and the registry here has `PreventDeviceEncryption = 1` (Windows Home Device Encryption is blocked). Needs an admin: clear that policy and turn on Settings → Privacy & security → Device encryption, if the hardware supports it. Column-level `pgcrypto` stays out of scope per the backend plan. | ❌ needs admin action |

## 8. Backups and test data

| What | Where |
|---|---|
| Central Postgres, taken before this session's second round of testing (it already contained 19 test cases from the first e2e runs) | `DR_SCREENING/db-backups/dr_screening_central-20260924-174855.dump` |
| Central media | `DR_SCREENING/db-backups/central-media-20260924-174855/` |
| PHC local SQLite | `DR_SCREENING/db-backups/phc-local-20260924-174912.sqlite` |
| MATLAB pathdef | `DR_SCREENING/db-backups/pathdef.m.before-compiler` |

## 9. Session wrap-up

### 9.1 Desktop quality-gate exe (§3.3): ❌ not finished
- **Build 1** (`-N -p images`) produced `qualityGate.exe` (10.9 MB), which failed at start with `runtimeInitializationChecks` undefined: `\toolbox\compiler\runtime` wasn't on the path yet (fixed in §3.2).
- **Build 2** (repo's `buildQualityGateExe.m`, no `-N`) failed in dependency analysis: `internal.matlab.importtool.server.ImportUtils` couldn't be imported (MATLAB's own Import Tool; the gate doesn't use it).
- **Build 3** (`-N -p images -p compiler`, with the runtime path fixed) was **stopped by Claude Code because the machine ran low on memory**, not because it failed. Rerun it when the machine is idle:
  ```
  matlab -batch "cd('phc-local-app/backend/quality-gate-matlab'); mcc('-m','qualityGateCli.m','-o','qualityGate','-d','dist','-a','cameraPresets.json','-N','-p',fullfile(matlabroot,'toolbox','images'),'-p',fullfile(matlabroot,'toolbox','compiler'))"
  ```
  Then test it with `D:\runtime\win64` on PATH: `dist\qualityGate.exe demo_images\1_quality_pass.jpg unknown`.
- The desktop gate still works without the exe: the local backend falls back to `matlab -batch`.

### 9.2 Central dev database: ✅ recovered
- Restored `dr_screening_central` from `db-backups/dr_screening_central-20260924-174855.dump` (`pg_restore --clean`).
- Removed the 19 test patients/cases from the first e2e runs, which the backup contained. The database is back to its original **36 cases**, with all 18 migrations (0016–0018 stay applied).
- Removed the test media folders and chunk sessions: `media/cases` = 36 folders, matching the database; `media/chunks` is empty.
- The PHC local database (`phc-local-app/backend/db/local.sqlite`) was never used by tests (they use throwaway copies): still 42 patients / 42 captures.

### 9.3 Final configuration: ✅
- PHC Kharadi provisioned with a central API key (it had none). `PHC_API_KEY`, `PHC_AUTH_ENABLED=true` and `JWT_SECRET` are in `.env`; `EXPO_PUBLIC_PHC_API_KEY` is in `mobile/.env`.
- Checked against live central: no key → 401 `phc_key_required`, wrong key → 401 `phc_key_invalid`, real key accepted.
- Phone: a key entered in Device Settings is stored in the OS keystore. For release builds, leave `EXPO_PUBLIC_PHC_API_KEY` empty, because `EXPO_PUBLIC_*` values are compiled into the app.
- **Restart the running PHC local backend** (port 4000) to pick up the new code, schema and key. It was started before these changes.
- Still off, by design: `AUTH_ENABLED` (central web app has no real login yet) and `LOCAL_AUTH_ENABLED` (create technician accounts first with `npm run technician -- add …`, then set it true).

### 9.4 Test totals at the end of the session
| Suite | Result |
|---|---|
| Mobile unit (`npm test`) | 23/23 |
| Mobile ↔ central (`npm run test:sync`) | 9/9 |
| Mobile ↔ PC power cut (`npm run test:peer`) | 12/12 |
| Mobile gate vs MATLAB (`npm run test:parity`) | 35/35 |
| Local backend auth + peer + TLS (`phc-local-app/backend: npm test`) | 24/24 |
| TLS on both backends (`node verify_tls.js`) | 12/12 |
| Central auth (`node verify_backend_auth.js`) | ALL PASSED |
| Not run: `verify_mobile_lens.js` (would use your live port 4000 and live DB); `verify_quality_gate_parity.js` (needs the exe, and compares it against the JS fallback, which is now switched off by design) | — |
