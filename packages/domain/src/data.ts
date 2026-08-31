import type { AppState, OrderStatus } from './types';

export const DATA_REVISION = 2;

export const statusSequence: OrderStatus[] = [
  'received',
  'sorting',
  'washing',
  'drying',
  'ironing',
  'quality_check',
  'ready',
  'out_for_delivery',
  'collected',
];

export const statusLabels: Record<OrderStatus, string> = {
  received: 'Received',
  sorting: 'Sorting',
  washing: 'Washing',
  drying: 'Drying',
  ironing: 'Ironing',
  quality_check: 'Quality check',
  ready: 'Ready for collection',
  out_for_delivery: 'Out for delivery',
  collected: 'Collected',
  cancelled: 'Cancelled',
};

/**
 * A deliberately blank client workspace. Business records and account profiles
 * are hydrated only from the API; this state is never uploaded to PostgreSQL.
 */
export const createEmptyState = (): AppState => ({
  version: 1,
  dataRevision: DATA_REVISION,
  activeUserId: null,
  activeBranchId: 'all',
  branches: [],
  users: [],
  customers: [],
  services: [],
  orders: [],
  payments: [],
  pickupRequests: [],
  inventory: [],
  clothingItems: [],
  clothingSales: [],
  activities: [],
  notifications: [],
});
