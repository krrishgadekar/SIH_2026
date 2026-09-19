# UI Implementation Plan — Kankshi
## NetraSetu, National Round — derived from a teammate's screenshot review + codebase notes

**Scope:** This is a distinct workstream from the functional-wiring plan Parth, Vedant, and Krrish are working from. Everything here is a concrete, already-identified bug or polish item — most with an exact file and line number, a few (the screenshot-review items) with an exact screen/behavior description but no file:line yet, since those came from looking at running screens rather than reading code. Where you and the frontend team would touch the same file, coordinate directly before editing — check with them first rather than assuming a file is free to change. "Anything else required by the desktop app" beyond this list: sync with Parth/Vedant/Krrish as new needs come up during your own pass with Tanuj tonight; this document is a strong starting list, not a ceiling.

---

## Part 1 — Critical, Fix Before Anyone Sees a Demo

### 1.1 Fundus Image Viewer Shows Debug Console Output
In the "AI Diagnostic Report" modal, the box labeled "MACULA-CENTERED FUNDUS SCAN (OD)" is currently displaying leftover terminal/debug output ("Enter value of N: 10 / Even: 0,2,4... / Program finished with exit code 0") instead of an actual fundus image. This is a stray dev artifact left in place of the real image render. **Fix:** locate wherever this modal renders its image element and confirm it's actually bound to the real image source (or a placeholder fundus photo from IDRiD/APTOS if real data isn't wired up yet) — not whatever left this debug text in place. Treat this as blocking, not cosmetic; it directly undermines the system's core claim in one screenshot.

### 1.2 PHC Health Status Doesn't Match Sync Recency
Several PHC rows show a green "GOOD" badge while their last-sync timestamps read 270+ hours ago (over 11 days). Either the badge isn't tied to sync recency at all, or the demo data's timestamps are stale relative to whatever "today" is set to in the demo. **Fix:** tie the health badge to an actual staleness threshold (e.g., GOOD only if `last_contact_at` is within a defined window — this pairs directly with the new System Health work the backend is building, §5.4/§10.7 of the design doc; ask Saad for the exact field/threshold once his work lands rather than inventing your own). Refresh demo data timestamps to be recent relative to "today" regardless.

### 1.3 Numbers Don't Reconcile Across Screens
PHC Health shows "Total Screened: 1,991"; Dashboard shows "Total Processed: 1,284," "Images Rejected (Quality): 38," "Pending Sync: 26" — even generously combined, this doesn't explain the ~700 gap. **Fix:** either make it explicit in the UI that "screened" and "processed" cover different time windows or pipeline stages (a short label change may be enough), or make the underlying mock numbers internally consistent so they visibly add up. A judge paying attention will do this arithmetic.

### 1.4 Same Name Used Across Three Different Roles
"Krrish Gadekar" appears as the District Admin, "Dr. Krrish Gadekar" as the ophthalmologist, and "Krrish" as a patient in the queue. **Fix:** give every role and every demo patient a distinct name — costs nothing, avoids a derailing "wait, is that the same person?" mid-demo.

### 1.5 "(UNKNOWN_PATIENT)" Tag Next to a Real Name
The capture screen shows "PATIENT: PARTH GOGGI (UNKNOWN_PATIENT)" — calling a named patient "unknown" reads as an error state. **Fix:** rename the tag to something like "(NEW REGISTRATION)."

---

## Part 2 — High-Priority, Fix Before the National Round

