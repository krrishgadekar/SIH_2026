import * as SQLite from 'expo-sqlite';
import { ScreeningSession, QueueItem } from '../types/queue'; // Wait, QueueItem is in types/queue

let db: SQLite.SQLiteDatabase | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!db) {
    db = await SQLite.openDatabaseAsync('retinasaarthi.db');
  }
  return db;
}

export async function initDb(): Promise<void> {
  const database = await getDb();
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS patients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      age INTEGER NOT NULL,
      contact_number TEXT NOT NULL,
      reference_id TEXT,
      consent_given_at TEXT
    );

    CREATE TABLE IF NOT EXISTS captures (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      image_uri TEXT,
      eye_laterality TEXT,
      created_at TEXT NOT NULL,
      quality_status TEXT,
      quality_reason TEXT,
      central_case_id TEXT,
      FOREIGN KEY (patient_id) REFERENCES patients (id)
    );

    CREATE TABLE IF NOT EXISTS questionnaire_responses (
      id TEXT PRIMARY KEY,
      capture_id TEXT NOT NULL,
      data_json TEXT NOT NULL,
      FOREIGN KEY (capture_id) REFERENCES captures (id)
    );

    CREATE TABLE IF NOT EXISTS capture_metadata_responses (
      id TEXT PRIMARY KEY,
      capture_id TEXT NOT NULL,
      data_json TEXT NOT NULL,
      FOREIGN KEY (capture_id) REFERENCES captures (id)
    );

    CREATE TABLE IF NOT EXISTS sync_queue (
      id TEXT PRIMARY KEY,
      capture_id TEXT NOT NULL,
      sync_status TEXT NOT NULL,
      retry_count INTEGER DEFAULT 0,
      last_attempt_at TEXT,
      error_message TEXT,
      full_session_json TEXT NOT NULL,
      FOREIGN KEY (capture_id) REFERENCES captures (id)
    );
  `);
}

// Store a complete session, mapping it to the relational schema
export async function saveSessionToDb(session: any, queueItem: any): Promise<void> {
  const database = await getDb();
  
  // Since the UI heavily relies on the full session object, we will store 
  // the structured fields for queries/sync prioritization, but also keep
  // the full_session_json in the sync_queue table to easily reconstruct 
  // the ScreeningSession object for the UI context.
  
  await database.withTransactionAsync(async () => {
    // 1. Patient
    await database.runAsync(
      `INSERT OR REPLACE INTO patients (id, name, age, contact_number, reference_id, consent_given_at) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        session.patient.id || session.id, // Fallback if missing
        session.patient.name,
        session.patient.age,
        session.patient.contactNumber || '',
        session.patient.referenceId || '',
        session.patient.consentGivenAt || null
      ]
    );

    // 2. Capture
    await database.runAsync(
      `INSERT OR REPLACE INTO captures (id, patient_id, image_uri, eye_laterality, created_at, quality_status, quality_reason, central_case_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        session.id,
        session.patient.id || session.id,
        session.imageUri || null,
        session.eyeLaterality || null,
        session.createdAt,
        session.qualityGateResult?.status || null,
        session.qualityGateResult?.reason || null,
        session.centralCaseId || null
      ]
    );

    // 3. Questionnaire
    if (session.questionnaire) {
      await database.runAsync(
        `INSERT OR REPLACE INTO questionnaire_responses (id, capture_id, data_json) VALUES (?, ?, ?)`,
        [session.id, session.id, JSON.stringify(session.questionnaire)]
      );
    }

    // 4. Capture Metadata
    if (session.captureMetadata) {
      await database.runAsync(
        `INSERT OR REPLACE INTO capture_metadata_responses (id, capture_id, data_json) VALUES (?, ?, ?)`,
        [session.id, session.id, JSON.stringify(session.captureMetadata)]
      );
    }

    // 5. Sync Queue
    await database.runAsync(
      `INSERT OR REPLACE INTO sync_queue (id, capture_id, sync_status, retry_count, last_attempt_at, error_message, full_session_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        queueItem.id,
        session.id,
        queueItem.syncStatus,
        queueItem.retryCount,
        queueItem.lastAttemptAt,
        queueItem.errorMessage,
        JSON.stringify(session)
      ]
    );
  });
}

export async function loadQueueFromDb(): Promise<any[]> {
  const database = await getDb();
  const rows = await database.getAllAsync<any>(`SELECT * FROM sync_queue`);
  return rows.map((row: any) => {
    return {
      id: row.id,
      syncStatus: row.sync_status,
      retryCount: row.retry_count,
      lastAttemptAt: row.last_attempt_at,
      errorMessage: row.error_message,
      session: JSON.parse(row.full_session_json)
    };
  });
}

export async function removeSessionFromDb(id: string): Promise<void> {
  const database = await getDb();
  await database.withTransactionAsync(async () => {
    await database.runAsync(`DELETE FROM sync_queue WHERE id = ?`, [id]);
    await database.runAsync(`DELETE FROM capture_metadata_responses WHERE capture_id = ?`, [id]);
    await database.runAsync(`DELETE FROM questionnaire_responses WHERE capture_id = ?`, [id]);
    await database.runAsync(`DELETE FROM captures WHERE id = ?`, [id]);
    // Note: Patient is deliberately not deleted since multiple captures could share a patient
  });
}

export async function updateQueueItemStatusDb(id: string, updates: any): Promise<void> {
  const database = await getDb();
  
  // Update individual fields
  const setClauses: string[] = [];
  const values: any[] = [];
  
  if (updates.syncStatus !== undefined) {
    setClauses.push('sync_status = ?');
    values.push(updates.syncStatus);
  }
  if (updates.retryCount !== undefined) {
    setClauses.push('retry_count = ?');
    values.push(updates.retryCount);
  }
  if (updates.lastAttemptAt !== undefined) {
    setClauses.push('last_attempt_at = ?');
    values.push(updates.lastAttemptAt);
  }
  if (updates.errorMessage !== undefined) {
    setClauses.push('error_message = ?');
    values.push(updates.errorMessage);
  }
  
  if (setClauses.length > 0) {
    values.push(id);
    await database.runAsync(`UPDATE sync_queue SET ${setClauses.join(', ')} WHERE id = ?`, values);
  }
  
  // If session is passed, update full_session_json
  if (updates.session) {
    await database.runAsync(`UPDATE sync_queue SET full_session_json = ? WHERE id = ?`, [
      JSON.stringify(updates.session),
      id
    ]);
  }
}
