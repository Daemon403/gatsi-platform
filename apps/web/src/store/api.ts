import { appReducer, DATA_REVISION, type AppAction, type AppState, type DailyOperationsSummary } from '@gatsi/domain';

const API_ORIGIN = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? 'http://localhost:4000' : '');
const API_URL = `${API_ORIGIN.replace(/\/$/, '')}/api`;
const ACCESS = 'gatsi-access-token';
const REFRESH = 'gatsi-refresh-token';
const SESSION = 'gatsi-session-id';
const STATE_STORAGE = 'gatsi-comms-web-state-v1';
const CONFIRMED_STORAGE = 'gatsi-comms-web-confirmed-v1';
const QUEUE_STORAGE = 'gatsi-comms-web-sync-v1';
const SYNC_JOURNAL_STORAGE = 'gatsi-comms-web-sync-journal-v1';
const MUTATION_FAILURE_STORAGE = 'gatsi-comms-web-mutation-failures-v1';
const ONLINE_OPERATION_STORAGE = 'gatsi-comms-web-online-operation-v1';
const MAX_PENDING_ACTIONS = 250;
const REQUEST_TIMEOUT_MS = 12_000;
const ONLINE_OPERATION_TTL_MS = 24 * 60 * 60 * 1000;
const MUTATION_FAILURE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type AuthResponse = { accessToken?: string; refreshToken?: string; token?: string; state: AppState };
type PendingMutation = { id: string; userId: string; action: AppAction; createdAt: string };
type StoredMutationFailure = { entryId: string; userId: string; message: string; status?: number; createdAt: string; dismissed?: boolean };
type SyncJournal = { entryId: string; userId: string; confirmed: AppState; failure?: StoredMutationFailure };
type OnlineOperation = { id: string; identity: string; action: AppAction; createdAt: string };
type SessionContext = { epoch: number; sessionId: string; userId: string };
export type SyncPhase = 'online' | 'offline' | 'syncing' | 'error';
export type SyncSnapshot = { phase: SyncPhase; pendingCount: number; lastError?: string };

export class ApiError extends Error {
  constructor(message: string, public readonly status?: number, public readonly network = false) {
    super(message);
    this.name = 'ApiError';
  }
}

export const isNetworkError = (error: unknown): error is ApiError => error instanceof ApiError && error.network;

const mutationId = () => globalThis.crypto?.randomUUID?.() ?? `offline-${Date.now()}-${Math.random().toString(36).slice(2)}`;
let sessionEpoch = 0;

const saveTokens = (result: AuthResponse) => {
  const access = result.accessToken ?? result.token;
  if (!access) throw new ApiError('The API returned an invalid authentication response.');
  localStorage.setItem(ACCESS, access);
  if (result.refreshToken) localStorage.setItem(REFRESH, result.refreshToken);
  else localStorage.removeItem(REFRESH);
};

const ensureSessionId = () => {
  let id = localStorage.getItem(SESSION);
  if (!id && (localStorage.getItem(ACCESS) || localStorage.getItem(REFRESH))) {
    id = mutationId();
    localStorage.setItem(SESSION, id);
  }
  return id ?? '';
};

const clearSession = () => {
  sessionEpoch += 1;
  localStorage.removeItem(ACCESS);
  localStorage.removeItem(REFRESH);
  localStorage.removeItem(SESSION);
  localStorage.removeItem(STATE_STORAGE);
  localStorage.removeItem(CONFIRMED_STORAGE);
  localStorage.removeItem(QUEUE_STORAGE);
  localStorage.removeItem(SYNC_JOURNAL_STORAGE);
  localStorage.removeItem(MUTATION_FAILURE_STORAGE);
  localStorage.removeItem(ONLINE_OPERATION_STORAGE);
};

const readState = (key: string): AppState | undefined => {
  try {
    const value = localStorage.getItem(key);
    const state = value ? JSON.parse(value) as AppState : undefined;
    if (state?.version === 1 && state.dataRevision === DATA_REVISION) return state;
    if (value) localStorage.removeItem(key);
    return undefined;
  } catch {
    return undefined;
  }
};

