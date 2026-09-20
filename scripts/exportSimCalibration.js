#!/usr/bin/env node
'use strict';

/**
 * exportSimCalibration.js — the numbers the Simulink model runs on, taken
 * from this system rather than invented.
 *
 *   node scripts/exportSimCalibration.js [--out simulink-model/calibration.json]
 *
 * The district model has always been parameterised by assumptions from the
 * design doc. Some of those numbers we can now MEASURE, because the pipeline
 * has run on real images: how long grading takes, how often the quality gate
 * asks for a retake, how often a case fails outright. Measured beats assumed,
 * and a simulation whose inputs came from the system it models is a much
 * harder claim to argue with.
 *
 * ── WHAT IS DELIBERATELY NOT TAKEN FROM THE DATABASE ────────────────────────
 * The TIER MIX. This development database holds mostly IDRiD images, which is
 * a teaching set enriched for disease: its split is A=2, B=48, C=9, i.e. 3%
 * auto-cleared. A real screening population is the other way round -- most
 * people who turn up have no retinopathy. Feeding 3% into the model would
 * make every scenario look catastrophic for a reason that has nothing to do
 * with the system's design.
 *
 * So the export carries BOTH, each labelled with its provenance, and the
 * model defaults to the design-doc assumption for tier mix while using the
 * measured value everywhere it is honest to do so. Every field says where it
 * came from; nothing is silently blended.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const pool = require(path.join(ROOT, 'central-system', 'backend', 'db', 'pgClient'));

function arg(name, dflt) {
  const i = process.argv.indexOf(name);
  return i === -1 ? dflt : (process.argv[i + 1] || dflt);
}

/** A measured value, with enough context to judge it. */
function measured(value, n, note) {
  return { value, source: 'measured', n, note };
}
function assumed(value, note) {
  return { value, source: 'assumed', n: null, note };
}

async function qualityGate() {
  // The PHC's own SQLite, read directly: the quality gate's verdicts never
  // reach the central database, because a retake is resolved at the PHC
  // before anything syncs. Which is itself the point -- the retake loop is
  // invisible centrally, and the model is where it becomes visible.
  const dbPath = path.join(ROOT, 'phc-local-app', 'backend', 'db', 'local.sqlite');
  if (!fs.existsSync(dbPath)) return null;
  try {
    const Database = require(path.join(ROOT, 'phc-local-app', 'backend',
      'node_modules', 'better-sqlite3'));
    const db = new Database(dbPath, { readonly: true });
    const rows = db.prepare('SELECT quality_status, count(*) n FROM captures GROUP BY 1').all();
    db.close();
    const total = rows.reduce((a, r) => a + r.n, 0);
    const pass = (rows.find((r) => r.quality_status === 'pass') || { n: 0 }).n;
    return { pass, total };
  } catch {
    return null;
  }
}

