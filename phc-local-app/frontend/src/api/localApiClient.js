import { USE_MOCK_DATA, LOCAL_API_BASE } from '../config';
import * as mockData from './mockData';

// Delay helper to simulate network latency
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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
    const res = await fetch(`${this.baseUrl}/api/v1/patients`);
    if (!res.ok) throw new Error('Failed to fetch patients');
    return res.json();
  }

  async registerPatient(patientData) {
    if (this.useMock) {
      await delay(400);
      const newPatient = {
        patientId: `PHC001-${Math.random().toString(36).substring(2, 8).toUpperCase()}-NEW1`,
        registeredAt: new Date().toISOString(),
        ...patientData
      };
      mockData.mockPatients.unshift(newPatient);
      try {
        localStorage.setItem('netra_latest_patient', JSON.stringify(newPatient));
        const existing = JSON.parse(localStorage.getItem('netra_registered_patients') || '[]');
        localStorage.setItem('netra_registered_patients', JSON.stringify([newPatient, ...existing]));
      } catch (e) {}
      return newPatient;
    }
    const res = await fetch(`${this.baseUrl}/api/v1/patients`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patientData)
    });
    if (!res.ok) throw new Error('Failed to register patient');
    return res.json();
  }

  async saveCaptureMetadata(captureId, metadata) {
    if (this.useMock) {
      await delay(400);
      let resolvedName = metadata.patientName;
      let resolvedAge = metadata.patientAge;

      if (!resolvedName) {
        try {
          const latest = JSON.parse(localStorage.getItem('netra_latest_patient'));
          if (latest?.name) {
            resolvedName = latest.name;
            resolvedAge = latest.age;
          }
        } catch (e) {}
      }

      const newQueueItem = {
        captureId,
        patientId: metadata.patientId || `PHC001-${Math.random().toString(36).substring(2, 8).toUpperCase()}-NEW1`,
        patientName: resolvedName || 'Krrish',
        patientAge: resolvedAge || 20,
        status: 'result_delivered',
        capturedAt: new Date().toISOString(),
        imagePreviewUrl: metadata.imagePreviewUrl,
        imageUrl: metadata.imagePreviewUrl,
        prediction: metadata.aiPrediction,
      };

      mockData.mockQueueItems.unshift(newQueueItem);
      try {
        const stored = JSON.parse(localStorage.getItem('netra_phc_queue') || '[]');
        localStorage.setItem('netra_phc_queue', JSON.stringify([newQueueItem, ...stored]));
        localStorage.setItem('netra_last_capture', JSON.stringify(newQueueItem));
      } catch (e) {}
      return { success: true, captureId, ...metadata };
    }
    const res = await fetch(`${this.baseUrl}/api/v1/captures/${captureId}/metadata`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(metadata)
    });
    if (!res.ok) throw new Error('Failed to save metadata');
    return res.json();
  }

  async getQueue() {
    if (this.useMock) {
      await delay(200);
      try {
        const stored = JSON.parse(localStorage.getItem('netra_phc_queue') || '[]');
        if (stored && stored.length > 0) {
          const existingIds = new Set(mockData.mockQueueItems.map(q => q.captureId));
          const additions = stored.filter(q => !existingIds.has(q.captureId));
          return [...additions, ...mockData.mockQueueItems];
        }
      } catch (e) {}
      return [...mockData.mockQueueItems];
    }
    const res = await fetch(`${this.baseUrl}/api/v1/queue`);
    if (!res.ok) throw new Error('Failed to fetch queue');
    return res.json();
  }

  async getSyncStatus() {
    if (this.useMock) {
      // Don't delay sync status checks as they might be polled
      return { ...mockData.mockSyncStatus };
    }
    const res = await fetch(`${this.baseUrl}/api/v1/sync/status`);
    if (!res.ok) throw new Error('Failed to fetch sync status');
    return res.json();
  }
}

export const localApi = new LocalApiClient();
