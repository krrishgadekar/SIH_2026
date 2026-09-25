# PPT Audit 05 — Security, Reliability, Tests, Performance, Sync Bandwidth

**Project:** NetraSetu (SIH 2026, PS 26038, MathWorks)
**Audited:** 2026-09-25, on the working tree at `SIH_2026/` (branch `tanuj`, HEAD `7dcf3b1`, with uncommitted changes in the PHC backend, the mobile app and the central `routes/phc.js`, plus untracked PHC auth/peer files. Everything below reflects the working tree, not HEAD).
**Method:** every item was checked against code, migrations, config (`.env`, `app.json`), result/log files, the live Postgres DB, or a test run in this audit session. Docs were used only to find things to check. Every test suite was **run on 2026-09-25**. Numbers are copied exactly from the output or file. When a number is derived by arithmetic, the arithmetic is shown.

**Path shorthand:** `CB/` = `central-system/backend/`, `ML/` = `CB/ml-pipeline/`, `PB/` = `phc-local-app/backend/`, `MOB/` = `phc-local-app/mobile/`. Other paths are relative to `SIH_2026/`.

### Tags

| Tag | Meaning |
|---|---|
| **CODE-VERIFIED** | Found in code/config, or in a result file, log, DB row or test run, at the path given |
| **DOC-ONLY** | Claimed in a markdown doc/README; no code, result file or run backs it |
| **MOCK** | The UI exists, but what it does or shows is hardcoded |
| **BEYOND-V4** | Exists in code but isn't in `docs/system-design-v4.md` |
| **V4-MISSING** | v4 specifies it, but the code doesn't do it, or it's off on the live config |
| **V4-STALE** | v4 states something the code now contradicts |

---

## 0. Read this before putting anything on a slide

1. **Backend auth is real, but it's switched off for browser users on the current config.** The root `.env` has no `AUTH_ENABLED` line, so it defaults to `false` (`CB/services/authConfig.js:52`). The central server said so at boot during this audit: `[central] auth: users not enforced (AUTH_ENABLED=false), PHC keys ENFORCED`. PHC device keys **are** enforced (`PHC_AUTH_ENABLED=true`). With the flags forced on, the enforcement passes 64/64 checks (`verify_backend_auth.js`).
2. **The central web frontend's login is MOCK.** `central-system/frontend/src/components/screens/LoginScreen.jsx:71-99` accepts `admin/admin123`, `doctor/doctor123`, **or any password of 4+ characters**. It never calls `/api/v1/auth/login`, and the API client sends no `credentials: 'include'` and no CSRF header. `USE_MOCK_DATA` defaults to `true` (`central-system/frontend/src/config.js:1-3`), and no frontend `.env` overrides it. If `AUTH_ENABLED=true` were turned on today, the central web UI could not authenticate against the backend.
3. **No encryption at rest anywhere.** Postgres, central media files, PHC SQLite, and phone SQLite plus images are all plaintext. v4 §11.1 requires "AES-256 on the database and stored images" (**V4-MISSING**). The only AES-256 in the system is the desktop↔phone link and USB bundles (AES-256-GCM, **BEYOND-V4**).
4. **TLS is implemented and tested (12/12), but not configured.** `.env` has no `TLS_*` keys, and central booted with `(NO TLS -- set TLS_KEY_PATH / TLS_CERT_PATH)`. The mobile app ships `"usesCleartextTraffic": true` (`MOB/app.json`).
5. **The segmentation worker is broken and has been since at least 2026-09-24 17:09.** It crashes on every start with `KeyError: "unknown model role 'bright_lesion'"` (`ML/inference/segSession/worker.stderr.log`). The cause is `ML/inference/segSession/runSegWorker.py:73`, which still lists `"bright_lesion"` after `modelPaths.py` renamed the role to `"hard_exudate"`. The supervisor catches it correctly. System Health shows a `seg_worker_down` alert open since `2026-09-24T11:41:03.430Z`. Grading still works through the per-case fallback. It's a one-word fix, but it was not applied in this audit.
6. **v4 §11.1 is V4-STALE.** It says "Today, this system has **none** — no login route in any application, no auth middleware". That's no longer true (see §1). Update v4 or the slide before quoting it.
7. **Two verify scripts can't run on this machine.** `verify_fovea_e2e.js` and `verify_demo_dryrun.js` hardcode `C:\Users\91740\Desktop\SIH\dr-screening-system\...`. Both fail at `require` with `Cannot find module`.

---

## 1. Security

### 1.1 Authentication (who can log in, and how)

