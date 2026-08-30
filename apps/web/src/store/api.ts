import { appReducer, type AppAction, type AppState, type DailyOperationsSummary } from '@gatsi/domain';

const API_ORIGIN = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? 'http://localhost:4000' : '');
const API_URL = `${API_ORIGIN.replace(/\/$/, '')}/api`;
const ACCESS = 'gatsi-access-token';
const REFRESH = 'gatsi-refresh-token';
const STATE_STORAGE = 'gatsi-comms-web-state-v1';
const QUEUE_STORAGE = 'gatsi-comms-web-sync-v1';
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

const save = (result: AuthResponse) => {
  const access = result.accessToken ?? result.token;
  if (!access) throw new ApiError('The API returned an invalid authentication response.');
  localStorage.setItem(ACCESS, access);
  if (result.refreshToken) localStorage.setItem(REFRESH, result.refreshToken);
  else localStorage.removeItem(REFRESH);
};

const clear = () => {
  localStorage.removeItem(ACCESS);
  localStorage.removeItem(REFRESH);
};

const readCachedState = (): AppState | undefined => {
  try {
    const value = localStorage.getItem(STATE_STORAGE);
    return value ? JSON.parse(value) as AppState : undefined;
  } catch {
    return undefined;
  }
};

const persistCachedState = (state: AppState) => {
  try { localStorage.setItem(STATE_STORAGE, JSON.stringify(state)); } catch { /* the provider will surface storage failures on its next write */ }
};

const readQueue = (): PendingMutation[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(QUEUE_STORAGE) ?? '[]') as PendingMutation[];
    return Array.isArray(parsed)
      ? parsed.filter((entry) => entry && typeof entry.id === 'string' && typeof entry.userId === 'string' && typeof entry.action?.type === 'string')
      : [];
  } catch {
    return [];
  }
};

const listeners = new Set<(snapshot: SyncSnapshot) => void>();
let snapshot: SyncSnapshot = {
  phase: typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'online',
  pendingCount: 0,
};

const activePendingCount = (queue = readQueue()) => {
  const userId = readCachedState()?.activeUserId;
  return userId ? queue.filter((entry) => entry.userId === userId).length : 0;
};

const publish = (updates: Partial<SyncSnapshot>) => {
  snapshot = { ...snapshot, ...updates, pendingCount: updates.pendingCount ?? activePendingCount() };
  listeners.forEach((listener) => listener(snapshot));
};

const writeQueue = (queue: PendingMutation[]) => {
  try {
    localStorage.setItem(QUEUE_STORAGE, JSON.stringify(queue));
  } catch {
    throw new ApiError('Offline storage is full. Reconnect and sync before recording more work.');
  }
  publish({ pendingCount: activePendingCount(queue) });
};

snapshot.pendingCount = activePendingCount();

export const getSyncSnapshot = () => snapshot;
export const getPendingActionCount = (userId = readCachedState()?.activeUserId) => userId ? readQueue().filter((entry) => entry.userId === userId).length : 0;
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

export const applyPendingActions = (base: AppState): AppState => readQueue()
  .filter((entry) => entry.userId === base.activeUserId)
  .reduce((state, entry) => appReducer(state, entry.action), base);

