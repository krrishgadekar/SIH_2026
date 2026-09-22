// Role destinations. Both default to the existing local frontends; set the
// VITE_* variables to point a deployed build somewhere else.
export const ROLE_URLS = {
  ophthalmologist: import.meta.env.VITE_OPHTHALMOLOGIST_URL || 'http://localhost:5173/',
  nurse: import.meta.env.VITE_NURSE_URL || 'http://localhost:5174/',
};
