import AsyncStorage from '@react-native-async-storage/async-storage';
import { appReducer, createDemoState, type AppAction, type AppState } from '@gatsi/domain';
import React, { createContext, useContext, useEffect, useMemo, useReducer, useState } from 'react';

const STORAGE_KEY = 'gatsi-comms-state-v1';

type StoreValue = {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  hydrated: boolean;
};

const StoreContext = createContext<StoreValue | null>(null);

export function AppStoreProvider({ children }: React.PropsWithChildren) {
  const [state, dispatch] = useReducer(appReducer, undefined, createDemoState);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((value) => {
        if (value) {
          const stored = JSON.parse(value) as AppState;
          if (stored.version === 1) {
            dispatch({ type: 'HYDRATE', state: stored });
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
