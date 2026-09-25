// Tests flip globalThis.__deviceOnline to simulate the phone losing its network.
export async function getNetworkStateAsync() {
  const up = globalThis.__deviceOnline !== false;
  return { isConnected: up, isInternetReachable: up };
}
export function addNetworkStateListener() { return { remove() {} }; }