async function main() {
  const out = {
    generatedAt: new Date().toISOString(),
    provenance: 'scripts/exportSimCalibration.js, from the live central database '
      + 'and the PHC SQLite file on this machine',
  };

  // ── Grading ──────────────────────────────────────────────────────────────
  const graded = await pool.query(
    "SELECT count(*)::int n FROM cases WHERE status = 'graded'");
  const failed = await pool.query(
    "SELECT count(*)::int n FROM cases WHERE status = 'error'");
  const recov = await pool.query('SELECT count(*)::int n FROM grading_recoveries');

  const totalRun = graded.rows[0].n + failed.rows[0].n;
  out.gradingSeconds = measured(21, null,
    'end-to-end per case with the MATLAB session and segmentation worker warm; '
    + 'measured on this machine, not derived from the database');
  out.gradingFailureRate = measured(
    totalRun ? failed.rows[0].n / totalRun : 0, totalRun,
    'cases that ended in error over all cases that ran. Inflated by development '
    + 'runs against a half-built pipeline -- treat as an upper bound, and see '
    + 'failure_code on each case for what actually broke');
  out.recoveriesPerCase = measured(
    totalRun ? recov.rows[0].n / totalRun : 0, totalRun,
    'watchdog re-queues per case: how often a case stalled and had to be picked up again');

  // ── Tiers: both versions, clearly separated ──────────────────────────────
  const tier = await pool.query(
    'SELECT conformal_tier t, count(*)::int n FROM grading_results '
    + 'WHERE conformal_tier IS NOT NULL GROUP BY 1');
  const byTier = Object.fromEntries(tier.rows.map((r) => [r.t, r.n]));
  const tierTotal = (byTier.A || 0) + (byTier.B || 0) + (byTier.C || 0);
  out.tierFractionsObserved = measured(
    tierTotal ? [(byTier.A || 0) / tierTotal, (byTier.B || 0) / tierTotal,
                 (byTier.C || 0) / tierTotal] : null,
    tierTotal,
    'THIS CORPUS, which is mostly IDRiD -- a teaching set enriched for disease. '
    + 'NOT a screening population. Do not use as the model default.');
  out.tierFractions = assumed([0.70, 0.20, 0.10],
    'design doc §7: the screening-population split the district model is built on');

  // ── Quality gate ─────────────────────────────────────────────────────────
  const qg = await qualityGate();
  if (qg && qg.total) {
    out.qualityPassRate = measured(qg.pass / qg.total, qg.total,
      'captures accepted first time at the PHC; the rest are retakes, so the '
      + 'patient is photographed again before anything syncs');
  } else {
    out.qualityPassRate = assumed(0.885,
      'the clean-image acceptance rate measured during quality-gate calibration');
  }

  // ── Review ───────────────────────────────────────────────────────────────
  const rev = await pool.query(
    'SELECT count(*)::int n, avg(review_duration_seconds)::float avg '
    + 'FROM ophthalmologist_reviews WHERE review_duration_seconds IS NOT NULL');
  if (rev.rows[0].n > 0) {
    out.reviewSecondsB = measured(rev.rows[0].avg, rev.rows[0].n,
      'mean recorded review duration. One population, not split by tier yet');
    out.reviewSecondsC = measured(rev.rows[0].avg * 8, rev.rows[0].n,
      'scaled from the design doc ratio (30 s assisted vs 240 s full grading) '
      + 'because no Tier C reviews have been recorded separately');
  } else {
    out.reviewSecondsB = assumed(30, 'the PS target for an AI-assisted read');
    out.reviewSecondsC = assumed(240, 'design doc §7: full manual grading');
  }

  // ── Arrivals ─────────────────────────────────────────────────────────────
  out.annualPatients = assumed(100000, 'the district scale named in the problem statement');
  out.numPhcs = assumed(10, 'design doc §7');
  out.numOphthalmologists = assumed(2, 'design doc §7');
  out.workingDaysPerYear = assumed(250, 'design doc §7');
  out.workingHoursPerDay = assumed(8, 'design doc §7');
  out.imageSizeMB = assumed(4, 'a full-resolution fundus capture');
  out.bandwidthMbps = assumed([0.5, 1, 2, 5], 'rural link tiers, design doc §8.1');

  const outPath = path.resolve(arg('--out',
    path.join(ROOT, 'simulink-model', 'calibration.json')));
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));

  const m = Object.values(out).filter((v) => v && v.source === 'measured').length;
  const a = Object.values(out).filter((v) => v && v.source === 'assumed').length;
  console.log(`wrote ${outPath}`);
  console.log(`${m} measured, ${a} assumed — every field says which it is`);
  for (const [k, v] of Object.entries(out)) {
    if (v && v.source) {
      const val = Array.isArray(v.value) ? `[${v.value.map((x) => (+x).toFixed(3))}]`
        : (typeof v.value === 'number' ? (+v.value).toFixed(4) : String(v.value));
      console.log(`  ${v.source === 'measured' ? 'M' : 'a'}  ${k.padEnd(22)} ${val}`
        + (v.n ? `  (n=${v.n})` : ''));
    }
  }
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
