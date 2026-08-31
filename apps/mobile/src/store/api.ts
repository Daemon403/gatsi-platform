import AsyncStorage from '@react-native-async-storage/async-storage';
import { appReducer, DATA_REVISION, type AppAction, type AppState, type DailyOperationsSummary } from '@gatsi/domain';
import { Platform } from 'react-native';

declare const process: { env: { EXPO_PUBLIC_API_URL?: string } };
const host = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
const API_URL = `${process.env.EXPO_PUBLIC_API_URL || `http://${host}:4000`}/api`;
const ACCESS = 'gatsi-access-token';
const REFRESH = 'gatsi-refresh-token';
const SESSION = 'gatsi-session-id';
const STATE_STORAGE = 'gatsi-comms-state-v1';
const CONFIRMED_STORAGE = 'gatsi-comms-confirmed-v1';
const QUEUE_STORAGE = 'gatsi-comms-mobile-sync-v1';
const SYNC_JOURNAL_STORAGE = 'gatsi-comms-mobile-sync-journal-v1';
const MUTATION_FAILURE_STORAGE = 'gatsi-comms-mobile-mutation-failures-v1';
const ONLINE_OPERATION_STORAGE = 'gatsi-comms-mobile-online-operation-v1';
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
let storageLock: Promise<void> = Promise.resolve();
let queueLock: Promise<void> = Promise.resolve();
let storedFailureNotice: StoredMutationFailure | undefined;

const withStorageLock = async <T,>(work: () => Promise<T>) => {
  let result!: T;
  const operation = storageLock.then(async () => { result = await work(); });
  storageLock = operation.then(() => undefined, () => undefined);
  await operation;
  return result;
};

const saveTokens = async (result: AuthResponse) => {
  const access = result.accessToken ?? result.token;
  if (!access) throw new ApiError('The API returned an invalid authentication response.');
  await AsyncStorage.setItem(ACCESS, access);
  if (result.refreshToken) await AsyncStorage.setItem(REFRESH, result.refreshToken);
  else await AsyncStorage.removeItem(REFRESH);
};

const ensureSessionId = async () => {
  let id = await AsyncStorage.getItem(SESSION);
  if (!id && ((await AsyncStorage.getItem(ACCESS)) || (await AsyncStorage.getItem(REFRESH)))) {
    id = mutationId();
    await AsyncStorage.setItem(SESSION, id);
  }
  return id ?? '';
};

const clearSession = () => withStorageLock(async () => {
  sessionEpoch += 1;
  storedFailureNotice = undefined;
  await queueLock;
  await AsyncStorage.multiRemove([ACCESS, REFRESH, SESSION, STATE_STORAGE, CONFIRMED_STORAGE, QUEUE_STORAGE, SYNC_JOURNAL_STORAGE, MUTATION_FAILURE_STORAGE, ONLINE_OPERATION_STORAGE]);
});

const readState = async (key: string): Promise<AppState | undefined> => {
  try {
    const value = await AsyncStorage.getItem(key);
    const state = value ? JSON.parse(value) as AppState : undefined;
    if (state?.version === 1 && state.dataRevision === DATA_REVISION) return state;
    if (value) await AsyncStorage.removeItem(key);
    return undefined;
  } catch {
    return undefined;
  }
};

const writeState = async (key: string, state: AppState) => {
  try { await AsyncStorage.setItem(key, JSON.stringify(state)); } catch { /* queue writes report storage exhaustion explicitly */ }
};

const readCachedState = () => readState(STATE_STORAGE);
const readConfirmedState = () => readState(CONFIRMED_STORAGE);
const persistCachedState = (state: AppState) => writeState(STATE_STORAGE, state);
const persistConfirmedState = async (state: AppState) => {
  try {
    await AsyncStorage.setItem(CONFIRMED_STORAGE, JSON.stringify(state));
  } catch {
    const error = new ApiError('Offline storage is full. Reconnect and sync before recording more work.', 507);
    publish({ phase: 'error', lastError: error.message });
    throw error;
  }
};

