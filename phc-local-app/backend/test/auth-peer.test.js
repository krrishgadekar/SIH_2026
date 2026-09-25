'use strict';

/**
 * PHC local backend: technician auth, the sealed desktop<->phone channel,
 * merge rules, export bundles, TLS.
 *
 *   npm test          (from phc-local-app/backend)
 *
 * Runs on a throwaway database and storage directory (LOCAL_DB_PATH /
 * LOCAL_STORAGE_DIR) on a random port -- never the live local.sqlite.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const tls = require('tls');
const { execFileSync } = require('child_process');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'phc-local-test-'));
process.env.LOCAL_DB_PATH = path.join(TMP, 'local.sqlite');
process.env.LOCAL_STORAGE_DIR = path.join(TMP, 'storage');
process.env.LOCAL_AUTH_ENABLED = 'true';
process.env.SYNC_DISABLED = '1';
process.env.PEER_TAKEOVER_MS = String(60 * 60 * 1000);

const app = require('../server');
const db = require('../db/localDb');
const { hashPassword } = require('../services/passwords');
const peerCrypto = require('../services/peerCrypto');
const peerSync = require('../services/peerSync');
const { generateLocalId } = require('../services/ids');

const DEMO = path.resolve(__dirname, '../../../demo_images/1_quality_pass.jpg');
let server, base;

before(async () => {
  const now = new Date().toISOString();
  const add = (u, role) => db.prepare(`INSERT INTO technicians (user_id, username, name, role, password_hash, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?)`).run(`tech-${u}`, u, `Test ${u}`, role, hashPassword('correct-horse'), now, now);
  add('tech1', 'technician');
  add('admin1', 'phc_admin');
  server = app.createServer().server;
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server?.close(); });

const post = (p, body, headers = {}) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const login = async (username = 'tech1', password = 'correct-horse') => (await (await post('/auth/login', { username, password })).json()).token;
const bearer = (t) => ({ authorization: `Bearer ${t}` });

// ── Technician auth ─────────────────────────────────────────────────────────

test('patient data needs a session when LOCAL_AUTH_ENABLED=true', async () => {
  const r = await fetch(`${base}/patients`);
  assert.equal(r.status, 401);
  assert.equal((await r.json()).error, 'unauthenticated');
});

test('login: wrong password and unknown user get the SAME answer (no account enumeration)', async () => {
  const a = await post('/auth/login', { username: 'tech1', password: 'nope-nope' });
  const b = await post('/auth/login', { username: 'ghost', password: 'nope-nope' });
  assert.equal(a.status, 401);
  assert.equal(b.status, 401);
  assert.deepEqual(await a.json(), await b.json());
});

test('login works, the token reads patient data, /auth/me names the technician, logout ends it', async () => {
  const token = await login();
  assert.ok(token && token.length >= 40);
  assert.equal((await fetch(`${base}/patients`, { headers: bearer(token) })).status, 200);
  const me = await (await fetch(`${base}/auth/me`, { headers: bearer(token) })).json();
  assert.equal(me.user.username, 'tech1');
  assert.equal((await post('/auth/logout', {}, bearer(token))).status, 204);
  assert.equal((await fetch(`${base}/patients`, { headers: bearer(token) })).status, 401);
});

test('passwords and tokens are never stored in clear', async () => {
  const token = await login();
  const t = db.prepare("SELECT password_hash FROM technicians WHERE username = 'tech1'").get();
  assert.match(t.password_hash, /^scrypt\$32768\$8\$1\$/);
  assert.ok(!t.password_hash.includes('correct-horse'));
  const rows = db.prepare('SELECT token_hash FROM sessions').all().map((r) => r.token_hash);
  assert.ok(!rows.includes(token));
  assert.ok(rows.includes(crypto.createHash('sha256').update(token).digest('hex')));
});

test('an expired session and a deactivated technician are both refused', async () => {
  const t1 = await login();
  db.prepare("UPDATE sessions SET expires_at = '2000-01-01T00:00:00.000Z'").run();
  assert.equal((await fetch(`${base}/patients`, { headers: bearer(t1) })).status, 401);
  const t2 = await login();
  db.prepare("UPDATE technicians SET is_active = 0 WHERE username = 'tech1'").run();
  assert.equal((await fetch(`${base}/patients`, { headers: bearer(t2) })).status, 401);
  assert.equal((await post('/auth/login', { username: 'tech1', password: 'correct-horse' })).status, 401);
  db.prepare("UPDATE technicians SET is_active = 1 WHERE username = 'tech1'").run();
});

test('repeated failed logins lock the account out for 15 minutes', async () => {
  for (let i = 0; i < 10; i++) await post('/auth/login', { username: 'admin1', password: 'wrong-wrong' });
  const r = await post('/auth/login', { username: 'admin1', password: 'correct-horse' });
  assert.equal(r.status, 429);
});

test('reads of patient data are written to access_log with who read them', async () => {
  const token = await login();
  const before = db.prepare('SELECT COUNT(*) AS n FROM access_log').get().n;
  await fetch(`${base}/patients`, { headers: bearer(token) });
  const last = db.prepare('SELECT * FROM access_log ORDER BY id DESC LIMIT 1').get();
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM access_log').get().n, before + 1);
  assert.equal(last.action, 'read');
  assert.equal(last.entity_type, 'patients');
  assert.equal(last.user_id, 'tech-tech1');
});

// ── Pairing + sealed channel ────────────────────────────────────────────────

let pairing;
/** A phone-side client, written against the protocol doc (the Expo client is tested against this server too). */
async function sealedCall(p, body, { key = pairing.key, deviceId = pairing.deviceId, ts = Date.now(), nonce = crypto.randomBytes(16).toString('hex'), tamper } = {}) {
  const k = peerCrypto.keyFromB64(key);
  const env = peerCrypto.seal(k, body, peerCrypto.requestAad({ deviceId, method: 'POST', path: p, ts: String(ts), nonce }));
  if (tamper) env.ct = Buffer.from(Buffer.from(env.ct, 'base64').map((b, i) => (i === 0 ? b ^ 1 : b))).toString('base64');
  const r = await fetch(base + p, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-netra-device': deviceId, 'x-netra-ts': String(ts), 'x-netra-nonce': nonce },
    body: JSON.stringify(env),
  });
  const raw = await r.json();
  if (raw && raw.v === 1 && raw.ct) {
    return { status: r.status, body: peerCrypto.openJson(k, raw, peerCrypto.responseAad({ deviceId, path: p, nonce })), sealed: true };
  }
  return { status: r.status, body: raw, sealed: false };
}

