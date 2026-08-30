import { appReducer, createDemoState, type AppAction, type AppState } from '@gatsi/domain';
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ApiError, apiAction, apiLogout, apiState, applyPendingActions, getPendingActionCount, getSyncSnapshot, hasApiSession, isNetworkError, setConnectivity, subscribeSync, syncPendingActions, type SyncSnapshot } from './api';

const STORAGE_KEY = 'gatsi-comms-web-state-v1';
const withoutPasswords = (state: AppState): AppState => ({ ...state, users: state.users.map(({ password: _password, ...user }) => user) });

function initialState() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const state = JSON.parse(stored) as AppState;
      if (state.version === 1) return withoutPasswords(state);
    }
  } catch { /* use demo data */ }
  return withoutPasswords(createDemoState());
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

const localOnly = new Set<AppAction['type']>(['HYDRATE', 'LOGIN', 'LOGOUT', 'SET_BRANCH', 'RESET_DEMO']);
const containsCredentials = (action: AppAction) => action.type === 'CREATE_CUSTOMER'
  || action.type === 'CREATE_CUSTOMER_AND_ORDER'
  || action.type === 'CREATE_STAFF'
  || (action.type === 'RESTORE_STAFF' && Boolean(action.password));

export function AppStoreProvider({ children }: React.PropsWithChildren) {
  const [state, localDispatch] = useReducer(appReducer, undefined, initialState);
  const stateRef = useRef(state);
  const [sync, setSync] = useState(getSyncSnapshot);

  const hydrate = useCallback((remote: AppState) => {
    const next = preserveBranch(remote, stateRef.current);
    stateRef.current = next;
    localDispatch({ type: 'HYDRATE', state: next });
  }, []);

  const reconcile = useCallback(async () => {
    if (!hasApiSession()) {
      if (stateRef.current.activeUserId) {
        stateRef.current = appReducer(stateRef.current, { type: 'LOGOUT' });
        localDispatch({ type: 'LOGOUT' });
      }
      return;
    }
    try {
      const pending = getPendingActionCount(stateRef.current.activeUserId ?? undefined);
      if (pending) {
        const synced = await syncPendingActions();
        if (synced) hydrate(synced);
      } else {
        const remote = await apiState();
        hydrate(applyPendingActions(preserveBranch(remote, stateRef.current)));
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
    if (!hasApiSession()) return;
    void apiAction(action, previous).then(hydrate).catch(() => void reconcile());
  }, [hydrate, reconcile]);

  useEffect(() => subscribeSync(setSync), []);
  useEffect(() => {
    const online = () => { setConnectivity(true); void reconcile(); };
    const offline = () => setConnectivity(false);
    const visible = () => { if (document.visibilityState === 'visible' && navigator.onLine) void reconcile(); };
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    document.addEventListener('visibilitychange', visible);
    const timer = window.setInterval(() => { if (getSyncSnapshot().phase === 'offline' || getSyncSnapshot().pendingCount) void reconcile(); }, 30_000);
    void reconcile();
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
      document.removeEventListener('visibilitychange', visible);
      window.clearInterval(timer);
    };
  }, [reconcile]);
  useEffect(() => { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }, [state]);
  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { if (state.activeUserId) void reconcile(); }, [state.activeUserId, reconcile]);
  const value = useMemo(() => ({ state, dispatch, sync, syncNow: reconcile }), [state, dispatch, sync, reconcile]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useAppStore() {
  const value = useContext(StoreContext);
  if (!value) throw new Error('useAppStore must be used within AppStoreProvider');
  return value;
}
