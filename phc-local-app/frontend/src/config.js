export const USE_MOCK_DATA = import.meta.env?.VITE_USE_MOCK_DATA !== undefined 
  ? import.meta.env.VITE_USE_MOCK_DATA === 'true' 
  : true;
export const LOCAL_API_BASE = import.meta.env?.VITE_LOCAL_API_BASE || 'http://localhost:4000';
export const CENTRAL_API_BASE = import.meta.env?.VITE_CENTRAL_API_BASE || 'http://localhost:5000';
export const ML_API_ENDPOINT = import.meta.env?.VITE_ML_API_ENDPOINT || 'https://unpadded-slick-pushiness.ngrok-free.dev/predict';
export const PHC_CODE = import.meta.env?.VITE_PHC_CODE || 'PHC001';
export const PHC_NAME = import.meta.env?.VITE_PHC_NAME || 'PHC Kharadi';

