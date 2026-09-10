export const USE_MOCK_DATA = import.meta.env?.VITE_USE_MOCK_DATA !== undefined 
  ? import.meta.env.VITE_USE_MOCK_DATA === 'true' 
  : true;
export const CENTRAL_API_BASE = import.meta.env?.VITE_CENTRAL_API_BASE || 'http://localhost:5000';

