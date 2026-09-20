# Backend plan: status against `implementation-plan-backend-saad (1).md`

Status as of 2026-09-20. Every item below was verified by running it, not by reading code. The test scripts named in the table can be re-run.

## Where each section stands

| § | Item | Status | Verified by |
|---|---|---|---|
| L | Migration tooling (node-pg-migrate). `schema.sql` is now migration 0001, and all later changes are migrations 0002–0009. | Done | `npm run migrate` |
| A.1–A.13 | Login (httpOnly cookie), CSRF, bcrypt, seed users, role guards on every route, `AUTH_ENABLED` flag, 12 h JWT, PHC API keys plus a provisioning script, access log | Done | `verify_backend_auth.js` (53 checks) |
| A.14 | TLS: optional HTTPS at TLS 1.2+ (`TLS_KEY_PATH` / `TLS_CERT_PATH`), plus a self-signed dev certificate from `scripts/generateDevCert.js` | Done | HTTPS served; TLS 1.1 and plain HTTP refused |
| A.15 | Encryption at rest | **Not done. Deployment action needed; see below.** | none |
| B.1 | `GET /api/v1/patients/search`. The desktop app also gets the same endpoint on its local backend, for offline use. | Done | auth suite plus local test |
| B.2 | `POST /cases/:id/claim`: one conditional UPDATE, 30-minute expiry, 409 names who holds it | Done | auth suite |
| B.3 | `GET /cases/:id/reviews` | Done | auth suite |
| C | Idempotent ingestion on `capture_id_ref` (46 old duplicates relabelled, none deleted), plus `POST /cases/summary` and an `awaiting_image` status | Done | `verify_backend_ingestion.js` (20 checks, including 6 concurrent retries) |
| D | Periodic stranded-job watchdog, recoveries recorded, capped at 3 per case | Done | `verify_backend_health.js` |
| E | MATLAB session supervisor: heartbeat, auto-start at boot, restart, alert when a restart fails, no restart loop. The same supervisor now also watches the segmentation worker (`workerSupervisor.js`, two instances). | Done | `verify_backend_health.js` |
| F | `GET /admin/system-health` covering silent PHCs, stuck jobs, MATLAB status and unreviewed cases, plus the new `last_contact_at`. Also reports `segWorker`, kept separate from the MATLAB status on purpose: the MATLAB session being down fails cases, the worker being down only slows them. | Done | `verify_backend_health.js` |
| G | Simulink README fixed. `referenceQueueingModel('recommend')` runs daily into `resource_recommendations`, served by `GET /admin/resource-recommendations` | Done | ran live (about 10 s) |
| H | Venous beading and IRMA wired into the rule engine as 4-element boolean arrays; they are passed only when present | Done | `testRuleEngineSignals.m` (17) + `testBranchB.m` (54) |
| I | `fovea_unreliable` stored; rule engine skips the quadrant criteria; tier held at B or higher | Done on the backend side. See the §I.3 note below. | `testRuleEngineSignals.m`, live MATLAB run |
| J | `neovascularizationSuspicion.m` now runs inside the per-case MATLAB call; the real score is stored instead of NULL/0 | Done | live run: NV 0.078 / 0.101 on real images |
| K | Camera probation | No action needed (as planned) | none |
| M | `consentGivenAt` accepted and stored, at both the PHC and central | Done | tests |
| N | ID-format spec for the mobile team, `docs/id-format-spec.md` | Done | self-check run against `ids.js` |
| O | Clinical-rationale PDF, `GET /cases/:id/report`. Rendered by `generateReport.m` with **MATLAB Report Generator** (`mlreportgen.dom`), as the plan specifies; `generateReportFigures.m` is a core-MATLAB fallback for a machine without that toolbox. | Done | real case rendered and served |
| P | DICOM through `readFundusImage`; the DICOM eye tag is recorded and a mismatch with the technician's choice is flagged | Done | `testReadFundusDicom.m` (8), on a synthetic DICOM |
| Q | One `fromMatlabDeep` boundary for `[]`→null, plus `jsonencodeAscii`, which fixes em dashes being silently dropped from MATLAB output on Windows | Done | live runs |
| R | Rename to `hard_exudate` / `hardExudates` in the JS layer | **Waiting on Tanuj's rename** | none |
| S | M2/M3/M4 served from the MATLAB session (`SEG_INFERENCE_BACKEND`, PyTorch fallback, M5 excluded) | Done | `diagnostics/checkSegBackendParity.py`: rule grade 20/20, lesion counts 20/20 |

