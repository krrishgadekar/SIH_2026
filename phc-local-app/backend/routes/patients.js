'use strict';

/**
 * routes/patients.js  (Task 3.2)
 *
 * Mounted at /patients. Implements the "Local API" patient endpoints from
 * docs/api-contracts.md:
 *
 *   POST /patients            -> 201 { patientId, name, age, contactNumber, registeredAt }
 *   GET  /patients/:patientId -> 200 same shape | 404 patient_not_found
 *
 * The DB stores snake_case; every response here is camelCase. That translation
 * happens in this file and nowhere else -- not in db/localDb.js, not in a
 * frontend component (api-contracts.md, "Global naming rule").
 */

const express = require('express');

const db                  = require('../db/localDb');
const { generateLocalId } = require('../services/ids');

const router = express.Router();

/**
 * toPatientResponse(row)
 *
 * The single snake_case -> camelCase mapping for a patient. Every route that
 * returns a patient goes through this, so POST and GET cannot drift into
 * returning subtly different shapes for the same record.
 */
function toPatientResponse(row) {
  return {
    patientId:     row.patient_id,
    name:          row.name,
    age:           row.age,
    contactNumber: row.contact_number,
    registeredAt:  row.registered_at,
  };
}

// ── POST /patients ───────────────────────────────────────────────────────────
router.post('/', (req, res) => {
  const { name, age, contactNumber } = req.body || {};

  // contactNumber is the contract's only explicitly required field, and it is
  // required for a real reason: it is the sole channel for delivering a result
  // to a patient who has already gone home (design doc §4.1). A patient
  // registered without one cannot be told their outcome in the offline flow.
  if (!contactNumber) {
    return res.status(400).json({
      error: 'contact_number_required',
      message: 'contactNumber is required — it is the only channel for delayed results.',
    });
  }
  if (!name) {
    return res.status(400).json({
      error: 'name_required',
      message: 'name is required.',
    });
  }

  const parsedAge = Number(age);
  if (!Number.isInteger(parsedAge) || parsedAge < 0 || parsedAge > 130) {
    return res.status(400).json({
      error: 'invalid_age',
      message: 'age must be an integer between 0 and 130.',
    });
  }

  const row = {
    patient_id:     generateLocalId(),
    name:           String(name),
    age:            parsedAge,
    contact_number: String(contactNumber),
    registered_at:  new Date().toISOString(),
  };

  db.prepare(`
    INSERT INTO patients (patient_id, name, age, contact_number, registered_at)
    VALUES (@patient_id, @name, @age, @contact_number, @registered_at)
  `).run(row);

  res.status(201).json(toPatientResponse(row));
});

// ── GET /patients/:patientId ─────────────────────────────────────────────────
router.get('/:patientId', (req, res) => {
  const row = db
    .prepare('SELECT * FROM patients WHERE patient_id = ?')
    .get(req.params.patientId);

  if (!row) {
    return res.status(404).json({
      error: 'patient_not_found',
      message: `No patient with id ${req.params.patientId}`,
    });
  }

  res.json(toPatientResponse(row));
});

// ── GET /patients ────────────────────────────────────────────────────────────
// Not in api-contracts.md. Kept because Task 0.1's Definition of Done curls it,
// and the Patient Lookup screen needs a list to search. Deliberately capped:
// this is a local single-PHC database, but an unbounded SELECT that grows all
// season is a slow surprise waiting to happen on modest PHC hardware.
router.get('/', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM patients ORDER BY registered_at DESC LIMIT 200')
    .all();
  res.json(rows.map(toPatientResponse));
});

module.exports = router;
