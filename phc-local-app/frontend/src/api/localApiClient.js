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
      await delay(800);
      const newPatient = {
        patientId: `PHC001-${Math.random().toString(36).substring(2, 8)}-new1`,
        registeredAt: new Date().toISOString(),
        ...patientData
      };
      // In a real app, we'd update state/mock data store here, but for demo just returning it is fine.
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
      await delay(600);
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
      await delay(400);
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