async function raw<T>(path: string, init?: RequestInit, retry = true): Promise<T> {
  const access = localStorage.getItem(ACCESS);
  let response: Response;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
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
    window.clearTimeout(timeout);
  }

  if (response.status === 401 && retry && path !== '/auth/refresh') {
    const refreshToken = localStorage.getItem(REFRESH);
    if (refreshToken) {
      try {
        const renewed = await raw<AuthResponse>('/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken }) }, false);
        save(renewed);
        return raw<T>(path, init, false);
      } catch (error) {
        if (isNetworkError(error)) throw error;
        clear();
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
  let current = readCachedState();
  const userId = current?.activeUserId;
  if (!userId || !hasApiSession()) return current;
  if (navigator.onLine === false) {
    publish({ phase: 'offline', lastError: undefined });
    return current;
  }

  publish({ phase: 'syncing', lastError: undefined });
  let lastError: string | undefined;
  while (true) {
    const queue = readQueue();
    const entry = queue.find((candidate) => candidate.userId === userId);
    if (!entry) break;
    try {
      const remote = await sendAction(entry);
      const remaining = readQueue().filter((candidate) => candidate.id !== entry.id);
      writeQueue(remaining);
      current = applyPendingActions(preserveView(remote, current));
      persistCachedState(current);
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
      const remaining = readQueue().filter((candidate) => candidate.id !== entry.id);
      writeQueue(remaining);
      try {
        const remote = await apiState();
        current = applyPendingActions(preserveView(remote, current));
        persistCachedState(current);
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
  const cached = optimisticBase ?? readCachedState();
  const userId = cached?.activeUserId;
  if (!userId || !hasApiSession()) {
    return raw<AppState>('/actions', { method: 'POST', headers: { 'x-idempotency-key': mutationId() }, body: JSON.stringify(action) });
  }

  if (requiresOnline(action)) {
    if (navigator.onLine === false) throw new ApiError('Creating or restoring login accounts requires an internet connection.', undefined, true);
    if (activePendingCount() > 0) {
      await syncPendingActions();
      if (activePendingCount() > 0) throw new ApiError('Reconnect and sync saved work before changing login accounts.', undefined, true);
    }
    publish({ phase: 'syncing', lastError: undefined });
    const remote = preserveView(await raw<AppState>('/actions', { method: 'POST', headers: { 'x-idempotency-key': mutationId() }, body: JSON.stringify(action) }), cached);
    persistCachedState(remote);
    publish({ phase: 'online', lastError: undefined });
    return remote;
  }

  const queue = readQueue();
  if (queue.filter((entry) => entry.userId === userId).length >= MAX_PENDING_ACTIONS) throw new ApiError('The offline queue is full. Reconnect before recording more work.');
  const entry: PendingMutation = { id: mutationId(), userId, action, createdAt: new Date().toISOString() };
  writeQueue([...queue, entry]);
  const optimistic = appReducer(cached, action);
  persistCachedState(optimistic);
  if (navigator.onLine === false) {
    publish({ phase: 'offline', lastError: undefined });
    return optimistic;
  }

  let result = await syncPendingActions() ?? optimistic;
  if (readQueue().some((candidate) => candidate.id === entry.id) && getSyncSnapshot().phase === 'online') result = await syncPendingActions() ?? result;
  const failure = failures.get(entry.id);
  if (failure) {
    failures.delete(entry.id);
    throw failure;
  }
  return result;
}

export async function apiLogin(username: string, password: string, localState?: AppState) {
  const result = await raw<AuthResponse>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }, false);
  save(result);
  if (localState && result.state.users.find((user) => user.id === result.state.activeUserId)?.role === 'admin' && !result.state.services.length) {
    try { return await raw<AppState>('/bootstrap', { method: 'POST', body: JSON.stringify(localState) }); } catch { /* backend may already be initialized */ }
  }
  persistCachedState(result.state);
  publish({ phase: 'online', pendingCount: getPendingActionCount(result.state.activeUserId ?? undefined), lastError: undefined });
  return result.state;
}

export const apiLogout = async () => {
  try { await raw('/auth/logout', { method: 'POST' }); } catch { /* local logout must still succeed offline */ } finally { clear(); }
};
export const apiState = () => raw<AppState>('/state');
export const hasApiSession = () => Boolean(localStorage.getItem(ACCESS) || localStorage.getItem(REFRESH));
export const apiRequestPasswordReset = (identifier: string) => raw<{ ok: boolean; debugToken?: string }>('/auth/password-reset/request', { method: 'POST', body: JSON.stringify({ identifier }) }, false);
export const apiConfirmPasswordReset = (token: string, newPassword: string) => raw<{ ok: boolean }>('/auth/password-reset/confirm', { method: 'POST', body: JSON.stringify({ token, newPassword }) }, false);
export const apiChangePassword = (currentPassword: string, newPassword: string) => raw<{ ok: boolean }>('/account/password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) });
export const apiConfirmVerification = (token: string) => raw<{ ok: boolean }>('/auth/verification/confirm', { method: 'POST', body: JSON.stringify({ token }) }, false);
export const apiVerifyCustomer = (userId: string) => raw<AppState>('/admin/customers/verify', { method: 'POST', body: JSON.stringify({ userId }) });
export const apiOperationsSummaries = () => raw<{ items: DailyOperationsSummary[] }>('/admin/operations-summaries');
export const apiGenerateOperationsSummary = () => raw<{ summary: DailyOperationsSummary }>('/admin/operations-summaries/generate', { method: 'POST', body: '{}' });
