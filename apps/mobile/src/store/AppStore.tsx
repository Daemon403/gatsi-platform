import AsyncStorage from '@react-native-async-storage/async-storage';
import { appReducer, createDemoState, migrateAccounts, type AppAction, type AppState } from '@gatsi/domain';
import React, { createContext, useContext, useEffect, useMemo, useReducer, useState } from 'react';
import { apiAction, apiLogout, apiState, hasApiSession } from './api';

const STORAGE_KEY = 'gatsi-comms-state-v1';

type StoreValue = {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  hydrated: boolean;
};

const StoreContext = createContext<StoreValue | null>(null);

export function AppStoreProvider({ children }: React.PropsWithChildren) {
  const [state, localDispatch] = useReducer(appReducer, undefined, createDemoState);
  const dispatch: React.Dispatch<AppAction> = (action) => { localDispatch(action); if (action.type === 'LOGOUT') { void apiLogout(); return; } if (!['HYDRATE', 'LOGIN', 'SET_BRANCH', 'RESET_DEMO'].includes(action.type)) void hasApiSession().then((active) => active ? apiAction(action).then((remote) => localDispatch({ type: 'HYDRATE', state: remote })) : undefined).catch(() => undefined); };
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    Promise.all([hasApiSession(), AsyncStorage.getItem(STORAGE_KEY)])
      .then(async ([active, value]) => {
        if (active) { try { localDispatch({ type: 'HYDRATE', state: await apiState() }); return; } catch { await apiLogout(); } }
        if (value) {
          const stored = JSON.parse(value) as AppState;
          if (stored.version === 1) {
            localDispatch({ type: 'HYDRATE', state: migrateAccounts(stored) });
          }
        }
      })
      .catch(() => undefined)
      .finally(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (hydrated) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => undefined);
  }, [hydrated, state]);

  const value = useMemo(() => ({ state, dispatch, hydrated }), [state, hydrated]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useAppStore() {
  const value = useContext(StoreContext);
  if (!value) throw new Error('useAppStore must be used within AppStoreProvider');
  return value;
}
