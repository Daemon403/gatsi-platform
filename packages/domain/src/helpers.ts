import { statusSequence } from './data';
import type { AppState, Order, OrderStatus, Role } from './types';

export const money = (value: number) =>
  new Intl.NumberFormat('en-ZW', { style: 'currency', currency: 'USD' }).format(value);

export const shortDate = (value: string) =>
  new Intl.DateTimeFormat('en-ZW', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));

export const dateTime = (value: string) =>
  new Intl.DateTimeFormat('en-ZW', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));

export const makeId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

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

export const roleHomeTitle = (role: Role) => ({ admin: 'Business overview', staff: 'Today’s workspace', customer: 'Your garment care' })[role];

export const branchRevenue = (state: AppState, branchId: string) => {
  const orderIds = new Set(state.orders.filter((order) => branchId === 'all' || order.branchId === branchId).map((order) => order.id));
  return state.payments.filter((payment) => orderIds.has(payment.orderId)).reduce((sum, payment) => sum + payment.amount, 0);
};

export const orderNumber = (state: AppState) => {
  const next = 1060 + state.orders.length;
  return `GAT-2608-${next}`;
};
