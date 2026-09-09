/**
 * Dedicated API client for RetinaSaarthi.
 *
 * Features:
 *  - Single configurable base URL (see src/config/api.ts)
 *  - 30-second timeout with AbortController
 *  - Typed error classes: NetworkError, TimeoutError, InvalidImageError, ServerError
 *  - Multipart FormData upload matching FastAPI backend specifications
 *  - Mock mode bypass (see MOCK_MODE in config)
 *  - Automatic fallback to mock data if API is unreachable or fails
 *  - Ngrok compatibility headers
 *  - Automatic response normalization for frontend compatibility
 */

import { File } from 'expo-file-system';

import {
  API_BASE_URL,
  REQUEST_TIMEOUT_MS,
  UPLOAD_ENDPOINT,
  MOCK_MODE,
} from '../config/api';

import { ScreeningResult } from '../types/screening';
import { ACTIVE_MOCK } from './mockData';

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
  modelLoaded: boolean;
  modelVersion: string;
  modelPath: string;
  device: string;
  imageSize: number;
  referableThreshold: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Normalizes backend response to match frontend expectations:
 * - Maps imageQuality.status 'good' -> 'pass', 'poor' -> 'retake'
 */
export function normalizeScreeningResult(raw: any): ScreeningResult {
  const quality = raw.imageQuality ?? {};
  let status = quality.status;
  if (status === 'good') status = 'pass';
  if (status === 'poor') status = 'retake';

  return {
    ...raw,
    imageQuality: {
      ...quality,
      status: status ?? 'pass',
    },
  };
}

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
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'ngrok-skip-browser-warning': 'true',
      ...(options.headers as Record<string, string> || {}),
    };

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

      // 400, 413, or 422 with image issues
      if (
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

    const data: T = await response.json();
    return data;
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
      // TypeError: Failed to fetch → network unreachable
      if (err.message.includes('fetch') || err.message.includes('Network')) {
        throw new NetworkError();
      }
    }

    throw new NetworkError(String(err));
  }
}

// ── Health check endpoint ──────────────────────────────────────────────────

export async function checkBackendHealth(): Promise<HealthResponse> {
  try {
    return await apiRequest<HealthResponse>('/health', {
      method: 'GET',
    });
  } catch (err) {
    console.warn('[RetinaSaarthi API] Health check failed, using fallback health state:', err);
    return {
      status: 'offline',
      modelLoaded: false,
      modelVersion: 'fallback-offline',
      modelPath: 'mock',
      device: 'cpu',
      imageSize: 384,
      referableThreshold: 0.341616,
    };
  }
}

// ── Upload endpoint ────────────────────────────────────────────────────────

/**
 * Upload a retinal image to the FastAPI backend for screening analysis.
 * Automatically falls back to mock data if the API request fails or times out.
 *
 * @param imageUri  - local file URI from camera/image-picker
 * @param filename  - original filename (e.g. "retina.jpg")
 * @param mimeType  - MIME type (e.g. "image/jpeg")
 * @returns         ScreeningResult with exact backend field names
 */

// export async function uploadImageForScreening(

//   imageUri: string,
//   filename: string,
//   mimeType: string,
// ): Promise<ScreeningResult> {
//   let cleanFilename = filename ? filename.split('/').pop()?.split('\\').pop() || filename : 'retina_scan.jpg';
//   const hasValidExt = /\.(jpe?g|png)$/i.test(cleanFilename);
//   if (!hasValidExt) {
//     if (mimeType?.toLowerCase().includes('png')) {
//       cleanFilename += '.png';
//     } else {
//       cleanFilename += '.jpg';
//     }
//   }

//   const effectiveMimeType = mimeType || (cleanFilename.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg');

//   if (MOCK_MODE) {
//     await new Promise((resolve) => setTimeout(resolve, 2000));
//     return normalizeScreeningResult({
//       ...ACTIVE_MOCK,
//       processedAt: new Date().toISOString(),
//       input: {
//         ...ACTIVE_MOCK.input,
//         filename: cleanFilename,
//       },
//     });
//   }