test('pairing from a LAN address: refused anonymously and to a plain technician, allowed to a PHC admin', async () => {
  const { pairingAllowed } = require('../routes/peer');
  const call = (token) => new Promise((resolve) => {
    const req = { socket: { remoteAddress: '192.168.1.50' }, get: (h) => (h.toLowerCase() === 'authorization' && token ? `Bearer ${token}` : undefined) };
    const res = { status(c) { this.code = c; return this; }, json() { resolve(this.code); } };
    pairingAllowed(req, res, () => resolve('allowed'));
  });
  assert.equal(await call(null), 403);
  assert.equal(await call(await login('tech1')), 403);
  db.prepare("UPDATE technicians SET username = 'admin2' WHERE username = 'admin1'").run(); // admin1 is locked out by the lockout test
  assert.equal(await call(await login('admin2')), 'allowed');
});

test('pairing from the PC itself (localhost) returns a 256-bit key', async () => {
  const token = await login();
  const r = await post('/peer/pair', { name: 'x' }, bearer(token));
  assert.equal(r.status, 201);
  const { pairing: p } = await r.json();
  assert.equal(Buffer.from(p.key, 'base64').length, 32);
  pairing = p;
});

test('hello: a sealed round trip decrypts, and the response is sealed too', async () => {
  const r = await sealedCall('/peer/hello', {});
  assert.equal(r.status, 200);
  assert.ok(r.sealed);
  assert.equal(r.body.pcDeviceId, db.deviceId());
  assert.ok(Math.abs(r.body.serverTime - Date.now()) < 5000);
});