const readSyncJournal = async (): Promise<SyncJournal | undefined> => {
  try {
    const value = await AsyncStorage.getItem(SYNC_JOURNAL_STORAGE);
    const journal = value ? JSON.parse(value) as SyncJournal : undefined;
    const validFailure = journal?.failure === undefined || (typeof journal.failure.entryId === 'string'
      && typeof journal.failure.userId === 'string'
      && typeof journal.failure.message === 'string'
      && typeof journal.failure.createdAt === 'string');
    if (journal && typeof journal.entryId === 'string' && typeof journal.userId === 'string' && journal.confirmed?.version === 1 && journal.confirmed.dataRevision === DATA_REVISION && validFailure) return journal;
    if (value) await AsyncStorage.removeItem(SYNC_JOURNAL_STORAGE);
    return undefined;
  } catch {
    return undefined;
  }
};

const persistSyncJournal = async (journal: SyncJournal) => {
  try {
    await AsyncStorage.setItem(SYNC_JOURNAL_STORAGE, JSON.stringify(journal));
  } catch {
    const error = new ApiError('Offline storage is full. Reconnect and sync before recording more work.', 507);
    publish({ phase: 'error', lastError: error.message });
    throw error;
  }
};

const readMutationFailures = async (): Promise<StoredMutationFailure[]> => {
  try {
    const parsed = JSON.parse(await AsyncStorage.getItem(MUTATION_FAILURE_STORAGE) ?? '[]') as StoredMutationFailure[];
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

const persistMutationFailure = async (failure: StoredMutationFailure) => {
  try {
    const next = [failure, ...(await readMutationFailures()).filter((item) => item.entryId !== failure.entryId)].slice(0, 50);
    await AsyncStorage.setItem(MUTATION_FAILURE_STORAGE, JSON.stringify(next));
    storedFailureNotice = failure;
  } catch { /* the authoritative rollback remains safe even if this small notice cannot be retained */ }
};

const mutationFailure = async (entryId: string) => {
  const stored = (await readMutationFailures()).find((failure) => failure.entryId === entryId);
  return stored ? new ApiError(stored.message, stored.status) : undefined;
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

const storedActiveUserId = async () => {
  const [cached, journal, confirmed] = await Promise.all([readCachedState(), readSyncJournal(), readConfirmedState()]);
  return cached?.activeUserId ?? journal?.confirmed.activeUserId ?? confirmed?.activeUserId;
};

const listeners = new Set<(snapshot: SyncSnapshot) => void>();
let snapshot: SyncSnapshot = { phase: 'online', pendingCount: 0 };

const activePendingCount = async (queue?: PendingMutation[], userId?: string | null) => {
  const entries = queue ?? await readQueue();
  const activeUserId = userId === undefined ? await storedActiveUserId() : userId;
  if (!activeUserId) return 0;
  const journal = await readSyncJournal();
  const acknowledgedId = journal?.userId === activeUserId ? journal.entryId : undefined;
  return entries.filter((entry) => entry.userId === activeUserId && entry.id !== acknowledgedId).length + (acknowledgedId ? 1 : 0);
};

const publish = (updates: Partial<SyncSnapshot>) => {
  snapshot = { ...snapshot, ...updates };
  listeners.forEach((listener) => listener(snapshot));
};

const updateQueue = async (update: (queue: PendingMutation[]) => PendingMutation[]) => {
  let updated: PendingMutation[] = [];
  const operation = queueLock.then(async () => {
    updated = update(await readQueue());
    try {
      await AsyncStorage.setItem(QUEUE_STORAGE, JSON.stringify(updated));
    } catch {
      const error = new ApiError('Offline storage is full. Reconnect and sync before recording more work.', 507);
      publish({ phase: 'error', lastError: error.message });
      throw error;
    }
  });
  queueLock = operation.then(() => undefined, () => undefined);
  await operation;
  publish({ pendingCount: await activePendingCount(updated) });
  return updated;
};

void activePendingCount().then((pendingCount) => publish({ pendingCount }));
void Promise.all([storedActiveUserId(), readMutationFailures()]).then(([userId, storedFailures]) => {
  const failure = storedFailures.find((item) => item.userId === userId && !item.dismissed);
  if (failure) {
    storedFailureNotice = failure;
    publish({ phase: 'error', lastError: failure.message });
  }
});

export const getSyncSnapshot = () => snapshot;
export const getPendingActionCount = async (userId?: string) => activePendingCount(undefined, userId);
export const subscribeSync = (listener: (value: SyncSnapshot) => void) => {
  listeners.add(listener);
  listener(snapshot);
  return () => { listeners.delete(listener); };
};
export const setConnectivity = (online: boolean) => publish({ phase: online ? storedFailureNotice ? 'error' : snapshot.pendingCount ? 'syncing' : 'online' : 'offline', lastError: online ? storedFailureNotice?.message : undefined });
export const clearSyncFailure = async () => {
  const wasOffline = snapshot.phase === 'offline';
  try {
    await AsyncStorage.setItem(MUTATION_FAILURE_STORAGE, JSON.stringify((await readMutationFailures()).map((failure) => ({ ...failure, dismissed: true }))));
  } catch { /* retry can still continue */ }
  storedFailureNotice = undefined;
  publish({ phase: wasOffline ? 'offline' : snapshot.pendingCount ? 'syncing' : 'online', lastError: undefined });
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

const applyQueue = (base: AppState, queue: PendingMutation[], acknowledgedId?: string) => queue
  .filter((entry) => entry.userId === base.activeUserId && entry.id !== acknowledgedId)
  .reduce((state, entry) => appReducer(state, entry.action), base);

export const applyPendingActions = async (base: AppState): Promise<AppState> => {
  const [queue, journal] = await Promise.all([readQueue(), readSyncJournal()]);
  return applyQueue(base, queue, journal?.entryId);
};

export const getCachedProjection = async () => {
  const [cached, storedConfirmed, queue, journal] = await Promise.all([readCachedState(), readConfirmedState(), readQueue(), readSyncJournal()]);
  const confirmed = journal?.confirmed ?? storedConfirmed;
  if (!confirmed) return cached;
  return applyQueue(preserveView(confirmed, cached), queue, journal?.entryId);
};

const captureContext = async (providedUserId?: string): Promise<SessionContext | undefined> => {
  const userId = providedUserId ?? await storedActiveUserId() ?? undefined;
  const sessionId = await ensureSessionId();
  return userId && sessionId ? { epoch: sessionEpoch, sessionId, userId } : undefined;
};

const contextIsCurrent = async (context: SessionContext) => context.epoch === sessionEpoch
  && await AsyncStorage.getItem(SESSION) === context.sessionId
  && await storedActiveUserId() === context.userId
  && Boolean((await AsyncStorage.getItem(ACCESS)) || (await AsyncStorage.getItem(REFRESH)));

const staleSession = () => new ApiError('The signed-in account changed while this request was running.', 409);

let refreshFlight: { key: string; promise: Promise<void> } | undefined;

async function raw<T>(path: string, init?: RequestInit, retry = true, expectedSessionId?: string): Promise<T> {
  if (expectedSessionId && await AsyncStorage.getItem(SESSION) !== expectedSessionId) throw staleSession();
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
    if (expectedSessionId && await AsyncStorage.getItem(SESSION) !== expectedSessionId) throw staleSession();
    if (access !== await AsyncStorage.getItem(ACCESS)) return raw<T>(path, init, false, expectedSessionId);
    const refreshToken = await AsyncStorage.getItem(REFRESH);
    const sessionId = await AsyncStorage.getItem(SESSION);
    if (refreshToken && sessionId) {
      const key = `${sessionId}:${refreshToken}`;
      if (!refreshFlight || refreshFlight.key !== key) {
        const promise = raw<AuthResponse>('/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken }) }, false, sessionId)
          .then(async (renewed) => {
            await withStorageLock(async () => {
              if (await AsyncStorage.getItem(SESSION) !== sessionId || await AsyncStorage.getItem(REFRESH) !== refreshToken) throw staleSession();
              await saveTokens(renewed);
            });
          })
          .finally(() => { if (refreshFlight?.key === key) refreshFlight = undefined; });
        refreshFlight = { key, promise };
      }
      try {
        await refreshFlight.promise;
        return raw<T>(path, init, false, expectedSessionId);
      } catch (error) {
        if (isNetworkError(error)) throw error;
        if (await AsyncStorage.getItem(SESSION) === sessionId) await clearSession();
      }
    }
  }

  const body = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new ApiError(body.error || 'Request failed.', response.status);
  return body as T;
}

const acceptRemote = async (remote: AppState, cached: AppState | undefined, context: SessionContext) => withStorageLock(async () => {
    if (!(await contextIsCurrent(context))) throw staleSession();
    if (remote.version !== 1 || remote.dataRevision !== DATA_REVISION) throw new ApiError('The server database has not been upgraded to the current workspace revision.', 503);
    const confirmed = preserveView(remote, cached);
    await persistConfirmedState(confirmed);
    const [queue, journal] = await Promise.all([readQueue(), readSyncJournal()]);
    const projected = applyQueue(confirmed, queue, journal?.entryId);
    await persistCachedState(projected);
    return projected;
  });

const commitQueuedRemote = async (entry: PendingMutation, remote: AppState, cached: AppState | undefined, context: SessionContext, rejection?: ApiError) => withStorageLock(async () => {
  if (!(await contextIsCurrent(context))) throw staleSession();
  if (remote.version !== 1 || remote.dataRevision !== DATA_REVISION) throw new ApiError('The server database has not been upgraded to the current workspace revision.', 503);
  const confirmed = preserveView(remote, cached);
  const failure = rejection ? { entryId: entry.id, userId: context.userId, message: rejection.message, status: rejection.status, createdAt: new Date().toISOString() } : undefined;
  // The journal makes the server acknowledgement and queue removal recoverable
  // if the app process stops between separate AsyncStorage writes.
  await AsyncStorage.removeItem(CONFIRMED_STORAGE);
  await persistSyncJournal({ entryId: entry.id, userId: context.userId, confirmed, ...(failure ? { failure } : {}) });
  const remaining = await updateQueue((queue) => queue.filter((candidate) => candidate.id !== entry.id));
  if (!(await contextIsCurrent(context))) throw staleSession();
  await AsyncStorage.removeItem(STATE_STORAGE);
  await persistConfirmedState(confirmed);
  if (failure) await persistMutationFailure(failure);
  await AsyncStorage.removeItem(SYNC_JOURNAL_STORAGE);
  const projected = applyQueue(confirmed, remaining, entry.id);
  await persistCachedState(projected);
  publish({ pendingCount: await activePendingCount(remaining, context.userId) });
  return projected;
});

const recoverSyncJournal = async (current: AppState | undefined, context: SessionContext) => withStorageLock(async () => {
  const journal = await readSyncJournal();
  if (!journal || journal.userId !== context.userId) return current;
  if (!(await contextIsCurrent(context))) throw staleSession();
  const remaining = await updateQueue((queue) => queue.filter((entry) => entry.id !== journal.entryId));
  if (!(await contextIsCurrent(context))) throw staleSession();
  await AsyncStorage.removeItem(STATE_STORAGE);
  await persistConfirmedState(journal.confirmed);
  if (journal.failure) await persistMutationFailure(journal.failure);
  await AsyncStorage.removeItem(SYNC_JOURNAL_STORAGE);
  const projected = applyQueue(journal.confirmed, remaining, journal.entryId);
  await persistCachedState(projected);
  publish({ pendingCount: await activePendingCount(remaining, context.userId) });
  return projected;
});

const sendAction = (entry: PendingMutation, context: SessionContext) => raw<AppState>('/actions', {
  method: 'POST',
  headers: { 'x-idempotency-key': entry.id },
  body: JSON.stringify(entry.action),
}, true, context.sessionId);

const failures = new Map<string, ApiError>();
const syncFlights = new Map<string, Promise<AppState | undefined>>();

async function synchronize(context: SessionContext): Promise<AppState | undefined> {
  let current = await getCachedProjection() ?? await readCachedState();
  if (!(await contextIsCurrent(context))) return current;
  current = await recoverSyncJournal(current, context);
  // A background retry must not make newly recorded work wait for its network
  // timeout when the API is already known to be unavailable.
  if (snapshot.phase !== 'offline') publish({ phase: 'syncing', lastError: undefined });
  let lastError: string | undefined;

  while (await contextIsCurrent(context)) {
    const entry = (await readQueue()).find((candidate) => candidate.userId === context.userId);
    if (!entry) break;
    try {
      const remote = await sendAction(entry, context);
      if (!(await contextIsCurrent(context))) throw staleSession();
      current = await commitQueuedRemote(entry, remote, current, context);
    } catch (error) {
      const apiError = error instanceof ApiError ? error : new ApiError('The queued action could not be synchronized.');
      if (!(await contextIsCurrent(context))) return readCachedState();
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

      try {
        const remote = await raw<AppState>('/state', undefined, true, context.sessionId);
        if (!(await contextIsCurrent(context))) throw staleSession();
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
  if (await contextIsCurrent(context)) {
    const retainedError = lastError ?? (storedFailureNotice?.userId === context.userId ? storedFailureNotice.message : undefined);
    publish({ phase: retainedError ? 'error' : 'online', pendingCount: await activePendingCount(undefined, context.userId), lastError: retainedError });
  }
  return current;
}

export async function syncPendingActions(): Promise<AppState | undefined> {
  const context = await captureContext();
  if (!context) return readCachedState();
  const flightKey = `${context.userId}:${context.sessionId}`;
  const existing = syncFlights.get(flightKey);
  if (existing) return existing;
  const promise = synchronize(context).finally(() => { if (syncFlights.get(flightKey) === promise) syncFlights.delete(flightKey); });
  syncFlights.set(flightKey, promise);
  return promise;
}

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

const removeOnlineOperation = (id: string) => withStorageLock(async () => {
  try {
    const value = await AsyncStorage.getItem(ONLINE_OPERATION_STORAGE);
    const current = value ? JSON.parse(value) as OnlineOperation : undefined;
    if (current?.id === id) await AsyncStorage.removeItem(ONLINE_OPERATION_STORAGE);
  } catch { /* an invalid record will be replaced by the next operation */ }
});

const onlineOperation = async (action: AppAction) => {
  const identity = credentialIdentity(action);
  if (!identity) return { id: mutationId(), action, remove: async () => undefined };
  return withStorageLock(async () => {
    try {
      const value = await AsyncStorage.getItem(ONLINE_OPERATION_STORAGE);
      const previous = value ? JSON.parse(value) as OnlineOperation : undefined;
      if (previous && previous.identity === identity && Date.now() - Date.parse(previous.createdAt) <= ONLINE_OPERATION_TTL_MS) {
        return {
          id: previous.id,
          action: restoreOnlinePassword(previous.action, action),
          remove: () => removeOnlineOperation(previous.id),
        };
      }
    } catch { /* create a fresh operation below */ }
    const operation: OnlineOperation = { id: mutationId(), identity, action: stripOnlinePassword(action), createdAt: new Date().toISOString() };
    await AsyncStorage.setItem(ONLINE_OPERATION_STORAGE, JSON.stringify(operation));
    return { id: operation.id, action, remove: () => removeOnlineOperation(operation.id) };
  });
};

export async function apiAction(action: AppAction, optimisticBase?: AppState): Promise<AppState> {
  const cached = optimisticBase ?? await getCachedProjection() ?? await readCachedState();
  const userId = cached?.activeUserId;
  const context = await captureContext(userId ?? undefined);
  if (!cached || !userId || !context) {
    return raw<AppState>('/actions', { method: 'POST', headers: { 'x-idempotency-key': mutationId() }, body: JSON.stringify(action) });
  }

  if (!canQueueOffline(action)) {
    if (snapshot.phase === 'offline') {
      publish({ phase: 'offline', lastError: undefined });
      throw new ApiError('This account or settings change requires an internet connection.', undefined, true);
    }
    if ((await getPendingActionCount(userId)) > 0) {
      await syncPendingActions();
      if ((await getPendingActionCount(userId)) > 0) throw new ApiError('Reconnect and sync saved work before changing account or workspace settings.', undefined, true);
    }
    if (!(await contextIsCurrent(context))) throw staleSession();
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
      const result = await acceptRemote(remote, cached, context);
      publish({ phase: 'online', lastError: undefined });
      return result;
    } catch (error) {
      const apiError = error instanceof ApiError ? error : new ApiError('The change could not be saved.');
      if (operation && !apiError.network && apiError.status !== undefined && apiError.status < 500) await operation.remove();
      if (await contextIsCurrent(context)) {
        const transient = apiError.status === 408 || apiError.status === 429 || (apiError.status !== undefined && apiError.status >= 500);
        publish({ phase: apiError.network ? 'offline' : transient ? 'error' : 'online', lastError: transient ? apiError.message : undefined });
      }
      if (apiError.network) throw new ApiError('This account or settings change requires an internet connection.', undefined, true);
      throw apiError;
    }
  }

  const entry: PendingMutation = { id: mutationId(), userId, action: withoutQueuedCredentials(action), createdAt: new Date().toISOString() };
  const optimistic = await withStorageLock(async () => {
    if (!(await contextIsCurrent(context))) throw staleSession();
    const [queue, journal, storedConfirmed] = await Promise.all([readQueue(), readSyncJournal(), readConfirmedState()]);
    const confirmedBeforeQueue = journal?.confirmed ?? storedConfirmed;
    if (!confirmedBeforeQueue && !queue.some((candidate) => candidate.userId === userId)) await persistConfirmedState(cached);
    const updated = await updateQueue((current) => {
      const pending = current.filter((candidate) => candidate.userId === userId && candidate.id !== journal?.entryId).length
        + (journal?.userId === userId ? 1 : 0);
      if (pending >= MAX_PENDING_ACTIONS) throw new ApiError('The offline queue is full. Reconnect before recording more work.');
      return [...current, entry];
    });
    const confirmed = journal?.confirmed ?? await readConfirmedState();
    const next = confirmed ? applyQueue(preserveView(confirmed, cached), updated, journal?.entryId) : appReducer(cached, entry.action);
    await persistCachedState(next);
    return next;
  });

  if (snapshot.phase === 'offline') {
    publish({ phase: 'offline', lastError: undefined });
    return optimistic;
  }

  const result = await syncPendingActions() ?? optimistic;
  const failure = failures.get(entry.id) ?? await mutationFailure(entry.id);
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
  await withStorageLock(async () => {
    sessionEpoch += 1;
    storedFailureNotice = undefined;
    await AsyncStorage.multiRemove([STATE_STORAGE, CONFIRMED_STORAGE, QUEUE_STORAGE, SYNC_JOURNAL_STORAGE, MUTATION_FAILURE_STORAGE, ONLINE_OPERATION_STORAGE]);
    await AsyncStorage.setItem(SESSION, mutationId());
    await saveTokens(result);
    await persistConfirmedState(remote);
    await persistCachedState(remote);
  });
  const context = await captureContext(remote.activeUserId ?? undefined);
  await withStorageLock(async () => {
    if (!context || !(await contextIsCurrent(context))) throw staleSession();
    await persistConfirmedState(remote);
    await persistCachedState(remote);
  });
  publish({ phase: 'online', pendingCount: 0, lastError: undefined });
  return remote;
}

export const apiLogout = async () => {
  const access = await AsyncStorage.getItem(ACCESS);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const request = access ? fetch(`${API_URL}/auth/logout`, {
    method: 'POST',
    signal: controller.signal,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${access}` },
  }).catch(() => undefined) : undefined;
  await clearSession();
  publish({ phase: 'online', pendingCount: 0, lastError: undefined });
  try { await request; } catch { /* local logout still succeeds offline */ } finally { clearTimeout(timeout); }
};

export const apiState = async () => {
  const cached = await readCachedState();
  const context = await captureContext();
  if (!context) throw new ApiError('Sign in is required.', 401);
  const remote = await raw<AppState>('/state', undefined, true, context.sessionId);
  return acceptRemote(remote, cached, context);
};
export const hasApiSession = async () => Boolean(await ensureSessionId() && ((await AsyncStorage.getItem(ACCESS)) || (await AsyncStorage.getItem(REFRESH))));
export const apiRequestPasswordReset = (identifier: string) => raw<{ ok: boolean; debugToken?: string }>('/auth/password-reset/request', { method: 'POST', body: JSON.stringify({ identifier }) }, false);
export const apiConfirmPasswordReset = (token: string, newPassword: string) => raw<{ ok: boolean }>('/auth/password-reset/confirm', { method: 'POST', body: JSON.stringify({ token, newPassword }) }, false);
export const apiConfirmVerification = (token: string) => raw<{ ok: boolean }>('/auth/verification/confirm', { method: 'POST', body: JSON.stringify({ token }) }, false);
export const apiChangePassword = async (currentPassword: string, newPassword: string) => {
  const context = await captureContext();
  return raw<{ ok: boolean }>('/account/password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }, true, context?.sessionId);
};
export const apiVerifyCustomer = async (userId: string) => {
  const cached = await readCachedState();
  const context = await captureContext();
  if (!context) throw new ApiError('Sign in is required.', 401);
  const remote = await raw<AppState>('/admin/customers/verify', { method: 'POST', body: JSON.stringify({ userId }) }, true, context.sessionId);
  return acceptRemote(remote, cached, context);
};
export type OperationsSummariesResponse = { items: DailyOperationsSummary[] };
export type GenerateOperationsSummaryResponse = { summary: DailyOperationsSummary };
export const apiOperationsSummaries = async () => {
  const context = await captureContext();
  return raw<OperationsSummariesResponse>('/admin/operations-summaries', undefined, true, context?.sessionId);
};
export const apiGenerateOperationsSummary = async (date?: string) => {
  const context = await captureContext();
  return raw<GenerateOperationsSummaryResponse>('/admin/operations-summaries/generate', { method: 'POST', body: JSON.stringify(date ? { date } : {}) }, true, context?.sessionId);
};