### 2.1 Confidence and Agreement Tell Contradictory Stories, Unexplained
In the Review Queue, a mismatch case (CNN says Grade 2, Rule Engine says Grade 3) shows 81% confidence — higher than an agreeing case below it at 64%. Left unexplained, this reads as a bug. **Fix:** label the score explicitly as "CNN confidence" (one branch's own self-assessed certainty, not a combined system confidence), and treat this as a talking point rather than something to hide: "the CNN was 81% confident and still wrong — this is exactly why we never trust one branch alone" is a stronger demo moment than a number with no explanation.

### 2.2 Full Patient Names Visible on the Ophthalmologist's Review Queue
The Review Queue shows a patient's real first name directly ("Krrish, PT-4821, 20Y"), which sits awkwardly next to the system's own stated role-based-access-control and audit-logging design (§11.1). **Fix:** show only the patient reference/ID at the review stage; reserve full names for the technician/registration and referral-tracking stages where identity is actually needed.

### 2.3 Rotating Status Ticker Can Show a Stale Message
A top-left status ticker ("MODEL v4.2 READY," "INITIALIZING SYSTEM...," "PIPELINE OPTIMAL," etc.) can show "INITIALIZING SYSTEM..." on a screen that's already fully loaded. **Fix:** confirm this ticker's state actually reflects real system status rather than looping through messages on a timer regardless of what's true — a static "still initializing" message on a loaded screen reads as a hang, not a feature.

### 2.4 GradCAM Overlay Controls Have No Accessibility
The JET/CONTOURS/CENTROIDS toggle buttons render as `<button>` elements with no `aria-pressed`, `aria-label`, or visible keyboard focus state. **Fix:** add proper ARIA attributes and focus styling — for a medical tool this is a real gap, and it's also a stated judging criterion at national level.

### 2.5 Dashboard Charts Have No Empty/Error State
If `data.drGradeDistribution` or `data.weeklyTrend` is empty, the charts render with blank axes and no explanation. This will visibly happen on any fresh deployment before data exists. **Fix:** add a zero-state placeholder ("No data yet for this period") instead of a blank chart.

### 2.6 No Tablet/Responsive Layout for the Capture Screen
The capture screen's two-column CSS grid overlaps at ~768px viewport width (iPad-sized). The system targets a PHC desktop, but judges are likely to view this on a laptop or tablet. **Fix:** add `@media` breakpoints for the capture screen's layout specifically — this is the screen most likely to be shown live.

---

## Part 3 — Cleanup, Lower Priority But Cheap

### 3.1 Vite Scaffold `index.css` Still Present
Both `phc-local-app/frontend/src/index.css` and `central-system/frontend/src/index.css` are still the original Vite scaffold (purple accent variables, a fixed `#root` width of `1126px`, `text-align: center` on `#root`), conflicting with the real design system in `styles/main.css` and causing horizontal scroll under 1200px. **Fix:** replace the contents of `index.css` with a one-line comment pointing to `main.css`, or remove the import from `main.jsx` entirely and import `main.css` directly.

### 3.2 Hardcoded Personal Credentials in Source
`central-system/frontend/src/App.jsx` (lines ~58–66, ~76–91) has a real personal email, phone number, and officer ID embedded directly in source — committed to the repo. **Fix:** replace with clearly-fake demo placeholders (`demo@draiai.health`, a masked phone pattern, a demo officer ID).

### 3.3 `dangerouslySetInnerHTML` Used for a Line Break
`PatientRegistrationForm.jsx:51` uses `dangerouslySetInnerHTML` just to inject a `<br/>` — unnecessary React-XSS-protection bypass for no real benefit. **Fix:** use CSS `white-space: pre-line`, or split into separate elements.

### 3.4 `alert()` Used as Error UI
Three places (`CaptureScreen.jsx:153,233`, `PatientRegistrationForm.jsx:40`) use a raw browser `alert()` for error messages — jarring, blocks the event loop, reads as unfinished. **Fix:** build a small `ErrorToast` component (fixed-position banner, auto-dismiss after a few seconds, matching the existing design system) and replace all three calls.

### 3.5 Donut Chart Center KPI Uses a Magic Number
`DashboardPage.jsx:314-330` positions the center KPI overlay with a magic `top: 40%`, which breaks when the chart legend reflows. **Fix:** use `top: 50%` with `transform: translate(-50%, -70%)`, or a proper Chart.js plugin for center text.

### 3.6 No Favicon or PWA Manifest
Both apps still use the default Vite favicon, and there's no manifest — meaning the PHC app can't be installed as a home-screen app, which matters for the offline-first use case it's actually designed for. **Fix:** add a real favicon and a basic `manifest.json` to both apps.

### 3.7 Tier Badge Doesn't Distinguish Tier A
`ReviewQueuePage.jsx:37-40`'s `TierBadge` component only branches on `'C'` vs. anything-else, so a Tier A case (if one ever reaches this view) would render with the same styling as Tier B. Low real-world impact since Tier A shouldn't reach the review queue at all, but the component itself should handle all three tiers explicitly rather than silently collapsing two of them. Same pattern appears in `CaseDetailPage.jsx:98-99`. **Fix:** add the third branch in both places.

### 3.8 Hardcoded Reviewer Name in the Submission Success Message
The post-submit confirmation currently reads "Audit log recorded by Dr. Krrish Gadekar" regardless of who actually reviewed the case — the same kind of demo-data hygiene issue as the duplicate-name problem in §1.4, just in a different spot. **Fix:** once real reviewer identity exists (Saad's auth work), this should reflect the actual logged-in reviewer; until then, at minimum stop hardcoding a real teammate's name into a "signed" audit message — use a generic placeholder instead.

### 3.9 Confirm Whether the Review Queue's Search Bar Is Actually Missing or Just Hard to Notice
Teammate feedback flagged "no search bar" on the Ophthalmologist interface, but a code-level check found `ReviewQueuePage.jsx` already has real, working tier/disagreement filters, a PHC dropdown, a grade filter, and free-text search across patient name/reference/PHC — genuinely applied, not just declared. Before building anything here, look at the actual rendered screen and figure out which is true: the controls are visually easy to miss (a UI/prominence problem worth your attention) or something is preventing them from rendering (a bug worth flagging back to the frontend team). Don't assume the feature needs building from scratch — it very likely doesn't.

### 3.10 `FieldOpsPage.jsx` Is Orphaned
A real, 171-line component exists (`central-system/frontend/src/components/screens/FieldOpsPage.jsx`) but isn't imported or routed anywhere in `App.jsx`. **Decision needed, not just a fix:** either wire it into the admin routes (if it's finished and useful) or delete it — an orphaned file reads as unfinished work to anyone reviewing the repo. Check with the team which way to go before spending time on it.

---

## Part 4 — Stretch, Only If Time Allows After Everything Above

- **PHC drill-down depth:** clicking into a PHC Health row currently shows nothing further. Adding a per-technician/per-camera-unit breakdown (rejection rate, volume, last calibration) is a natural next layer on an already-built concept.
- **Drift trend sparkline:** the Dashboard's "Override Rate: 8.3% (Target <10%)" is a single number; a small sparkline showing the last several weeks would give the model-drift-monitoring story something to visually point at.
- **"Similar past cases" panel:** on Case Detail, showing 2–3 prior graded cases with a similar lesion pattern when branches disagree or confidence is borderline — a genuine "second-opinion" feature, not yet built.
- **Consistent sync-status chip across every role's nav bar:** the technician's Capture screen already shows one ("PHC Kharadi · ONLINE · 2 PENDING") — the Admin and Ophthalmologist nav bars don't show an equivalent, even though offline-first is a headline feature of the whole system.

---

## One Thing to Verify, Not Necessarily Fix

**Reason-code capture on Override:** confirm whether the override reason is actually shown anywhere after a decision is submitted (Case History, review history, anywhere). This was flagged as possibly missing but unconfirmed in a code scan — check before assuming it needs building; the backend already persists this data (`ophthalmologist_reviews.override_reason_category`/`override_reason_text`), so if it's missing, it's very likely just a rendering gap on your side, not a missing backend feature.