| Surface | Mechanism | Evidence | Tag |
|---|---|---|---|
| Central, browser users | `POST /api/v1/auth/login` (email+password) checks a **bcrypt** hash. Seeded demo users use `BCRYPT_COST = 12` (`scripts/seedDemoUsers.js:31`). The unknown-email path compares against a cost-10 dummy hash so timing doesn't reveal which accounts exist. `/auth/me`, `/auth/logout` | `CB/routes/auth.js:40-160` | CODE-VERIFIED |
| Same error for unknown email / wrong password / deactivated account | One 401 body, `invalid_credentials` | `CB/routes/auth.js:108-120` | CODE-VERIFIED |
| Brute-force brake (central) | In-memory. **10 failures per (ip, email)** and **50 per ip**, in a **15-min** window; answers `429 too_many_attempts` | `CB/routes/auth.js:45-50` | CODE-VERIFIED |
| Account revocation | `users.is_active` (migration 0012). A live session dies within **60 s** (`REVOCATION_CACHE_MS = 60_000`), and a role change applies on the next request | `CB/middleware/requireAuth.js:34-60`, `CB/db/migrations/0012_user_deactivation.sql` | CODE-VERIFIED, BEYOND-V4 |
| Boot-time guard | Server refuses to start if `AUTH_ENABLED=true` and `JWT_SECRET` is missing or shorter than 32 chars | `CB/services/authConfig.js:56-67` | CODE-VERIFIED |
| **Enforcement switch** | `AUTH_ENABLED` defaults to false. **Currently false.** While false, requests pass unauthenticated, but a valid cookie is still read for attribution | `.env` (no `AUTH_ENABLED` line), server boot log this audit | CODE-VERIFIED (**off**) |
| PHC device → central | Per-site API key in the `X-PHC-Api-Key` header. Only its **SHA-256** is stored (`phc_sites.api_key_hash`, unique index). Provisioned by `scripts/provisionPhcKey.js`. A valid key stamps `last_contact_at`. An invalid key is always rejected, even with enforcement off | `CB/middleware/requirePhcApiKey.js`, `CB/db/migrations/0002_auth_and_access_log.sql` | CODE-VERIFIED, BEYOND-V4 |
| PHC key enforcement | `PHC_AUTH_ENABLED=true` in `.env`. DB has **1 site, 1 with a key** | `.env`, live DB query | CODE-VERIFIED (**on**) |
| PHC desktop backend, technicians | `POST /auth/login` (username+password). Hash is **scrypt** (N=2^15, r=8, p=1, 32-byte key, 16-byte salt), compared in constant time. Same error for unknown user / wrong password. Lockout: **10 failures per (ip, username) in 15 min** | `PB/services/passwords.js`, `PB/routes/auth.js`, `PB/services/localAuth.js` | CODE-VERIFIED, BEYOND-V4 (v4 says only "a real authentication endpoint… in every application") |
| PHC desktop enforcement switch | `LOCAL_AUTH_ENABLED` defaults to false. **Currently false** (no line in `.env`). A present-but-invalid token is always rejected | `PB/services/localAuth.js:24`, `.env` | CODE-VERIFIED (**off**) |
| PHC desktop live DB state | `PB/db/local.sqlite` has only `patients, captures, questionnaire_responses, capture_metadata_responses, sync_queue`. The `technicians`/`sessions`/`access_log`/peer tables are created on the next server start, and **no technician accounts exist yet**. Setting `LOCAL_AUTH_ENABLED=true` today would lock everyone out until `npm run technician -- add …` is run | Read-only query of `PB/db/local.sqlite`, this audit | CODE-VERIFIED |
| PHC desktop web frontend | Real login when `USE_MOCK_DATA` is false (`localApi.login` → Bearer token in `localStorage`). But `USE_MOCK_DATA` **defaults to true**, and in mock mode it accepts `krrish/tech123`, `technician/tech123`, **or any password ≥4 chars** | `phc-local-app/frontend/src/components/screens/LoginScreen.jsx:25-72`, `phc-local-app/frontend/src/config.js:1-3` | CODE-VERIFIED (real path) / **MOCK** (default path) |
| Mobile app | Logs in through the PC over the sealed peer channel. When the PC is off, it verifies offline against a cached **PBKDF2-SHA256 verifier (60,000 iterations, 16-byte random salt)**; the password itself is never stored. A wrong password reported by the PC deletes the verifier | `MOB/netrasetu/auth/offlineCredentials.ts`, `MOB/netrasetu/auth/AuthContext.tsx` | CODE-VERIFIED, BEYOND-V4 |
| Mobile dev fallback | In a dev build **before pairing**, `technician / tech123` is accepted (`DEMO_HINT`). `EXPO_PUBLIC_TECHNICIANS=user:pass:Name,…` also works in release builds, and those credentials get **compiled into the bundle** | `MOB/netrasetu/auth/AuthContext.tsx:37-49`, `MOB/.env.example` | CODE-VERIFIED (**demo credential path**) |
| Twilio delivery webhook | `POST /api/v1/notifications/sms-status` is authenticated by `twilio.validateRequest` over `X-Twilio-Signature`, not by a session | `CB/routes/notifications.js:38-50` | CODE-VERIFIED, BEYOND-V4 |

### 1.2 RBAC — roles and permissions

**Central roles:** `ophthalmologist`, `district_admin` (`CB/services/authConfig.js:97`). Guards are applied **per route, not globally** (`CB/server.js:73`). Every guard is a no-op while `AUTH_ENABLED=false`. Live DB: **2 users, both active, roles `{district_admin, ophthalmologist}`**.

| Route (mounted under `/api/v1`) | Guard | File:line |
|---|---|---|
| `POST /auth/login`, `GET /auth/me`, `POST /auth/logout` | none (login endpoints) | `CB/routes/auth.js:92,134,157` |
| `POST /cases`, `POST /cases/summary`, `POST /cases/:ref/chunks/init`, `.../complete`, `GET .../chunks`, `POST .../chunks/:index` | PHC API key | `CB/routes/cases.js:105,151,206,213,223,236` |
| `GET /cases/:id/status` | PHC key **or** any logged-in user | `CB/routes/cases.js:253` |
| `GET /cases/:id`, `GET /cases/:id/report`, `GET /cases/:id/reviews` | `ophthalmologist` or `district_admin` | `CB/routes/cases.js:58,266,542,568` |
| `POST /cases/:id/review`, `POST /cases/:id/claim` | `ophthalmologist` | `CB/routes/cases.js:59,282,482` |
| `GET /ophthalmologist/queue` | `ophthalmologist` | `CB/routes/ophthalmologistQueue.js:34` |
| `GET /admin/dashboard, /referrals, /system-health, /resource-recommendations, /simulink-validation`; `POST .../refresh` ×2 | `district_admin` | `CB/routes/adminDashboard.js:39-115` |
| `PATCH /referrals/:id` | `district_admin` | `CB/routes/referrals.js:37` |
| `GET /phc/:phcId/sync-status` | `district_admin` | `CB/routes/phc.js:159` |
| `GET /phc/cases/:ref/report`, `GET /phc/cases/:ref/gradcam`, `GET /patients/search` | PHC API key | `CB/routes/phc.js:86,145`, `CB/routes/patients.js:55` |
| `POST /notifications/sms-status` | Twilio signature | `CB/routes/notifications.js:54` |
| `/media/*` (fundus, Grad-CAM, masks) | `requireAuth` (any logged-in user) | `CB/server.js:94` |
| `GET /health` | none (dependency-free heartbeat) | `CB/server.js:70` |

Also enforced: a PHC key is **pinned** to its own `phc_id` on ingestion (`pinPhc` in `CB/routes/cases.js`). Review claims expire after `CLAIM_TTL_MINUTES` (default 30), and a second reviewer can't submit while a claim is held (v4 §10.8). All of this is exercised in `verify_backend_auth.js` (64/64, §3).

**PHC desktop roles:** `technician`, `phc_admin` (`PB/db/localDb.js`, CHECK constraint). `phc_admin` is needed only to revoke a paired phone, and to pair from a LAN address. Pairing from `localhost` is allowed without login (`PB/routes/peer.js:58-86`). Every `/patients`, `/captures` and `/sync` route goes through `requireTechnician` (`PB/server.js:61-63`). **BEYOND-V4** (v4 names no PHC-side roles).