const writeState = (key: string, state: AppState) => {
  try { localStorage.setItem(key, JSON.stringify(state)); } catch { /* a queue write reports storage exhaustion explicitly */ }
};

const readCachedState = () => readState(STATE_STORAGE);
const readConfirmedState = () => readState(CONFIRMED_STORAGE);
const persistCachedState = (state: AppState) => writeState(STATE_STORAGE, state);
const persistConfirmedState = (state: AppState) => {
  try { localStorage.setItem(CONFIRMED_STORAGE, JSON.stringify(state)); } catch {
    const error = new ApiError('Offline storage is full. Reconnect and sync before recording more work.', 507);
    publish({ phase: 'error', lastError: error.message });
    throw error;
  }
};

const readSyncJournal = (): SyncJournal | undefined => {
  try {
    const value = localStorage.getItem(SYNC_JOURNAL_STORAGE);
    const journal = value ? JSON.parse(value) as SyncJournal : undefined;
    const validFailure = journal?.failure === undefined || (typeof journal.failure.entryId === 'string'
      && typeof journal.failure.userId === 'string'
      && typeof journal.failure.message === 'string'
      && typeof journal.failure.createdAt === 'string');
    if (journal && typeof journal.entryId === 'string' && typeof journal.userId === 'string' && journal.confirmed?.version === 1 && journal.confirmed.dataRevision === DATA_REVISION && validFailure) return journal;
    if (value) localStorage.removeItem(SYNC_JOURNAL_STORAGE);
    return undefined;
  } catch {
    return undefined;
  }
};

const persistSyncJournal = (journal: SyncJournal) => {
  try { localStorage.setItem(SYNC_JOURNAL_STORAGE, JSON.stringify(journal)); } catch {
    const error = new ApiError('Offline storage is full. Reconnect and sync before recording more work.', 507);
    publish({ phase: 'error', lastError: error.message });
    throw error;
  }
};

const readMutationFailures = (): StoredMutationFailure[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(MUTATION_FAILURE_STORAGE) ?? '[]') as StoredMutationFailure[];
    const cutoff = Date.now() - MUTATION_FAILURE_TTL_MS;
    return Array.isArray(parsed) ? parsed.filter((failure) => failure
      && typeof failure.entryId === 'string'
      && typeof failure.userId === 'string'
      && typeof failure.message === 'string'
      && Date.parse(failure.createdAt) >= cutoff).slice(0, 50) : [];
  } catch {
    return [];
  }
};

const persistMutationFailure = (failure: StoredMutationFailure) => {
  try {
    const next = [failure, ...readMutationFailures().filter((item) => item.entryId !== failure.entryId)].slice(0, 50);
    localStorage.setItem(MUTATION_FAILURE_STORAGE, JSON.stringify(next));
  } catch { /* the authoritative rollback remains safe even if this small notice cannot be retained */ }
};

