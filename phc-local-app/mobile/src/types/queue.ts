import { ScreeningSession } from './screening';

export type SyncStatus = 'pending' | 'uploading' | 'synced' | 'error';

export interface QueueItem {
  id: string;                    // same as ScreeningSession.id
  session: ScreeningSession;
  syncStatus: SyncStatus;
  retryCount: number;
  lastAttemptAt: string | null;  // ISO timestamp
  errorMessage: string | null;
}

export interface QueueState {
  items: QueueItem[];
  isSyncing: boolean;
  lastSyncAt: string | null;
}
