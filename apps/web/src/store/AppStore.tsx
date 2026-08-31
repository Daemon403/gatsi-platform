import { appReducer, createEmptyState, DATA_REVISION, type AppAction, type AppState } from '@gatsi/domain';
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ApiError, apiAction, apiLogout, apiState, canQueueOffline, clearSyncFailure, getCachedProjection, getPendingActionCount, getSyncSnapshot, handleOfflineStorageChange, hasApiSession, isNetworkError, isSessionStorageKey, setConnectivity, subscribeSync, syncPendingActions, type SyncSnapshot } from './api';

const STORAGE_KEY = 'gatsi-comms-web-state-v1';
const withoutPasswords = (state: AppState): AppState => ({ ...state, users: state.users.map(({ password: _password, ...user }) => user) });

function initialState() {
  const stored = hasApiSession() ? getCachedProjection() : undefined;
  if (stored?.version === 1 && stored.dataRevision === DATA_REVISION) return withoutPasswords(stored);
  return createEmptyState();
}

type StoreValue = { state: AppState; dispatch: React.Dispatch<AppAction>; sync: SyncSnapshot; syncNow: () => Promise<void> };
const StoreContext = createContext<StoreValue | null>(null);

const preserveBranch = (remote: AppState, local: AppState) => {
  const user = remote.users.find((entry) => entry.id === remote.activeUserId);
  if (user?.role !== 'admin') return remote;
  return local.activeBranchId === 'all' || remote.branches.some((branch) => branch.id === local.activeBranchId)
    ? { ...remote, activeBranchId: local.activeBranchId }
    : remote;
};

const localOnly = new Set<AppAction['type']>(['HYDRATE', 'LOGIN', 'LOGOUT', 'SET_BRANCH', 'CLEAR_LOCAL_STATE']);

export function AppStoreProvider({ children }: React.PropsWithChildren) {
  const [state, localDispatch] = useReducer(appReducer, undefined, initialState);
  const stateRef = useRef(state);
  const sessionEpochRef = useRef(0);
  const [sync, setSync] = useState(getSyncSnapshot);

  const hydrate = useCallback((remote: AppState, expected?: { userId: string; epoch: number }) => {
    if (expected && (sessionEpochRef.current !== expected.epoch || stateRef.current.activeUserId !== expected.userId)) return;
    if (stateRef.current.activeUserId && remote.activeUserId !== stateRef.current.activeUserId) return;
    const next = preserveBranch(remote, stateRef.current);
    stateRef.current = next;
    localDispatch({ type: 'HYDRATE', state: next });
  }, []);

  const resetWorkspace = useCallback(() => {
    sessionEpochRef.current += 1;
    const empty = createEmptyState();
    stateRef.current = empty;
    localDispatch({ type: 'HYDRATE', state: empty });
  }, []);

  const reconcile = useCallback(async () => {
    if (!hasApiSession()) {
      if (stateRef.current.activeUserId) resetWorkspace();
      return;
    }
    const userId = stateRef.current.activeUserId;
    if (!userId) return;
    const expected = { userId, epoch: sessionEpochRef.current };
    try {
      const pending = getPendingActionCount(userId);
      if (pending) {
        const synced = await syncPendingActions();
        if (synced) hydrate(synced, expected);
      } else {
        const remote = await apiState();
        hydrate(remote, expected);
        setConnectivity(true);
      }
    } catch (error) {
      if (isNetworkError(error)) return;
      if (error instanceof ApiError && error.status === 401) {
        resetWorkspace();
        void apiLogout();
      }
    }
  }, [hydrate, resetWorkspace]);

  const dispatch: React.Dispatch<AppAction> = useCallback((action) => {
    if (action.type === 'LOGOUT' || action.type === 'CLEAR_LOCAL_STATE') {
      resetWorkspace();
      void apiLogout();
      return;
    }
    if (localOnly.has(action.type)) {
      if (action.type === 'HYDRATE' && action.state.activeUserId && (!hasApiSession() || (stateRef.current.activeUserId && action.state.activeUserId !== stateRef.current.activeUserId))) return;
      stateRef.current = appReducer(stateRef.current, action);
      localDispatch(action);
      return;
    }
    const previous = stateRef.current;
    const expected = previous.activeUserId ? { userId: previous.activeUserId, epoch: sessionEpochRef.current } : undefined;
    if (canQueueOffline(action)) {
      stateRef.current = appReducer(stateRef.current, action);
      localDispatch(action);
    }
    if (!hasApiSession()) return;
    void apiAction(action, previous)
      .then((remote) => expected ? hydrate(remote, expected) : undefined)
      .catch((error) => {
        if (canQueueOffline(action)) {
          const projection = getCachedProjection();
          if (projection && expected) hydrate(projection, expected);
        }
        if (error instanceof ApiError && error.status === 401) void reconcile();
      });
  }, [hydrate, reconcile, resetWorkspace]);

  useEffect(() => subscribeSync(setSync), []);
  useEffect(() => {
    const online = () => { setConnectivity(true); void reconcile(); };
    const offline = () => setConnectivity(false);
    const visible = () => { if (document.visibilityState === 'visible' && navigator.onLine) void reconcile(); };
    const storage = (event: StorageEvent) => {
      handleOfflineStorageChange(event.key);
      const projection = getCachedProjection();
      if (isSessionStorageKey(event.key)) {
        sessionEpochRef.current += 1;
        if (!hasApiSession() || !projection) resetWorkspace();
        else if (projection) {
          const next = withoutPasswords(projection);
          stateRef.current = next;
          localDispatch({ type: 'HYDRATE', state: next });
        }
      } else if (projection?.activeUserId === stateRef.current.activeUserId) {
        hydrate(projection, projection.activeUserId ? { userId: projection.activeUserId, epoch: sessionEpochRef.current } : undefined);
      } else if (!stateRef.current.activeUserId && projection && hasApiSession()) {
        hydrate(projection);
      }
      void reconcile();
    };
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    window.addEventListener('storage', storage);
    document.addEventListener('visibilitychange', visible);
    const timer = window.setInterval(() => { if (getSyncSnapshot().phase === 'offline' || getSyncSnapshot().pendingCount) void reconcile(); }, 30_000);
    void reconcile();
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
      window.removeEventListener('storage', storage);
      document.removeEventListener('visibilitychange', visible);
      window.clearInterval(timer);
    };
  }, [hydrate, reconcile, resetWorkspace]);
  useEffect(() => { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }, [state]);
  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { if (state.activeUserId) void reconcile(); }, [state.activeUserId, reconcile]);
  const syncNow = useCallback(async () => { clearSyncFailure(); await reconcile(); }, [reconcile]);
  const value = useMemo(() => ({ state, dispatch, sync, syncNow }), [state, dispatch, sync, syncNow]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useAppStore() {
  const value = useContext(StoreContext);
  if (!value) throw new Error('useAppStore must be used within AppStoreProvider');
  return value;
}
