# Implementation Plan — Frontend
## Owners: Krrish, Vedant, Kankshi (when not on backend/ML), Parth (once PPT work is done)

This whole list needs to be **done, not just started**, by Sept 10 — the internal round weighs visuals heavily, so treat visual polish as part of "done," not a nice-to-have at the end. There's no checkpoint marker in this one the way the backend/ML plan has one — everything below is in scope for the 10th.

Divide these tasks among yourselves however works — you know your own pace better than a plan written in advance can. One steer, since it was raised explicitly: **Krrish should take the tasks marked 🔴 HARDEST** — they're the most visually and technically complex, and the ones most worth having your strongest frontend developer on.

---

## Shared Repository Directory Structure

Full baseline — you own everything under `phc-local-app/frontend/` and `central-system/frontend/`. The `backend/` folders belong to Tanuj and Saad; shown here so you know exactly what shape of data to expect from each endpoint once it's real.

```
dr-screening-system/
├── README.md
├── docs/
│   ├── system-design-v3-final.md
│   ├── implementation-plan-backend-ml.md
│   ├── implementation-plan-frontend.md
│   ├── diagram-pipeline-layers.svg
│   └── diagram-phc-central-architecture.svg
│
├── phc-local-app/
│   ├── frontend/                          # YOU OWN THIS
│   │   ├── package.json
│   │   ├── public/
│   │   │   └── index.html
│   │   └── src/
│   │       ├── index.jsx
│   │       ├── App.jsx
│   │       ├── config.js
│   │       ├── api/
│   │       │   ├── localApiClient.js
│   │       │   └── mockData.js
│   │       ├── components/
│   │       │   ├── PatientRegistrationForm.jsx
│   │       │   ├── CaptureScreen.jsx
│   │       │   ├── QualityResultPanel.jsx
│   │       │   ├── PatientQuestionnaireForm.jsx
│   │       │   ├── CaptureMetadataForm.jsx
│   │       │   ├── LocalQueueTable.jsx
│   │       │   └── SyncStatusBadge.jsx
│   │       └── styles/
│   │           └── main.css
│   └── backend/                           # backend track owns this
│
├── central-system/
│   ├── frontend/                          # YOU OWN THIS
│   │   ├── package.json
│   │   └── src/
│   │       ├── index.jsx
│   │       ├── App.jsx
│   │       ├── config.js
│   │       ├── api/
│   │       │   ├── apiClient.js
│   │       │   └── mockData.js
│   │       ├── auth/
│   │       │   └── RoleRouter.jsx
│   │       ├── ophthalmologist/
│   │       │   ├── ReviewQueuePage.jsx
│   │       │   ├── CaseDetailPage.jsx
│   │       │   ├── GradCamOverlay.jsx
│   │       │   ├── LesionEvidencePanel.jsx
│   │       │   ├── BranchComparisonPanel.jsx
│   │       │   ├── DecisionControls.jsx
│   │       │   └── CaseHistoryTimeline.jsx
│   │       ├── admin/
│   │       │   ├── DashboardPage.jsx
│   │       │   ├── PhcHealthTable.jsx
│   │       │   ├── ReferralTrackerPage.jsx
│   │       │   └── ResourceRecommendationsPanel.jsx
│   │       └── styles/
│   │           └── main.css
│   └── backend/                           # backend track owns this
│
├── simulink-model/                        # backend track owns this
├── datasets/                              # backend track owns this
└── scripts/
```

Stack: React for both frontends (Vite is the fastest way to stand these up). No CSS framework mandated — pick one (Tailwind is fine, or plain CSS with a shared design-tokens file) and use it consistently across both apps so they don't look like two different products.

---

## Phase 0 — Setup & the Mock/Real Switch (do this first, together)

**Task 0.1 — Scaffold both React apps**
- Files: `phc-local-app/frontend/package.json` + `src/index.jsx` + `src/App.jsx`, and the same three files under `central-system/frontend/`
- Build: two separate Vite+React apps, each rendering a placeholder "hello" page to confirm they boot.

**Task 0.2 — Design tokens / shared visual language**
- Files: `phc-local-app/frontend/src/styles/main.css`, `central-system/frontend/src/styles/main.css`
- Build: agree on and write down a shared palette, type scale, and spacing scale (even a simple one) *before* building individual screens, and use it consistently in both apps. Given how much the internal round weighs visuals, inconsistent styling between the two apps will stand out badly — decide this once, here, not screen by screen.