//   let normalizedUri = imageUri;
//   if (
//     Platform.OS === 'android' &&
//     !normalizedUri.startsWith('file://') &&
//     !normalizedUri.startsWith('content://')
//   ) {
//     normalizedUri = `file://${normalizedUri}`;
//   }

//   const file = new File(imageUri);

//   console.log('File exists:', file.exists);
//   console.log('File name:', file.name);
//   console.log('File size:', file.size);

//   const formData = new FormData();

//   formData.append('file', file);

//   const controller = new AbortController();
//   const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

//   try {
//     const baseUrl = API_BASE_URL.replace(/\/+$/, '');
//     const url = `${baseUrl}${UPLOAD_ENDPOINT}`;

//     const response = await fetch(url, {
//       method: 'POST',
//       body: formData,
//       headers: {
//         Accept: 'application/json',
//         'ngrok-skip-browser-warning': 'true',
//         // Notice: 'Content-Type' must NOT be set here; fetch will generate
//         // 'multipart/form-data; boundary=...' automatically with the boundary delimiter.
//       },
//       signal: controller.signal,
//     });

//     clearTimeout(timer);

//     if (!response.ok) {
//       let errMsg = `Server responded with ${response.status}`;
//       let errCode = '';
//       try {
//         const errBody = await response.json();
//         if (typeof errBody?.detail === 'string') {
//           errMsg = errBody.detail;
//         } else if (errBody?.detail && typeof errBody.detail === 'object') {
//           errMsg = errBody.detail.message || JSON.stringify(errBody.detail);
//           errCode = errBody.detail.error || '';
//         } else if (errBody?.message) {
//           errMsg = errBody.message;
//         }
//       } catch (_) { }

//       if (
//         response.status === 400 ||
//         response.status === 422 ||
//         errCode === 'invalid_image_type' ||
//         errCode === 'invalid_image' ||
//         errCode === 'empty_file' ||
//         errCode === 'file_too_large'
//       ) {
//         throw new InvalidImageError(errMsg);
//       }
//       throw new ServerError(response.status, errMsg);
//     }

//     const rawResult = await response.json();
//     return normalizeScreeningResult(rawResult);
//   } catch (apiError: unknown) {
//     clearTimeout(timer);

//     if (apiError instanceof InvalidImageError || apiError instanceof ServerError) {
//       throw apiError;
//     }

//     if (apiError instanceof Error && apiError.name === 'AbortError') {
//       throw new TimeoutError();
//     }

//     console.warn(
//       '[RetinaSaarthi API] Network request failed; automatically falling back to mock data:',
//       apiError,
//     );

//     await new Promise((resolve) => setTimeout(resolve, 1000));

