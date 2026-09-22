# Backend Implementation Plan — Saad
## NetraSetu, National Round — derived from system-design-v4.md

**Scope:** You own the entire backend — the central Node.js system, the PHC-local Node.js backend, all MATLAB backend-side code (rule engine, quality gate, MATLAB session management, Simulink integration), the database schema, and every API endpoint. You do not own: the ML model files themselves, or the internal math inside any file that computes a score/classification from image data. Everywhere your work touches Tanuj's, this document states the exact interface contract so you can write and test your side without waiting on his.

**Read `system-design-v4.md` first.** Every §-reference below points to it. This plan does not re-explain *why* — that document does. This plan tells you exactly *what* to build, in what file, against what contract.

---

## 0. Already built — do not rebuild any of this

Confirmed real, by direct code inspection and/or a live behavioral test, not by reading the design doc:

- **Simulink model** (`simulink-model/districtScreeningSimEvents.slx`) — real, git-clean, contains genuine SimEvents blocks (1 Entity Generator, 3 Entity Servers, 2 Queues, 2 Switches, 2 Terminators, 6 ToWorkspace). Your only task on the model itself is fixing `simulink-model/README.md:16`'s stale "not built yet" line. Do not touch the `.slx`.
- **SMS/Twilio** — real, wired, reachable. `referralNotificationService.js:66` constructs a real client; called from `routes/cases.js:37,290` inside `POST /:caseId/review`. Leave this alone.
- **Branch A MATLAB inference** — `INFERENCE_BACKEND=matlab` is the live default (`gradingOrchestrator.js:170`), served by a persistent session (`matlabSession/runMatlabInferenceSession.m`), verified faster than Python and failing loudly (`matlab_session_unavailable`, `gradingOrchestrator.js:321`) rather than silently falling back. Don't rearchitect this.
- **Confidence-routing decision site** — one real function, `gradingOrchestrator.js:794-819`, already combines branch agreement, quality-forced, and camera-probation overrides. You are *extending* this function's inputs (§I, §J below), not restructuring it.
- **Override-reason persistence** — `ophthalmologist_reviews` + `corrections` tables already capture and link override reasons for the continual-learning consumer. Don't build a `feedback_queue` table; it doesn't need to exist.
- **Patient ID uniqueness** — `schema.sql:64`, `patients.patient_id TEXT PRIMARY KEY` is a real constraint, and `ingestionService.js`'s `ON CONFLICT (patient_id) DO NOTHING` correctly depends on it. Nothing to fix here.

---

## A. Authentication & Access Control (§11.1) — Tier 1, top priority

This is the single most urgent item in the whole system. Today: zero auth middleware exists anywhere (`middleware/` contains only `cors.js` and `testCors.js`, same in the PHC backend); no login route exists in any route file; every one of `/api/v1/cases/*`, `/ophthalmologist/*`, `/admin/*`, `/referrals/*`, `/phc/*` responds to a bare unauthenticated request.

