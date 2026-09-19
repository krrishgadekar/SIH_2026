# District Screening Simulation — Task 3.8

Discrete-event model of the telemedicine screening pipeline, for **PS
requirement 5**: model image acquisition rates, bandwidth constraints,
processing throughput and review capacity, to optimise resource allocation for
a district program serving **100,000+ patients annually**.

---

## ⚠️ Status

| File | What it is | Runs today |
|---|---|---|
| `referenceQueueingModel.m` | Pure-MATLAB discrete-event simulation | ✅ yes |
| `buildDistrictScreeningModel.m` | Builds the SimEvents `.slx` programmatically | ✅ yes |
| `districtScreeningSimEvents.slx` | The Simulink deliverable | ✅ built 2026-09-08 |
| `runDistrictScreeningModel.m` | Runs the `.slx` and checks it against the reference model | ✅ yes |

**Built and validated.** Simulink and SimEvents are installed, and the SimEvents
model was built by `buildDistrictScreeningModel.m` on 2026-09-08 (commit
`66638bb`, "Task 3.8: build and validate the SimEvents district model"). On the
review stage it agrees with the independent reference model (auto-clear 71.0% vs
68.4%, reviewer utilisation 20.0% vs 22.2%). This table used to say the `.slx`
was not built; that was stale documentation, not a capability gap.

**How it reaches the product (backend plan §G):** the central backend runs
`referenceQueueingModel('recommend', params)` on a daily schedule, with the tier
mix, PHC count and reviewer count observed in its own database, and stores the
result in the `resource_recommendations` table. `GET
/api/v1/admin/resource-recommendations` serves the latest row to the admin
dashboard. The reference model is what runs on the schedule: it takes seconds,
has no Simulink dependency at request time, and is the oracle the `.slx` was
validated against. The `.slx` remains the PS-requirement-5 deliverable and the
validation check, run with `runDistrictScreeningModel`.

> [!IMPORTANT]
> **`referenceQueueingModel.m` is NOT the Simulink deliverable and must never be
> presented as one.** The PS asks for a Simulink model specifically. The
> reference model exists for two reasons: to produce the district-scale numbers
> now rather than blocking on an install, and to act as a **validation oracle** —
> once the SimEvents model is built, it should reproduce these numbers on the
> same inputs. If the two disagree materially, one of them is wrong, and that is
> worth knowing before the demo rather than during it.

---

## The system being modelled

Three stages, per design doc §7 and the end-to-end flow in §8.1:

```
patient arrivals ──▶ [ upload queue ]  ──▶ tier triage ──▶ [ reviewer pool ] ──▶ done
   (per PHC)          bandwidth-bound       A: auto-clear     B: ~30 s
                      one upload at a       B/C: queued       C: ~4 min, PREEMPTS B
                      time per site
```

**Stage 1 — network transmission.** Each PHC uploads serially; service time is
image size ÷ that site's bandwidth. This is where poor rural connectivity shows
up, and it is the constraint the PS is really asking about.

**Stage 2 — tier triage.** Tier A auto-clears and leaves the system without
consuming reviewer time (design doc §6.8) — this is the whole point of the tier
system, and modelling it is what shows the reviewer-capacity saving. Tiers B
and C go to the queue.

**Stage 3 — ophthalmologist review.** A limited pool of reviewers.
**Tier C preempts Tier B** on the same pool, per design doc §7 — a preempted
Tier B resumes later with its remaining work, it is not restarted.

---

## Parameters

Defaults target the PS's stated scale. All are modelled assumptions, **not
measured field data** — say so in the demo (design doc §16).

| Parameter | Default | Note |
|---|---|---|
| `annualPatients` | 100,000 | the PS's district figure |
| `numPhcs` | 10 | arrivals split evenly |
| `workingDaysPerYear` | 250 | |
| `workingHoursPerDay` | 8 | |
| `imageSizeMB` | 4 | typical fundus JPEG |
| `bandwidthMbps` | `[0.5 1 2 5]` | sampled per PHC — rural tiers |
| `numOphthalmologists` | 2 | the resource being optimised |
| `tierFractions` | `[0.70 0.20 0.10]` | A / B / C |
| `reviewSecondsB` | 30 | the PS's <30 s target for AI-assisted review |
| `reviewSecondsC` | 240 | full manual grading |

`tierFractions` is the number to revisit once real grading output exists —
Tier A share drives almost everything, because those cases never reach a
reviewer. Today it is an assumption.

> The untrained stub currently sends **100% of cases to Tier A** (it is confident
> on everything), so do not read tier fractions off the live system until the
> real model lands. See `docs/model-handoff-guide.md` §7.

---

## Running it

```
matlab -batch "cd('simulink-model'); referenceQueueingModel"
```

Runs the default scenario set and prints a comparison table plus a
plain-language recommendation. To explore one configuration:

```matlab
p = referenceQueueingModel('defaults');
p.numOphthalmologists = 4;
r = referenceQueueingModel('run', p);
```

Once Simulink is installed:

```
matlab -batch "cd('simulink-model'); buildDistrictScreeningModel"
```

---

## Why the `.slx` is built by a script

`buildDistrictScreeningModel.m` constructs the model with
`new_system` / `add_block` / `add_line` rather than the model being drawn by
hand and committed as a binary.

A `.slx` cannot be diffed, cannot be code-reviewed, and produces merge conflicts
that are unresolvable — on a six-person team sharing one repo that is a real
cost. The script is the reviewable source of truth; the `.slx` is a build
artifact. Rebuild it rather than hand-editing it, or the two drift and the
script silently stops being true.

---

## Outputs

Both models emit the same summary, written to `simulation-results.csv` for
`analyticsAggregator.js` to surface on the admin Resource Recommendations
screen (design doc §5.3):

- mean and 95th-percentile wait before review
- upload and review queue length over time
- reviewer utilisation, and utilisation of the upload stage
- **bottleneck location** — which stage is saturated
- a plain-language recommendation

## Current result (reference model, ~9 s to run)

Minimum ophthalmologists to hold the p95 review wait under 60 minutes, for
100,000 patients/year:

| Tier A auto-clear | routine (250 days) | camp mode (50 days) |
|---|---|---|
| 70% | 1 | 3 |
| 50% | 2 | 4 |
| 30% | 2 | 6 |
| 0% (no tier system) | 2 | **8** |

**Read this honestly.** At 100k/year over 250 working days a district sees only
~400 patients/day across all PHCs, and 2 ophthalmologists cover it regardless of
the tier rate. The tier system's value does **not** show up as headcount in the
routine regime, and claiming it does would not survive one question.

It shows up under **burst load**. In camp mode (§9.5 — the same annual
population arriving in a fifth of the time) Tier A auto-clear takes staffing
from 8 reviewers down to 3. So the defensible claim is *"the tier system is what
makes camp-mode screening staffable"*, not *"it saves N ophthalmologists a
year"*.

The bottleneck is **always ophthalmologist review, never bandwidth**, at these
parameters — upload peaks at 23% utilisation even in camp mode. If the demo
narrative is "rural connectivity is the constraint", this model does not support
it; the constraint is reviewer capacity.

Tier A share is the single most influential parameter and is currently an
assumption. Revisit every number here once the real model produces real tiers.

## Definition of Done

The model runs across at least two contrasting scenarios and the recommendation
**changes accordingly**. A model that emits the same advice regardless of its
inputs is not a model, and a judge will find that in one question.