## Full audit, 2026-09-20: what it found

A line-by-line pass over every plan section, plus the design doc's own
requirements, looking for things that were done wrongly rather than not at all.
Twelve defects, all fixed and covered by tests.

**Would have been visible to a user**

1. **Reviewed cases never left the review queue.** The queue selected every
   graded Tier B/C case with no check for an existing review, so finished work
   stayed mixed in with outstanding work forever.
2. **A review could be recorded against a case that was never graded** — and
   with a referable-looking corrected grade, that raised a referral and sent
   the patient an SMS. Now `409 case_not_graded`.
3. **An undeliverable SMS left the referral looking exactly like a delivered
   one** (design doc §10.5, never implemented). The one patient nobody reached
   was indistinguishable from the ones who were told.
4. **The camera-probation tier rule could LOWER a case's tier.** It set the
   tier to exactly 'B', so a case the conformal predictor had put in Tier C
   came out as B -- the "floor" was cutting the review requirement.
5. **Queue rows did not show the eye or whether another reviewer held the
   case**, both of which the design doc asks for (§5.2), so a reviewer could
   open a case someone else was already deciding.

**Operational / data correctness**

6. **Summary-first cases were reported as stuck immediately.** "How long has
   this been processing?" was measured from `received_at`, which for a
   summary-first case is when the *summary* arrived, possibly days earlier.
   Now measured from a new `processing_started_at`.
7. **A reviewer who had ever claimed a case could not be removed** (a foreign
   key blocked it), and deleting a user would have orphaned the audit trail
   anyway. Access is now revoked by deactivation; history is kept.
8. **A revoked account kept working for up to 12 hours** -- until its token
   expired. Sessions are now re-checked against the account (cached 60 s), so
   deactivation and role changes take effect within a minute.
9. **A timed-out MATLAB request was left in the request directory,** so a slow
   session would later run inference nobody was waiting for and leave orphan
   response files behind.
10. **The MATLAB session went unsupervised** on a python-classifier +
    matlab-segmentation configuration, silently degrading every case to the
    PyTorch fallback with nobody told.
11. **A chunked upload of an already-ingested capture transferred the whole
    image** over a bad link before ingestion recognised the duplicate and
    discarded it.
12. **A non-numeric `patientAge` produced a 500** from a NOT NULL constraint
    rather than a 400 naming the field.

**Hardening added at the same time**

- Security headers on every response (nosniff, frame-deny, no-referrer,
  no-store).
- A 500 no longer echoes internal error text in production; database errors
  quote table names, column names and sometimes patient values.
- The login brake now also counts per IP, not only per (IP, email), so one
  client cannot walk a list of addresses; its memory is bounded.
- An invalid `RESOURCE_MODEL_CRON` no longer stops the backend from starting.
- A boot warning when auth is enabled over plain HTTP, where the Secure
  session cookie is silently dropped by the browser.

**Test suites:** 16 Node suites, 516 checks, all passing --
`verify_backend_auth` (66), `verify_backend_ingestion` (20),
`verify_backend_health` (28), `verify_backend_pipeline` (35),
`verify_task27`–`verify_task82_83`, plus
`testCors`, `testBranchB` (54), `testRuleEngineSignals` (17),
`testPhase7Explainability` (58) and `testReadFundusDicom` (8) in MATLAB.

Two existing suites asserted behaviour this work deliberately changed (the
ingestion response gained fields; sync-status gained `lastContactAt`) and were
updated. One was failing before any of this work, on a missing `sharp`
install, and one assumed a database with no sync history; both fixed.

## Flagged explicitly (plan §A.15): encryption at rest is NOT in place

The plan's own corrected guidance: self-hosted Postgres has no built-in transparent data encryption. For this round the real mechanism is **full-disk encryption at the OS level**. It needs no application code, so it cannot be done from the repository.

- **This machine (Windows 11 Home):** BitLocker proper isn't available on the Home edition. Windows 11 Home offers **Device Encryption** instead (Settings → Privacy & security → Device encryption) if the hardware supports it. It covers the Postgres data directory, the stored images under `central-system/backend/media/`, and the PHC's SQLite file. Someone with admin rights on the machine has to switch it on.
- **What it protects against:** a stolen or badly decommissioned disk.
- **What it does not protect against:** a compromised running system reading the database. That needs column-level encryption (`pgcrypto`) with proper key management, which is out of scope this round.