1. **Login endpoint.** Add `POST /api/v1/auth/login` (new file, e.g. `routes/auth.js`). Accepts `{ email, password }` — not `username`; the `users` table has `email`, no `username` column, log in with that. Look up the user by email, compare `password` against `users.password_hash` using `bcrypt.compare()`. On success, issue a signed JWT containing `{ userId, role }` — **but set it as an httpOnly, Secure, SameSite=Lax cookie, not a value the frontend reads and manually attaches as a Bearer header.** This matters for a real reason, not just convention: `<img>` tags loading the fundus photo, Grad-CAM overlay, and lesion masks can't send a custom `Authorization` header, so a Bearer-header-only scheme would leave every image in the ophthalmologist view blank the moment `/media` gets guarded. A cookie is sent automatically by the browser on every same-origin request — `fetch` calls and `<img>` tags alike — so one auth mechanism covers both without special-casing image routes. On failure, return 401 with no distinction between "user not found" and "wrong password" in the response body.
2. **CSRF protection, required alongside the cookie approach.** Cookie-based auth means the browser attaches credentials automatically, including to requests a malicious page could trigger — add CSRF protection on every state-changing route (POST/PATCH/DELETE): a synchronizer token returned at login and required in a header on those requests, or a double-submit-cookie pattern. This is not optional once you're using cookies for auth; skipping it reopens a different real vulnerability while closing the one you set out to close.
3. **`/media` itself needs no separate signed-URL scheme.** Given the cookie approach above, `/media` just needs `requireAuth` applied like any other route — the browser will already be sending the auth cookie on the image request. Don't build the short-lived-signed-URL alternative; it solves the same problem with more moving parts than this system needs right now.
4. **Password hashing on user creation.** Wherever users get created/seeded (see the new seed script, item 5 below), the password must be hashed with `bcrypt.hash()` before being written to `password_hash`. It is currently unused — nothing writes to it. Fix the write path, not just the read path.
5. **Seed script — needed, nothing in the repo creates a user today.** Add a script inserting exactly two demo accounts: one `ophthalmologist`, one `district_admin`. Use clearly-fake, clearly-labeled demo values for both email and password (e.g. `ophthalmologist@demo.netrasetu.local`) — do not reuse a real teammate's personal email or a memorable real password, for the same reason Kankshi's UI plan flags removing hardcoded personal credentials from `App.jsx`. Document the demo credentials in a `.env.example` or a short README note, not committed as a real secret.
6. **Auth middleware.** New `middleware/requireAuth.js`: reads the JWT from the cookie (not a header), verifies it, attaches `req.user = { userId, role }`, or returns 401. New `middleware/requireRole(role)`: a factory returning middleware that checks `req.user.role === role` (or is in an allowed-roles array), returns 403 otherwise.
7. **Apply it to every existing route file.** The five route files are `routes/adminDashboard.js`, `routes/cases.js`, `routes/ophthalmologistQueue.js`, `routes/phc.js`, `routes/referrals.js`. Every route in every one of these needs `requireAuth` and the correct `requireRole('district_admin')` or `requireRole('ophthalmologist')` applied — check each route individually; don't blanket-apply one role to a whole file, since some files will have mixed-role or both-roles-allowed endpoints (e.g. `phc.js`'s ingestion endpoints are called by the PHC apps, not by a logged-in browser session — see item 12 below).
8. **Ship this behind a flag, not as a big-bang cutover.** The moment `requireAuth` is applied, both web frontends get 401 on every call until they send valid credentials — and building the login page and cookie/credential handling on the frontend side is real work that won't land the same day. Add an `AUTH_ENABLED` env flag, defaulting to off in whatever environment the frontend team is actively developing against, and only flip it on once they confirm login works end-to-end. This is the same "don't let one side block the other" principle the rest of this plan already uses for ML handoffs, applied to frontend coordination now.
9. **Whoever builds the login page and cookie/token handling on the frontend is the frontend team (Parth, Vedant, Krrish), across every surface that needs it** — the desktop PHC app, and the central system's ophthalmologist and admin web interfaces. This should be an explicit task on their plan if it isn't already; flag it to them directly rather than assuming it's covered.
10. **JWT lifetime: 12–24 hours, no refresh-token system this round.** A prototype-stage security floor doesn't need refresh-token rotation — that's real added complexity for a session-length problem a demo doesn't have. Pick something in that range long enough that a judging session won't expire mid-presentation, short enough to still be a real boundary, and let re-login handle the rest.
11. **`server.js:39-59`'s middleware chain** currently runs `cors() → express.json() → routes` with nothing in between. Insert the new auth middlewares into this chain per-route (via `router.use()` or per-route arguments), not globally — the login route itself and the PHC ingestion routes must stay reachable without a user session.
12. **PHC-to-central authentication is a different mechanism, not user login.** The PHC apps (desktop and mobile) aren't a human logging into a browser — they're a device submitting data. Do not require the cookie-login flow for `POST /api/v1/cases`, `/cases/summary`, `/cases/{id}/chunks`. Instead, add a per-PHC-site API key (a new `api_key` column on `phc_sites`) checked via a separate, lightweight middleware (`middleware/requirePhcApiKey.js`) on just the ingestion routes. **Provisioning:** a small script that generates a new key for a given `phc_id` (or creates the `phc_sites` row fresh) and prints it once — an operator copies that into the PHC's local config at setup time. This is a manual, in-person setup step given the small number of PHCs involved, not something that needs a self-service rotation UI. **Mobile is fully in scope for this**, once the frontend team's mobile API-layer rewrite lands (their plan, §4) — it uses the exact same PHC API key as desktop, stored the Expo-appropriate way (an `EXPO_PUBLIC_`-prefixed env value or app-config value, same pattern already noted for the ID-generation format). The mobile app's current external-FastAPI-service target is the already-flagged, already-scheduled-for-removal ngrok problem (§1.3) — this isn't a new gap, it's that problem showing up again from a different angle.
13. **Access log.** New table (migration, §L): `access_log(log_id UUID PK, user_id UUID FK, action TEXT, resource_type TEXT, resource_id UUID, timestamp DATETIME)`. Add a small helper, `logAccess(userId, action, resourceType, resourceId)`, called from inside every authenticated route handler that reads or writes patient data — at minimum: viewing a case, submitting a review, viewing the review queue, viewing the admin dashboard. Call this explicitly in each handler; do not try to build a generic middleware that infers "resource type" from the URL, since that's more fragile than five explicit one-line calls.
14. **TLS.** For the demo environment, a self-signed certificate via Node's `https` module (or a reverse proxy like nginx in front of the app, if that's easier to stand up) is sufficient — this is a deployment-configuration task, not new application code. Do this after the items above; it's real but lower-urgency than having auth exist at all. Note also: cookie-based auth without TLS means the `Secure` cookie flag can't be set safely — get at least a self-signed cert in place before relying on the cookie approach for anything beyond local development.
15. **At-rest encryption — corrected guidance.** Vanilla, self-hosted PostgreSQL does not have built-in transparent data encryption the way some other databases do — "enable Postgres's built-in encryption options" was imprecise. The actual practical mechanism for this round: **full-disk or volume-level encryption at the OS or hosting-provider level** — LUKS if self-hosting on Linux, BitLocker on Windows, or the "encryption at rest" checkbox any major cloud provider's managed disk/database offering already has. This needs **zero application code changes** — it's a deployment/provisioning setting, not something you write. It protects the honest, specific threat this round can actually defend against (a stolen or improperly-decommissioned disk); it does not protect against a compromised running application reading the database directly, which would need real column-level encryption (e.g. Postgres's `pgcrypto` extension) plus proper key management — that's a real production step, out of scope this round, and worth saying so directly rather than implying disk encryption alone is a complete answer. Do the disk/volume-level version; state the boundary honestly if asked. **Priority stays where it currently sits** (after auth) unless Tanuj says otherwise — auth stops all unauthorized access outright; encryption narrows a much smaller remaining risk. Flag it explicitly in your status update either way, don't let it silently not happen.

---

## B. New API Endpoints — none of these exist yet, confirmed via git history

1. **`GET /api/v1/patients/search`** (new `routes/patients.js` — this file does not exist; confirmed via `git log --all -- '**/patients.js'`, zero commits, ever). Query params: `name`, `age`, `phone`. Implement fuzzy matching — for a first pass, a case-insensitive `LIKE` on name plus exact/near match on age (±1 year) and phone is sufficient; don't over-engineer this into a full fuzzy-matching library unless you have time left over. Returns candidate matches for the frontend's duplicate-check UI (§10.3). This single endpoint serves both the desktop and mobile frontends — build it once.
2. **`POST /api/v1/cases/{case_id}/claim`** (add to `routes/cases.js`). Sets `grading_results.claimed_by = req.user.userId` **only if** `claimed_by IS NULL`, using a single conditional `UPDATE ... WHERE case_id = $1 AND claimed_by IS NULL RETURNING *` — if zero rows are returned, another reviewer already holds it; return 409 Conflict with the current claimant's identity. This is the entire mechanism for §10.8 — no separate locking table needed, one column and one conditional update.
3. **`GET /api/v1/cases/{case_id}/reviews`** (add to `routes/cases.js`). Returns the review history for a case from `ophthalmologist_reviews`, joined to `users` for the reviewer's name. This has been a documented gap in `api-contracts.md` for a while — just build it, it's a plain SELECT.
4. **`GET /api/v1/admin/system-health`** — see §F.
5. **`GET /api/v1/admin/resource-recommendations`** — see §G.

---

## C. Idempotent Case Ingestion (§10.6)

Confirmed current state: `cases.capture_id_ref` has **no** unique or primary-key constraint centrally — `case_id` (the real PK) is a server-generated `gen_random_uuid()` unrelated to the PHC's own capture ID, so a retried upload currently *can* create a duplicate case.

1. **Migration:** add a unique constraint: `ALTER TABLE cases ADD CONSTRAINT cases_capture_id_ref_unique UNIQUE (capture_id_ref);`
2. **Change the insert logic** in the ingestion path (wherever `POST /api/v1/cases` currently does its `INSERT INTO cases`) to `INSERT INTO cases (...) VALUES (...) ON CONFLICT (capture_id_ref) DO NOTHING RETURNING case_id`. If no row is returned (conflict happened), look up and return the existing case's status instead of erroring — a retried upload should look like a successful resubmission to the caller, not a failure.
3. This applies to `POST /api/v1/cases` and `POST /api/v1/cases/summary` — both write to the same `cases` row identified by `capture_id_ref`, so a summary-then-full-image sequence for the same capture must update the same row, not insert a second one. Use `ON CONFLICT (capture_id_ref) DO UPDATE SET image_path = EXCLUDED.image_path, ...` for the full-image follow-up specifically, so it fills in the row the summary packet created.

---

## D. Grading Job Watchdog (§10.7, §5.4)

Confirmed current state: `recoverStranded()` (`gradingQueue.js:205`) is real and correct, but is only called once, at boot (`server.js:97`). A job stuck at `status='processing'` stays stuck indefinitely if the server doesn't restart.

1. Extract the call to `recoverStranded()` so it can run on an interval, not only at boot. Use `setInterval(recoverStranded, INTERVAL_MS)` (or `node-cron` if you'd rather have a cron-style schedule) with `INTERVAL_MS` around 60–120 seconds — well beyond the ~12.5s normal pipeline runtime, so you're not re-enqueuing jobs that are simply still running.
3. When `recoverStranded()` re-enqueues a job, also write a record (or increment a counter) that the System Health endpoint (§F) can read — "case X was auto-recovered at time Y" — so a repeatedly-stuck case is visible to an admin, not just silently retried forever.

---

## E. MATLAB Session Supervisor (§10.7, §5.4)

Confirmed current state: the persistent MATLAB session (`matlabSession/runMatlabInferenceSession.m`) does not survive a reboot and does not auto-start with the backend, and nothing currently watches whether it's alive.

1. New service, `matlabSessionSupervisor.js`. On an interval (e.g. every 30s), check the session's health — either by pinging it with a trivial request the same way `runBranchAInferenceMatlab()` does, or by checking `matlabSession/session.log` for a recent timestamp.
2. If the session is unresponsive, attempt to restart it by spawning `matlabSession/runMatlabInferenceSession.m` again (same command your existing startup code uses).
3. If the restart attempt itself fails (or the session is still unresponsive after a restart), write a System Health alert record (§F) — don't let this fail silently. This is the piece that turns "fails loudly" (already true) into "fails loudly *and someone finds out*."

---

## F. System Health Endpoint (§5.3, §10.7)

`GET /api/v1/admin/system-health`. One endpoint, four checks, one JSON response:

```json
{
  "silentPhcs": [{ "phcId": "...", "phcName": "...", "lastContactAt": "...", "hoursSilent": 52 }],
  "stuckJobs": [{ "caseId": "...", "stuckSince": "...", "autoRecoveredCount": 2 }],
  "matlabSessionStatus": "healthy" | "restarting" | "down",
  "unreviewedCases": [{ "caseId": "...", "tier": "C", "createdAt": "...", "hoursUnreviewed": 76 }]
}
```

1. **Silent PHCs:** `SELECT * FROM phc_sites WHERE last_contact_at < NOW() - INTERVAL '48 hours'`. **This needs a new column, `last_contact_at` — don't reuse the existing `phc_sites.last_sync_at`.** `last_sync_at` already has a specific, narrower meaning (updated on full sync completion, feeding the existing PHC Health screen's sync-status indicator) — a PHC sending lightweight case-summary packets under poor connectivity (§10.1) is genuinely in contact even without completing a full sync, and conflating the two would make this alert fire on sites that are actually fine. Add `last_contact_at`, updated on *every* ingestion touchpoint — `POST /api/v1/cases`, `/cases/summary`, `/cases/chunks` should all touch it — and leave `last_sync_at` doing whatever it already does.
2. **Stuck jobs:** read whatever record §D.3 writes.
3. **MATLAB session status:** read whatever state §E tracks.
4. **Unreviewed cases:** `SELECT c.case_id, gr.conformal_tier, c.received_at FROM cases c JOIN grading_results gr ON ... LEFT JOIN ophthalmologist_reviews r ON ... WHERE r.review_id IS NULL AND gr.referable = true AND c.received_at < NOW() - INTERVAL '48 hours'` (adjust the threshold as the team decides — 48 hours is a reasonable default, not a fixed requirement).

---

## G. Simulink Integration (§7, §5.3, §5.4)

The model is done (§0). This section is entirely about the missing connection to the product.

1. Fix `simulink-model/README.md:16`.
2. New scheduled job (cron or `setInterval`, run daily or on-demand) that either (a) invokes MATLAB to run the `.slx` model and capture its output, or (b) if the full Simulink run is too slow to run frequently, runs `referenceQueueingModel.m` (the pure-MATLAB reference, confirmed to run in ~9 seconds) as the thing that actually feeds the dashboard, with the full Simulink model run less frequently as the validation check against it. Either is acceptable — the key requirement is that *something* runs on a schedule and writes a result file the API can read.
3. Write the output to a location the endpoint below reads — a `simulation-results.csv`/JSON file, or a small database table (`resource_recommendations` with `min_ophthalmologists_routine`, `min_ophthalmologists_camp`, `bottleneck`, `generated_at`) — a table is preferable since it's queryable and timestamped without file-parsing logic.
4. `GET /api/v1/admin/resource-recommendations` — reads the above and returns it as plain JSON.

---

## H. Rule Engine Completion — venous beading and IRMA (§6.7)

**Contract with Tanuj:** he delivers two new signal-computation outputs, added to the segmentation/vessel-analysis result JSON that already flows into your rule engine:
- `venousBeadingQuadrants: [bool, bool, bool, bool]` — one boolean per retinal quadrant.
- `irmaQuadrants: [bool, bool, bool, bool]` — one boolean per quadrant.

Your task, in `ruleEngineGrade.m`: currently only the hemorrhage-count leg of the "4-2-1" severe-NPDR rule has a working branch. Add two more `if/else` branches consuming the two fields above:
- Severe NPDR if `sum(venousBeadingQuadrants) >= 2` (in addition to the existing hemorrhage-count branch).
- Severe NPDR if `any(irmaQuadrants)` (at least one quadrant).

These are `OR`'d with the existing hemorrhage-count branch — severe NPDR fires if *any* of the three criteria is met, not all three. **Do not start this until Tanuj confirms both fields exist in the JSON your code reads** — build against the field names above now if you want to unblock yourself, with a mock/hardcoded-false value, so your branch logic is written and testable independent of his timeline; swap the mock for the real field once it lands.

**Quadrant assignment itself is moving from Python to MATLAB (Tanuj's task, not yours).** Today, quadrants are assigned in `segInfer.py`, and your rule engine only ever receives the four resulting counts — that interface doesn't change for you. What changes is *where* that assignment computation runs, and it's a natural fit for the broader push to maximize genuine MATLAB usage: quadrant mapping is deterministic geometry (relative to the fovea-disc axis), not a trained model, so it ports cleanly. This also gives the `fovea_unreliable` fallback (§I) a single home — the image-axis fallback logic lives right next to the quadrant-assignment code once both are in MATLAB, rather than split across two languages. You don't need to do anything differently here; just don't be surprised if the four counts start arriving from a different upstream source.

---

## I. Fovea-Unreliable Wiring (§6.4, §6.8)

**Confirmed currently: this does not exist anywhere in the codebase, in any form.**

**Contract with Tanuj:** he delivers a boolean field, `foveaUnreliable`, as part of the localization pipeline's output JSON.

Your tasks:
1. Add `segmentation_outputs.fovea_unreliable BOOLEAN` (migration, §L).
2. In the orchestrator, write this field from the localization result.
3. In `ruleEngineGrade.m`, when `fovea_unreliable = true`, skip quadrant-dependent logic entirely and fall back to the plain image-axis convention (whatever your existing non-quadrant fallback path is — if one doesn't exist yet, you'll need to write it: a version of the rule engine that doesn't depend on the fovea-to-disc axis at all).
4. In the tier-decision function (`gradingOrchestrator.js:794-819`), add `fovea_unreliable === true` as one more condition forcing at least Tier B (alongside the existing `branchAgreement===false→C`, `qualityForced→C`, `cameraProbationOverride→B` conditions already there).

Same as §H: you can build 1, 2, and 4 now against the field name above with a hardcoded `false`, independent of Tanuj's timeline.

---

## J. Neovascularization Suspicion Score — Orchestration Wiring (§6.6, §1.12)

This is subtler than "wire in a field" — confirmed current state: `neovascularizationSuspicion.m` is a real MATLAB file that computes a genuine score, but it is **never called** from the live path. The live segmentation call is `segInfer.py` (Python), which never sets `nvSuspicionScore` at all — `gradingOrchestrator.js:1116` reads a field Python never populates, falls through to a hardcoded 0.

**Your task:** add a new orchestration step, after vessel segmentation returns (regardless of whether that's the Python or a future MATLAB path), that calls `neovascularizationSuspicion.m` with the vessel-mask output as input — likely via the same persistent MATLAB session pattern already used for Branch A, since spinning up a fresh MATLAB process per case would be slow. Write its return value into `segmentation_outputs.nv_suspicion_score`, replacing the current hardcoded 0/NULL logic at `gradingOrchestrator.js:899,1116`.

**Tanuj's task, separately:** improving the formula inside `neovascularizationSuspicion.m` itself (currently density + tortuosity only; missing fractal complexity and not using the branch/junction counts it already computes) — that's his file, not yours. You're wiring the call; he's improving what gets called. Do not wait for his formula improvement to build the orchestration step — wire it against the *current* version of the file now; his later change to the formula's internals doesn't change your call signature.

---

## K. Camera/Site Probation Tracking (§6.3, §5.4) — confirmed already built, no action needed

Confirmed real: `hasClearedCameraSiteProbation(phcId, cameraDeviceId, excludeCaseId)` (`gradingOrchestrator.js:547-558`) is a genuine Postgres query counting completed graded cases for that exact `(phc_id, camera_device_id)` pair, feeding `cameraProbationOverride` at `:740-741`. `CAMERA_PROBATION_MIN_CASES = 20` (`:545`) is explicitly documented as a stated, tunable placeholder — adjust it if the team wants a different number, but there's no rebuild needed.

**Known limitation, optional enhancement only if time allows:** there's no dedicated schema for this — no `graduated_at` column, no history of *when* a site/camera graduated, and "graduation" is recomputed from scratch on every case via a live join+count rather than a cached flag. Functionally correct as-is; only worth revisiting if query performance becomes a real problem at higher case volumes, which is unlikely to matter for the national round. Do not spend time on this unless everything else in this plan is done first.

## Q. One-Time Hygiene Sweep — MATLAB/JSON Interop

`jsonencode([])` returns JSON `[]`, not `null` — this has caused three separate real bugs in this codebase already (`ruleEngineGrade`/`branchAgreement` originally, then `uncertaintyScore`, then a failed `gradcamPath`). Rather than patching this case-by-case again the next time it bites, do a one-time sweep: every value that crosses from a MATLAB call back into JS should be routed through one conversion helper (`fromMatlab()` or equivalent) that normalizes this specific empty-array-vs-null ambiguity, rather than each call site handling it ad hoc. This is cheap now and will keep being a recurring bug source later if left alone.

## R. Hard-Exudate Field Rename — Downstream Check

Tanuj is renaming the bright-lesion model's own output field to `hard_exudate` (his plan, §9) — his side is the model/segmentation code. Your side: grep the Node/JS layer for any hardcoded references to the old field name (in JSON handling, the evidence-report generator, or anywhere else data from that model gets read or displayed) and update them to match. Do this once his rename lands, not before — coordinate timing with him directly rather than guessing when it's safe to change your side.

---

## L. Schema Migrations — full list

Set up real migration tooling first rather than continuing to hand-edit `schema.sql` — this is itself a stated gap (§11). **Recommend `node-pg-migrate` over `knex`**, given the codebase already queries Postgres directly with raw SQL (`pool.query`) everywhere and doesn't use a query builder anywhere else — `knex` would introduce a second way of talking to the database for no real benefit here. Your call to make either way, since you're the one maintaining it. **Yes, the existing `schema.sql` should become the baseline/initial migration** — snapshot the current schema as migration zero, then every change from here forward goes through the tool, not hand-edits. Once that's in place, the migrations needed:
1. `access_log` table (§A).
2. `phc_sites.api_key` column (§A).
3. `phc_sites.last_contact_at DATETIME`, separate from the existing `last_sync_at` (§F).
4. `patients.consent_given_at DATETIME` (§M).
5. `cases_capture_id_ref_unique` constraint (§C.1).
6. `grading_results.claimed_by UUID FK` (§B.2).
7. `segmentation_outputs.fovea_unreliable BOOLEAN` (§I.1).
8. `explainability_outputs.rationale_report_path TEXT` (§O, PDF report).
9. `resource_recommendations` table, if you go that route in §G.3.

---

## M. Consent Capture — Backend Support (§9.7)

Small: accept a `consentGivenAt` timestamp field in the patient-registration payload (`POST /api/v1/cases`, or wherever patient registration currently happens), write it to `patients.consent_given_at` (migration above). The actual checkbox/confirmation UI is the frontend team's task — you're just accepting and storing the field.

---

## N. Publish the ID-Generation Format Contract

`ids.js:70-72`'s format — `` `${phcCode}-${Date.now().toString(36)}-${randomSuffix(4)}` `` — is the one correct, collision-safe scheme (§10.6), and it's already what the desktop app uses. The mobile app needs to produce IDs in this *exact* format, but **cannot reuse this file directly**: it depends on `crypto.randomBytes` (Node core, not available in Expo/Hermes without a different polyfill) and `process.env.PHC_CODE` (not populated the same way under Metro/Expo).

Your task: write a short, explicit spec (a markdown file or a shared constants file) stating the exact format string, and handing the mobile team the two things they need to replace: `crypto.randomBytes(n)` → `expo-crypto`'s equivalent random-bytes function, and `process.env.PHC_CODE` → an `EXPO_PUBLIC_PHC_CODE` env var (Expo's public-env convention) or a value passed in at app configuration time. You are not writing the Expo-side code — that's the frontend team's task — you're making sure they don't have to reverse-engineer the format from reading your file.

---

## O. PDF Clinical-Rationale Report (§6.9)

New `explainability/generateReport.m`, using `mlreportgen`. Assembles, per case: patient identifiers, the fundus photograph, the Grad-CAM overlay, the DR grade with plain-language description, both branches' output and agreement status, the four-category lesion evidence, and the standing "AI-assisted screen — requires ophthalmologist review" disclaimer. Save to `central-system/backend/media/cases/<caseId>/report.pdf`, write the path to `explainability_outputs.rationale_report_path` (migration §L.7), and expose it via the existing `/media/` static route (guard this route with auth too, per §A — it currently serves files unauthenticated).

## P. DICOM Input Support (§14, Medical Imaging Toolbox)

`readFundusImage.m` reportedly has partial DICOM support already — confirm what's there before writing new code. Task is likely just testing/activating `dicomread`/`dicominfo` against a real DICOM sample, plus using DICOM metadata for automatic eye-laterality detection where available (falling back to the manual left/right control otherwise, §10.4).

---

## S. Wire M2/M3/M4 Into the MATLAB Path — currently blocked, do not start yet

**Status correction:** an earlier pass of this plan said this conversion was fully done. It isn't, in the repo you actually have — `models/` currently has `vessel_unet_v1.onnx` and `localization_v1.onnx` (ONNX export done for these two, but no `.mat` for either — the MATLAB import step either wasn't run or wasn't committed) and **nothing at all** for the bright-lesion model (no `.onnx`, no `.mat`). This was verified against your actual `models/` folder, not assumed. **Do not start this task until Tanuj confirms the missing artifacts are in place** — he's tracking this as an urgent action item on his side (check whether these exist locally from an earlier session and just need committing, or need regenerating from scratch). Once he confirms, the rest of this section applies as written:

1. Extend the same `INFERENCE_BACKEND=python|matlab` pattern already built for Branch A to cover segmentation: add the equivalent toggle/dispatch for vessel segmentation, optic-disc/fovea localization, and hard-exudate detection, defaulting to `matlab` once you've confirmed each one loads and runs correctly in your environment, with Python (`segInfer.py`) as the fallback.
2. **Do not wire M5 (red-lesion) this way at all, for now** — not blocked pending files, genuinely out of scope until further notice. Its current MATLAB conversion reflects the old 2-class model and is being replaced by Tanuj's 3-class retrain (his plan, §4) — wiring the soon-to-be-stale version in now would be wasted work. Keep M5 on its current path until he tells you the new conversion is ready.
3. **Beyond tensor parity, also verify lesion counts and the resulting rule-engine grade match between the Python and MATLAB paths, on the same reference images** — this was flagged as a real gap in the original parity-checking approach and it's a good catch: a tensor difference small enough to be invisible at the pixel level can still flip whether a borderline blob gets counted, which changes a lesion count, which can change the rule-engine's grade. Tensor parity alone doesn't catch that; check the actual downstream discrete outputs too, for every model you wire in this section.
4. **Re-measure end-to-end latency once more than one model is being served from the same persistent MATLAB session.** The earlier 3.3s-vs-6.3s win over Python was measured with the session serving Branch A alone — loading three more networks into the same process changes memory footprint and per-case compute in ways that measurement didn't cover. Don't assume the same speedup magnitude holds without checking.
5. This is a good task to start (once unblocked) independently of Tanuj's retrain work — nothing here is blocked on his *retrain* timeline specifically, only on the missing artifacts above. It's a real, direct expansion of genuine MATLAB toolbox usage across the pipeline, which is worth pursuing broadly precisely because the risk here is low (verified-parity conversions), unlike the previously-rejected idea of replacing a trained model with an untrained classical heuristic (§16's "Explicitly rejected" list) — that rejection still stands and this task is not a reopening of it.

---

## Summary — Cross-Team Handoff Contracts

| You depend on | From | Field/Contract | Can you start before it exists? |
|---|---|---|---|
| §H rule engine | Tanuj | `venousBeadingQuadrants`, `irmaQuadrants` arrays | Yes — mock as all-false |
| §I fovea wiring | Tanuj | `foveaUnreliable` boolean | Yes — mock as false |
| §J NV score call | Tanuj | `neovascularizationSuspicion.m`'s current signature (unchanged by his formula work) | Yes — his internal formula changes don't change your call |
| §S M2/M3/M4 wiring | Tanuj | Missing `.mat`/`.onnx` artifacts committed to the repo | No — blocked until he confirms these exist |
| §S M5 re-wiring | Tanuj | "New M5 conversion is ready" signal | No — wait for his explicit go-ahead, don't wire the stale version |
| §N ID format | You → Frontend team | Published spec, not code | They wait on your spec, not your code |
| §M consent field | Frontend team → You | `consentGivenAt` in the payload | You build the column/accept-logic now; works once they send the field |
