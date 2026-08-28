import { statusSequence } from './data';
import type { AppNotification, AppState, Order, OrderStatus, Role, User } from './types';

export const money = (value: number) =>
  new Intl.NumberFormat('en-ZW', { style: 'currency', currency: 'USD' }).format(value);

export const shortDate = (value: string) =>
  new Intl.DateTimeFormat('en-ZW', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));

export const dateTime = (value: string) =>
  new Intl.DateTimeFormat('en-ZW', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));

export const makeId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export type AuthenticationResult = { ok: true; userId: string } | { ok: false; error: string };

export const authenticateUser = (state: AppState, username: string, password: string): AuthenticationResult => {
  const normalized = username.trim().toLowerCase();
  if (!normalized || !password) return { ok: false, error: 'Enter your username and password.' };
  const user = state.users.find((item) => item.username?.toLowerCase() === normalized);
  if (!user || user.password !== password) return { ok: false, error: 'Username or password is incorrect.' };
  if (user.active === false) return { ok: false, error: 'This account has been disabled. Contact an administrator.' };
  if (user.verified !== true) return { ok: false, error: 'This account has not been verified. Contact an administrator.' };
  return { ok: true, userId: user.id };
};

const seededAccounts: Record<string, { username: string; password: string }> = {
  'user-admin': { username: 'Promise', password: 'GATSI' },
  'user-mary': { username: 'Mary', password: 'DUBE' },
  'user-tinashe': { username: 'Tinashe', password: 'MOYO' },
  'user-rudo-staff': { username: 'RudoStaff', password: 'NYATHI' },
  'user-customer': { username: 'Rudo', password: 'CHIKOWORE' },
};

export const normalizeNotifications = (value: unknown): AppNotification[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is AppNotification => Boolean(
      item
      && typeof item === 'object'
      && typeof (item as AppNotification).id === 'string'
      && typeof (item as AppNotification).title === 'string'
      && typeof (item as AppNotification).message === 'string'
      && typeof (item as AppNotification).at === 'string',
    ))
    .map((item) => ({
      ...item,
      recipientUserIds: Array.isArray(item.recipientUserIds) ? item.recipientUserIds.filter((id): id is string => typeof id === 'string') : [],
      readByUserIds: Array.isArray(item.readByUserIds) ? item.readByUserIds.filter((id): id is string => typeof id === 'string') : [],
    }));
};

export const migrateAccounts = (state: AppState): AppState => ({
  ...state,
  notifications: normalizeNotifications(state.notifications),
  clothingItems: Array.isArray(state.clothingItems) ? state.clothingItems : [],
  clothingSales: Array.isArray(state.clothingSales) ? state.clothingSales : [],
  users: state.users.map((user) => {
    const seeded = seededAccounts[user.id];
    return { ...user, username: user.username ?? seeded?.username, password: user.password ?? seeded?.password, verified: user.verified ?? Boolean(user.username || seeded), active: user.active ?? true };
  }),
});

export const orderSubtotal = (order: Order) => order.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
export const orderTotal = (order: Order) => Math.max(0, orderSubtotal(order) - order.discount + order.deliveryFee);
export const orderPaid = (state: AppState, orderId: string) => state.payments.filter((payment) => payment.orderId === orderId).reduce((sum, payment) => sum + payment.amount, 0);
export const orderBalance = (state: AppState, order: Order) => Math.max(0, orderTotal(order) - orderPaid(state, order.id));

export const orderProgress = (status: OrderStatus) => {
  if (status === 'cancelled') return 0;
  const index = statusSequence.indexOf(status);
  return index < 0 ? 0 : Math.round((index / (statusSequence.length - 1)) * 100);
};

export const nextStatus = (status: OrderStatus): OrderStatus | null => {
  if (status === 'cancelled' || status === 'collected') return null;
  const index = statusSequence.indexOf(status);
  return statusSequence[index + 1] ?? null;
};

export const getActiveUser = (state: AppState) => state.users.find((user) => user.id === state.activeUserId) ?? null;
export const getActiveBranch = (state: AppState) => state.branches.find((branch) => branch.id === state.activeBranchId) ?? state.branches[0];

export const visibleOrders = (state: AppState) => {
  const user = getActiveUser(state);
  if (!user) return [];
  if (user.role === 'customer') return state.orders.filter((order) => order.customerId === user.customerId);
  if (user.role === 'staff') return state.orders.filter((order) => user.branchIds.includes(order.branchId));
  return state.activeBranchId === 'all' ? state.orders : state.orders.filter((order) => order.branchId === state.activeBranchId);
};

export const notificationRelatesToUser = (state: AppState, notification: AppNotification, user: User) => {
  if (user.role === 'admin') return true;
  if (notification.recipientUserIds?.includes(user.id) || notification.actorUserId === user.id) return true;
  if (user.role === 'customer') return Boolean(user.customerId && notification.customerId === user.customerId);
  if (user.role === 'staff' && notification.orderId) {
    return state.orders.some((order) => order.id === notification.orderId && order.assignedStaffId === user.id);
  }
  return false;
};

export const visibleNotifications = (state: AppState) => {
  const user = getActiveUser(state);
  if (!user) return [];
  return (state.notifications ?? [])
    .filter((notification) => notificationRelatesToUser(state, notification, user))
    .sort((left, right) => new Date(right.at).getTime() - new Date(left.at).getTime());
};

export const unreadNotifications = (state: AppState) => {
  const user = getActiveUser(state);
  if (!user) return [];
  return visibleNotifications(state).filter((notification) => !notification.readByUserIds?.includes(user.id));
};

export const roleHomeTitle = (role: Role) => ({ admin: 'Business overview', staff: 'Today’s workspace', customer: 'Your garment care' })[role];

export const branchRevenue = (state: AppState, branchId: string) => {
  const orderIds = new Set(state.orders.filter((order) => branchId === 'all' || order.branchId === branchId).map((order) => order.id));
  return state.payments.filter((payment) => orderIds.has(payment.orderId)).reduce((sum, payment) => sum + payment.amount, 0);
};

export const orderNumber = (state: AppState) => {
  const next = 1060 + state.orders.length;
  return `GAT-2608-${next}`;
};
