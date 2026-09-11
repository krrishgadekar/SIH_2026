import { USE_MOCK_DATA, LOCAL_API_BASE } from '../config';
import * as mockData from './mockData';

// Delay helper to simulate network latency
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// How long a real call to the local backend is allowed to take before we give
// up and fall back. The quality gate itself can take a few seconds (it runs a
// real image analysis), so this is generous — but a demo cannot hang forever
// waiting on a backend that is down.
const REAL_CALL_TIMEOUT_MS = 8000;

async function fetchWithTimeout(url, options = {}, timeoutMs = REAL_CALL_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

class LocalApiClient {
  constructor() {
    this.useMock = USE_MOCK_DATA;
    this.baseUrl = LOCAL_API_BASE;
  }

  async getPatients() {
    if (this.useMock) {
      await delay(500);
      return [...mockData.mockPatients];
    }
    try {
      const res = await fetchWithTimeout(`${this.baseUrl}/patients`);
      if (!res.ok) throw new Error(`getPatients: backend returned ${res.status}`);
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error('getPatients: unexpected response shape');
      return data;
    } catch (err) {
      console.warn('[localApi] real getPatients failed, falling back to mock:', err.message);
      await delay(500);
      return [...mockData.mockPatients];
    }
  }

  /**
   * registerPatient(patientData) -> real POST /patients, falling back silently
   * to the existing mock-generated patient on any error, timeout, or
   * unexpected shape. Never throws — a flaky network here must not block the
   * demo's registration screen.
   */
  async registerPatient(patientData) {
    if (!this.useMock) {
      try {
        const res = await fetchWithTimeout(`${this.baseUrl}/patients`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patientData),
        });
        if (!res.ok) throw new Error(`registerPatient: backend returned ${res.status}`);
        const data = await res.json();
        if (!data || typeof data.patientId !== 'string') {
          throw new Error('registerPatient: unexpected response shape');
        }
        return data;
      } catch (err) {
        console.warn('[localApi] real registerPatient failed, falling back to mock:', err.message);
      }
    }

    await delay(800);
    return {
      patientId: `PHC001-${Math.random().toString(36).substring(2, 8)}-new1`,
      registeredAt: new Date().toISOString(),
      ...patientData,
    };
  }

  /**
   * submitCapture(patientId, imageFile, cameraDeviceId) -> real multipart
   * POST /captures (the actual local quality gate). Returns the contract shape
   * { captureId, patientId, qualityStatus, qualityReason, retakeCount, capturedAt }
   * on success, or null on any failure — callers decide what "no real result"
   * means for their own fallback (this client does not know the mock scenario
   * shape the capture screen wants to show instead).
   */
  async submitCapture(patientId, imageFile, cameraDeviceId) {
    if (this.useMock) return null;
    try {
      const formData = new FormData();
      formData.append('patientId', patientId);
      formData.append('image', imageFile);
      formData.append('cameraDeviceId', cameraDeviceId || 'unknown');

      // Quality gate analysis can take real time (image processing), so this
      // gets a longer budget than other calls.
      const res = await fetchWithTimeout(
        `${this.baseUrl}/captures`, { method: 'POST', body: formData }, 20000);

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(`submitCapture: backend returned ${res.status} ${body.error || ''}`);
      }
      const data = await res.json();
      if (!data || typeof data.captureId !== 'string' ||
          !['pass', 'retake', 'borderline'].includes(data.qualityStatus)) {
        throw new Error('submitCapture: unexpected response shape');
      }
      return data;
    } catch (err) {
      console.warn('[localApi] real submitCapture failed, falling back to mock:', err.message);
      return null;
    }
  }

  /** submitQuestionnaire(captureId, payload) -> real POST, best-effort (never throws). */
  async submitQuestionnaire(captureId, payload) {
    if (this.useMock) return null;
    try {
      const res = await fetchWithTimeout(`${this.baseUrl}/captures/${captureId}/questionnaire`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`submitQuestionnaire: backend returned ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn('[localApi] real submitQuestionnaire failed (non-fatal):', err.message);
      return null;
    }
  }

  /** submitCaptureMetadata(captureId, payload) -> real POST, best-effort (never throws). */
  async submitCaptureMetadata(captureId, payload) {
    if (this.useMock) return null;
    try {
      const res = await fetchWithTimeout(`${this.baseUrl}/captures/${captureId}/capture-metadata`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`submitCaptureMetadata: backend returned ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn('[localApi] real submitCaptureMetadata failed (non-fatal):', err.message);
      return null;
    }
  }

  /**
   * saveCaptureMetadata(captureId, metadata) — populates the demo Local Queue
   * Table / result modal (mockData.mockQueueItems), which is client-side-only
   * state with no real backend equivalent: the real GET /captures never
   * returns a `prediction`/`imagePreviewUrl`-shaped row (see getQueue above),
   * and there has never been a real POST /api/v1/captures/:id/metadata route
   * — the actual real submissions (questionnaire, capture-metadata) are sent
   * separately via submitQuestionnaire()/submitCaptureMetadata() before this
   * is called. So this always runs the same way regardless of USE_MOCK_DATA;
   * there is no "real" branch to attempt here.
   */
  async saveCaptureMetadata(captureId, metadata) {
    await delay(600);
    const newQueueItem = {
      captureId,
      patientId: metadata.patientId || 'PHC001-lz3k9f-a2x9',
      patientName: metadata.patientName || (metadata.patientId === 'PHC001-lz3k9g-b4y2' ? 'Ramesh Kumar' : 'Sunita Devi'),
      status: 'result_delivered',
      capturedAt: new Date().toISOString(),
      imagePreviewUrl: metadata.imagePreviewUrl,
      imageUrl: metadata.imagePreviewUrl,
      prediction: metadata.aiPrediction,
    };
    mockData.mockQueueItems.unshift(newQueueItem);
    return { success: true, captureId, ...metadata };
  }

  /**
   * getQueue() — real backend has no bulk /queue endpoint; the contract's
   * equivalent is GET /captures. Real rows can only ever report
   * captured/quality_passed/synced (never result_pending/result_delivered —
   * the local backend has no visibility into central grading yet), so a real
   * item's "view result" action naturally stays disabled rather than
   * fabricating a result. Falls back to the existing mock queue on any error.
   */
  async getQueue() {
    if (this.useMock) {
      await delay(400);
      return [...mockData.mockQueueItems];
    }
    try {
      const res = await fetchWithTimeout(`${this.baseUrl}/captures`);
      if (!res.ok) throw new Error(`getQueue: backend returned ${res.status}`);
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error('getQueue: unexpected response shape');
      return data;
    } catch (err) {
      console.warn('[localApi] real getQueue failed, falling back to mock:', err.message);
      await delay(400);
      return [...mockData.mockQueueItems];
    }
  }

  async getSyncStatus() {
    if (this.useMock) {
      // Don't delay sync status checks as they might be polled
      return { ...mockData.mockSyncStatus };
    }
    try {
      const res = await fetchWithTimeout(`${this.baseUrl}/sync/status`, {}, 3000);
      if (!res.ok) throw new Error(`getSyncStatus: backend returned ${res.status}`);
      const data = await res.json();
      if (!data || typeof data.online !== 'boolean') {
        throw new Error('getSyncStatus: unexpected response shape');
      }
      return data;
    } catch (err) {
      console.warn('[localApi] real getSyncStatus failed, falling back to mock:', err.message);
      return { ...mockData.mockSyncStatus };
    }
  }
}

export const localApi = new LocalApiClient();
