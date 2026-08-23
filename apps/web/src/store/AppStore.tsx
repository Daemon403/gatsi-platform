import { appReducer, createDemoState, migrateAccounts, type AppAction, type AppState } from '@gatsi/domain';
import { createContext, useContext, useEffect, useMemo, useReducer } from 'react';
import { apiAction, apiLogout, apiState, hasApiSession } from './api';

const STORAGE_KEY = 'gatsi-comms-web-state-v1';

function initialState() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const state = JSON.parse(stored) as AppState;
      if (state.version === 1) return migrateAccounts(state);
    }
  } catch { /* use demo data */ }
  return createDemoState();
}

const StoreContext = createContext<{ state: AppState; dispatch: React.Dispatch<AppAction> } | null>(null);

export function AppStoreProvider({ children }: React.PropsWithChildren) {
  const [state, localDispatch] = useReducer(appReducer, undefined, initialState);
  const dispatch: React.Dispatch<AppAction> = (action) => {
    localDispatch(action);
    if (action.type === 'LOGOUT') { void apiLogout(); return; }
    if (!['HYDRATE', 'LOGIN', 'SET_BRANCH', 'RESET_DEMO'].includes(action.type) && hasApiSession()) void apiAction(action).then((remote) => localDispatch({ type: 'HYDRATE', state: remote })).catch(() => undefined);
  };
  useEffect(() => { if (hasApiSession()) void apiState().then((remote) => localDispatch({ type: 'HYDRATE', state: remote })).catch(() => void apiLogout()); }, []);
  useEffect(() => { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }, [state]);
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useAppStore() {
  const value = useContext(StoreContext);
  if (!value) throw new Error('useAppStore must be used within AppStoreProvider');
  return value;
}
