'use strict';

/**
 * routes/patients.js
 *
 * Placeholder router (Task 0.1). Mounted at /patients by server.js.
 *
 * Endpoints this router owns, per docs/api-contracts.md ("Local API"):
 *
 *   POST /patients              -> 201 { patientId, name, age, contactNumber, registeredAt }
 *                                  400 { error: 'contact_number_required' } if contactNumber missing
 *   GET  /patients/:patientId   -> 200 same shape as the POST response
 *                                  404 { error: 'patient_not_found' }
 *
 * IMPLEMENTED BY: Task 3.2. The route below is a boot placeholder only -- it is
 * not one of the contract endpoints and Task 3.2 should replace it outright.
 */

const express = require('express');

const router = express.Router();

// Placeholder so Task 0.1's Definition of Done (`curl localhost:4000/patients`
// returns JSON) holds before Task 3.2 lands. There is no GET /patients
// collection endpoint in api-contracts.md, so nothing real is being shadowed.
router.get('/', (req, res) => res.json([]));

module.exports = router;
