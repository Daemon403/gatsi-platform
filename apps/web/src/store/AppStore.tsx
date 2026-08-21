import { appReducer, createDemoState, type AppAction, type AppState } from '@gatsi/domain';
import { createContext, useContext, useEffect, useMemo, useReducer } from 'react';

const STORAGE_KEY = 'gatsi-comms-web-state-v1';

function initialState() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const state = JSON.parse(stored) as AppState;
      if (state.version === 1) return state;
    }
  } catch { /* use demo data */ }
  return createDemoState();
}

const StoreContext = createContext<{ state: AppState; dispatch: React.Dispatch<AppAction> } | null>(null);

export function AppStoreProvider({ children }: React.PropsWithChildren) {
  const [state, dispatch] = useReducer(appReducer, undefined, initialState);
  useEffect(() => { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }, [state]);
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useAppStore() {
  const value = useContext(StoreContext);
  if (!value) throw new Error('useAppStore must be used within AppStoreProvider');
  return value;
}