test('the channel rejects: wrong key, tampered ciphertext, replayed nonce, stale clock, unknown device', async () => {
  const wrongKey = await sealedCall('/peer/hello', {}, { key: peerCrypto.newKeyB64() });
  assert.equal(wrongKey.status, 401); assert.equal(wrongKey.body.error, 'envelope_invalid');

  const tampered = await sealedCall('/peer/hello', {}, { tamper: true });
  assert.equal(tampered.status, 401); assert.equal(tampered.body.error, 'envelope_invalid');

  const nonce = crypto.randomBytes(16).toString('hex');
  const token = (await sealedCall('/peer/login', { username: 'tech1', password: 'correct-horse' })).body.token;
  assert.equal((await sealedCall('/peer/pull', { cursor: 0, token }, { nonce })).status, 200);
  const replay = await sealedCall('/peer/pull', { cursor: 0, token }, { nonce });
  assert.equal(replay.status, 401); assert.equal(replay.body.error, 'peer_replay');

  const stale = await sealedCall('/peer/pull', { cursor: 0, token }, { ts: Date.now() - 60 * 60 * 1000 });
  assert.equal(stale.status, 401); assert.equal(stale.body.error, 'peer_clock_skew');

  const ghost = await sealedCall('/peer/hello', {}, { deviceId: 'ph-000000000000' });
  assert.equal(ghost.status, 401); assert.equal(ghost.body.error, 'peer_unknown');
});

