'use strict';

/**
 * lesionCounts.js — the contract shape of `lesionCounts`, in one place.
 *
 * What segmentation stores (segmentation_outputs.lesion_counts) and what the
 * API promises are two different things, and they always were:
 *
 *   stored:   { red: [4], bright: [4], redTotal, brightTotal, minAreaPx, procedure }
 *   contract: { microaneurysms, hemorrhages, hardExudates, softExudates }
 *
 * The stored shape is what the detectors actually produce — red lesions are
 * one class today, not two — and it keeps the per-quadrant detail the rule
 * engine and the evidence text are built on. The contract shape is clinical
 * vocabulary. This maps one to the other at the API boundary; nothing is
 * rewritten in the database, so no migration and no loss of the quadrant
 * breakdown.
 *
 * ── WHY THREE OF THE FOUR ARE NULL TODAY ──────────────────────────────────
 * null means NOT MEASURED. It is not 0, and the frontend renders it as "N/A"
 * rather than as a finding. The distinction is the whole point of this module:
 * "no microaneurysms were found" and "nothing looked for microaneurysms" are
 * different clinical claims, and only one of them is true here.
 *
 *   microaneurysms / hemorrhages  M5 detects RED LESIONS as a single class, so
 *                                 the split does not exist yet. Tanuj's 3-class
 *                                 retrain adds maPerQuadrant / hePerQuadrant,
 *                                 and these become real numbers then (the
 *                                 mapping below is already written for it).
 *   hardExudates                  Real today: the bright-lesion count, under
 *                                 the name it should always have had (§R).
 *   softExudates                  PERMANENTLY null. Nothing in the pipeline
 *                                 detects cotton-wool spots. This is a
 *                                 disclosed exclusion, not a measurement, and
 *                                 it must never become 0.
 *
 * Splitting a red-lesion total across the two keys by any ratio would be
 * inventing a measurement, so the total stays reported in `redTotal` under
 * `detail` and the two clinical keys stay null until the detector exists.
 */

/** Sum of a 4-element quadrant array, or null if it is not one. */
function totalOf(arr) {
  if (!Array.isArray(arr) || arr.length !== 4) return null;
  if (!arr.every((v) => Number.isFinite(v))) return null;
  return arr.reduce((a, b) => a + b, 0);
}

/** A stored total if it is a real number, else the sum of the quadrants. */
function pickTotal(stored, quadrants) {
  return Number.isFinite(stored) ? stored : totalOf(quadrants);
}

/**
 * toContractShape(storedLesionCounts) -> the API's lesionCounts, or null.
 *
 * null in, null out: a case whose segmentation has not run reports
 * `lesionCounts: null`, not an object of four nulls. "Segmentation did not
 * run" and "segmentation ran and found nothing measurable" are, again, two
 * different statements.
 */
function toContractShape(stored) {
  if (!stored || typeof stored !== 'object') return null;

  const ma = pickTotal(stored.maTotal, stored.ma);
  const he = pickTotal(stored.heTotal, stored.he);
  const bright = pickTotal(stored.brightTotal, stored.bright);
  const red = pickTotal(stored.redTotal, stored.red);

  return {
    microaneurysms: ma,
    hemorrhages: he,
    // §R: `bright` is the stored name, `hardExudates` the clinical one. When
    // Tanuj's rename lands the stored key changes and this reads the new one;
    // the API shape does not move again.
    hardExudates: Number.isFinite(stored.hardExudateTotal)
      ? stored.hardExudateTotal : bright,
    softExudates: null,

    // The measurement the two null keys above are hiding, plus the per-quadrant
    // breakdown, kept so nothing that exists is thrown away at the boundary. A
    // reader who needs "how many red lesions were found" can still get it,
    // without the API implying a split it cannot make.
    detail: {
      redTotal: red,
      redPerQuadrant: Array.isArray(stored.red) ? stored.red : null,
      brightPerQuadrant: Array.isArray(stored.bright) ? stored.bright : null,
      minAreaPx: Number.isFinite(stored.minAreaPx) ? stored.minAreaPx : null,
      procedure: typeof stored.procedure === 'string' ? stored.procedure : null,
    },
  };
}

module.exports = { toContractShape };