## Notes

- **§I.3:** the rule engine side is done. When `foveaUnreliable` is true it skips the quadrant-dependent criteria and grades on totals. The *upstream* quadrant assignment (`quadrant_counts` in `segInfer.py`) still uses the fovea-to-disc axis. It already falls back to the image axes when disc and fovea coincide, but it does not yet read `foveaUnreliable`, because that field does not exist yet. That change belongs next to Tanuj's fovea gate, which is where the plan says quadrant assignment is moving.
- **§S.4 latency, resolved.** The original finding was that serving M2–M4 from the MATLAB session gave no speedup at all: 22.5 s per image on MATLAB vs 21.4 s on PyTorch, over 20 images. The reason is now measured rather than suspected — it moved forward passes costing under a second each and left 17 s of Python process start exactly where it was.

  With the segmentation worker that process start is gone, and the comparison finally means something. It goes the other way:

  | `SEG_INFERENCE_BACKEND` (in the **worker's** environment) | segmentation | whole case |
  |---|---|---|
  | `matlab` (the default, per §S) | 5.3 s | 22.6 s |
  | `python` | 2.6 s | 20.6 s |

  Identical outputs either way (tensor parity 2e-6..4e-5, `diagnostics/out/parity_v1_report.txt`). Serving the three nets from MATLAB now **costs** about 2.7 s per case, because each forward pass is a separate round trip to another process. **The default is left on `matlab` because §S asks for it — this is a decision for the plan owner, not one to change quietly.**
- **Grading time per case is about 33 s end to end, with the session up** (was about 47 s). The per-case MATLAB work — camera check, NV score, rule engine, lesion attention, evidence sentence — is now `ml-pipeline/grading/runCasePipeline.m`, a real function served by the persistent session, instead of ~60 statements joined onto one line for `matlab -batch`. That call went from 23.3 s to 9.2 s: the difference is almost entirely MATLAB start-up, which the session pays once at boot instead of once per case. Verified byte-identical on all 12 output fields against the old expression, on the same image, in the same MATLAB (`scratchpad/parity.js` pattern; `verify_backend_pipeline.js` covers the input and transport contracts). When no session is running it still falls back to `matlab -batch` and logs that it did.
- **Segmentation is now a persistent worker too, and a case takes about 21 s.** `ml-pipeline/inference/segSession/runSegWorker.py` holds M2–M5 in memory; the backend uses it when its heartbeat is fresh and spawns `segInfer.py` per case when it is not. Measured on this machine: the torch import plus four model loads cost **17.1 s** and the actual work costs **2.0 s**, so the per-case process was paying seventeen seconds to do two seconds of work. Same `segInfer.run_one` on both paths, so no preprocessing step, threshold or count can drift; a real case through both produced identical lesion counts, rule-engine grade and NV score.
- **Grading latency, end to end, on the development machine:** about 47 s before this work → 33 s with the case pipeline in the MATLAB session → **21 s** with the segmentation worker as well.
- **Uncertainty on the MATLAB path:** `uncertainty_score` is null under `INFERENCE_BACKEND=matlab`, because MC-dropout is deliberately not faked there. The review queue then ranks Tier C by 1 − confidence, as it always has when uncertainty is missing.
- **`lesionCounts` in `GET /cases/:id`** returns `{red, bright, redTotal, brightTotal, …}`. api-contracts.md and the frontend's lesion panel expect `{microaneurysms, hemorrhages, hardExudates, softExudates}`. The plan is to fix this together with §R.

## Waiting on other people

- **Tanuj:**
  - The §R rename.
  - The M5 3-class retrain, together with recalibrated rule-engine thresholds.
  - The real `foveaUnreliable`, `venousBeadingQuadrants` and `irmaQuadrants` fields. The backend reads them as top-level keys of the segmentation JSON.
- **Frontend team:**
  - The login screen: `credentials: 'include'` plus the `X-CSRF-Token` header.
  - The claim flow and the disagreement rule (Confirm unavailable on disagreement cases).
  - The review-history panel.
  - `eyeLaterality: m.eye` in `CaptureScreen.jsx`'s capture-metadata payload.
  - Mobile: the ID format, a PHC API key, and the endpoints listed in api-contracts.md.
