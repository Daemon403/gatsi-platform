import AsyncStorage from '@react-native-async-storage/async-storage';
import { appReducer, type AppAction, type AppState, type DailyOperationsSummary } from '@gatsi/domain';
import { Platform } from 'react-native';

declare const process: { env: { EXPO_PUBLIC_API_URL?: string } };
const host = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
const API_URL = `${process.env.EXPO_PUBLIC_API_URL || `http://${host}:4000`}/api`;
const ACCESS = 'gatsi-access-token';
const REFRESH = 'gatsi-refresh-token';
const STATE_STORAGE = 'gatsi-comms-state-v1';
const QUEUE_STORAGE = 'gatsi-comms-mobile-sync-v1';
const MAX_PENDING_ACTIONS = 250;
const REQUEST_TIMEOUT_MS = 12_000;

type AuthResponse = { accessToken?: string; refreshToken?: string; token?: string; state: AppState };
type PendingMutation = { id: string; userId: string; action: AppAction; createdAt: string };
export type SyncPhase = 'online' | 'offline' | 'syncing' | 'error';
export type SyncSnapshot = { phase: SyncPhase; pendingCount: number; lastError?: string };

export class ApiError extends Error {
  constructor(message: string, public readonly status?: number, public readonly network = false) {
    super(message);
    this.name = 'ApiError';
  }
}

export const isNetworkError = (error: unknown): error is ApiError => error instanceof ApiError && error.network;

const save = async (result: AuthResponse) => {
  const access = result.accessToken ?? result.token;
  if (!access) throw new ApiError('The API returned an invalid authentication response.');
  await AsyncStorage.setItem(ACCESS, access);
  if (result.refreshToken) await AsyncStorage.setItem(REFRESH, result.refreshToken);
  else await AsyncStorage.removeItem(REFRESH);
};

const clear = () => AsyncStorage.multiRemove([ACCESS, REFRESH]);

const readCachedState = async (): Promise<AppState | undefined> => {
  try {
    const value = await AsyncStorage.getItem(STATE_STORAGE);
    return value ? JSON.parse(value) as AppState : undefined;
  } catch {
    return undefined;
  }
};

const persistCachedState = async (state: AppState) => {
  try { await AsyncStorage.setItem(STATE_STORAGE, JSON.stringify(state)); } catch { /* provider persistence will retry */ }
};

const readQueue = async (): Promise<PendingMutation[]> => {
  try {
    const parsed = JSON.parse(await AsyncStorage.getItem(QUEUE_STORAGE) ?? '[]') as PendingMutation[];
    return Array.isArray(parsed)
      ? parsed.filter((entry) => entry && typeof entry.id === 'string' && typeof entry.userId === 'string' && typeof entry.action?.type === 'string')
      : [];
  } catch {
    return [];
  }
};

const listeners = new Set<(snapshot: SyncSnapshot) => void>();
let snapshot: SyncSnapshot = { phase: 'online', pendingCount: 0 };

const activePendingCount = async (providedQueue?: PendingMutation[]) => {
  const queue = providedQueue ?? await readQueue();
  const userId = (await readCachedState())?.activeUserId;
  return userId ? queue.filter((entry) => entry.userId === userId).length : 0;
};

const publish = (updates: Partial<SyncSnapshot>) => {
  snapshot = { ...snapshot, ...updates };
  listeners.forEach((listener) => listener(snapshot));
};

let queueLock: Promise<void> = Promise.resolve();
const updateQueue = async (update: (queue: PendingMutation[]) => PendingMutation[]) => {
  let updated: PendingMutation[] = [];
  const operation = queueLock.then(async () => {
    updated = update(await readQueue());
    try {
      await AsyncStorage.setItem(QUEUE_STORAGE, JSON.stringify(updated));
    } catch {
      throw new ApiError('Offline storage is full. Reconnect and sync before recording more work.');
    }
  });
  queueLock = operation.then(() => undefined, () => undefined);
  await operation;
  publish({ pendingCount: await activePendingCount(updated) });
  return updated;
};

void activePendingCount().then((pendingCount) => publish({ pendingCount }));

export const getSyncSnapshot = () => snapshot;
export const getPendingActionCount = async (providedUserId?: string) => {
  const userId = providedUserId ?? (await readCachedState())?.activeUserId;
  return userId ? (await readQueue()).filter((entry) => entry.userId === userId).length : 0;
};
export const subscribeSync = (listener: (value: SyncSnapshot) => void) => {
  listeners.add(listener);
  listener(snapshot);
  return () => { listeners.delete(listener); };
};
export const setConnectivity = (online: boolean) => publish({ phase: online ? (snapshot.pendingCount ? 'syncing' : 'online') : 'offline', lastError: undefined });

