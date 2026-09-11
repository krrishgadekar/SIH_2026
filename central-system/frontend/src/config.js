// false = attempt the real central backend first (localhost:5000), falling
// back to mock data silently on any error, timeout, empty/unexpected shape —
// see centralApiClient.js. Set back to true to force pure offline mock
// rehearsal (skips every network call entirely). Admin screens stay
// mock-only regardless of this flag (out of scope for today).
export const USE_MOCK_DATA = false;
export const CENTRAL_API_BASE = 'http://localhost:5000';