//     return normalizeScreeningResult({
//       ...ACTIVE_MOCK,
//       processedAt: new Date().toISOString(),
//       input: {
//         ...ACTIVE_MOCK.input,
//         filename: cleanFilename,
//       },
//     });
//   }
// }
export async function uploadImageForScreening(
  imageUri: string,
  filename: string,
  mimeType: string,
): Promise<ScreeningResult> {

  // ─────────────────────────────────────────────
  // 1. Normalize filename
  // ─────────────────────────────────────────────

  let cleanFilename =
    filename
      ? filename.split('/').pop()?.split('\\').pop() || filename
      : 'retina_scan.jpg';

  const hasValidExt = /\.(jpe?g|png)$/i.test(cleanFilename);

  if (!hasValidExt) {
    if (mimeType?.toLowerCase().includes('png')) {
      cleanFilename += '.png';
    } else {
      cleanFilename += '.jpg';
    }
  }

  const effectiveMimeType =
    mimeType?.toLowerCase().includes('png')
      ? 'image/png'
      : 'image/jpeg';


  // ─────────────────────────────────────────────
  // 2. MOCK MODE
  // Keep this exactly as your fallback
  // ─────────────────────────────────────────────

  if (MOCK_MODE) {
    await new Promise((resolve) => setTimeout(resolve, 2000));

    return normalizeScreeningResult({
      ...ACTIVE_MOCK,
      processedAt: new Date().toISOString(),
      input: {
        ...ACTIVE_MOCK.input,
        filename: cleanFilename,
      },
    });
  }


  // ─────────────────────────────────────────────
  // 3. REAL API REQUEST
  // ─────────────────────────────────────────────

  try {

    console.log('========== UPLOAD DEBUG ==========');
    console.log('API URL:', `${API_BASE_URL}${UPLOAD_ENDPOINT}`);
    console.log('URI:', imageUri);
    console.log('Filename:', cleanFilename);
    console.log('MIME:', effectiveMimeType);
    console.log('===================================');


    // Create Expo File object directly from picker URI
    const file = new File(imageUri);

    console.log('File exists:', file.exists);
    console.log('File name:', file.name);
    console.log('File size:', file.size);


    if (!file.exists) {
      throw new Error('Selected image file does not exist.');
    }


    // ─────────────────────────────────────────
    // 4. Create multipart/form-data
    // Backend expects:
    //
    // file = image
    // ─────────────────────────────────────────

    const formData = new FormData();

    formData.append('file', file);

    console.log('FormData created');


    // ─────────────────────────────────────────
    // 5. Timeout
    // ─────────────────────────────────────────

    const controller = new AbortController();

    const timer = setTimeout(() => {
      controller.abort();
    }, REQUEST_TIMEOUT_MS);


    try {

      const baseUrl = API_BASE_URL.replace(/\/+$/, '');
      const url = `${baseUrl}${UPLOAD_ENDPOINT}`;

      console.log('Sending POST request to:', url);


      const response = await fetch(url, {
        method: 'POST',

        headers: {
          Accept: 'application/json',

          // Required for ngrok
          'ngrok-skip-browser-warning': 'true',

          // IMPORTANT:
          // Do NOT manually set Content-Type.
          // React Native/Expo generates the multipart boundary.
        },

        body: formData,

        signal: controller.signal,
      });


      console.log('HTTP STATUS:', response.status);


      // Read response only once
      const responseText = await response.text();

      console.log('BACKEND RESPONSE:', responseText);


      if (!response.ok) {

        let errMsg = `Server responded with ${response.status}`;
        let errCode = '';

        try {

          const errBody = JSON.parse(responseText);

          if (typeof errBody?.detail === 'string') {

            errMsg = errBody.detail;

          } else if (
            errBody?.detail &&
            typeof errBody.detail === 'object'
          ) {

            errMsg =
              errBody.detail.message ||
              JSON.stringify(errBody.detail);

            errCode =
              errBody.detail.error || '';

          } else if (errBody?.message) {

            errMsg = errBody.message;
          }

        } catch (_) {
          // Response wasn't JSON
        }


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


        throw new ServerError(
          response.status,
          errMsg
        );
      }


      // Parse successful backend response
      const rawResult = JSON.parse(responseText);

      return normalizeScreeningResult(rawResult);

    } finally {

      clearTimeout(timer);
    }


  } catch (apiError: unknown) {

    console.error(
      '========== REAL API ERROR =========='
    );

    console.error(apiError);

    console.error(
      '====================================='
    );


    // ─────────────────────────────────────────
    // IMPORTANT:
    // These errors should reach the fallback
    // ─────────────────────────────────────────

    if (
      apiError instanceof InvalidImageError ||
      apiError instanceof ServerError
    ) {

      throw apiError;
    }


    if (
      apiError instanceof Error &&
      apiError.name === 'AbortError'
    ) {

      console.warn(
        '[RetinaSaarthi API] Request timed out.'
      );

      // Let fallback happen below
    }


    // ─────────────────────────────────────────
    // 6. FALLBACK TO MOCK
    //
    // KEEP THIS BEHAVIOUR
    // ─────────────────────────────────────────

    console.warn(
      '[RetinaSaarthi API] Real API failed. Falling back to mock data:',
      apiError
    );


    await new Promise(
      (resolve) => setTimeout(resolve, 1000)
    );


    return normalizeScreeningResult({

      ...ACTIVE_MOCK,

      processedAt:
        new Date().toISOString(),

      input: {

        ...ACTIVE_MOCK.input,

        filename:
          cleanFilename,

      },

    });
  }
}