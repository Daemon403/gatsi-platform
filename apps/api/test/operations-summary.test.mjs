import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDailyOperationsSummary } from '../src/operations-summary.mjs';

test('daily money metrics remain exact when quantities create fractional cents', () => {
  const date = '2026-08-30';
  const state = {
    branches: [{ id: 'branch-1', name: 'Test branch' }],
    users: [],
    inventory: [],
    clothingItems: [],
    activities: [],
    pickupRequests: [],
    orders: [{
      id: 'order-1',
      branchId: 'branch-1',
      createdAt: '2026-08-30T08:00:00.000+02:00',
      status: 'received',
      priority: 'normal',
      items: [{ quantity: 1.5, unitPrice: 0.01 }],
      discount: 0,
      deliveryFee: 0,
    }],
    payments: [{ id: 'payment-1', orderId: 'order-1', amount: 0.01, paidAt: '2026-08-30T09:00:00.000+02:00' }],
    clothingSales: [
      { id: 'sale-1', branchId: 'branch-1', quantity: 1, total: 0.1, soldAt: '2026-08-30T10:00:00.000+02:00' },
      { id: 'sale-2', branchId: 'branch-1', quantity: 1, total: 0.2, soldAt: '2026-08-30T11:00:00.000+02:00' },
    ],
  };

  const summary = buildDailyOperationsSummary(state, date);
  assert.equal(summary.branches[0].revenueCollected, 0.01);
  assert.equal(summary.branches[0].outstandingBalance, 0.01);
  assert.equal(summary.branches[0].clothingRevenue, 0.3);
  assert.equal(summary.totals.revenueCollected, 0.01);
  assert.equal(summary.totals.outstandingBalance, 0.01);
  assert.equal(summary.totals.clothingRevenue, 0.3);
});
