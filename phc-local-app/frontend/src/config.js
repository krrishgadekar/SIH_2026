// false = attempt the real local backend first (localhost:4000), falling back
// to mock data/scenarios silently on any error — see localApiClient.js and
// CaptureScreen.jsx. Set back to true to force pure offline mock rehearsal
// (skips every network call entirely).
export const USE_MOCK_DATA = false;
export const LOCAL_API_BASE = 'http://localhost:4000';
export const CENTRAL_API_BASE = 'http://localhost:5000';
export const ML_API_ENDPOINT = 'https://unpadded-slick-pushiness.ngrok-free.dev/predict';
export const PHC_CODE = 'PHC001';
export const PHC_NAME = 'PHC Kharadi';
