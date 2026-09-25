import React, {
  createContext,
  useContext,
  useReducer,
  ReactNode,
  useEffect,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueueItem, QueueState } from '../types/queue';
import { ScreeningSession } from '../types/screening';
import { 
  initDb, 
  loadQueueFromDb, 
  saveSessionToDb, 
  updateQueueItemStatusDb, 
  removeSessionFromDb 
} from '../db/database';

const LAST_SYNC_KEY = '@retina_saarthi_last_sync';

// ── Reducer ────────────────────────────────────────────────────────────────

type Action =
  | { type: 'LOAD_QUEUE'; payload: { items: QueueItem[]; lastSyncAt: string | null } }
  | { type: 'ADD_ITEM'; payload: QueueItem }
  | { type: 'UPDATE_ITEM'; payload: { id: string; updates: Partial<QueueItem> } }
  | { type: 'REMOVE_ITEM'; payload: string }
  | { type: 'SET_SYNCING'; payload: boolean }
  | { type: 'SYNC_DONE'; payload: string }; // ISO timestamp

const initialState: QueueState = {
  items: [],
  isSyncing: false,
  lastSyncAt: null,
};

function reducer(state: QueueState, action: Action): QueueState {
  switch (action.type) {
    case 'LOAD_QUEUE':
      return { ...state, items: action.payload.items, lastSyncAt: action.payload.lastSyncAt };
    case 'ADD_ITEM':
      return { ...state, items: [...state.items, action.payload] };
    case 'UPDATE_ITEM':
      return {
        ...state,
        items: state.items.map((item) =>
          item.id === action.payload.id
            ? { ...item, ...action.payload.updates }
            : item,
        ),
      };
    case 'REMOVE_ITEM':
      return { ...state, items: state.items.filter((i) => i.id !== action.payload) };
    case 'SET_SYNCING':
      return { ...state, isSyncing: action.payload };
    case 'SYNC_DONE':
      return { ...state, isSyncing: false, lastSyncAt: action.payload };
    default:
      return state;
  }
}

// ── Context ────────────────────────────────────────────────────────────────

interface QueueContextValue {
  state: QueueState;
  enqueue: (session: ScreeningSession) => Promise<void>;
  updateItemStatus: (id: string, updates: Partial<QueueItem>) => Promise<void>;
  removeItem: (id: string) => Promise<void>;
  setSyncing: (isSyncing: boolean) => void;
  setSyncDone: (timestamp: string) => void;
  pendingCount: number;
}

const QueueContext = createContext<QueueContextValue | undefined>(undefined);

export function QueueProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Load persisted queue and lastSyncAt on mount
  useEffect(() => {
    (async () => {
      try {
        await initDb();
        const items = await loadQueueFromDb();
        const rawLastSync = await AsyncStorage.getItem(LAST_SYNC_KEY);

        dispatch({
          type: 'LOAD_QUEUE',
          payload: { items, lastSyncAt: rawLastSync || null },
        });
      } catch (e) {
        console.error('Failed to load queue from sqlite:', e);
      }
    })();
  }, []);

  const enqueue = async (session: ScreeningSession) => {
    const item: QueueItem = {
      id: session.id,
      session,
      syncStatus: 'pending',
      retryCount: 0,
      lastAttemptAt: null,
      errorMessage: null,
    };
    await saveSessionToDb(session, item);
    dispatch({ type: 'ADD_ITEM', payload: item });
  };

  const updateItemStatus = async (id: string, updates: Partial<QueueItem>) => {
    await updateQueueItemStatusDb(id, updates);
    dispatch({ type: 'UPDATE_ITEM', payload: { id, updates } });
  };

  const removeItem = async (id: string) => {
    await removeSessionFromDb(id);
    dispatch({ type: 'REMOVE_ITEM', payload: id });
  };

  const setSyncing = (isSyncing: boolean) => {
    dispatch({ type: 'SET_SYNCING', payload: isSyncing });
  };

  const setSyncDone = (timestamp: string) => {
    dispatch({ type: 'SYNC_DONE', payload: timestamp });
    AsyncStorage.setItem(LAST_SYNC_KEY, timestamp).catch(() => {});
  };

  const pendingCount = state.items.filter((i) => i.syncStatus === 'pending').length;

  return (
    <QueueContext.Provider
      value={{
        state,
        enqueue,
        updateItemStatus,
        removeItem,
        setSyncing,
        setSyncDone,
        pendingCount,
      }}
    >
      {children}
    </QueueContext.Provider>
  );
}

export function useQueue(): QueueContextValue {
  const ctx = useContext(QueueContext);
  if (!ctx) throw new Error('useQueue must be used within QueueProvider');
  return ctx;
}
