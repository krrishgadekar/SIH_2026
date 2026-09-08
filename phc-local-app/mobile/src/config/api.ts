/**
 * API Configuration
 *
 * Change API_BASE_URL to point at your FastAPI server.
 * For Android emulator pointing at localhost: http://10.0.2.2:8000
 * For physical device on same WiFi:          http://192.168.x.x:8000
 *
 * Set MOCK_MODE = true to use realistic fixture data (no backend needed).
 */

export const API_BASE_URL = 'https://unpadded-slick-pushiness.ngrok-free.dev';

/**
 * Toggle mock mode for frontend development.
 * When true, all API calls return fixture data from src/api/mockData.ts
 * and no real network requests are made.
 */
export const MOCK_MODE = false;

/** Request timeout in milliseconds */
export const REQUEST_TIMEOUT_MS = 30_000;

/** Upload endpoint path */
export const UPLOAD_ENDPOINT = '/predict';
