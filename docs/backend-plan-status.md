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
| E | MATLAB session supervisor: heartbeat, auto-start at boot, restart, alert when a restart fails, no restart loop | Done | `verify_backend_health.js` |
| F | `GET /admin/system-health` covering silent PHCs, stuck jobs, MATLAB status and unreviewed cases, plus the new `last_contact_at` | Done | `verify_backend_health.js` |
| G | Simulink README fixed. `referenceQueueingModel('recommend')` runs daily into `resource_recommendations`, served by `GET /admin/resource-recommendations` | Done | ran live (about 10 s) |
| H | Venous beading and IRMA wired into the rule engine as 4-element boolean arrays; they are passed only when present | Done | `testRuleEngineSignals.m` (17) + `testBranchB.m` (54) |
| I | `fovea_unreliable` stored; rule engine skips the quadrant criteria; tier held at B or higher | Done on the backend side. See the §I.3 note below. | `testRuleEngineSignals.m`, live MATLAB run |
| J | `neovascularizationSuspicion.m` now runs inside the per-case MATLAB call; the real score is stored instead of NULL/0 | Done | live run: NV 0.078 / 0.101 on real images |
| K | Camera probation | No action needed (as planned) | none |
| M | `consentGivenAt` accepted and stored, at both the PHC and central | Done | tests |
| N | ID-format spec for the mobile team, `docs/id-format-spec.md` | Done | self-check run against `ids.js` |
| O | Clinical-rationale PDF, `GET /cases/:id/report`. Rendered by `generateReport.m`; MATLAB Report Generator is not installed, so it uses core-MATLAB figures and exportgraphics. | Done | real case rendered and served |
| P | DICOM through `readFundusImage`; the DICOM eye tag is recorded and a mismatch with the technician's choice is flagged | Done | `testReadFundusDicom.m` (8), on a synthetic DICOM |
| Q | One `fromMatlabDeep` boundary for `[]`→null, plus `jsonencodeAscii`, which fixes em dashes being silently dropped from MATLAB output on Windows | Done | live runs |
| R | Rename to `hard_exudate` / `hardExudates` in the JS layer | **Waiting on Tanuj's rename** | none |
| S | M2/M3/M4 served from the MATLAB session (`SEG_INFERENCE_BACKEND`, PyTorch fallback, M5 excluded) | Done | `diagnostics/checkSegBackendParity.py`: rule grade 20/20, lesion counts 20/20 |

## Flagged explicitly (plan §A.15): encryption at rest is NOT in place

The plan's own corrected guidance: self-hosted Postgres has no built-in transparent data encryption. For this round the real mechanism is **full-disk encryption at the OS level**. It needs no application code, so it cannot be done from the repository.

- **This machine (Windows 11 Home):** BitLocker proper isn't available on the Home edition. Windows 11 Home offers **Device Encryption** instead (Settings → Privacy & security → Device encryption) if the hardware supports it. It covers the Postgres data directory, the stored images under `central-system/backend/media/`, and the PHC's SQLite file. Someone with admin rights on the machine has to switch it on.
- **What it protects against:** a stolen or badly decommissioned disk.
- **What it does not protect against:** a compromised running system reading the database. That needs column-level encryption (`pgcrypto`) with proper key management, which is out of scope this round.

## Notes

- **§I.3:** the rule engine side is done. When `foveaUnreliable` is true it skips the quadrant-dependent criteria and grades on totals. The *upstream* quadrant assignment (`quadrant_counts` in `segInfer.py`) still uses the fovea-to-disc axis. It already falls back to the image axes when disc and fovea coincide, but it does not yet read `foveaUnreliable`, because that field does not exist yet. That change belongs next to Tanuj's fovea gate, which is where the plan says quadrant assignment is moving.
- **§S.4 latency:** serving M2–M4 from the MATLAB session gives **no speedup** for segmentation: 22.5 s per image on MATLAB vs 21.4 s on PyTorch, over 20 images. Each forward pass takes under 1 s in the session, but every `segInfer.py` call is still a fresh Python process that also loads M5 in PyTorch, and that dominates.
- **Grading time per case is about 50 s end to end.** The largest single cost is the per-case `matlab -batch` call for the rule engine and evidence report, about 20 s of which is MATLAB start-up. Moving that call into the persistent session is the obvious next improvement; it is not in this plan.
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
