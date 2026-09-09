import { useQueue } from '../context/QueueContext';

/** Convenience wrapper around QueueContext — exposes the most-used queue operations. */
export function useQueueActions() {
  const {
    state,
    enqueue,
    updateItemStatus,
    removeItem,
    setSyncing,
    setSyncDone,
    pendingCount,
  } = useQueue();

  const pendingItems  = state.items.filter((i) => i.syncStatus === 'pending');
  const processedItems = state.items.filter((i) => i.syncStatus === 'synced' || i.syncStatus === 'error');
  const syncedItems   = state.items.filter((i) => i.syncStatus === 'synced');

  return {
    allItems: state.items,
    pendingItems,
    processedItems,
    syncedItems,
    pendingCount,
    isSyncing: state.isSyncing,
    lastSyncAt: state.lastSyncAt,
    enqueue,
    updateItemStatus,
    removeItem,
    setSyncing,
    setSyncDone,
  };
}
