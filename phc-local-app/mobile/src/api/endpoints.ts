/**
 * Typed endpoint functions — thin wrappers over the API client.
 * Import from here rather than calling client.ts directly from screens.
 */

export { uploadImageForScreening, checkBackendHealth } from './client';
export { NetworkError, TimeoutError, InvalidImageError, ServerError } from './client';
export type { HealthResponse } from './client';
