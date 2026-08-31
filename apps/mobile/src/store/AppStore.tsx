import AsyncStorage from '@react-native-async-storage/async-storage';
import { appReducer, createEmptyState, DATA_REVISION, type AppAction, type AppState } from '@gatsi/domain';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AppState as NativeAppState } from 'react-native';
import { ApiError, apiAction, apiLogout, apiState, canQueueOffline, clearSyncFailure, getCachedProjection, getPendingActionCount, getSyncSnapshot, hasApiSession, isNetworkError, setConnectivity, subscribeSync, syncPendingActions, type SyncSnapshot } from './api';

const STORAGE_KEY = 'gatsi-comms-state-v1';
const withoutPasswords = (state: AppState): AppState => ({ ...state, users: state.users.map(({ password: _password, ...user }) => user) });

type StoreValue = {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  hydrated: boolean;
  sync: SyncSnapshot;
  syncNow: () => Promise<void>;
};

const StoreContext = createContext<StoreValue | null>(null);

const preserveBranch = (remote: AppState, local: AppState) => {
  const user = remote.users.find((entry) => entry.id === remote.activeUserId);
  if (user?.role !== 'admin') return remote;
  return local.activeBranchId === 'all' || remote.branches.some((branch) => branch.id === local.activeBranchId)
    ? { ...remote, activeBranchId: local.activeBranchId }
    : remote;
};

const localOnly = new Set<AppAction['type']>(['HYDRATE', 'LOGIN', 'LOGOUT', 'SET_BRANCH']);

export function AppStoreProvider({ children }: React.PropsWithChildren) {
  const [state, localDispatch] = useReducer(appReducer, undefined, createEmptyState);
  const stateRef = useRef(state);
  const sessionEpochRef = useRef(0);
  const [hydrated, setHydrated] = useState(false);
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
    if (!(await hasApiSession())) {
      if (stateRef.current.activeUserId) resetWorkspace();
      return;
    }
    const userId = stateRef.current.activeUserId;
    if (!userId) return;
    const expected = { userId, epoch: sessionEpochRef.current };
    try {
      const pending = await getPendingActionCount(userId);
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
    if (action.type === 'LOGOUT') {
      resetWorkspace();
      void apiLogout();
      return;
    }
    if (action.type === 'CLEAR_LOCAL_STATE') {
      // Clearing the local database cache also ends the device session.
      resetWorkspace();
      void apiLogout();
      return;
    }
    if (localOnly.has(action.type)) {
      if (action.type === 'HYDRATE' && action.state.activeUserId) {
        if (stateRef.current.activeUserId && action.state.activeUserId !== stateRef.current.activeUserId) return;
        if (!stateRef.current.activeUserId) {
          void hasApiSession().then((active) => {
            if (active && !stateRef.current.activeUserId) hydrate(action.state);
          });
          return;
        }
      }
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
    void hasApiSession().then((active) => active ? apiAction(action, previous)
      .then((remote) => expected ? hydrate(remote, expected) : undefined)
      .catch(async (error) => {
        // A permanent server rejection has already restored the confirmed
        // projection. Hydrate that rollback without immediately fetching again
        // and erasing the sync error users need to see.
        const projection = await getCachedProjection();
        if (projection && expected) hydrate(projection, expected);
        if (error instanceof ApiError && error.status === 401) void reconcile();
      }) : undefined);
  }, [hydrate, reconcile, resetWorkspace]);

  useEffect(() => {
    Promise.all([hasApiSession(), getCachedProjection()])
      .then(([active, stored]) => {
        if (active && stored?.version === 1 && stored.dataRevision === DATA_REVISION) {
          const cached = withoutPasswords(stored);
          stateRef.current = cached;
          localDispatch({ type: 'HYDRATE', state: cached });
        }
        setHydrated(true);
        if (active) void reconcile();
      })
      .catch(() => undefined)
      .finally(() => setHydrated(true));
  }, [reconcile]);

  useEffect(() => subscribeSync(setSync), []);
  useEffect(() => {
    const subscription = NativeAppState.addEventListener('change', (next) => { if (next === 'active') void reconcile(); });
    const timer = setInterval(() => { if (getSyncSnapshot().phase === 'offline' || getSyncSnapshot().pendingCount) void reconcile(); }, 30_000);
    return () => { subscription.remove(); clearInterval(timer); };
  }, [reconcile]);

  useEffect(() => {
    if (hydrated) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => undefined);
  }, [hydrated, state]);
  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { if (state.activeUserId) void reconcile(); }, [state.activeUserId, reconcile]);

  const syncNow = useCallback(async () => { await clearSyncFailure(); await reconcile(); }, [reconcile]);
  const value = useMemo(() => ({ state, dispatch, hydrated, sync, syncNow }), [state, dispatch, hydrated, sync, syncNow]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useAppStore() {
  const value = useContext(StoreContext);
  if (!value) throw new Error('useAppStore must be used within AppStoreProvider');
  return value;
}