### 1.3 Session mechanism

| Where | Session | Lifetime | CSRF | Tag |
|---|---|---|---|---|
| Central | **JWT HS256** in an **httpOnly** cookie `ns_session`, `Secure` by default, `SameSite=lax` by default (`none` forces Secure). Claims: `userId, role, csrf` | `JWT_TTL_HOURS` default **12**, must be in (0, 24]. No refresh tokens | Double-submit: every non-GET must send `X-CSRF-Token` equal to the `csrf` claim inside the signed JWT, checked with a constant-time compare | CODE-VERIFIED (`CB/services/authTokens.js`, `authConfig.js`, `middleware/requireAuth.js:82-89`), BEYOND-V4 |
| PHC desktop | Opaque 32-byte random **Bearer** token. Only its **SHA-256** is stored (`sessions.token_hash`), with `device_id` and `last_seen_at` | `LOCAL_SESSION_HOURS` default **12** | n/a (header token, not a cookie) | CODE-VERIFIED (`PB/services/localAuth.js`) |
| Phone | PC-issued token plus the pairing key, both in the **OS keystore** (`expo-secure-store`, `WHEN_UNLOCKED_THIS_DEVICE_ONLY`). Logout clears them locally only; the PC-side session expires on its own | PC-side 12 h. **No phone-side session expiry or idle lock was found** | n/a | CODE-VERIFIED (`MOB/netrasetu/lib/secrets.ts`, `AuthContext.tsx:130-138`) |

### 1.4 TLS / encryption in transit

| Item | Evidence | Tag |
|---|---|---|
| Central HTTPS with `minVersion: 'TLSv1.2'` when `TLS_KEY_PATH` and `TLS_CERT_PATH` are set | `CB/server.js:148-163` | CODE-VERIFIED |
| PHC desktop HTTPS with `minVersion: 'TLSv1.2'` when `LOCAL_TLS_KEY_PATH` and `LOCAL_TLS_CERT_PATH` are set | `PB/server.js:104-116` | CODE-VERIFIED, BEYOND-V4 detail |
| Test: both backends negotiate TLSv1.3 by default, accept 1.2, refuse 1.0/1.1, refuse plain HTTP on the TLS port | `verify_tls.js`: **12/12 PASS** (run 2026-09-25). `PB` `npm test` #24 also PASS | CODE-VERIFIED |
| Self-signed dev cert generator | `scripts/generateDevCert.js` | CODE-VERIFIED |
| **Configured on this machine?** **No.** `.env` has no `TLS_*` or `LOCAL_TLS_*` keys, and the central boot log says `NO TLS` | `.env`, boot log | CODE-VERIFIED (**off**) |
| Mobile allows cleartext HTTP. Default central URL is `http://10.0.2.2:5000` | `MOB/app.json` (`"usesCleartextTraffic": true`), `MOB/.env.example` | CODE-VERIFIED |
| Desktop↔phone link: **AES-256-GCM** envelope per message, fresh 96-bit IV, AAD binds `device\|method\|path\|ts\|nonce`, nonce replay cache, **15-min** clock-skew limit. It's sealed whether or not TLS is on | `PB/services/peerCrypto.js`, `PB/routes/peer.js:33-42,110-112`, `MOB/netrasetu/peer/peerCrypto.ts` (`@noble/ciphers`) | CODE-VERIFIED, **BEYOND-V4** (v4 only rules out a general P2P mesh, §17) |
| Peer channel rejects: wrong key, tampered ciphertext, replayed nonce, stale clock, unknown device, cross-endpoint replay | `PB` `npm test` #10-12, 23 PASS; mobile `test:peer` 12/12 | CODE-VERIFIED |
| Response hardening headers on central: `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store` | `CB/server.js:55-66` | CODE-VERIFIED, BEYOND-V4 |
| CORS allowlist (central; `.env` lists localhost:5173-5175 on both `localhost` and `127.0.0.1`) | `CB/middleware/cors.js`, `.env` `CORS_ALLOWED_ORIGINS` | CODE-VERIFIED |

### 1.5 Audit log — what is actually logged

**Central `access_log`** (`CB/db/migrations/0002_auth_and_access_log.sql`): `log_id, user_id NOT NULL → users, action, resource_type, resource_id TEXT, timestamp`. Written explicitly from handlers by `CB/services/accessLog.js`.

| Logged action | resource_type | Call site |
|---|---|---|
| `view_dashboard` / `view_referrals` / `view_system_health` | dashboard / referral_list / system_health | `CB/routes/adminDashboard.js:44,52,60` |
| `refresh_resource_model` / `refresh_simulink_validation` | resource_recommendations / simulink_validation | `CB/routes/adminDashboard.js:87,118` |
| `view_case`, `submit_review`, `claim_case`, `view_report`, `view_reviews` | case (+ case_id) | `CB/routes/cases.js:272,428,511,555,585` |
| `view_queue` | review_queue | `CB/routes/ophthalmologistQueue.js:110` |
| `view_phc_sync_status` | phc_site | `CB/routes/phc.js:173` |
| `update_referral` | referral | `CB/routes/referrals.js:77` |

**Not logged at central (gaps, CODE-VERIFIED by absence):**
- anything done without a logged-in user. `logAccess` returns immediately when `userId` is null (`accessLog.js:26`), so **with `AUTH_ENABLED=false` an unauthenticated reader leaves no trace**;
- `/media/*` image fetches;
- every PHC-key read (`/phc/cases/:ref/report`, `/gradcam`, `/patients/search`) and all ingestion;
- login, logout and failed-login events.

A failed log write is printed to the console and does not fail the request.

**Live table content right now:** 14 rows, all written by this audit's `verify_backend_auth.js` run: `view_reviews` 4, `claim_case` 4, `view_queue` 4, `view_dashboard` 2, last at `2026-09-25T07:31:13.069Z`.

**PHC desktop `access_log`** (`PB/db/localDb.js`): `at, user_id, device_id, action, entity_type, entity_id`. It logs technician login, every GET under `/patients` and `/captures` (`PB/server.js:55-58`), and `peer_pair`, `peer_revoke`, `peer_pull`, `peer_push`, `peer_image_get`, `peer_image_put`, `peer_bundle_import` (`PB/routes/peer.js`). Exercised by `PB` `npm test` #7 (PASS). **BEYOND-V4.** The live PHC DB doesn't have this table yet (see 1.1).