test('a body sealed for one endpoint cannot be replayed against another (AAD binds the path)', async () => {
  const k = peerCrypto.keyFromB64(pairing.key);
  const ts = String(Date.now()); const nonce = crypto.randomBytes(16).toString('hex');
  const env = peerCrypto.seal(k, { cursor: 0 }, peerCrypto.requestAad({ deviceId: pairing.deviceId, method: 'POST', path: '/peer/hello', ts, nonce }));
  const r = await fetch(`${base}/peer/pull`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-netra-device': pairing.deviceId, 'x-netra-ts': ts, 'x-netra-nonce': nonce }, body: JSON.stringify(env) });
  assert.equal(r.status, 401);
});

test('peer login happens inside the sealed channel; data routes need its token', async () => {
  const bad = await sealedCall('/peer/login', { username: 'tech1', password: 'wrong-wrong' });
  assert.equal(bad.status, 401);
  const noToken = await sealedCall('/peer/pull', { cursor: 0 });
  assert.equal(noToken.status, 401); assert.equal(noToken.body.error, 'unauthenticated');
});

// ── Replication + merge rules ───────────────────────────────────────────────

async function phoneToken() { return (await sealedCall('/peer/login', { username: 'tech1', password: 'correct-horse' })).body.token; }

test('pull: a patient registered on the desktop reaches the phone', async () => {
  const token = await login();
  const created = await (await post('/patients', { name: 'Desk Patient', age: 61, contactNumber: '+919111111111', consentGivenAt: new Date().toISOString() }, bearer(token))).json();
  const pt = await phoneToken();
  const r = await sealedCall('/peer/pull', { cursor: 0, token: pt });
  const rec = r.body.records.find((x) => x.kind === 'patient' && x.data.patientId === created.patientId);
  assert.ok(rec, 'desktop patient in the feed');
  assert.equal(rec.data.name, 'Desk Patient');
  assert.equal(rec.data.originDevice, db.deviceId());
});

let phoneCapture;
test('push: a capture made on the phone (image first, then records) lands on the PC intact', async () => {
  const pt = await phoneToken();
  const patientId = generateLocalId('PHC001');
  const captureId = generateLocalId('PHC001');
  const now = new Date().toISOString();
  const img = fs.readFileSync(DEMO);
  const sha = crypto.createHash('sha256').update(img).digest('hex');

  const early = await sealedCall('/peer/push', { token: pt, records: [
    { kind: 'patient', data: { patientId, name: 'Phone Patient', age: 50, contactNumber: '+919222222222', consentGivenAt: now, registeredAt: now, updatedAt: now, originDevice: pairing.deviceId } },
    { kind: 'capture', data: { captureId, patientId, eye: 'left', cameraDeviceId: 'mobile_lens', source: 'lens', qualityStatus: 'pass', qualityReason: null, qualityScores: { focusScore: 0.8 }, retakeCount: 0, bestEffort: false, capturedAt: now, imageBytes: img.length, imageSha256: sha, originDevice: pairing.deviceId } },
  ] });
  assert.equal(early.status, 400);
  assert.equal(early.body.error, 'image_missing');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM patients WHERE patient_id = ?').get(patientId).n, 0, 'whole batch rolled back');

  const badSum = await sealedCall('/peer/image/put', { token: pt, captureId, bytesB64: img.toString('base64'), sha256: '0'.repeat(64), ext: '.jpg' });
  assert.equal(badSum.status, 400); assert.equal(badSum.body.error, 'checksum_mismatch');
  assert.equal((await sealedCall('/peer/image/put', { token: pt, captureId, bytesB64: img.toString('base64'), sha256: sha, ext: '.jpg' })).status, 200);

  const push = await sealedCall('/peer/push', { token: pt, records: [
    { kind: 'syncState', data: { captureId, state: 'pending', centralCaseId: null, centralStatus: null, priority: 0, ownerDevice: pairing.deviceId, updatedAt: now } },
    { kind: 'metadata', data: { responseId: generateLocalId('PHC001'), captureId, cameraDeviceReported: 'mobile_lens', pupilStatus: 'dilated', lightingEnvironment: 'low_light', observedIssues: ['none_noticed'], workerUsabilityRating: 'clear', eyeLaterality: 'left', recordedAt: now } },
    { kind: 'questionnaire', data: { responseId: generateLocalId('PHC001'), captureId, riskFactorFields: { yearsSinceDiagnosis: '1to5', glycemicControl: 'poor', bloodPressure: 'high', pregnant: null }, symptomFields: { blurredVision: true, floaters: false, suddenVisionChange: false, eyePain: false }, language: 'hi', recordedAt: now } },
    { kind: 'capture', data: { captureId, patientId, eye: 'left', cameraDeviceId: 'mobile_lens', source: 'lens', qualityStatus: 'pass', qualityReason: null, qualityScores: { focusScore: 0.8 }, retakeCount: 0, bestEffort: false, capturedAt: now, imageBytes: img.length, imageSha256: sha, originDevice: pairing.deviceId } },
    { kind: 'patient', data: { patientId, name: 'Phone Patient', age: 50, contactNumber: '+919222222222', consentGivenAt: now, registeredAt: now, updatedAt: now, originDevice: pairing.deviceId } },
  ] });
  assert.equal(push.status, 200, JSON.stringify(push.body));
  assert.equal(push.body.applied, 5);

  const cap = db.prepare('SELECT * FROM captures WHERE capture_id = ?').get(captureId);
  assert.equal(cap.origin_device, pairing.deviceId);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(cap.image_path)).digest('hex'), sha);
  assert.equal(db.prepare('SELECT owner_device FROM sync_queue WHERE capture_id = ?').get(captureId).owner_device, pairing.deviceId);
  phoneCapture = { captureId, patientId };

  // Re-pushing the same batch changes nothing (idempotent).
  const again = await sealedCall('/peer/push', { token: pt, records: push.body && [
    { kind: 'capture', data: { captureId, patientId, qualityStatus: 'pass', capturedAt: now, originDevice: pairing.deviceId } },
  ] });
  assert.equal(again.body.applied, 0);
});

test("the feed does not echo the phone's own records back to it", async () => {
  const pt = await phoneToken();
  let cursor = 0; const seen = [];
  for (;;) {
    const r = await sealedCall('/peer/pull', { cursor, token: pt });
    seen.push(...r.body.records); cursor = r.body.cursor;
    if (!r.body.more) break;
  }
  assert.ok(!seen.some((x) => x.data.captureId === phoneCapture.captureId && x.kind === 'capture'));
});