const mutationId = () => globalThis.crypto?.randomUUID?.() ?? `offline-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const requiresOnline = (action: AppAction) => action.type === 'CREATE_CUSTOMER'
  || action.type === 'CREATE_CUSTOMER_AND_ORDER'
  || action.type === 'CREATE_STAFF'
  || (action.type === 'RESTORE_STAFF' && Boolean(action.password));

const preserveView = (remote: AppState, cached?: AppState): AppState => {
  const activeUser = remote.users.find((user) => user.id === remote.activeUserId);
  if (activeUser?.role !== 'admin' || !cached) return remote;
  const branchId = cached.activeBranchId;
  return branchId === 'all' || remote.branches.some((branch) => branch.id === branchId)
    ? { ...remote, activeBranchId: branchId }
    : remote;
};

export async function applyPendingActions(base: AppState): Promise<AppState> {
  return (await readQueue())
    .filter((entry) => entry.userId === base.activeUserId)
    .reduce((state, entry) => appReducer(state, entry.action), base);
}

async function raw<T>(path: string, init?: RequestInit, retry = true): Promise<T> {
  const access = await AsyncStorage.getItem(ACCESS);
  let response: Response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      signal: init?.signal ?? controller.signal,
      headers: {
        'content-type': 'application/json',
        ...(access ? { authorization: `Bearer ${access}` } : {}),
        ...init?.headers,
      },
    });
  } catch {
    publish({ phase: 'offline', lastError: undefined });
    throw new ApiError(`Cannot reach the Gatsi API at ${API_URL}. Your saved work will sync when the connection returns.`, undefined, true);
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 401 && retry && path !== '/auth/refresh') {
    const refreshToken = await AsyncStorage.getItem(REFRESH);
    if (refreshToken) {
      try {
        const renewed = await raw<AuthResponse>('/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken }) }, false);
        await save(renewed);
        return raw<T>(path, init, false);
      } catch (error) {
        if (isNetworkError(error)) throw error;
        await clear();
      }
    }
  }

  const body = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new ApiError(body.error || 'Request failed.', response.status);
  return body as T;
}

const sendAction = (entry: PendingMutation) => raw<AppState>('/actions', {
  method: 'POST',
  headers: { 'x-idempotency-key': entry.id },
  body: JSON.stringify(entry.action),
});

const failures = new Map<string, ApiError>();
let syncPromise: Promise<AppState | undefined> | null = null;

async function synchronize(): Promise<AppState | undefined> {
  let current = await readCachedState();
  const userId = current?.activeUserId;
  if (!userId || !(await hasApiSession())) return current;

  publish({ phase: 'syncing', lastError: undefined });
  let lastError: string | undefined;
  while (true) {
    const entry = (await readQueue()).find((candidate) => candidate.userId === userId);
    if (!entry) break;
    try {
      const remote = await sendAction(entry);
      await updateQueue((queue) => queue.filter((candidate) => candidate.id !== entry.id));
      current = await applyPendingActions(preserveView(remote, current));
      await persistCachedState(current);
    } catch (error) {
      const apiError = error instanceof ApiError ? error : new ApiError('The queued action could not be synchronized.');
      if (apiError.network) {
        publish({ phase: 'offline', lastError: undefined });
        return current;
      }
      if (apiError.status === 408 || apiError.status === 429 || (apiError.status !== undefined && apiError.status >= 500)) {
        publish({ phase: 'error', lastError: apiError.message });
        return current;
      }
      failures.set(entry.id, apiError);
      lastError = apiError.message;
      if (apiError.status === 401) {
        publish({ phase: 'error', lastError });
        throw apiError;
      }
      await updateQueue((queue) => queue.filter((candidate) => candidate.id !== entry.id));
      try {
        const remote = await apiState();
        current = await applyPendingActions(preserveView(remote, current));
        await persistCachedState(current);
      } catch (refreshError) {
        if (isNetworkError(refreshError)) {
          publish({ phase: 'offline', lastError });
          return current;
        }
      }
    }
  }
  publish({ phase: lastError ? 'error' : 'online', pendingCount: 0, lastError });
  return current;
}

export function syncPendingActions(): Promise<AppState | undefined> {
  if (!syncPromise) syncPromise = synchronize().finally(() => { syncPromise = null; });
  return syncPromise;
}

export async function apiAction(action: AppAction, optimisticBase?: AppState): Promise<AppState> {
  const cached = optimisticBase ?? await readCachedState();
  const userId = cached?.activeUserId;
  if (!userId || !(await hasApiSession())) {
    return raw<AppState>('/actions', { method: 'POST', headers: { 'x-idempotency-key': mutationId() }, body: JSON.stringify(action) });
  }

  if (requiresOnline(action)) {
    if ((await getPendingActionCount(userId)) > 0) {
      await syncPendingActions();
      if ((await getPendingActionCount(userId)) > 0) throw new ApiError('Reconnect and sync saved work before changing login accounts.', undefined, true);
    }
    publish({ phase: 'syncing', lastError: undefined });
    try {
      const remote = preserveView(await raw<AppState>('/actions', { method: 'POST', headers: { 'x-idempotency-key': mutationId() }, body: JSON.stringify(action) }), cached);
      await persistCachedState(remote);
      publish({ phase: 'online', lastError: undefined });
      return remote;
    } catch (error) {
      if (isNetworkError(error)) throw new ApiError('Creating or restoring login accounts requires an internet connection.', undefined, true);
      throw error;
    }
  }

  const queue = await readQueue();
  if (queue.filter((entry) => entry.userId === userId).length >= MAX_PENDING_ACTIONS) throw new ApiError('The offline queue is full. Reconnect before recording more work.');
  const entry: PendingMutation = { id: mutationId(), userId, action, createdAt: new Date().toISOString() };
  await updateQueue((current) => [...current, entry]);
  const optimistic = appReducer(cached, action);
  await persistCachedState(optimistic);

  let result = await syncPendingActions() ?? optimistic;
  if ((await readQueue()).some((candidate) => candidate.id === entry.id) && getSyncSnapshot().phase === 'online') result = await syncPendingActions() ?? result;
  const failure = failures.get(entry.id);
  if (failure) {
    failures.delete(entry.id);
    throw failure;
  }
  return result;
}

export async function apiLogin(username: string, password: string, localState?: AppState) {
  const result = await raw<AuthResponse>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }, false);
  await save(result);
  if (localState && result.state.users.find((user) => user.id === result.state.activeUserId)?.role === 'admin' && !result.state.services.length) {
    try { return await raw<AppState>('/bootstrap', { method: 'POST', body: JSON.stringify(localState) }); } catch { /* backend may already be initialized */ }
  }
  await persistCachedState(result.state);
  publish({ phase: 'online', pendingCount: await getPendingActionCount(result.state.activeUserId ?? undefined), lastError: undefined });
  return result.state;
}

export const apiLogout = async () => {
  try { await raw('/auth/logout', { method: 'POST' }); } catch { /* local logout still succeeds offline */ } finally { await clear(); }
};
export const apiState = () => raw<AppState>('/state');
export const hasApiSession = async () => Boolean(await AsyncStorage.getItem(ACCESS) || await AsyncStorage.getItem(REFRESH));
export const apiRequestPasswordReset = (identifier: string) => raw<{ ok: boolean; debugToken?: string }>('/auth/password-reset/request', { method: 'POST', body: JSON.stringify({ identifier }) }, false);
export const apiConfirmPasswordReset = (token: string, newPassword: string) => raw<{ ok: boolean }>('/auth/password-reset/confirm', { method: 'POST', body: JSON.stringify({ token, newPassword }) }, false);
export const apiConfirmVerification = (token: string) => raw<{ ok: boolean }>('/auth/verification/confirm', { method: 'POST', body: JSON.stringify({ token }) }, false);
export const apiChangePassword = (currentPassword: string, newPassword: string) => raw<{ ok: boolean }>('/account/password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) });
export const apiVerifyCustomer = (userId: string) => raw<AppState>('/admin/customers/verify', { method: 'POST', body: JSON.stringify({ userId }) });
export type OperationsSummariesResponse = { items: DailyOperationsSummary[] };
export type GenerateOperationsSummaryResponse = { summary: DailyOperationsSummary };
export const apiOperationsSummaries = () => raw<OperationsSummariesResponse>('/admin/operations-summaries');
export const apiGenerateOperationsSummary = (date?: string) => raw<GenerateOperationsSummaryResponse>('/admin/operations-summaries/generate', { method: 'POST', body: JSON.stringify(date ? { date } : {}) });