const mutationFailure = (entryId: string) => {
  const stored = readMutationFailures().find((failure) => failure.entryId === entryId);
  return stored ? new ApiError(stored.message, stored.status) : undefined;
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

const storedActiveUserId = () => readCachedState()?.activeUserId
  ?? readSyncJournal()?.confirmed.activeUserId
  ?? readConfirmedState()?.activeUserId;

const listeners = new Set<(snapshot: SyncSnapshot) => void>();
let snapshot: SyncSnapshot = {
  phase: typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'online',
  pendingCount: 0,
};

const activePendingCount = (queue = readQueue(), userId = storedActiveUserId()) => {
  const journal = readSyncJournal();
  const acknowledgedId = journal && journal.userId === userId ? journal.entryId : undefined;
  return userId
  ? queue.filter((entry) => entry.userId === userId && entry.id !== acknowledgedId).length + (acknowledgedId ? 1 : 0)
  : 0;
};

const publish = (updates: Partial<SyncSnapshot>) => {
  snapshot = { ...snapshot, ...updates, pendingCount: updates.pendingCount ?? activePendingCount() };
  listeners.forEach((listener) => listener(snapshot));
};

type WebLockManager = { request<T>(name: string, callback: () => Promise<T>): Promise<T> };
const withLock = async <T,>(name: string, work: () => Promise<T>): Promise<T> => {
  const locks = (navigator as unknown as { locks?: WebLockManager }).locks;
  return locks ? locks.request<T>(name, work) : work();
};

const updateQueue = (update: (queue: PendingMutation[]) => PendingMutation[]) => withLock('gatsi-offline-queue-write', async () => {
  const updated = update(readQueue());
  try {
    localStorage.setItem(QUEUE_STORAGE, JSON.stringify(updated));
  } catch {
    const error = new ApiError('Offline storage is full. Reconnect and sync before recording more work.', 507);
    publish({ phase: 'error', lastError: error.message });
    throw error;
  }
  publish({ pendingCount: activePendingCount(updated) });
  return updated;
});

snapshot.pendingCount = activePendingCount();
const initialFailure = readMutationFailures().find((failure) => failure.userId === storedActiveUserId() && !failure.dismissed);
if (initialFailure) snapshot = { ...snapshot, phase: 'error', lastError: initialFailure.message };

export const getSyncSnapshot = () => snapshot;
export const getPendingActionCount = (userId = storedActiveUserId()) => activePendingCount(readQueue(), userId);
export const subscribeSync = (listener: (value: SyncSnapshot) => void) => {
  listeners.add(listener);
  listener(snapshot);
  return () => { listeners.delete(listener); };
};
export const setConnectivity = (online: boolean) => {
  const failure = online ? readMutationFailures().find((item) => item.userId === storedActiveUserId() && !item.dismissed) : undefined;
  publish({ phase: online ? failure ? 'error' : activePendingCount() ? 'syncing' : 'online' : 'offline', lastError: failure?.message });
};
export const handleOfflineStorageChange = (key: string | null) => {
  if (key === SESSION) sessionEpoch += 1;
  if (key === QUEUE_STORAGE || key === STATE_STORAGE || key === SYNC_JOURNAL_STORAGE || key === SESSION || key === null) publish({ pendingCount: activePendingCount() });
  if (key === MUTATION_FAILURE_STORAGE || key === null) {
    const failure = readMutationFailures().find((item) => item.userId === storedActiveUserId() && !item.dismissed);
    if (failure) publish({ phase: 'error', lastError: failure.message });
    else if (key === MUTATION_FAILURE_STORAGE) publish({ phase: navigator.onLine === false ? 'offline' : activePendingCount() ? 'syncing' : 'online', lastError: undefined });
  }
};
export const isSessionStorageKey = (key: string | null) => key === SESSION;
export const clearSyncFailure = () => {
  try { localStorage.setItem(MUTATION_FAILURE_STORAGE, JSON.stringify(readMutationFailures().map((failure) => ({ ...failure, dismissed: true })))); } catch { /* retry can still continue */ }
  publish({ phase: navigator.onLine === false ? 'offline' : activePendingCount() ? 'syncing' : 'online', lastError: undefined });
};

const offlineActionTypes = new Set<AppAction['type']>([
  'CREATE_ORDER',
  'CREATE_CUSTOMER_AND_ORDER',
  'CREATE_CUSTOMER',
  'UPDATE_ORDER_STATUS',
  'ADD_PAYMENT',
  'CREATE_PICKUP',
  'ADJUST_INVENTORY',
  'CREATE_CLOTHING_ITEM',
  'ADJUST_CLOTHING_STOCK',
  'RECORD_CLOTHING_SALE',
  'CREATE_BRANCH',
  'CREATE_SERVICE',
]);

export const canQueueOffline = (action: AppAction) => offlineActionTypes.has(action.type);

const withoutQueuedCredentials = (action: AppAction): AppAction => {
  if (action.type === 'CREATE_CUSTOMER') {
    const { password: _password, ...user } = action.user;
    return { ...action, user };
  }
  if (action.type === 'CREATE_CUSTOMER_AND_ORDER') {
    const { password: _password, ...user } = action.user;
    return { ...action, user };
  }
  return action;
};

const preserveView = (remote: AppState, cached?: AppState): AppState => {
  const activeUser = remote.users.find((user) => user.id === remote.activeUserId);
  if (activeUser?.role !== 'admin' || !cached) return remote;
  const branchId = cached.activeBranchId;
  return branchId === 'all' || remote.branches.some((branch) => branch.id === branchId)
    ? { ...remote, activeBranchId: branchId }
    : remote;
};

const applyQueue = (base: AppState, queue = readQueue(), acknowledgedId = readSyncJournal()?.entryId): AppState => queue
  .filter((entry) => entry.userId === base.activeUserId && entry.id !== acknowledgedId)
  .reduce((state, entry) => appReducer(state, entry.action), base);

export const applyPendingActions = (base: AppState): AppState => applyQueue(base);

export const getCachedProjection = () => {
  const cached = readCachedState();
  const journal = readSyncJournal();
  const confirmed = journal?.confirmed ?? readConfirmedState();
  if (!confirmed) return cached;
  return applyQueue(preserveView(confirmed, cached), readQueue(), journal?.entryId);
};

const captureContext = (userId = storedActiveUserId()): SessionContext | undefined => {
  const sessionId = ensureSessionId();
  return userId && sessionId ? { epoch: sessionEpoch, sessionId, userId } : undefined;
};

const contextIsCurrent = (context: SessionContext) => context.epoch === sessionEpoch
  && localStorage.getItem(SESSION) === context.sessionId
  && storedActiveUserId() === context.userId
  && Boolean(localStorage.getItem(ACCESS) || localStorage.getItem(REFRESH));

const staleSession = () => new ApiError('The signed-in account changed while this request was running.', 409);

let refreshFlight: { key: string; promise: Promise<void> } | undefined;

async function raw<T>(path: string, init?: RequestInit, retry = true, expectedSessionId?: string): Promise<T> {
  if (expectedSessionId && localStorage.getItem(SESSION) !== expectedSessionId) throw staleSession();
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
    if (expectedSessionId && localStorage.getItem(SESSION) !== expectedSessionId) throw staleSession();
    if (access !== localStorage.getItem(ACCESS)) return raw<T>(path, init, false, expectedSessionId);
    const refreshToken = localStorage.getItem(REFRESH);
    const sessionId = localStorage.getItem(SESSION);
    if (refreshToken && sessionId) {
      const key = `${sessionId}:${refreshToken}`;
      if (!refreshFlight || refreshFlight.key !== key) {
        const promise = withLock('gatsi-auth-refresh', async () => {
          if (localStorage.getItem(SESSION) !== sessionId) throw staleSession();
          // Another tab may have rotated the token while this tab waited for the lock.
          if (localStorage.getItem(REFRESH) !== refreshToken || localStorage.getItem(ACCESS) !== access) return;
          const renewed = await raw<AuthResponse>('/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken }) }, false, sessionId);
          if (localStorage.getItem(SESSION) !== sessionId || localStorage.getItem(REFRESH) !== refreshToken) throw staleSession();
          saveTokens(renewed);
        })
          .finally(() => { if (refreshFlight?.key === key) refreshFlight = undefined; });
        refreshFlight = { key, promise };
      }
      try {
        const flight = refreshFlight;
        if (!flight) throw new ApiError('The authentication refresh could not be started.', 401);
        await flight.promise;
        return raw<T>(path, init, false, expectedSessionId);
      } catch (error) {
        if (isNetworkError(error)) throw error;
        if (localStorage.getItem(SESSION) === sessionId) clearSession();
      }
    }
  }

  const body = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new ApiError(body.error || 'Request failed.', response.status);
  return body as T;
}

const acceptRemote = (remote: AppState, cached: AppState | undefined, context: SessionContext, queue = readQueue()) => {
  if (!contextIsCurrent(context)) throw staleSession();
  if (remote.version !== 1 || remote.dataRevision !== DATA_REVISION) throw new ApiError('The server database has not been upgraded to the current workspace revision.', 503);
  const confirmed = preserveView(remote, cached);
  persistConfirmedState(confirmed);
  const projected = applyQueue(confirmed, queue);
  persistCachedState(projected);
  return projected;
};

const commitQueuedRemote = async (entry: PendingMutation, remote: AppState, cached: AppState | undefined, context: SessionContext, rejection?: ApiError) => {
  if (!contextIsCurrent(context)) throw staleSession();
  if (remote.version !== 1 || remote.dataRevision !== DATA_REVISION) throw new ApiError('The server database has not been upgraded to the current workspace revision.', 503);
  const confirmed = preserveView(remote, cached);
  const failure = rejection ? { entryId: entry.id, userId: context.userId, message: rejection.message, status: rejection.status, createdAt: new Date().toISOString() } : undefined;
  // One atomic journal value bridges the otherwise unavoidable gap between
  // storing server state and removing its queued mutation.
  localStorage.removeItem(CONFIRMED_STORAGE);
  persistSyncJournal({ entryId: entry.id, userId: context.userId, confirmed, ...(failure ? { failure } : {}) });
  const remaining = await updateQueue((queue) => queue.filter((candidate) => candidate.id !== entry.id));
  if (!contextIsCurrent(context)) throw staleSession();
  localStorage.removeItem(STATE_STORAGE);
  persistConfirmedState(confirmed);
  if (failure) persistMutationFailure(failure);
  localStorage.removeItem(SYNC_JOURNAL_STORAGE);
  const projected = applyQueue(confirmed, remaining, entry.id);
  persistCachedState(projected);
  publish({ pendingCount: activePendingCount(remaining, context.userId) });
  return projected;
};

const recoverSyncJournal = async (current: AppState | undefined, context: SessionContext) => {
  const journal = readSyncJournal();
  if (!journal || journal.userId !== context.userId) return current;
  if (!contextIsCurrent(context)) throw staleSession();
  const remaining = await updateQueue((queue) => queue.filter((entry) => entry.id !== journal.entryId));
  if (!contextIsCurrent(context)) throw staleSession();
  localStorage.removeItem(STATE_STORAGE);
  persistConfirmedState(journal.confirmed);
  if (journal.failure) persistMutationFailure(journal.failure);
  localStorage.removeItem(SYNC_JOURNAL_STORAGE);
  const projected = applyQueue(journal.confirmed, remaining, journal.entryId);
  persistCachedState(projected);
  publish({ pendingCount: activePendingCount(remaining, context.userId) });
  return projected;
};

const sendAction = (entry: PendingMutation, context: SessionContext) => raw<AppState>('/actions', {
  method: 'POST',
  headers: { 'x-idempotency-key': entry.id },
  body: JSON.stringify(entry.action),
}, true, context.sessionId);

const failures = new Map<string, ApiError>();
const syncFlights = new Map<string, Promise<AppState | undefined>>();

async function synchronize(context: SessionContext): Promise<AppState | undefined> {
  let current = getCachedProjection() ?? readCachedState();
  if (!contextIsCurrent(context)) return current;
  current = await recoverSyncJournal(current, context);
  if (navigator.onLine === false) {
    publish({ phase: 'offline', lastError: undefined });
    return current;
  }

  // Keep the known-offline phase during background probes so newly recorded
  // work still returns immediately instead of waiting for the probe timeout.
  if (snapshot.phase !== 'offline') publish({ phase: 'syncing', lastError: undefined });
  let lastError: string | undefined;
  while (contextIsCurrent(context)) {
    const entry = readQueue().find((candidate) => candidate.userId === context.userId);
    if (!entry) break;
    try {
      const remote = await sendAction(entry, context);
      if (!contextIsCurrent(context)) throw staleSession();
      current = await commitQueuedRemote(entry, remote, current, context);
    } catch (error) {
      const apiError = error instanceof ApiError ? error : new ApiError('The queued action could not be synchronized.');
      if (!contextIsCurrent(context)) return readCachedState();
      if (apiError.network) {
        publish({ phase: 'offline', lastError: undefined });
        return current;
      }
      if (apiError.status === 401) {
        publish({ phase: 'error', lastError: apiError.message });
        throw apiError;
      }
      if (apiError.status === 408 || apiError.status === 429 || (apiError.status !== undefined && apiError.status >= 500)) {
        publish({ phase: 'error', lastError: apiError.message });
        return current;
      }
      if (apiError.status === 507) {
        publish({ phase: 'error', lastError: apiError.message });
        return getCachedProjection();
      }

      // Keep the rejected entry until an authoritative refresh succeeds, so its
      // optimistic projection can always be rolled back.
      try {
        const remote = await raw<AppState>('/state', undefined, true, context.sessionId);
        if (!contextIsCurrent(context)) throw staleSession();
        failures.set(entry.id, apiError);
        lastError = apiError.message;
        current = await commitQueuedRemote(entry, remote, current, context, apiError);
      } catch (refreshError) {
        const refreshApiError = refreshError instanceof ApiError ? refreshError : new ApiError('The server state could not be refreshed.');
        publish({ phase: refreshApiError.network ? 'offline' : 'error', lastError: refreshApiError.network ? undefined : refreshApiError.message });
        return current;
      }
    }
  }
  if (contextIsCurrent(context)) {
    const retainedError = lastError ?? readMutationFailures().find((failure) => failure.userId === context.userId && !failure.dismissed)?.message;
    publish({ phase: retainedError ? 'error' : 'online', pendingCount: activePendingCount(readQueue(), context.userId), lastError: retainedError });
  }
  return current;
}

export function syncPendingActions(): Promise<AppState | undefined> {
  const context = captureContext();
  if (!context) return Promise.resolve(readCachedState());
  const flightKey = `${context.userId}:${context.sessionId}`;
  const existing = syncFlights.get(flightKey);
  if (existing) return existing;
  const promise = withLock(`gatsi-offline-sync-${context.userId}`, () => synchronize(context))
    .finally(() => { if (syncFlights.get(flightKey) === promise) syncFlights.delete(flightKey); });
  syncFlights.set(flightKey, promise);
  return promise;
}

const readOnlineOperation = (identity: string): OnlineOperation | undefined => {
  try {
    const value = localStorage.getItem(ONLINE_OPERATION_STORAGE);
    const operation = value ? JSON.parse(value) as OnlineOperation : undefined;
    if (!operation || operation.identity !== identity || Date.now() - Date.parse(operation.createdAt) > ONLINE_OPERATION_TTL_MS) return undefined;
    return operation;
  } catch {
    return undefined;
  }
};

const removeOnlineOperation = (id: string) => withLock('gatsi-online-operation', async () => {
  try {
    const value = localStorage.getItem(ONLINE_OPERATION_STORAGE);
    const current = value ? JSON.parse(value) as OnlineOperation : undefined;
    if (current?.id === id) localStorage.removeItem(ONLINE_OPERATION_STORAGE);
  } catch { /* an invalid record will be replaced by the next operation */ }
});

const credentialIdentity = (action: AppAction) => action.type === 'CREATE_STAFF'
  ? `create-staff:${action.user.username?.trim().toLowerCase() ?? action.user.id}`
  : action.type === 'RESTORE_STAFF' && action.password
    ? `restore-staff:${action.userId}`
    : undefined;

const stripOnlinePassword = (action: AppAction): AppAction => {
  if (action.type === 'CREATE_STAFF') {
    const { password: _password, ...user } = action.user;
    return { ...action, user };
  }
  if (action.type === 'RESTORE_STAFF' && action.password) {
    const { password: _password, ...rest } = action;
    return rest;
  }
  return action;
};

const restoreOnlinePassword = (stored: AppAction, current: AppAction): AppAction => {
  if (stored.type === 'CREATE_STAFF' && current.type === 'CREATE_STAFF') return { ...stored, user: { ...stored.user, password: current.user.password } };
  if (stored.type === 'RESTORE_STAFF' && current.type === 'RESTORE_STAFF') return { ...stored, password: current.password };
  return current;
};

const onlineOperation = async (action: AppAction) => {
  const identity = credentialIdentity(action);
  if (!identity) return { id: mutationId(), action, remove: async () => undefined };
  return withLock('gatsi-online-operation', async () => {
    const previous = readOnlineOperation(identity);
    if (previous) return {
      id: previous.id,
      action: restoreOnlinePassword(previous.action, action),
      remove: () => removeOnlineOperation(previous.id),
    };
    const operation: OnlineOperation = { id: mutationId(), identity, action: stripOnlinePassword(action), createdAt: new Date().toISOString() };
    localStorage.setItem(ONLINE_OPERATION_STORAGE, JSON.stringify(operation));
    return { id: operation.id, action, remove: () => removeOnlineOperation(operation.id) };
  });
};

export async function apiAction(action: AppAction, optimisticBase?: AppState): Promise<AppState> {
  const cached = optimisticBase ?? getCachedProjection() ?? readCachedState();
  const userId = cached?.activeUserId;
  const context = captureContext(userId ?? undefined);
  if (!cached || !userId || !context) {
    return raw<AppState>('/actions', { method: 'POST', headers: { 'x-idempotency-key': mutationId() }, body: JSON.stringify(action) });
  }

  if (!canQueueOffline(action)) {
    if (navigator.onLine === false || snapshot.phase === 'offline') throw new ApiError('This account or settings change requires an internet connection.', undefined, true);
    if (getPendingActionCount(userId) > 0) {
      await syncPendingActions();
      if (getPendingActionCount(userId) > 0) throw new ApiError('Reconnect and sync saved work before changing account or workspace settings.', undefined, true);
    }
    if (!contextIsCurrent(context)) throw staleSession();
    publish({ phase: 'syncing', lastError: undefined });
    let operation: Awaited<ReturnType<typeof onlineOperation>> | undefined;
    try {
      operation = await onlineOperation(action);
      const remote = await raw<AppState>('/actions', {
        method: 'POST',
        headers: { 'x-idempotency-key': operation.id },
        body: JSON.stringify(operation.action),
      }, true, context.sessionId);
      await operation.remove();
      const result = acceptRemote(remote, cached, context);
      publish({ phase: 'online', lastError: undefined });
      return result;
    } catch (error) {
      const apiError = error instanceof ApiError ? error : new ApiError('The change could not be saved.');
      if (operation && !apiError.network && apiError.status !== undefined && apiError.status < 500) await operation.remove();
      if (contextIsCurrent(context)) {
        const transient = apiError.status === 408 || apiError.status === 429 || (apiError.status !== undefined && apiError.status >= 500);
        publish({ phase: apiError.network ? 'offline' : transient ? 'error' : 'online', lastError: transient ? apiError.message : undefined });
      }
      throw apiError;
    }
  }

  const queue = readQueue();
  if (!readConfirmedState() && !queue.some((entry) => entry.userId === userId)) persistConfirmedState(cached);
  const entry: PendingMutation = { id: mutationId(), userId, action: withoutQueuedCredentials(action), createdAt: new Date().toISOString() };
  const updated = await updateQueue((current) => {
    if (!contextIsCurrent(context)) throw staleSession();
    if (current.filter((candidate) => candidate.userId === userId).length >= MAX_PENDING_ACTIONS) throw new ApiError('The offline queue is full. Reconnect before recording more work.');
    return [...current, entry];
  });
  if (!contextIsCurrent(context)) throw staleSession();
  const confirmed = readConfirmedState();
  const optimistic = confirmed ? applyQueue(preserveView(confirmed, cached), updated) : appReducer(cached, entry.action);
  persistCachedState(optimistic);
  if (navigator.onLine === false || snapshot.phase === 'offline') {
    publish({ phase: 'offline', lastError: undefined });
    return optimistic;
  }

  const result = await syncPendingActions() ?? optimistic;
  const failure = failures.get(entry.id) ?? mutationFailure(entry.id);
  if (failure) {
    failures.delete(entry.id);
    publish({ phase: 'error', lastError: failure.message });
    throw failure;
  }
  return result;
}

export async function apiLogin(username: string, password: string) {
  const result = await raw<AuthResponse>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }, false);
  const remote = result.state;
  if (remote.version !== 1 || remote.dataRevision !== DATA_REVISION) throw new ApiError('The server database has not been upgraded to the current workspace revision.', 503);
  sessionEpoch += 1;
  localStorage.removeItem(STATE_STORAGE);
  localStorage.removeItem(CONFIRMED_STORAGE);
  localStorage.removeItem(QUEUE_STORAGE);
  localStorage.removeItem(SYNC_JOURNAL_STORAGE);
  localStorage.removeItem(MUTATION_FAILURE_STORAGE);
  localStorage.removeItem(ONLINE_OPERATION_STORAGE);
  localStorage.setItem(SESSION, mutationId());
  saveTokens(result);
  const context = captureContext(remote.activeUserId ?? undefined);
  persistConfirmedState(remote);
  persistCachedState(remote);
  if (!context || !contextIsCurrent(context)) throw staleSession();
  persistConfirmedState(remote);
  persistCachedState(remote);
  publish({ phase: 'online', pendingCount: 0, lastError: undefined });
  return remote;
}