### 1.6 Encryption at rest

| Store | State | Evidence | Tag |
|---|---|---|---|
| Central Postgres (`dr_screening_central`) | Plaintext. No pgcrypto or column encryption; the only "encrypt" match in `CB/` is a code comment | grep of `CB/` | **V4-MISSING** (v4 §11.1 "AES-256 on the database") |
| Central media (`CB/media/cases/<caseId>/original.jpg`, `gradcam.png`, masks) | Plaintext files | `CB/services/mediaPaths.js:32-59` | **V4-MISSING** |
| PHC desktop SQLite + images (`PB/db/local.sqlite`, `PB/storage/`) | Plaintext (better-sqlite3, no SQLCipher) | `PB/db/localDb.js` | **V4-MISSING** |
| Phone SQLite `netrasetu.db` + images in `Paths.document/captures/` | Plaintext (expo-sqlite, no cipher) | `MOB/netrasetu/db/database.ts:13`, `MOB/netrasetu/lib/storage.ts:10` | **V4-MISSING** |
| Phone secrets (pairing key, PC session token) | OS keystore, hardware-backed where available | `MOB/netrasetu/lib/secrets.ts` | CODE-VERIFIED |
| Passwords / tokens / API keys | Hashed only: bcrypt (central users), scrypt (technicians), SHA-256 (PHC keys, PHC session tokens), PBKDF2 verifier (phone) | §1.1 | CODE-VERIFIED |
| USB export bundles | AES-256-GCM, addressed to one device, AAD `bundle\|from\|to\|createdAt` | `PB/services/peerBundle.js`, `peerCrypto.js`; `PB` test #21-22, mobile `test:peer` #11-12 | CODE-VERIFIED, BEYOND-V4 |
| OS-level disk encryption (BitLocker etc.) | **Not checked.** Nothing in the repo configures or asserts it | — | unknown |

### 1.7 Data minimization

| Item | Evidence | Tag |
|---|---|---|
| Central stores `name`, `age`, `contact_number` (NOT NULL: the SMS channel) for every patient. Full identity leaves the PHC | `CB/db/migrations/0001_baseline.sql:71-83` | CODE-VERIFIED |
| Ophthalmologist views get a display-safe `patient_reference` (e.g. `PT-4821`), never the raw `patient_id` | same file, `:78-82` | CODE-VERIFIED |
| District admin views are aggregate-only, with no per-case push | `CB/services/analyticsAggregator.js` header | CODE-VERIFIED |
| PHC report endpoint returns only what central computed (no reviewer identity, no claim state) | `CB/routes/phc.js:60-85` comment | CODE-VERIFIED |
| Referral SMS never names a condition or a grade ("An SMS is unencrypted…") | `CB/services/referralNotificationService.js:20-32` | CODE-VERIFIED, BEYOND-V4 |
| Production errors hide DB error text at central (`NODE_ENV=production`). **PHC desktop always returns `err.message`** | `CB/server.js:108-118`; `PB/server.js:92` | CODE-VERIFIED |
| Training export refuses unconsented rows unless `--include-unconsented` is passed | `scripts/exportTrainingSet.js:19-22` | CODE-VERIFIED |
| Verbal consent timestamp (`consent_given_at`) on patients, both sides | `PB/db/localDb.js:61`, central `patients.consent_given_at` | CODE-VERIFIED |
| Data retention / deletion policy | **None found** in code or v4 | — |

### 1.8 Lost or stolen device: unsynced data on the phone and the PHC PC

What protects it:
- Pairing key and PC session token live in the OS keystore, `WHEN_UNLOCKED_THIS_DEVICE_ONLY`, so they don't migrate to another device (`MOB/netrasetu/lib/secrets.ts`). CODE-VERIFIED.
- The PC can **revoke a paired phone**, and it's locked out immediately (`POST /peer/devices/:id/revoke`, `phc_admin`; `PB` `npm test` #23 PASS). CODE-VERIFIED, BEYOND-V4.
- The password is never stored on the phone, only a 60k-iteration PBKDF2 verifier. CODE-VERIFIED.
- The PHC API key can be kept in the keystore when it's entered on-device. If `EXPO_PUBLIC_PHC_API_KEY` is set at build time, it's **compiled into the app bundle** (`MOB/.env.example` warns about this). CODE-VERIFIED.

What does **not** protect it (CODE-VERIFIED by reading the code; none of it is in v4):
- Patient names, ages, phone numbers, questionnaire answers and fundus images sit in **unencrypted** SQLite and files in the app sandbox (§1.6).
- **Logout keeps the queued cases** by design: "Queued cases stay queued; they sync after the next login" (`MOB/netrasetu/sync/syncManager.ts:107`).
- No phone-side session expiry, idle auto-lock, remote wipe, or failed-attempt wipe was found.
- The PBKDF2 verifier sits in the same unencrypted SQLite `kv` table (`offlineCredentials.ts:16-27`). Someone who extracts the file can attack it offline.
- `MOB/app.json` doesn't set `allowBackup`. Nothing in the repo excludes the database from OS backups.
- On the PHC PC: plaintext SQLite and images. The only protection is whatever the OS provides (not checked).

**Honest slide wording:** *"Credentials and link keys are in the hardware keystore, and a lost phone can be revoked from the PHC PC. Patient data queued on the device is not yet encrypted at rest."*

---

## 2. Reliability

### 2.1 MATLAB session supervisor — CODE-VERIFIED

`CB/services/matlabSessionSupervisor.js` → shared logic in `CB/services/workerSupervisor.js`. It's started from `server.js`'s main block only, never on import.

