import { File } from 'expo-file-system';
import * as Crypto from 'expo-crypto';

import {
  API_BASE_URL,
  REQUEST_TIMEOUT_MS,
  MOCK_MODE,
} from '../config/api';

import { CaseSummaryResponse, CaseStatusResponse, PatientSearchItem, CentralCaseDetail } from '../types/screening';

// ── Error types ────────────────────────────────────────────────────────────

export class NetworkError extends Error {
  constructor(message = 'No network connection. Please check your internet access.') {
    super(message);
    this.name = 'NetworkError';
  }
}

export class TimeoutError extends Error {
  constructor(message = 'Request timed out. The server took too long to respond.') {
    super(message);
    this.name = 'TimeoutError';
  }
}

export class InvalidImageError extends Error {
  constructor(message = 'The image could not be processed. Please check the file format.') {
    super(message);
    this.name = 'InvalidImageError';
  }
}

export class ServerError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message || `Server error (${statusCode}). Please try again.`);
    this.name = 'ServerError';
    this.statusCode = statusCode;
  }
}

export interface HealthResponse {
  status: string;
}

// ── API Key Header Setup ───────────────────────────────────────────────────

const getHeaders = (optionsHeaders: Record<string, string> = {}) => {
  // Read API Key from environment or config
  const apiKey = process.env.EXPO_PUBLIC_PHC_API_KEY || 'default-phc-key';
  return {
    Accept: 'application/json',
    'ngrok-skip-browser-warning': 'true',
    'X-PHC-Api-Key': apiKey,
    ...optionsHeaders,
  };
};

// ── Core fetch wrapper ─────────────────────────────────────────────────────

async function apiRequest<T>(
  path: string,
  options: RequestInit,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const baseUrl = API_BASE_URL.replace(/\/+$/, '');
    const url = `${baseUrl}${path}`;
    const headers = getHeaders(options.headers as Record<string, string>);

    const response = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) {
      let errMsg = `Server responded with ${response.status}`;
      let errCode = '';

      try {
        const errBody = await response.json();
        if (typeof errBody?.detail === 'string') {
          errMsg = errBody.detail;
        } else if (errBody?.detail && typeof errBody.detail === 'object') {
          errMsg = errBody.detail.message || JSON.stringify(errBody.detail);
          errCode = errBody.detail.error || '';
        } else if (errBody?.message) {
          errMsg = errBody.message;
        }
      } catch (_) { /* ignore parse errors */ }

      if (
        response.status === 400 ||
        response.status === 413 ||
        response.status === 422 ||
        errCode === 'invalid_image_type' ||
        errCode === 'invalid_image' ||
        errCode === 'empty_file' ||
        errCode === 'file_too_large'
      ) {
        throw new InvalidImageError(errMsg);
      }

      throw new ServerError(response.status, errMsg);
    }

    const text = await response.text();
    if (!text) return {} as T;
    return JSON.parse(text);
  } catch (err: unknown) {
    clearTimeout(timer);

    if (
      err instanceof InvalidImageError ||
      err instanceof ServerError ||
      err instanceof NetworkError ||
      err instanceof TimeoutError
    ) {
      throw err;
    }

    if (err instanceof Error) {
      if (err.name === 'AbortError') {
        throw new TimeoutError();
      }
      if (err.message.includes('fetch') || err.message.includes('Network')) {
        throw new NetworkError();
      }
    }

    throw new NetworkError(String(err));
  }
}

// ── Endpoints ──────────────────────────────────────────────────────────────

export async function checkBackendHealth(): Promise<HealthResponse> {
  try {
    return await apiRequest<HealthResponse>('/api/v1/health', {
      method: 'GET',
    });
  } catch (err) {
    console.warn('[RetinaSaarthi API] Health check failed', err);
    return {
      status: 'offline'
    };
  }
}

export async function searchPatients(name?: string, age?: number, phone?: string): Promise<PatientSearchItem[]> {
  const params = new URLSearchParams();
  if (name) params.append('name', name);
  if (age) params.append('age', age.toString());
  if (phone) params.append('phone', phone);
  
  return apiRequest<PatientSearchItem[]>(`/api/v1/patients/search?${params.toString()}`, {
    method: 'GET',
  });
}

export async function getCaseStatus(caseId: string): Promise<CaseStatusResponse> {
  return apiRequest<CaseStatusResponse>(`/api/v1/cases/${caseId}/status`, {
    method: 'GET',
  });
}

export async function getCaseDetail(caseId: string): Promise<CentralCaseDetail> {
  return apiRequest<CentralCaseDetail>(`/api/v1/cases/${caseId}`, {
    method: 'GET',
  });
}

export async function createCaseSummary(payload: any): Promise<CaseSummaryResponse> {
  return apiRequest<CaseSummaryResponse>('/api/v1/cases/summary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

// Basic single-shot upload for simplicity if not chunking
export async function uploadCaseImageSingle(payload: any, imageUri: string): Promise<CaseSummaryResponse> {
  const file = new File(imageUri);
  const formData = new FormData();
  
  formData.append('file', file);
  // Append all payload keys
  Object.keys(payload).forEach(key => {
    if (typeof payload[key] === 'object') {
      formData.append(key, JSON.stringify(payload[key]));
    } else {
      formData.append(key, payload[key]);
    }
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const baseUrl = API_BASE_URL.replace(/\/+$/, '');
    const url = `${baseUrl}/api/v1/cases`;
    const headers = getHeaders();

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: formData,
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) {
      let errMsg = `Server responded with ${response.status}`;
      try {
        const errBody = await response.json();
        errMsg = errBody.message || errBody.detail || errMsg;
      } catch (_) {}
      throw new ServerError(response.status, errMsg);
    }

    return await response.json();
  } catch (apiError: unknown) {
    clearTimeout(timer);
    throw apiError;
  }
}