export const apiLogout = async () => {
  const access = localStorage.getItem(ACCESS);
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const request = access ? fetch(`${API_URL}/auth/logout`, {
    method: 'POST',
    signal: controller.signal,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${access}` },
  }) : undefined;
  // Clear immediately so closing the app during a slow/offline logout cannot
  // restore the previous workspace on the next launch.
  clearSession();
  publish({ phase: navigator.onLine === false ? 'offline' : 'online', pendingCount: 0, lastError: undefined });
  try { await request; } catch { /* local logout must still succeed offline */ } finally { window.clearTimeout(timeout); }
};

export const apiState = async () => {
  const cached = readCachedState();
  const context = captureContext();
  if (!context) throw new ApiError('Sign in is required.', 401);
  const remote = await raw<AppState>('/state', undefined, true, context.sessionId);
  return acceptRemote(remote, cached, context);
};
export const hasApiSession = () => Boolean(ensureSessionId() && (localStorage.getItem(ACCESS) || localStorage.getItem(REFRESH)));
export const apiRequestPasswordReset = (identifier: string) => raw<{ ok: boolean; debugToken?: string }>('/auth/password-reset/request', { method: 'POST', body: JSON.stringify({ identifier }) }, false);
export const apiConfirmPasswordReset = (token: string, newPassword: string) => raw<{ ok: boolean }>('/auth/password-reset/confirm', { method: 'POST', body: JSON.stringify({ token, newPassword }) }, false);
export const apiConfirmVerification = (token: string) => raw<{ ok: boolean }>('/auth/verification/confirm', { method: 'POST', body: JSON.stringify({ token }) }, false);
export const apiChangePassword = (currentPassword: string, newPassword: string) => {
  const context = captureContext();
  return raw<{ ok: boolean }>('/account/password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }, true, context?.sessionId);
};
export const apiVerifyCustomer = async (userId: string) => {
  const cached = readCachedState();
  const context = captureContext();
  if (!context) throw new ApiError('Sign in is required.', 401);
  const remote = await raw<AppState>('/admin/customers/verify', { method: 'POST', body: JSON.stringify({ userId }) }, true, context.sessionId);
  return acceptRemote(remote, cached, context);
};
export const apiOperationsSummaries = () => {
  const context = captureContext();
  return raw<{ items: DailyOperationsSummary[] }>('/admin/operations-summaries', undefined, true, context?.sessionId);
};
export const apiGenerateOperationsSummary = () => {
  const context = captureContext();
  return raw<{ summary: DailyOperationsSummary }>('/admin/operations-summaries/generate', { method: 'POST', body: '{}' }, true, context?.sessionId);
};