| Behaviour | Value / how | Source |
|---|---|---|
| Liveness signal | **Heartbeat file** (`ML/inference/matlabSession/session.heartbeat`), rewritten every 5 s by `runMatlabInferenceSession.m`. It checks the heartbeat, not the PID, so a wedged process is caught | `matlabSessionSupervisor.js:13-18` |
| Check interval | `MATLAB_SUPERVISOR_INTERVAL_MS` = **30,000** | `:88` |
| Stale after | `MATLAB_HEARTBEAT_STALE_MS` = **30,000** | `:89` |
| Startup grace | `MATLAB_STARTUP_GRACE_MS` = **240,000** | `:90` |
| Restart | `manageMatlabSession.ps1 stop` then `start`. Windows only; on other OSes it reports "only implemented on Windows" | `workerSupervisor.js:73-80` |
| Restart cap | **3** per **30 min** window (`MATLAB_MAX_RESTARTS`, `MATLAB_RESTART_WINDOW_MS`) | `:91-92` |
| On failure | `system_alerts` row `matlab_session_down`, auto-resolved when the heartbeat returns | `systemAlerts.js`, migration 0007 |
| Enabled when | classifier **or** segmentation backend is `matlab`, and `MATLAB_SUPERVISOR_ENABLED` is not false | `:66-77` |
| Test | `verify_backend_health.js` **40/40 PASS** (simulated dead/wedged session, restart recorder, alert raise/resolve) | run 2026-09-25 |
| Live, this audit | Boot log `[matlabSupervisor] MATLAB session is healthy.` System health `matlabSession.status = "healthy"`, `restartsInWindow: 0` | server log, `/admin/system-health` |

Measured session cold start (from `session.log`): launched 13:03:53, `session starting` 13:04:04, 5 networks loaded by 13:04:28, `warmup inference call OK` 13:04:37, `session ready` **13:04:37**. That's **44 s** launch→ready, or 33 s from `session starting`. A second start the same day took 15:04:46 → 15:05:16 (30 s).

### 2.2 Segmentation worker supervisor — CODE-VERIFIED, BEYOND-V4

`CB/services/segWorkerSupervisor.js`, same `workerSupervisor.js` core. Heartbeat is `ML/inference/segSession/worker.heartbeat`. Interval **30,000 ms**, stale after **30,000 ms**, startup grace **90,000 ms**, cap **3** per **30 min**, alert kind `seg_worker_down`. Disable with `SEG_WORKER_SUPERVISOR_ENABLED=false`. If the worker is down, the orchestrator falls back to spawning `segInfer.py` per case (`gradingOrchestrator.js`, log line "falling back to a fresh segInfer.py process").

**Live state (this audit): DOWN.** Every start crashes (§0.5). `worker.log` shows **16** `worker starting` lines on 2026-09-25 alone: the per-window cap of 3 resets every 30 minutes, so it keeps retrying. `/admin/system-health` returned `"segWorker": {"status": "restarting", "lastHeartbeatAt": null, "restartsInWindow": 3}` and alert `seg_worker_down`, `"message": "No heartbeat within 90s of a restart."`, `firstSeenAt 2026-09-24T11:41:03.430Z`, `occurrences 4`. The supervision works. The worker itself is broken.

### 2.3 Stuck-job recovery — CODE-VERIFIED

| Layer | Behaviour | Source |
|---|---|---|
| Queue | In-memory, `GRADING_CONCURRENCY` default **1**, `GRADING_MAX_ATTEMPTS` default **3**, backoff base `GRADING_RETRY_BASE_MS` **2000**. Non-retryable codes: `image_not_found, invalid_image_type, case_not_found, matlab_unavailable, python_unavailable`. Dedupe across queued/inflight/retrying | `CB/services/gradingQueue.js:55-119` |
| Boot recovery | `recoverStranded()` re-enqueues every `processing` case with no job, at server start | `CB/server.js:126-127` |
| Periodic watchdog | Every `GRADING_WATCHDOG_INTERVAL_MS` **90,000**. Skips cases younger than **120 s**. Gives up after **3** recoveries per case; after that, a human sees it on System Health | `CB/services/gradingWatchdog.js` |
| Record | Each recovery is a row in `grading_recoveries (source 'boot' \| 'watchdog')` | migration 0006 |
| Graceful stop | SIGINT/SIGTERM drains the queue (`stop({drain:true})`) | `CB/server.js:167-173` |
| Failure reason | `cases.failure_code` / `failure_reason` (migration 0014), grouped on System Health | `CB/services/systemHealth.js:104-137` |
| Test | `verify_backend_health.js` 40/40 (watchdog, recovery cap, stuck-job listing) | run 2026-09-25 |

### 2.4 Fallback JS rule engine (central) — CODE-VERIFIED, BEYOND-V4

`CB/services/matlabFallback.js` is a pure-JS port of `ML/grading/ruleEngineGrade.m`, `branchesAgree.m` and the text half of `generateEvidenceReport.m`. It's used **only** when MATLAB can't be spawned at all. It deliberately does *not* port camera-family classification, lesion-attention consistency, or DICOM tag reading; those report "not measured" or null instead.

**Parity test** (`verify_fallback_parity.js`, run 2026-09-25 against MATLAB R2026a on this machine, 10 s):
```
720 cases x 8 fields, 0 mismatched
JS fallback and ruleEngineGrade.m agree
2880 evidence-text checks, 0 mismatched
evidence prose cites the criterion that actually fired
```
The grid is 5 red × 2 bright × 3 NV × 4 venous-beading × 3 IRMA × 2 fovea-unreliable = 720 (`verify_fallback_parity.js:38-60`).

**Other parity numbers in the repo:**

| Parity | Result (exact) | File | Tag |
|---|---|---|---|
| PyTorch vs MATLAB dlnetwork, 5 v1 models, 10 images each | branchA_v1 max\|diff\| 0.000002; vessel_unet_v1 0.000023; localization_v1 0.000002; bright_lesion_unet_v1 0.000040; red_lesion_unet_v1 0.000017; "All 5 models within parity threshold" (0.01) | `ML/diagnostics/out/parity_v1_report.txt` (2026-09-20) | CODE-VERIFIED |
| branchA_v2a / v2b / v2c | max\|diff\| 0.000001 each; argmax agreement **10/10** each | `parity_v2a_report.txt`, `parity_v2b_report.txt`, `parity_v2c_report.txt` | CODE-VERIFIED |
| red_lesion v2 (3-class) | max softmax diff 0.000014; MA/HE component counts agree on 10/10 | `parity_red_v2_report.txt` | CODE-VERIFIED |
| Segmentation backend, PyTorch vs MATLAB session, 20 IDRiD images | OD 20/20, fovea 20/20, vessel pixel count 17/20 (max diff 1 px), red 20/20, bright 20/20, **rule-engine grade 20/20** | `ML/diagnostics/out/seg_backend_parity.txt` (2026-09-22) | CODE-VERIFIED |
| Mobile quality gate (TS) vs MATLAB `qualityGateMain.m` | **35 PASS, 0 FAIL**, "ALL PASSED". Largest score diff 2.55e-3 (occlusionScore) | run 2026-09-25 (`npm run test:parity`, 72 s) | CODE-VERIFIED |
| **Desktop** JS quality-gate fallback vs MATLAB exe | **SKIP**: `qualityGate.exe is not built` (`PB/quality-gate-matlab/dist/` is empty) | run 2026-09-25 | **unverified** |

