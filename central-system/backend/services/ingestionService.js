'use strict';

/**
 * ingestionService.js  (Task 3.3)
 *
 * Receives a case from a PHC sync manager, stores it, and reads it back in the
 * exact shape api-contracts.md specifies.
 *
 *   ingestCase(fields)     -> { caseId, receivedAt }
 *   getCaseStatus(caseId)  -> { caseId, status } | null
 *   getCaseDetail(caseId)  -> full case detail | null
 *
 * THE NULL RULE, which is the whole point of getCaseDetail:
 *   Every ML-derived field must come back as an explicit null until its module
 *   ships — never undefined, never a missing key, and never a zero standing in
 *   for a real result. The frontend renders "not yet available" for null. A
 *   missing key reads as undefined and can render as blank; a 0 reads as a
 *   measured finding of zero lesions. On a clinical screen those are very
 *   different claims, and only one of them is true right now.
 */

const fs   = require('fs');
const path = require('path');

const pool       = require('../db/pgClient');
const mediaPaths = require('./mediaPaths');

const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.tif', '.tiff', '.bmp']);

/**
 * parseJsonField(value, fieldName)
 *
 * The questionnaire payloads arrive as JSON-encoded strings inside a multipart
 * body. They are parsed here and passed to pg as OBJECTS: node-postgres encodes
 * a JS object to JSONB itself, and handing it a pre-stringified value stores a
 * JSON *string* inside the JSONB column instead of a JSON object. That still
 * inserts cleanly and only shows up later, when a query on a nested key matches
 * nothing.
 */
function parseJsonField(value, fieldName) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (err) {
    const e = new Error(`${fieldName} is not valid JSON: ${err.message}`);
    e.code = 'invalid_json';
    throw e;
  }
}

// Reference alphabet: uppercase, with 0/O/1/I/5/S removed. These get read aloud
// and retyped between an ophthalmologist and a PHC, and that is exactly where
// the ambiguous glyphs cause a mismatch on the wrong patient's record.
const REF_ALPHABET = 'ABCDEFGHJKLMNPQRTUVWXYZ2346789';

function randomReference() {
  let s = '';
  for (let i = 0; i < 6; i++) {
    s += REF_ALPHABET[Math.floor(Math.random() * REF_ALPHABET.length)];
  }
  return `PT-${s}`;
}

/**
 * ensurePatientReference(client, patientId)
 *
 * Mints the display-safe reference shown to ophthalmologists in place of the
 * real patient ID (api-contracts.md — "never the raw patientId").
 *
 * WIDER THAN THE CONTRACT'S EXAMPLE, deliberately. api-contracts.md illustrates
 * the format as "PT-4821", but four digits is only 9,000 distinct values, and
 * this system is specified for a district screening 100,000+ patients a year —
 * the space would be exhausted in weeks, and by the birthday bound collisions
 * start at roughly a hundred patients. Six characters from a 30-symbol alphabet
 * gives ~7.3e8 instead. The prefix and shape are preserved; only the width
 * changes. api-contracts.md should record this.
 *
 * Random rather than sequential or hashed: a reference that can be counted or
 * reversed leaks the very thing it exists to hide.
 */
async function ensurePatientReference(client, patientId) {
  const { rows } = await client.query(
    'SELECT patient_reference FROM patients WHERE patient_id = $1', [patientId]);
  if (rows.length && rows[0].patient_reference) return rows[0].patient_reference;

  for (let attempt = 0; attempt < 20; attempt++) {
    const ref = randomReference();
    // SAVEPOINT per attempt. In Postgres ANY error aborts the whole
    // transaction, so a plain try/catch retry loop is broken inside one: the
    // first unique violation poisons the transaction and every subsequent
    // statement fails with "current transaction is aborted", including the
    // retry itself and the eventual COMMIT. Rolling back to a savepoint
    // confines the failed attempt.
    await client.query('SAVEPOINT ref_attempt');
    try {
      await client.query(
        'UPDATE patients SET patient_reference = $1 WHERE patient_id = $2', [ref, patientId]);
      await client.query('RELEASE SAVEPOINT ref_attempt');
      return ref;
    } catch (err) {
      await client.query('ROLLBACK TO SAVEPOINT ref_attempt');
      if (err.code !== '23505') throw err;   // 23505 = unique_violation
    }
  }
  throw new Error('ensurePatientReference: could not allocate a unique reference');
}

/**
 * ingestCase(fields)
 *
 * @param {object} fields
 *   patientId, phcId, captureIdRef, cameraDeviceId  — strings
 *   imageFile        — multer file object ({ buffer, originalname }) or a path
 *   questionnaireData, captureMetadata              — JSON strings or objects
 *   patientName, patientAge, patientContactNumber   — optional, see below
 * @returns {Promise<{caseId: string, receivedAt: string}>}
 */
