import { statusSequence } from './data';
import type { AppNotification, AppState, ClothingItem, ClothingSale, Order, OrderStatus, Payment, ReceiptKind, Role, TransactionReceipt, User } from './types';

export const money = (value: number) =>
  new Intl.NumberFormat('en-ZW', { style: 'currency', currency: 'USD' }).format(value);

export const shortDate = (value: string) =>
  new Intl.DateTimeFormat('en-ZW', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));

export const dateTime = (value: string) =>
  new Intl.DateTimeFormat('en-ZW', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));

export const makeId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

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

export const normalizeClothingSales = (value: unknown): ClothingSale[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is ClothingSale => Boolean(item && typeof item === 'object' && !Array.isArray(item)))
    .map((item) => {
      const legacyItem = item as ClothingSale & { listUnitPrice?: number };
      const legacyUnitPrice = typeof legacyItem.unitPrice === 'number' && Number.isFinite(legacyItem.unitPrice)
        ? legacyItem.unitPrice
        : 0;
      const listUnitPrice = typeof legacyItem.listUnitPrice === 'number' && Number.isFinite(legacyItem.listUnitPrice)
        ? legacyItem.listUnitPrice
        : legacyUnitPrice;
      const paymentMethod = ['cash', 'ecocash', 'card', 'bank_transfer'].includes(legacyItem.paymentMethod)
        ? legacyItem.paymentMethod
        : 'cash';
      return { ...legacyItem, listUnitPrice, unitPrice: legacyUnitPrice, paymentMethod };
    });
};

export const normalizeReceipts = (value: unknown): TransactionReceipt[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is TransactionReceipt => Boolean(
    item
    && typeof item === 'object'
    && typeof (item as TransactionReceipt).id === 'string'
    && typeof (item as TransactionReceipt).number === 'string'
    && ['service', 'store'].includes((item as TransactionReceipt).kind)
    && typeof (item as TransactionReceipt).transactionId === 'string'
    && typeof (item as TransactionReceipt).issuedAt === 'string'
    && Array.isArray((item as TransactionReceipt).lines),
  ));
};

const integerCents = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  const scaled = value * 100;
  const absolute = Math.abs(scaled);
  return Math.sign(scaled) * Math.round(absolute + Number.EPSILON * Math.max(1, absolute));
};

const orderSubtotalCents = (order: Order) => order.items.reduce(
  (sum, item) => sum + integerCents(item.quantity * item.unitPrice),
  0,
);

const orderTotalCents = (order: Order) => Math.max(
  0,
  orderSubtotalCents(order) - integerCents(order.discount) + integerCents(order.deliveryFee),
);

const orderPaidCents = (state: AppState, orderId: string) => state.payments
  .filter((payment) => payment.orderId === orderId)
  .reduce((sum, payment) => sum + integerCents(payment.amount), 0);

export const receiptIdForTransaction = (kind: ReceiptKind, transactionId: string) => `receipt-${kind}-${transactionId}`;