Note: the desktop JS quality-gate fallback is **on by default** (`QUALITY_GATE_ALLOW_FALLBACK !== '0'`, `PB/services/qualityGateClient.js:63`), but its parity with MATLAB is currently unverified. The mobile port *is* verified.

### 2.5 Health endpoints — exact contents

| Endpoint | Auth | Contents | Tag |
|---|---|---|---|
| Central `GET /health` | none | `{"status":"ok"}`. Deliberately no DB or MATLAB call, because it's the PHC sync heartbeat (`CB/server.js:66-70`). Observed live this audit | CODE-VERIFIED |
| PHC `GET /health` | none | `{"status":"ok"}` (`PB/server.js:65`) | CODE-VERIFIED |
| Central `GET /api/v1/admin/system-health` | `district_admin` | Keys: `silentPhcs[]` (>`SILENT_PHC_HOURS` **48**, by `last_contact_at`), `stuckJobs[]` (>`STUCK_JOB_MINUTES` **15**, with `autoRecoveredCount`, `autoRecoveryExhausted`), `failedCases[]` grouped by `failureCode`, `failedCaseCount`, `matlabSessionStatus`, `matlabSession{status,lastHeartbeatAt,restartsInWindow,lastError}`, `unreviewedCases[]` (referable, >`UNREVIEWED_CASE_HOURS` **48**), `segWorker{…}`, `alerts[]` (open `system_alerts`), `thresholds{}`, `generatedAt` (`CB/services/systemHealth.js:139-173`) | CODE-VERIFIED |

Live response at `2026-09-25T07:38:01.573Z`: silentPhcs 0, stuckJobs 0, failedCaseCount **1** (`not_recorded`, predates migration 0014), matlabSessionStatus `healthy`, unreviewedCases **17**, segWorker `restarting`, 1 open alert `seg_worker_down`.

v4 §10.7 lists four checks. The code adds `failedCases`, `segWorker`, `alerts` and `thresholds` (**BEYOND-V4**).

---

## 3. Test suites — all run on 2026-09-25

| # | Suite (command) | Tests / checks | Result now | Notes |
|---|---|---|---|---|
| 1 | PHC backend: `cd PB && npm test` (`PB/test/auth-peer.test.js`, untracked) | **24** | **24 pass, 0 fail** (8,939 ms) | auth, lockout, hashing, access_log, pairing, sealed channel, replay/AAD, pull/push, LWW, bundles, revoke, TLS |
| 2 | Mobile unit: `cd MOB && npm test` (`test/unit.test.mjs`) | **23** | **23 pass, 0 fail** (8,217 ms) | questionnaire, priority, IDs (1M-ID uniqueness), duplicates, quality gate |
| 3 | Mobile sync integration: `npm run test:sync` | **9** | **9 pass, 0 fail** with central up (65,509 ms). Earlier in the session with central down: 2 pass, **7 skip** | runs the real app sync stack against central |
| 4 | Mobile peer integration: `npm run test:peer` | **12** | **12 pass, 0 fail** (8,169 ms) | power-cut scenario, USB bundle, keystore |
| 5 | Mobile ↔ MATLAB quality-gate parity: `npm run test:parity` | **35** checks | **35 pass, 0 fail** (72 s) | needs MATLAB |
| 6 | `node verify_backend_auth.js` | **64** checks | **64 pass** | forces `AUTH_ENABLED` and `PHC_AUTH_ENABLED` on. Needs Postgres |
| 7 | `node verify_backend_health.js` | **40** checks | **40 pass** | watchdog, supervisor, system-health, §G.2 |
| 8 | `node verify_backend_ingestion.js` | **20** checks | **20 pass** | idempotency, summary-first |
| 9 | `node verify_backend_pipeline.js` | **85** checks | **FLAKY: 83 pass / 2 fail**, re-runs gave 1 fail and 2 fail | the failing checks are "the response file is cleaned up" and "a timed-out request is TAKEN BACK" (session-protocol file cleanup, `verify_backend_pipeline.js:234,269`). Exit code 1 |
| 10 | `node verify_tls.js` | **12** checks | **12 pass** | both backends |
| 11 | `node verify_fallback_parity.js` | 720 cases × 8 fields + 2,880 text checks | **0 mismatched** | needs MATLAB |
| 12 | `node verify_quality_gate_parity.js` | — | **SKIP** (exe not built) | |
| 13 | `node verify_mobile_lens.js` | 5 checks run | **2 pass, 3 fail**, exit 1 | hardcoded patient `PHC001-mtrrivyw-jsch` doesn't exist → `404 patient_not_found`. Test-data problem, not a code regression |
| 14 | `node verify_fovea_e2e.js` | — | **Cannot run** | hardcoded `C:\Users\91740\...` path |
| 15 | `node verify_demo_dryrun.js` | — | **Cannot run** | same hardcoded path; also hardcodes `PHC_ID 419402ef-…` |
| 16 | pytest `ML/tests/test_conformal_v2.py`, `ML/test_fovea_gate.py`, `ML/test_preprocessing.py` (dr_screening env, pytest 9.1.1) | **102** (90 + 12 + **0**) | **102 passed** (0.73 s) | `test_preprocessing.py` collects **0** tests |
| 17 | MATLAB `testConformalV2` | 86 golden + 10,000 property points + 2 demotion | **0 failures** | |
| 18 | MATLAB `testNVScoreFractal` | 83 PASS lines | **ALL PASSED** | |
| 19 | MATLAB `testRuleEngineSignals` | 17 | **17/17** | |
| 20 | MATLAB `testBranchB` | 54 | **54/54** | |
| 21 | MATLAB `testCalibrationPhase6` | 46 | **45 pass, 1 FAIL**: `refuses the real Branch A stub (it has no dropout layers) (no error raised)` | |
| 22 | MATLAB `testPhase7Explainability` | 58 | **58/58** | |
| 23 | MATLAB `testReadFundusDicom` | 8 | **8/8** | |
| 24 | MATLAB `testReadFundusImage` | 21 | **21/21** | |
| 25 | MATLAB `testCompareToBaseline` | 34 | **34/34** | |
| 26 | MATLAB `testEvaluateMetrics` | 86 | **86/86** | |
| 27 | MATLAB `testQualityGateDeploy` | 16 | **16/16** | |
| 28 | MATLAB `testImportedNetwork` | — | **ERROR** `testImportedNetwork:noConverter`: "Deep Learning Toolbox Converter for PyTorch Model Format is not available" | environment, not code |