async function ingestCase(fields) {
  const {
    patientId, phcId, captureIdRef, cameraDeviceId, imageFile,
    patientName, patientAge, patientContactNumber, capturedAt, pendingCount,
  } = fields;

  // Parsed to an object, like the questionnaires: pg encodes a JS object to
  // JSONB itself, and a pre-stringified value would be stored as a JSON STRING
  // inside the column, which only surfaces later when a query on a nested key
  // matches nothing.
  const qualityScores = parseJsonField(fields.qualityScores, 'qualityScores');

  if (!patientId) throw badRequest('patient_id_required', 'patientId is required.');
  if (!imageFile) throw badRequest('image_required', 'An image file is required.');

  const questionnaireData = parseJsonField(fields.questionnaireData, 'questionnaireData');
  const captureMetadata   = parseJsonField(fields.captureMetadata, 'captureMetadata');

  // Resolve the image bytes before opening a transaction — no point holding a
  // DB connection while reading a file that might not exist.
  let buffer, sourceName;
  if (typeof imageFile === 'string') {
    if (!fs.existsSync(imageFile)) {
      throw badRequest('image_not_found', `No image at ${imageFile}`);
    }
    buffer = fs.readFileSync(imageFile); sourceName = imageFile;
  } else if (imageFile.buffer) {
    buffer = imageFile.buffer; sourceName = imageFile.originalname || '.jpg';
  } else if (imageFile.path) {
    buffer = fs.readFileSync(imageFile.path);
    sourceName = imageFile.originalname || imageFile.path;
  } else {
    throw badRequest('image_required', 'imageFile must be a path or a multer file object.');
  }

  let ext = path.extname(sourceName).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) {
    if (ext) throw badRequest('invalid_image_type', `Unsupported image type '${ext}'.`);
    ext = '.jpg';
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── Patient ────────────────────────────────────────────────────────────
    // cases.patient_id is a foreign key, so the patient must exist centrally
    // first. api-contracts.md defines no central patient-creation endpoint and
    // POST /cases carries no demographics, so there is a genuine gap in how a
    // patient reaches the central DB — see the note in routes/cases.js.
    //
    // Demographics are accepted here when supplied (an additive extension the
    // sync manager can use) and required when the patient is unknown, because
    // patients.name/age/contact_number are NOT NULL — and contact_number is not
    // bookkeeping: Task 3.6 sends the referral SMS to it.
    const known = await client.query(
      'SELECT patient_id FROM patients WHERE patient_id = $1', [patientId]);

    if (known.rows.length === 0) {
      if (!patientName || patientAge === undefined || !patientContactNumber) {
        throw badRequest('patient_not_found',
          `Patient ${patientId} is not known centrally. Send patientName, ` +
          'patientAge and patientContactNumber with the case to register them.');
      }
      await client.query(`
        INSERT INTO patients (patient_id, name, age, contact_number, registered_at)
        VALUES ($1, $2, $3, $4, now())
        ON CONFLICT (patient_id) DO NOTHING
      `, [patientId, patientName, parseInt(patientAge, 10), patientContactNumber]);
    }

    await ensurePatientReference(client, patientId);

    // ── Case ───────────────────────────────────────────────────────────────
    // image_path is written AFTER the row exists, because the filename is keyed
    // on the generated case_id. Insert with a placeholder, then update.
    const inserted = await client.query(`
      INSERT INTO cases
        (patient_id, phc_id, capture_id_ref, camera_device_id, image_path,
         questionnaire_data, capture_metadata, status, captured_at, quality_scores)
      VALUES ($1, $2, $3, $4, '', $5, $6, 'processing', $7, $8)
      RETURNING case_id, received_at
    `, [patientId, phcId || null, captureIdRef || null, cameraDeviceId || null,
        questionnaireData, captureMetadata,
        // Falls back to now() only when the PHC did not send one. That fallback
        // is wrong for any case that synced late, so the sync manager (Task 3.4)
        // must always send the local captures.captured_at.
        capturedAt || new Date().toISOString(), qualityScores]);

    const caseId    = inserted.rows[0].case_id;
    const imagePath = mediaPaths.originalPath(caseId, ext);

    fs.writeFileSync(imagePath, buffer);

    await client.query('UPDATE cases SET image_path = $1 WHERE case_id = $2',
      [imagePath, caseId]);

    // Record the PHC's own view of its queue. pending_count cannot be computed
    // here -- the sync queue lives in that site's local SQLite and this server
    // has no visibility into it -- so the number is whatever the PHC last
    // reported, true only as of last_sync_at. Both columns are written together
    // for exactly that reason: read apart, pending_count is misleading, because
    // the site whose backlog is really growing is the offline one whose number
    // is frozen (api-contracts.md, GET /phc/:phcId/sync-status).
    if (phcId) {
      await client.query(`
        UPDATE phc_sites
        SET last_sync_at = now(),
            pending_count = COALESCE($2, pending_count)
        WHERE phc_id = $1
      `, [phcId, pendingCount === undefined || pendingCount === null || pendingCount === ''
                 ? null : parseInt(pendingCount, 10)]);
    }

    await client.query('COMMIT');

    return { caseId, receivedAt: inserted.rows[0].received_at.toISOString() };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** GET /api/v1/cases/:caseId/status */
async function getCaseStatus(caseId) {
  const { rows } = await pool.query(
    'SELECT case_id, status FROM cases WHERE case_id = $1', [caseId]);
  if (!rows.length) return null;
  return { caseId: rows[0].case_id, status: rows[0].status };
}

/**
 * getCaseDetail(caseId)
 *
 * LEFT JOINs across cases + grading_results + segmentation_outputs +
 * explainability_outputs. LEFT, not INNER: a case that has been received but
 * not yet graded has no grading_results row at all, and an INNER JOIN would
 * return "not found" for a case that demonstrably exists.
 */
async function getCaseDetail(caseId) {
  const { rows } = await pool.query(`
    SELECT
      c.case_id, c.image_path, c.questionnaire_data, c.capture_metadata,
      c.patient_id,
      p.patient_reference,
      g.dr_grade_cnn, g.dr_grade_rule_engine, g.branch_agreement,
      g.confidence_score, g.uncertainty_score, g.conformal_tier,
      s.lesion_counts, s.nv_suspicion_score,
      e.gradcam_path, e.lesion_attention_consistency_score, e.evidence_summary_text
    FROM cases c
    JOIN      patients               p ON p.patient_id = c.patient_id
    LEFT JOIN grading_results        g ON g.case_id    = c.case_id
    LEFT JOIN segmentation_outputs   s ON s.case_id    = c.case_id
    LEFT JOIN explainability_outputs e ON e.case_id    = c.case_id
    WHERE c.case_id = $1
  `, [caseId]);

  if (!rows.length) return null;
  const r = rows[0];

  // Earlier screenings for the same patient — the longitudinal view on the
  // ophthalmologist's Case History panel (design doc §5.2).
  const prior = await pool.query(`
    SELECT c.case_id, g.graded_at, g.dr_grade_cnn
    FROM cases c
    JOIN grading_results g ON g.case_id = c.case_id
    WHERE c.patient_id = $1 AND c.case_id <> $2 AND g.graded_at IS NOT NULL
    ORDER BY g.graded_at DESC
    LIMIT 10
  `, [r.patient_id, caseId]);

  // `?? null` throughout: a LEFT JOIN with no match yields undefined for those
  // columns, and JSON.stringify DROPS an undefined value entirely rather than
  // emitting null. The contract requires the key to be present and null.
  return {
    caseId:            r.case_id,
    patientReference:  r.patient_reference ?? null,
    imageUrl:          mediaPaths.toPublicUrl(r.image_path),
    gradCamOverlayUrl: mediaPaths.toPublicUrl(r.gradcam_path),

    // Phase 4 — segmentation
    lesionCounts:      r.lesion_counts ?? null,
    nvSuspicionScore:  r.nv_suspicion_score ?? null,

    // Phase 7 — explainability safeguards
    evidenceSummaryText: r.evidence_summary_text ?? null,

    // Phase 2 — Branch A (populated now)
    drGradeCnn:        r.dr_grade_cnn ?? null,
    confidenceScore:   r.confidence_score ?? null,
    conformalTier:     r.conformal_tier ?? null,

    // Phase 5 — Branch B and agreement
    drGradeRuleEngine: r.dr_grade_rule_engine ?? null,
    branchAgreement:   r.branch_agreement ?? null,

    // Phase 6 — MC-Dropout
    uncertaintyScore:  r.uncertainty_score ?? null,

    // Phase 7
    lesionAttentionConsistencyScore: r.lesion_attention_consistency_score ?? null,

    questionnaireData: r.questionnaire_data ?? null,
    captureMetadata:   r.capture_metadata ?? null,

    priorAssessments: prior.rows.map((x) => ({
      caseId:     x.case_id,
      gradedAt:   x.graded_at.toISOString(),
      drGradeCnn: x.dr_grade_cnn ?? null,
    })),
  };
}

function badRequest(code, message) {
  const e = new Error(message);
  e.code = code;
  e.status = 400;
  return e;
}

module.exports = { ingestCase, getCaseStatus, getCaseDetail };
