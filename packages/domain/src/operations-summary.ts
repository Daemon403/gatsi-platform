import type { AppState, BranchOperationsSummary, DailyOperationsSummary, OperationsMetrics } from './types';

export const OPERATIONS_TIMEZONE = 'Africa/Harare' as const;

const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: OPERATIONS_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export const operationsDateKey = (value: Date | string = new Date()) => {
  const parsed = value instanceof Date ? value : new Date(value);
  const parts = Object.fromEntries(dateFormatter.formatToParts(parsed).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};

const emptyMetrics = (): OperationsMetrics => ({
  ordersCreated: 0,
  ordersCollected: 0,
  activeOrders: 0,
  urgentOrders: 0,
  paymentsRecorded: 0,
  revenueCollected: 0,
  outstandingBalance: 0,
  pickupsRequested: 0,
  pendingPickups: 0,
  activeStaff: 0,
  lowStockItems: 0,
  operationalEvents: 0,
  clothingSales: 0,
  clothingUnitsSold: 0,
  clothingRevenue: 0,
});

const integerCents = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  const scaled = value * 100;
  return Math.sign(scaled) * Math.round(Math.abs(scaled) + Number.EPSILON * Math.max(1, Math.abs(scaled)));
};

const orderTotalCents = (order: AppState['orders'][number]) => Math.max(0,
  order.items.reduce((sum, item) => sum + integerCents(item.quantity * item.unitPrice), 0)
    - integerCents(order.discount)
    + integerCents(order.deliveryFee));

const orderPaidCents = (state: AppState, orderId: string) => state.payments
  .filter((payment) => payment.orderId === orderId)
  .reduce((sum, payment) => sum + integerCents(payment.amount), 0);

const branchSummary = (state: AppState, branch: AppState['branches'][number], date: string): BranchOperationsSummary => {
  const orders = state.orders.filter((order) => order.branchId === branch.id);
  const orderIds = new Set(orders.map((order) => order.id));
  const payments = state.payments.filter((payment) => orderIds.has(payment.orderId) && operationsDateKey(payment.paidAt) === date);
  const sales = state.clothingSales.filter((sale) => sale.branchId === branch.id && operationsDateKey(sale.soldAt) === date);
  return {
    branchId: branch.id,
    branchName: branch.name,
    ordersCreated: orders.filter((order) => operationsDateKey(order.createdAt) === date).length,
    ordersCollected: orders.filter((order) => order.collectedAt && operationsDateKey(order.collectedAt) === date).length,
    activeOrders: orders.filter((order) => !['collected', 'cancelled'].includes(order.status)).length,
    urgentOrders: orders.filter((order) => order.priority === 'urgent' && !['collected', 'cancelled'].includes(order.status)).length,
    paymentsRecorded: payments.length,
    revenueCollected: payments.reduce((sum, payment) => sum + integerCents(payment.amount), 0) / 100,
    outstandingBalance: orders.reduce((sum, order) => sum + Math.max(0, orderTotalCents(order) - orderPaidCents(state, order.id)), 0) / 100,
    pickupsRequested: state.pickupRequests.filter((request) => request.branchId === branch.id && operationsDateKey(request.createdAt) === date).length,
    pendingPickups: state.pickupRequests.filter((request) => request.branchId === branch.id && ['requested', 'scheduled'].includes(request.status)).length,
    activeStaff: state.users.filter((user) => user.role === 'staff' && user.active !== false && user.branchIds.includes(branch.id)).length,
    lowStockItems: state.inventory.filter((item) => item.branchId === branch.id && item.quantity <= item.reorderLevel).length
      + state.clothingItems.filter((item) => item.branchId === branch.id && item.active !== false && item.quantity <= item.reorderLevel).length,
    operationalEvents: state.activities.filter((item) => item.branchId === branch.id && operationsDateKey(item.at) === date).length,
    clothingSales: sales.length,
    clothingUnitsSold: sales.reduce((sum, sale) => sum + sale.quantity, 0),
    clothingRevenue: sales.reduce((sum, sale) => sum + integerCents(sale.total), 0) / 100,
  };
};

export const buildLiveOperationsSummary = (state: AppState, generatedAt = new Date()): DailyOperationsSummary => {
  const date = operationsDateKey(generatedAt);
  const branches = state.branches.map((branch) => branchSummary(state, branch, date));
  const totals = branches.reduce((sum, branch) => {
    for (const key of Object.keys(sum) as Array<keyof OperationsMetrics>) sum[key] += branch[key];
    return sum;
  }, emptyMetrics());
  totals.revenueCollected = integerCents(totals.revenueCollected) / 100;
  totals.outstandingBalance = integerCents(totals.outstandingBalance) / 100;
  totals.clothingRevenue = integerCents(totals.clothingRevenue) / 100;
  return {
    id: `operations-summary-live-${date}`,
    date,
    timezone: OPERATIONS_TIMEZONE,
    windowStart: new Date(`${date}T00:00:00+02:00`).toISOString(),
    windowEnd: generatedAt.toISOString(),
    generatedAt: generatedAt.toISOString(),
    totals,
    branches,
  };
};

export const transactionSummary = (metrics: OperationsMetrics) => ({
  count: metrics.paymentsRecorded + metrics.clothingSales,
  revenue: integerCents(metrics.revenueCollected + metrics.clothingRevenue) / 100,
});