MATLAB tests were run with `matlab -batch` through a runner that `feval`s each function from its own folder. `ML/explainability/counterfactualOcclusionTest.m` is a helper that needs arguments, not a test, so it wasn't run. **Not run:** frontend `oxlint` and mobile `tsc --noEmit` (lint/type-check, not test suites). There is **no CI config** in the repo.

**Totals (arithmetic from the rows above):**
- Node `node:test` suites (rows 1–4): 24 + 23 + 9 + 12 = **68 / 68 pass**.
- Counted-check scripts (rows 5–10): 35 + 64 + 40 + 20 + 85 + 12 = **256 checks, 254 pass, 2 fail** (both flaky, in row 9).
- Plus row 11: 720 × 8 fields and 2,880 text checks, all matching.
- pytest: **102 / 102**.
- MATLAB: **10 of 12** test functions fully green (1 check failed in row 21; row 28 couldn't run).
- Couldn't run or skipped: rows 12, 14, 15. Fixture failure: row 13.

---

## 4. Performance

### 4.1 Live end-to-end measurement, this audit (2026-09-25) — CODE-VERIFIED

**Setup:** dev laptop. Persistent MATLAB session up. **Segmentation worker DOWN** (§2.2), so segmentation used the per-case fallback. `GRADING_CONCURRENCY=1`. Cases submitted by the real mobile sync stack (`npm run test:sync`) over HTTP with a PHC key, image `demo_images/1_quality_pass.jpg` (123,421 B) or `2_grading_confirm.jpg` (443,672 B). Times are central `received_at → grading_results.graded_at` from Postgres. They do **not** include upload time.

| Case | Situation | received → graded | Gap from previous completion |
|---|---|---|---|
| 1 | **cold**: first case after session start (Branch A first call 16,174 ms) | **62.865 s** | — |
| 2 | 443,672 B image, chunked path; overlapped a seg-worker restart | **31.013 s** | 31.491 s |
| 3 | warm, queued | 47.786 s | **16.875 s** |
| 4 | warm, queued | 63.891 s | **16.175 s** |
| 5 | warm, queued | 81.398 s | **17.618 s** |

**Queueing:** cases 2–5 arrived within 284 ms (07:36:09.306Z → 07:36:09.590Z) and were graded one at a time, completing **31.0 / 47.8 / 63.9 / 81.4 s** after receipt. With concurrency 1, latency for the Nth queued case ≈ N × per-case time.

**Per-stage breakdown** (MATLAB `session.log`, ms per request, this run):

| Case | localization_v1 | vessel_unet_v1 | Branch A | bright_lesion_unet_v1 | casePipeline (rule engine, NV, camera check, evidence) | Sum of MATLAB stages |
|---|---|---|---|---|---|---|
| 1 (cold) | 1920 | 1159 | 16174 | 2289 | 5906 | 27,448 |
| 2 | 853 | 1029 | 2552 | 943 | 14707 | 20,084 |
| 3 | 1156 | 1150 | 1800 | 766 | 1389 | 6,261 |
| 4 | 872 | 893 | 1774 | 745 | 1212 | 5,496 |
| 5 | 1061 | 1009 | 1831 | 775 | 1426 | 6,102 |

In warm cases, MATLAB-session time is about 5.5–6.3 s of the 16.2–17.6 s per case. The rest is the per-case Python processes (Branch A preprocessing, `segInfer.py` fallback including red-lesion PyTorch), DB writes and file I/O. **Those are not individually timed anywhere in the code**, and the orchestrator has no per-stage timing log.

**Branch A alone** (`ML/experiments/measureInferenceLatency.js 5`, run this audit, IDRiD_163–167):
```
python  min=7690 median=8527 mean=8621 max=10198   (cold python process per call)
matlab  min=3446 median=3789 mean=3746 max=4131    (persistent session + python preprocessing)
```

**Derived throughput** (arithmetic, one grading worker, warm): 3600 / 17.618 = **204.3** and 3600 / 16.175 = **222.6** cases/hour.

### 4.2 Earlier measurements in result files and DB

| Measurement | Number (exact) | Source | Tag |
|---|---|---|---|
| segInfer wall time per image, 20 IDRiD images, fresh process each | python **21.40 s**, matlab **22.54 s** | `ML/diagnostics/out/seg_backend_parity.txt` (2026-09-22) | CODE-VERIFIED |
| MATLAB session requests, 2026-09-24 (warm, 5 cases) | branchA 774–1209 ms, casePipeline 489–6164 ms, seg models 500–1008 ms | `ML/inference/matlabSession/session.log` | CODE-VERIFIED |
| Burst of 4 cases, 2026-09-10 (branchA_v1, older pipeline) | received 07:55:19.644–.707Z; graded +7.447 / +14.746 / +21.850 / +29.127 s | Postgres `cases` / `grading_results` (these rows are still in the DB) | CODE-VERIFIED, **not comparable** (older pipeline) |
| Single cases, 2026-09-10 | 6.833 s … 15.455 s received→graded | same | CODE-VERIFIED, not comparable |

### 4.3 Latency claims that exist only in docs — DOC-ONLY, not reproduced

| Claim | Where | This audit measured |
|---|---|---|
| "about 47 s → 33 s → **21 s**" end to end | `docs/backend-plan-status.md:138-140` | 16.2–17.6 s warm (worker down), 62.9 s cold |
| whole case 22.6 s (matlab seg) / 20.6 s (python seg); segmentation 5.3 s / 2.6 s | `ML/inference/segSession/README.md:52-57` | seg worker couldn't start |
| torch import + model load **17.1 s**, work **2.0 s** | `docs/backend-plan-status.md:139` | — |
| `matlab -batch` cold start ~24 s | `ML/inference/matlabSession/README.md:3` | — |
| "~12.5 s normal pipeline run" | comments in `gradingWatchdog.js:17`, `systemHealth.js:15` | — |
| casePipeline 23.3 s → 9.2 s | `docs/backend-plan-status.md:138` | 1212–1426 ms warm this run |

### 4.4 Throughput / load testing

**No load-test tooling or results exist.** A grep found no k6, artillery, autocannon, JMeter or wrk, and no load-test script. The only queueing numbers are the bursts in §4.1 and §4.2. District-scale capacity is modelled in Simulink/SimEvents (see audit 03), which is a model, not a load test of this server. The grading queue runs one case at a time by default (`GRADING_CONCURRENCY=1`).

---

## 5. Sync bandwidth

### 5.1 Payload sizes (measured)

| Payload | Bytes (exact) | How measured | Tag |
|---|---|---|---|
| **Lightweight summary packet** (`POST /api/v1/cases/summary`, JSON, no image) | **936** | `JSON.stringify` of the app's own `CaseFields` built with `toQuestionnairePayload` on the sync-test fixture (patient "Sync Test", 58, full questionnaire, 7 quality scores). Varies slightly with name length | CODE-VERIFIED (this audit) |
| Full case, demo images | 123,421 / 362,575 / 443,672 / 595,019 (+ the same fields as multipart) | `ls -la demo_images/` | CODE-VERIFIED |
| Full case, IDRiD original (IDRiD_163.jpg) | 394,846 | file size | CODE-VERIFIED |
| Full case, Messidor-2 originals (first 200 files) | min **990,283**, median **2,789,282**, max **3,863,820** | `stat` of `ML/datasets/Messidor-2/extracted/IMAGES` | CODE-VERIFIED |
| Ratio summary : full (arithmetic) | 123,421 / 936 = **131.9×**; 2,789,282 / 936 = **2,980.0×** | — | derived |

### 5.2 Strategy

| Behaviour | Desktop PHC (`PB/services/syncManager.js`) | Mobile (`MOB/netrasetu/sync/syncManager.ts`, `api/central.ts`) | Tag |
|---|---|---|---|
| Summary packet before the image | **Not implemented.** No `summary` call in the desktop sync manager | **Always**: every case sends the summary first, then the image | Desktop **V4-MISSING**. Mobile CODE-VERIFIED (v4 says summary only "under poor connectivity for others", §9.2) |
| Order | `high` first, then `captured_at`. `high` is set only for **borderline** quality, provisionally (`captureHandler.js:151-157`) | tier 0 (red-flag symptom or best-effort), 1 (elevated risk / borderline / unclear), 2 (routine), then `enqueued_at` (`lib/questionnaire.ts:65-74`) | CODE-VERIFIED |
| Chunk threshold | **2 MiB** (`SYNC_CHUNK_THRESHOLD_BYTES` default 2,097,152) | **2 MiB** (`POLICY.chunkThresholdBytes`) | CODE-VERIFIED |
| Chunk size | **1 MiB** (`SYNC_CHUNK_BYTES`) | **1 MiB** | CODE-VERIFIED |
| Integrity | SHA-256 per chunk on receipt, plus a whole-file SHA-256 committed at `init` and checked on assembly. A mismatch refuses ingestion | same server | CODE-VERIFIED (`CB/services/chunkedUploadService.js`) |
| Resume | `GET /cases/:ref/chunks` → send only the missing chunks. Session keyed on the PHC's own `captureIdRef`, so no server token needs to survive a crash | same | CODE-VERIFIED |
| Server limits | chunk ≤ **4 MiB**, total ≤ **64 MiB**, ≤ **2048** chunks, session TTL **7 days** | — | CODE-VERIFIED (`chunkedUploadService.js:60-63`) |
| Idempotency | `capture_id` is the key on every call; a re-send returns the same case (migration 0005) | same; mobile `test:sync` #5 PASS | CODE-VERIFIED |
| Timeouts / cadence | heartbeat `/health` 3 s, chunk 120 s, whole upload 600 s, loop every 10 s | request 30 s, upload 120 s, loop every 15 s | CODE-VERIFIED |
| Storage-pressure warning | — (not found on desktop) | < **500 MiB** free, or > **150** queued | Mobile CODE-VERIFIED |
| Offline alternatives | USB bundle import (`POST /peer/bundle`) | encrypted bundle export/import; desktop↔phone replication with takeover after `PEER_TAKEOVER_MS` = **21,600,000** (6 h) of silence | CODE-VERIFIED, **BEYOND-V4** (v4 has "export queue to external drive") |
| Verified | `verify_backend_ingestion.js` 20/20 | `test:sync` #2 "large image goes through the chunked, resumable upload" PASS | CODE-VERIFIED |

No measurement of actual bytes on the wire (headers, multipart framing, retries) exists anywhere in the repo.

---

## 6. Not in `docs/system-design-v4.md` (BEYOND-V4 summary)

PHC API keys and pinning; JWT-cookie + CSRF design; revocation via `is_active`; login lockouts; PHC technician accounts and roles (`technician`/`phc_admin`) with scrypt; phone offline login (PBKDF2 verifier); OS-keystore secrets; desktop↔phone AES-256-GCM peer sync, pairing QR, device revoke, ownership takeover; encrypted USB bundles; Twilio signature check; security response headers; segmentation worker and its supervisor; generic heartbeat supervisor with restart cap; the central JS rule-engine fallback and its 720-case parity test; `failedCases`/`alerts`/`segWorker` on System Health; SMS content minimization.

**V4 says, code doesn't (V4-MISSING):** AES-256 at rest (all stores); TLS actually on; auth actually enforced for browser users; a real central web login; desktop summary-first sync; `access_log` "on every access to patient data" (media, PHC-key reads, unauthenticated reads are not logged).

**V4-STALE:** §11.1 "Today, this system has none" (auth exists); §5.1 "the single most urgent gap" (backend is done, the flags and the frontend aren't).

---

## 7. Side effects of this audit

- Started the MATLAB session, then stopped it at the end. Started the central backend; **Claude Code stopped it (low system memory)** after all the measurements above were taken. Neither was running before the audit.
- `npm run test:sync` created 5 cases and 5 patients (`PHCT-…`, patient name "Sync Test") in central Postgres. They were **deleted** afterwards, along with their `grading_results`, `segmentation_outputs` and `explainability_outputs` rows, their `CB/media/cases/<id>/` folders, and one leftover chunk session.
- `verify_backend_auth.js` keeps its 14 `access_log` rows for the two demo users by design (see its header).
- `verify_mobile_lens.js` touched `PB/db/local.sqlite`. It was restored byte-for-byte from a snapshot taken just before the run.
