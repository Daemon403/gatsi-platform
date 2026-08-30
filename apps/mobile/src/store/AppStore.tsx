import AsyncStorage from '@react-native-async-storage/async-storage';
import { appReducer, createDemoState, type AppAction, type AppState } from '@gatsi/domain';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AppState as NativeAppState } from 'react-native';
import { ApiError, apiAction, apiLogout, apiState, applyPendingActions, getPendingActionCount, getSyncSnapshot, hasApiSession, isNetworkError, setConnectivity, subscribeSync, syncPendingActions, type SyncSnapshot } from './api';

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

const localOnly = new Set<AppAction['type']>(['HYDRATE', 'LOGIN', 'LOGOUT', 'SET_BRANCH', 'RESET_DEMO']);
const containsCredentials = (action: AppAction) => action.type === 'CREATE_CUSTOMER'
  || action.type === 'CREATE_CUSTOMER_AND_ORDER'
  || action.type === 'CREATE_STAFF'
  || (action.type === 'RESTORE_STAFF' && Boolean(action.password));

export function AppStoreProvider({ children }: React.PropsWithChildren) {
  const [state, localDispatch] = useReducer(appReducer, undefined, () => withoutPasswords(createDemoState()));
  const stateRef = useRef(state);
  const [hydrated, setHydrated] = useState(false);
  const [sync, setSync] = useState(getSyncSnapshot);

  const hydrate = useCallback((remote: AppState) => {
    const next = preserveBranch(remote, stateRef.current);
    stateRef.current = next;
    localDispatch({ type: 'HYDRATE', state: next });
  }, []);

  const reconcile = useCallback(async () => {
    if (!(await hasApiSession())) {
      if (stateRef.current.activeUserId) {
        stateRef.current = appReducer(stateRef.current, { type: 'LOGOUT' });
        localDispatch({ type: 'LOGOUT' });
      }
      return;
    }
    try {
      const pending = await getPendingActionCount(stateRef.current.activeUserId ?? undefined);
      if (pending) {
        const synced = await syncPendingActions();
        if (synced) hydrate(synced);
      } else {
        const remote = await apiState();
        hydrate(await applyPendingActions(preserveBranch(remote, stateRef.current)));
        setConnectivity(true);
      }
    } catch (error) {
      if (isNetworkError(error)) return;
      if (error instanceof ApiError && error.status === 401) {
        await apiLogout();
        stateRef.current = appReducer(stateRef.current, { type: 'LOGOUT' });
        localDispatch({ type: 'LOGOUT' });
      }
    }
  }, [hydrate]);

  const dispatch: React.Dispatch<AppAction> = useCallback((action) => {
    if (action.type === 'LOGOUT') {
      stateRef.current = appReducer(stateRef.current, action);
      localDispatch(action);
      void apiLogout();
      return;
    }
    if (localOnly.has(action.type)) {
      stateRef.current = appReducer(stateRef.current, action);
      localDispatch(action);
      return;
    }
    const previous = stateRef.current;
    if (!containsCredentials(action)) {
      stateRef.current = appReducer(stateRef.current, action);
      localDispatch(action);
    }
    void hasApiSession().then((active) => active ? apiAction(action, previous).then(hydrate).catch(() => void reconcile()) : undefined);
  }, [hydrate, reconcile]);

  useEffect(() => {
    Promise.all([hasApiSession(), AsyncStorage.getItem(STORAGE_KEY)])
      .then(async ([active, value]) => {
        if (value) {
          const stored = JSON.parse(value) as AppState;
          if (stored.version === 1) {
            const cached = withoutPasswords(stored);
            stateRef.current = cached;
            localDispatch({ type: 'HYDRATE', state: cached });
          }
        }
        if (active) await reconcile();
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

  const value = useMemo(() => ({ state, dispatch, hydrated, sync, syncNow: reconcile }), [state, dispatch, hydrated, sync, reconcile]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useAppStore() {
  const value = useContext(StoreContext);
  if (!value) throw new Error('useAppStore must be used within AppStoreProvider');
  return value;
}
