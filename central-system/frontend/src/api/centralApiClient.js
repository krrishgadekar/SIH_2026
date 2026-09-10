import { USE_MOCK_DATA, CENTRAL_API_BASE } from '../config';
import * as mockData from './mockData';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

class CentralApiClient {
  constructor() {
    this.baseUrl = CENTRAL_API_BASE;
  }

  async _fetch(path, options = {}) {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'unknown', message: res.statusText }));
      throw new Error(err.message || err.error);
    }
    return res.json();
  }

  // ── Ophthalmologist ──
  async getOphthQueue() {
    if (USE_MOCK_DATA) {
      await delay(400);
      const list = [...mockData.mockOphthQueue];
      try {
        const latest = JSON.parse(localStorage.getItem('netra_latest_patient'));
        if (latest?.name) {
          list[0] = {
            ...list[0],
            patientName: latest.name,
            patientAge: latest.age || 20,
            patientReference: latest.patientId ? (latest.patientId.length > 10 ? latest.patientId.substring(0, 10).toUpperCase() : latest.patientId) : 'PT-4821',
          };
        }
      } catch (e) {}
      return list;
    }
    return this._fetch('/api/v1/ophthalmologist/queue');
  }

  async getCaseDetail(caseId) {
    if (USE_MOCK_DATA) {
      await delay(400);
      const base = mockData.mockCaseDetails[caseId] || { ...mockData.mockCaseDetail, caseId };
      try {
        const latest = JSON.parse(localStorage.getItem('netra_latest_patient'));
        if (latest?.name && (caseId === 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' || !mockData.mockCaseDetails[caseId])) {
          return {
            ...base,
            patientName: latest.name,
            patientAge: latest.age || 20,
            patientReference: latest.patientId ? (latest.patientId.length > 10 ? latest.patientId.substring(0, 10).toUpperCase() : latest.patientId) : 'PT-4821',
          };
        }
      } catch (e) {}
      return base;
    }
    return this._fetch(`/api/v1/cases/${caseId}`);
  }

  async submitReview(caseId, reviewData) {
    if (USE_MOCK_DATA) {
      await delay(500);
      return { reviewId: `review-${Date.now().toString(36)}` };
    }
    return this._fetch(`/api/v1/cases/${caseId}/review`, {
      method: 'POST',
      body: JSON.stringify(reviewData),
    });
  }

  // ── Admin ──
  async getAdminDashboard() {
    if (USE_MOCK_DATA) {
      await delay(500);
      return { ...mockData.mockAdminDashboard };
    }
    return this._fetch('/api/v1/admin/dashboard');
  }

  async getReferrals() {
    if (USE_MOCK_DATA) {
      await delay(300);
      const list = [...mockData.mockReferrals];
      try {
        const latest = JSON.parse(localStorage.getItem('netra_latest_patient'));
        if (latest?.name) {
          list[0] = {
            ...list[0],
            patientName: latest.name,
            patientAge: latest.age || 20,
          };
        }
      } catch (e) {}
      return list;
    }
    return this._fetch('/api/v1/admin/referrals');
  }

  async updateReferral(referralId, data) {
    if (USE_MOCK_DATA) {
      await delay(300);
      const idx = mockData.mockReferrals.findIndex(r => r.referralId === referralId);
      if (idx !== -1) {
        mockData.mockReferrals[idx] = {
          ...mockData.mockReferrals[idx],
          ...data,
          updatedAt: new Date().toISOString(),
        };
        return { ...mockData.mockReferrals[idx] };
      }
      return { referralId, ...data, updatedAt: new Date().toISOString() };
    }
    return this._fetch(`/api/v1/referrals/${referralId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async getPhcSyncStatuses() {
    if (USE_MOCK_DATA) {
      await delay(300);
      return [...mockData.mockPhcSyncStatuses];
    }
    // Would need to iterate PHCs or have a bulk endpoint
    return this._fetch('/api/v1/admin/phc-sync');
  }
}

export const centralApi = new CentralApiClient();