**Task 0.3 — The mock/real data switch — build this before any screen that needs data**
- Files: `phc-local-app/frontend/src/config.js`, `phc-local-app/frontend/src/api/localApiClient.js`, `phc-local-app/frontend/src/api/mockData.js` (and the equivalent three files under `central-system/frontend/src/`)
- Build: `config.js` exports one flag, e.g. `export const USE_MOCK_DATA = true;` (flip to `false` once the real backend is ready — this is the switch the plan calls for). Every data-fetching function lives in `localApiClient.js` / `apiClient.js`, and each one checks the flag: if mock, return a promise resolving to matching data straight from `mockData.js`; if real, make the actual `fetch()` call to the backend endpoint. **No component should ever import `mockData.js` directly** — always go through the client file, so flipping the switch is a true one-line change.
- Build `mockData.js` to match the *exact* shape of what the real API will return (field names matching design doc §5.5/§4.3 schemas) — ask Tanuj/Saad for the finalized endpoint list from their Task 3.2/3.5 as soon as it exists, even before those endpoints are actually implemented, so your mock shapes are already correct and swapping later is a non-event.
- Connects to: every single screen below reads through these client files, never fetches directly.

---

## Phase 1 — Local PHC App Screens

**Task 1.1 — Patient Registration**
- File: `phc-local-app/frontend/src/components/PatientRegistrationForm.jsx`
- Build: ID/search field for an existing patient, plus a new-patient form (name, age, contact number — contact number required, per design doc §4.1). On submit, calls `localApiClient.createPatient()`.

**Task 1.2 — Capture screen**
- File: `phc-local-app/frontend/src/components/CaptureScreen.jsx`
- Build: since real fundus camera SDK integration isn't necessary to demonstrate the concept, simulate capture via file upload (a styled dropzone or file picker) standing in for "the camera produced an image" — treat the uploaded file exactly as a captured image from here on. Show a preview of the selected image, an "Accept" button that calls `localApiClient.submitCapture()`, and a "Retake" affordance that clears the preview.
- Connects to: on submit, the response (real or mocked) drives the Quality Result panel (Task 1.3).

**Task 1.3 — Quality Result panel**
- File: `phc-local-app/frontend/src/components/QualityResultPanel.jsx`
- Build: pass/fail/borderline badge with the specific reason text from the API response (design doc §4.1 — never a bare rejection). A retake button loops back to Task 1.2.

**Task 1.4 — Patient Questionnaire (symptom + risk)**
- File: `phc-local-app/frontend/src/components/PatientQuestionnaireForm.jsx`
- Build: structured fields from design doc §9.1 — years since diabetes diagnosis (ranges), blood sugar control (good/moderate/poor), blood pressure status, pregnancy status, and the four symptom yes/no toggles (blurred vision, floaters, sudden vision change, eye pain). Dropdowns/toggles only, no free text.

**Task 1.5 — Capture Metadata Questionnaire**
- File: `phc-local-app/frontend/src/components/CaptureMetadataForm.jsx`
- Build: the fields from design doc §9.6 — camera device (a fixed dropdown list), pupil status, lighting environment, an observed-issues multi-select checklist, and the worker's overall usability rating. Tap-only, keep it fast — this form should be usable in well under a minute. **Keep this visually and structurally separate from Task 1.4** — it's a different form about a different thing (the photo, not the patient), and design doc §1.10 is explicit that conflating them is a mistake.

**Task 1.6 — Local Queue table**
- File: `phc-local-app/frontend/src/components/LocalQueueTable.jsx`
- Build: today's patients with status column (Captured / Quality-Passed / Synced / Result-Pending / Result-Delivered).

**Task 1.7 — Sync Status indicator**
- File: `phc-local-app/frontend/src/components/SyncStatusBadge.jsx`
- Build: small always-visible badge — online/offline state, count of items pending upload. Doesn't need to be fancy, just always present on screen.

---

## Phase 2 — Central Website Shell

**Task 2.1 — App shell + role routing**
- File: `central-system/frontend/src/auth/RoleRouter.jsx`, `central-system/frontend/src/App.jsx`
- Build: a simple login/role-select screen (this is one website, two role-based views, per the design doc — no separate app needed). After login, route to either the ophthalmologist views (Phase 3) or the admin views (Phase 4) based on role.

---

## Phase 3 — Ophthalmologist Interface

**Task 3.1 — Review Queue page**
- File: `central-system/frontend/src/ophthalmologist/ReviewQueuePage.jsx`
- Build: list sorted by priority (referable + high-uncertainty + branch-disagreement first), each row showing patient reference, PHC, capture time, predicted grade, confidence. Clicking a row opens Case Detail.

