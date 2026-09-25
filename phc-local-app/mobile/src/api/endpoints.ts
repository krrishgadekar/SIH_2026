/**
 * Typed endpoint functions — thin wrappers over the API client.
 * Import from here rather than calling client.ts directly from screens.
 */

export { 
    checkBackendHealth, 
    searchPatients, 
    getCaseStatus, 
    getCaseDetail, 
    createCaseSummary, 
    uploadCaseImageSingle 
} from './client';

export { NetworkError, TimeoutError, InvalidImageError, ServerError } from './client';
export type { HealthResponse } from './client';