test('patient edits: last writer wins; an older edit does not overwrite a newer one', async () => {
  const pt = await phoneToken();
  const { patientId } = phoneCapture;
  const later = new Date(Date.now() + 1000).toISOString();
  const earlier = '2020-01-01T00:00:00.000Z';
  const base_ = { patientId, name: 'Phone Patient', age: 50, registeredAt: earlier, consentGivenAt: earlier, originDevice: pairing.deviceId };
  await sealedCall('/peer/push', { token: pt, records: [{ kind: 'patient', data: { ...base_, contactNumber: '+919333333333', updatedAt: later } }] });
  await sealedCall('/peer/push', { token: pt, records: [{ kind: 'patient', data: { ...base_, contactNumber: '+919000000000', updatedAt: earlier } }] });
  assert.equal(db.prepare('SELECT contact_number FROM patients WHERE patient_id = ?').get(patientId).contact_number, '+919333333333');
});

test('sync state only moves forward: "synced" is never undone by a stale "pending"', async () => {
  const pt = await phoneToken();
  const { captureId } = phoneCapture;
  await sealedCall('/peer/push', { token: pt, records: [{ kind: 'syncState', data: { captureId, state: 'synced', centralCaseId: '11111111-2222-3333-4444-555555555555', centralStatus: 'graded', priority: 0, ownerDevice: pairing.deviceId } }] });
  await sealedCall('/peer/push', { token: pt, records: [{ kind: 'syncState', data: { captureId, state: 'pending', centralCaseId: null, centralStatus: 'processing', priority: 0, ownerDevice: pairing.deviceId } }] });
  const row = db.prepare('SELECT * FROM sync_queue WHERE capture_id = ?').get(captureId);
  assert.equal(row.status, 'synced');
  assert.equal(row.central_status, 'graded');
  assert.equal(row.central_case_id, '11111111-2222-3333-4444-555555555555');
});

test('upload ownership: the phone owns its capture while seen recently; the PC takes over after silence', () => {
  db.prepare('UPDATE peer_devices SET last_seen_at = ? WHERE device_id = ?').run(new Date().toISOString(), pairing.deviceId);
  assert.equal(peerSync.ownsUpload(pairing.deviceId), false);
  assert.equal(peerSync.ownsUpload(db.deviceId()), true);
  assert.equal(peerSync.ownsUpload(null), true);
  db.prepare('UPDATE peer_devices SET last_seen_at = ? WHERE device_id = ?').run(new Date(Date.now() - 2 * 3600 * 1000).toISOString(), pairing.deviceId);
  assert.equal(peerSync.ownsUpload(pairing.deviceId), true);
});

test('image/get returns the exact bytes with their checksum', async () => {
  const pt = await phoneToken();
  const r = await sealedCall('/peer/image/get', { token: pt, captureId: phoneCapture.captureId });
  assert.equal(r.status, 200);
  const bytes = Buffer.from(r.body.bytesB64, 'base64');
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), r.body.sha256);
});

// ── Bundles (no-network hand carry) ─────────────────────────────────────────

function phoneBundle(records, images = {}, { key = pairing.key, toDevice = db.deviceId() } = {}) {
  const header = { kind: 'netrasetu-bundle', v: 1, fromDevice: pairing.deviceId, toDevice, createdAt: new Date().toISOString() };
  return { ...header, envelope: peerCrypto.seal(peerCrypto.keyFromB64(key), { records, images }, peerCrypto.bundleAad(header)) };
}