export const receiptNumberForTransaction = (kind: ReceiptKind, transactionId: string) => {
  const compactId = transactionId.replace(/^(payment|clothing-sale)-/i, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
  return `GAT-${kind === 'service' ? 'SVC' : 'STR'}-${compactId.toUpperCase()}`;
};

export const createServiceReceipt = (state: AppState, payment: Payment): TransactionReceipt | null => {
  const order = state.orders.find((item) => item.id === payment.orderId);
  if (!order) return null;
  const branch = state.branches.find((item) => item.id === order.branchId);
  const customer = state.customers.find((item) => item.id === order.customerId);
  const issuer = state.users.find((item) => item.id === payment.receivedByUserId);
  const amountCents = integerCents(payment.amount);
  const paidBeforeCents = state.payments
    .filter((item) => item.orderId === order.id && item.id !== payment.id && (
      item.paidAt < payment.paidAt || (item.paidAt === payment.paidAt && item.id.localeCompare(payment.id) < 0)
    ))
    .reduce((sum, item) => sum + integerCents(item.amount), 0);
  const totalCents = orderTotalCents(order);
  return {
    id: receiptIdForTransaction('service', payment.id),
    number: receiptNumberForTransaction('service', payment.id),
    kind: 'service',
    transactionId: payment.id,
    branchId: order.branchId,
    branchName: branch?.name ?? branch?.shortName ?? 'Branch',
    customerId: order.customerId,
    customerName: customer?.name ?? 'Customer',
    customerPhone: customer?.phone,
    orderId: order.id,
    orderNumber: order.number,
    issuedAt: payment.paidAt,
    issuedByUserId: payment.receivedByUserId,
    issuedByName: issuer?.name ?? 'Team member',
    paymentMethod: payment.method,
    reference: payment.reference,
    lines: order.items.map((item) => ({
      id: item.id,
      description: item.description,
      detail: state.services.find((service) => service.id === item.serviceId)?.name,
      quantity: item.quantity,
      unitPrice: integerCents(item.unitPrice) / 100,
      total: integerCents(item.quantity * item.unitPrice) / 100,
    })),
    subtotal: orderSubtotalCents(order) / 100,
    discount: integerCents(order.discount) / 100,
    fees: integerCents(order.deliveryFee) / 100,
    total: totalCents / 100,
    amountPaid: amountCents / 100,
    balanceAfter: Math.max(0, totalCents - paidBeforeCents - amountCents) / 100,
  };
};

export const createStoreReceipt = (state: AppState, sale: ClothingSale, product?: ClothingItem): TransactionReceipt => {
  const transactionId = sale.transactionId ?? sale.id;
  const relatedSales = [sale, ...normalizeClothingSales(state.clothingSales).filter((entry) => entry.id !== sale.id && (entry.transactionId ?? entry.id) === transactionId)];
  const branch = state.branches.find((entry) => entry.id === sale.branchId);
  const issuer = state.users.find((entry) => entry.id === sale.soldByUserId);
  const customer = sale.customerId ? state.customers.find((entry) => entry.id === sale.customerId) : undefined;
  const total = relatedSales.reduce((sum, entry) => sum + integerCents(entry.total), 0) / 100;
  return {
    id: receiptIdForTransaction('store', transactionId),
    number: receiptNumberForTransaction('store', transactionId),
    kind: 'store',
    transactionId,
    branchId: sale.branchId,
    branchName: branch?.name ?? branch?.shortName ?? 'Branch',
    customerId: customer?.id,
    customerName: customer?.name ?? 'Walk-in customer',
    customerPhone: customer?.phone,
    issuedAt: sale.soldAt,
    issuedByUserId: sale.soldByUserId,
    issuedByName: issuer?.name ?? 'Team member',
    paymentMethod: sale.paymentMethod,
    lines: relatedSales.map((entry) => {
      const item = entry.id === sale.id && product ? product : state.clothingItems.find((candidate) => candidate.id === entry.itemId);
      return {
        id: entry.id,
        description: item?.name ?? 'Store item',
        detail: item ? `${item.sku} · ${item.size} · ${item.color}` : entry.itemId,
        quantity: entry.quantity,
        listUnitPrice: integerCents(entry.listUnitPrice) / 100,
        unitPrice: integerCents(entry.unitPrice) / 100,
        total: integerCents(entry.total) / 100,
      };
    }),
    subtotal: total,
    discount: 0,
    fees: 0,
    total,
    amountPaid: total,
    balanceAfter: 0,
  };
};

export const ensureTransactionReceipts = (state: AppState): TransactionReceipt[] => {
  const receipts = normalizeReceipts(state.receipts);
  const transactionKeys = new Set(receipts.map((receipt) => `${receipt.kind}:${receipt.transactionId}`));
  for (const payment of state.payments ?? []) {
    if (transactionKeys.has(`service:${payment.id}`)) continue;
    const receipt = createServiceReceipt(state, payment);
    if (receipt) {
      receipts.push(receipt);
      transactionKeys.add(`service:${payment.id}`);
    }
  }
  for (const sale of normalizeClothingSales(state.clothingSales)) {
    const transactionId = sale.transactionId ?? sale.id;
    if (transactionKeys.has(`store:${transactionId}`)) continue;
    receipts.push(createStoreReceipt(state, sale));
    transactionKeys.add(`store:${transactionId}`);
  }
  return receipts.sort((left, right) => right.issuedAt.localeCompare(left.issuedAt));
};

export const orderSubtotal = (order: Order) => orderSubtotalCents(order) / 100;
export const orderTotal = (order: Order) => orderTotalCents(order) / 100;
export const orderPaid = (state: AppState, orderId: string) => orderPaidCents(state, orderId) / 100;
export const orderBalance = (state: AppState, order: Order) => Math.max(0, orderTotalCents(order) - orderPaidCents(state, order.id)) / 100;

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
  if (user.role === 'staff') return state.orders.filter((order) => order.assignedStaffId === user.id && user.branchIds.includes(order.branchId));
  return state.activeBranchId === 'all' ? state.orders : state.orders.filter((order) => order.branchId === state.activeBranchId);
};

export const visibleReceipts = (state: AppState) => {
  const user = getActiveUser(state);
  if (!user) return [];
  const receipts = ensureTransactionReceipts(state);
  if (user.role === 'customer') return receipts.filter((receipt) => receipt.customerId === user.customerId);
  if (user.role === 'staff') return receipts.filter((receipt) => user.branchIds.includes(receipt.branchId));
  return state.activeBranchId === 'all' ? receipts : receipts.filter((receipt) => receipt.branchId === state.activeBranchId);
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
  return state.payments.filter((payment) => orderIds.has(payment.orderId)).reduce((sum, payment) => sum + integerCents(payment.amount), 0) / 100;
};

export const orderNumber = (state: AppState) => {
  const next = 1060 + state.orders.length;
  return `GAT-2608-${next}`;
};