**Task 3.2 — 🔴 HARDEST — Case Detail page**
- File: `central-system/frontend/src/ophthalmologist/CaseDetailPage.jsx`, plus its three sub-components: `GradCamOverlay.jsx`, `LesionEvidencePanel.jsx`, `BranchComparisonPanel.jsx`
- Build: this is the single most complex and most important screen in the whole system — it's also the one most likely to be the actual "wow moment" in the demo, since it's where the explainability story becomes visible. It needs, all on one screen without excessive scrolling: the original fundus image; a Grad-CAM overlay that can be toggled on/off cleanly over the same image (`GradCamOverlay.jsx` — handle this as an absolutely-positioned semi-transparent layer on top of the base image, not a separate side-by-side image, since overlay-in-place is what actually reads as "here's where it looked"); a lesion-evidence panel (`LesionEvidencePanel.jsx`) showing the structured summary text plus counts by lesion type; a branch-comparison panel (`BranchComparisonPanel.jsx`) showing the CNN grade and the rule-engine grade side by side, with a visually distinct flag state when they disagree (this needs to look different enough from the normal state that a reviewer can't miss it at a glance — don't just use a small text label); and the calibrated confidence + conformal tier displayed prominently near the top, since that's what determines urgency.
- This screen also needs to support the whole review workflow being fast — design doc §5.2 targets under 30 seconds per case, so layout hierarchy matters more here than almost anywhere else in the system: most important information (grade, tier, disagreement flag) should be readable without any interaction at all.
- Connects to: reads from `apiClient.getCaseDetail(caseId)`, and its Decision Controls (Task 3.3) write back through the same client.

**Task 3.3 — Decision Controls**
- File: `central-system/frontend/src/ophthalmologist/DecisionControls.jsx`
- Build: Confirm button, Override button (opens a reason-capture flow: a short structured category list — "artifact misread as lesion," "lesion missed," "wrong severity level," "image quality issue" — plus an optional free-text field). Keyboard shortcuts here are worth the small extra effort given the 30-second target.

**Task 3.4 — Case History**
- File: `central-system/frontend/src/ophthalmologist/CaseHistoryTimeline.jsx`
- Build: per-patient audit trail of past screenings; where more than one screening exists for a patient, show a simple longitudinal view of DR grade over time (a small trend line or stepped timeline is enough — this doesn't need to be elaborate).

---

## Phase 4 — District Admin Interface

**Task 4.1 — Dashboard page**
- File: `central-system/frontend/src/admin/DashboardPage.jsx`
- Build: patients screened per PHC per day/week, average review turnaround — simple charts are fine here (a bar chart and a line chart cover most of this).

**Task 4.2 — PHC Health table**
- File: `central-system/frontend/src/admin/PhcHealthTable.jsx`
- Build: sync status per PHC site (current vs. backlogged).

**Task 4.3 — Referral Tracker page**
- File: `central-system/frontend/src/admin/ReferralTrackerPage.jsx`
- Build: referred → contacted → attended (or lost) status per referral, with an assigned-worker field.

**Task 4.4 — Resource Recommendations panel**
- File: `central-system/frontend/src/admin/ResourceRecommendationsPanel.jsx`
- Build: plain-language text output translated from the Simulink model's numbers (e.g. "PHC X approaching capacity, consider redistributing") — this can be a simple styled card, the value here is the message, not the visualization.

---

## Phase 5 — Polish & Demo Readiness (do not skip this phase)

**Task 5.1 — Visual consistency pass**
- Go through every screen from Phases 1–4 against the design tokens from Task 0.2. Fix anything that drifted — spacing, colors, font sizes that don't match. This is the single highest-leverage use of time this close to a visuals-weighted judging round.

**Task 5.2 — Responsive check**
- Confirm both apps look reasonable on whatever screen/projector size the demo will actually run on — check this in advance, not for the first time five minutes before presenting.

**Task 5.3 — End-to-end mock-data demo rehearsal**
- With `USE_MOCK_DATA = true` in both `config.js` files, walk through the entire flow once, start to finish: patient registration → capture → quality result → both questionnaires → (switch app) → review queue → case detail → confirm/override → admin dashboard. Fix anything that breaks or looks unfinished in that walkthrough — this is your actual demo path if the real backend isn't ready in time, so it needs to work standalone, not just look plausible in isolated pieces.