test('a bundle carried on USB imports; a tampered, mis-addressed or foreign-key bundle is refused', async () => {
  const token = await login();
  const now = new Date().toISOString();
  const patientId = generateLocalId('PHC001');
  const rec = [{ kind: 'patient', data: { patientId, name: 'Bundle Patient', age: 44, contactNumber: '+919444444444', consentGivenAt: now, registeredAt: now, updatedAt: now, originDevice: pairing.deviceId } }];

  const ok = await (await post('/peer/bundle', phoneBundle(rec), bearer(token))).json();
  assert.equal(ok.applied, 1);
  assert.ok(db.prepare('SELECT 1 FROM patients WHERE patient_id = ?').get(patientId));

  const t = phoneBundle(rec);
  t.envelope.tag = Buffer.alloc(16).toString('base64');
  assert.equal((await post('/peer/bundle', t, bearer(token))).status, 401);

  const t2 = phoneBundle(rec); t2.createdAt = '2001-01-01T00:00:00.000Z'; // header edited after sealing
  assert.equal((await post('/peer/bundle', t2, bearer(token))).status, 401);

  assert.equal((await post('/peer/bundle', phoneBundle(rec, {}, { toDevice: 'pc-someoneelse' }), bearer(token))).status, 400);
  assert.equal((await post('/peer/bundle', phoneBundle(rec, {}, { key: peerCrypto.newKeyB64() }), bearer(token))).status, 401);
});

test('PC -> phone bundle: exported sealed for the phone, opens only with its key', () => {
  const bundle = require('../services/peerBundle').exportBundle(pairing.deviceId);
  assert.equal(bundle.toDevice, pairing.deviceId);
  const payload = peerCrypto.openJson(peerCrypto.keyFromB64(pairing.key), bundle.envelope, peerCrypto.bundleAad(bundle));
  assert.ok(payload.records.some((r) => r.kind === 'patient' && r.data.name === 'Desk Patient'));
  assert.throws(() => peerCrypto.openJson(peerCrypto.keyFromB64(peerCrypto.newKeyB64()), bundle.envelope, peerCrypto.bundleAad(bundle)));
  const raw = JSON.stringify(bundle);
  assert.ok(!raw.includes('Desk Patient') && !raw.includes('+919111111111'), 'nothing readable in the file');
});

test('a revoked phone is locked out immediately', async () => {
  db.prepare('UPDATE peer_devices SET revoked_at = ? WHERE device_id = ?').run(new Date().toISOString(), pairing.deviceId);
  const r = await sealedCall('/peer/hello', {});
  assert.equal(r.status, 401);
  assert.equal(r.body.error, 'peer_unknown');
  db.prepare('UPDATE peer_devices SET revoked_at = NULL WHERE device_id = ?').run(pairing.deviceId);
});

// ── TLS (design doc §11.1) ──────────────────────────────────────────────────

const OPENSSL = ['openssl', 'C:/Program Files/Git/usr/bin/openssl.exe'].find((c) => {
  try { execFileSync(c, ['version'], { stdio: 'ignore' }); return true; } catch { return false; }
});

test('TLS: HTTPS served at TLS 1.2+, TLS 1.1 refused, plain HTTP on the TLS port refused', { skip: !OPENSSL && 'no openssl found' }, async () => {
  const key = path.join(TMP, 'k.pem'); const cert = path.join(TMP, 'c.pem');
  execFileSync(OPENSSL, ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '1', '-keyout', key, '-out', cert, '-subj', '/CN=localhost'], { stdio: 'ignore' });
  process.env.LOCAL_TLS_KEY_PATH = key; process.env.LOCAL_TLS_CERT_PATH = cert;
  const { tls: isTls, server: s } = app.createServer();
  delete process.env.LOCAL_TLS_KEY_PATH; delete process.env.LOCAL_TLS_CERT_PATH;
  assert.equal(isTls, true);
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  const port = s.address().port;
  const connect = (opts) => new Promise((resolve) => {
    const sock = tls.connect({ host: '127.0.0.1', port, rejectUnauthorized: false, ...opts }, () => { const v = sock.getProtocol(); sock.end(); resolve(v); });
    sock.on('error', () => resolve(null));
  });
  try {
    assert.match(await connect({}), /TLSv1\.[23]/);
    assert.equal(await connect({ minVersion: 'TLSv1', maxVersion: 'TLSv1.1' }), null);
    const plain = await fetch(`http://127.0.0.1:${port}/health`).then(() => 'ok', () => 'refused');
    assert.equal(plain, 'refused');
  } finally {
    s.close();
  }
});
