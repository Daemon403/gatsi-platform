import assert from 'node:assert/strict';
import test from 'node:test';
import { createServiceReceipt, createStoreReceipt, ensureTransactionReceipts } from '../src/receipts.mjs';

const state = {
  branches: [{ id: 'branch-1', name: 'Main branch', shortName: 'Main' }],
  users: [{ id: 'user-1', name: 'Tariro Staff' }],
  customers: [{ id: 'customer-1', name: 'Rudo Customer', phone: '+263770000000' }],
  services: [{ id: 'service-1', name: 'Dry cleaning' }],
  orders: [{
    id: 'order-1', number: 'GAT-1', branchId: 'branch-1', customerId: 'customer-1',
    items: [{ id: 'line-1', serviceId: 'service-1', description: 'Suit', quantity: 2, unitPrice: 10 }],
    discount: 2, deliveryFee: 1,
  }],
  payments: [{ id: 'payment-old', orderId: 'order-1', amount: 5, method: 'cash', paidAt: '2026-09-01T08:00:00.000Z', receivedByUserId: 'user-1' }],
  clothingItems: [{ id: 'item-1', branchId: 'branch-1', name: 'Gatsi shirt', sku: 'SHIRT-1', size: 'M', color: 'Green' }],
  clothingSales: [],
  receipts: [],
};

test('service payments create one immutable transaction receipt with the remaining balance', () => {
  const payment = { id: 'payment-new', orderId: 'order-1', amount: 7, method: 'card', reference: 'POS-7', paidAt: '2026-09-02T08:00:00.000Z', receivedByUserId: 'user-1' };
  const receipt = createServiceReceipt(state, payment);
  assert.equal(receipt.kind, 'service');
  assert.equal(receipt.amountPaid, 7);
  assert.equal(receipt.total, 19);
  assert.equal(receipt.balanceAfter, 7);
  assert.equal(receipt.lines[0].description, 'Suit');
  assert.equal(receipt.reference, 'POS-7');
});

test('store sales preserve list and negotiated prices on their receipt', () => {
  const sale = { id: 'sale-1', itemId: 'item-1', branchId: 'branch-1', quantity: 2, listUnitPrice: 15, unitPrice: 12, total: 24, paymentMethod: 'ecocash', soldAt: '2026-09-02T09:00:00.000Z', soldByUserId: 'user-1' };
  const receipt = createStoreReceipt(state, sale);
  assert.equal(receipt.kind, 'store');
  assert.equal(receipt.paymentMethod, 'ecocash');
  assert.equal(receipt.lines[0].listUnitPrice, 15);
  assert.equal(receipt.lines[0].unitPrice, 12);
  assert.equal(receipt.amountPaid, 24);
});

test('receipt backfill creates exactly one receipt for every transaction', () => {
  const sale = { id: 'sale-1', itemId: 'item-1', branchId: 'branch-1', quantity: 1, listUnitPrice: 15, unitPrice: 12, total: 12, paymentMethod: 'cash', soldAt: '2026-09-02T09:00:00.000Z', soldByUserId: 'user-1' };
  const withTransactions = { ...state, clothingSales: [sale] };
  const first = ensureTransactionReceipts(withTransactions);
  const second = ensureTransactionReceipts({ ...withTransactions, receipts: first });
  assert.equal(first.length, 2);
  assert.equal(second.length, 2);
  assert.deepEqual(new Set(second.map((receipt) => receipt.transactionId)), new Set(['payment-old', 'sale-1']));
});
