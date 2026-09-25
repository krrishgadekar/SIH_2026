import { useEffect, useState } from 'react';
import { syncManager, SyncSnapshot } from './syncManager';

export function useSync(): SyncSnapshot {
  const [s, setS] = useState<SyncSnapshot>(syncManager.current);
  useEffect(() => syncManager.subscribe(setS), []);
  return s;
}

/** Calls `reload` on mount and whenever the sync manager changes a queue row. */
export function useQueueReload(reload: () => void) {
  useEffect(() => {
    reload();
    return syncManager.onQueueChanged(reload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
