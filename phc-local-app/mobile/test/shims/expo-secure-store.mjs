// In-memory stand-in for the OS keystore under Node tests.
const store = new Map();
export const WHEN_UNLOCKED_THIS_DEVICE_ONLY = 'WHEN_UNLOCKED_THIS_DEVICE_ONLY';
export async function getItemAsync(key) { return store.has(key) ? store.get(key) : null; }
export async function setItemAsync(key, value) { store.set(key, String(value)); }
export async function deleteItemAsync(key) { store.delete(key); }
