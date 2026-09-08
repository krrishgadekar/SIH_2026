import { useState, useEffect } from 'react';
import * as Network from 'expo-network';

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [isChecking, setIsChecking] = useState(false);

  const checkNetwork = async () => {
    setIsChecking(true);
    try {
      const state = await Network.getNetworkStateAsync();
      setIsOnline(state.isConnected === true && state.isInternetReachable !== false);
    } catch {
      setIsOnline(false);
    } finally {
      setIsChecking(false);
    }
  };

  useEffect(() => {
    checkNetwork();
    // Poll every 10 seconds
    const interval = setInterval(checkNetwork, 10_000);
    return () => clearInterval(interval);
  }, []);

  return { isOnline, isChecking, recheckNetwork: checkNetwork };
}
