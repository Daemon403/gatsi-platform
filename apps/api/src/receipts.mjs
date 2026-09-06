const integerCents = (value) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  const scaled = value * 100;
  return Math.sign(scaled) * Math.round(Math.abs(scaled) + Number.EPSILON * Math.max(1, Math.abs(scaled)));
};

const orderSubtotalCents = (order) => (order.items ?? [])
  .reduce((sum, item) => sum + integerCents(Number(item.quantity ?? 0) * Number(item.unitPrice ?? 0)), 0);

const orderTotalCents = (order) => Math.max(
  0,
  orderSubtotalCents(order) - integerCents(order.discount) + integerCents(order.deliveryFee),
);

export const normalizeClothingSales = (value) => Array.isArray(value)
  ? value
    .filter((item) => item && typeof item === 'object' && !Array.isArray(item))
    .map((item) => {
      const unitPrice = typeof item.unitPrice === 'number' && Number.isFinite(item.unitPrice) ? item.unitPrice : 0;
      const paymentMethod = ['cash', 'ecocash', 'card', 'bank_transfer'].includes(item.paymentMethod)
        ? item.paymentMethod
        : 'cash';
      return {
        ...item,
        unitPrice,
        listUnitPrice: typeof item.listUnitPrice === 'number' && Number.isFinite(item.listUnitPrice) ? item.listUnitPrice : unitPrice,
        paymentMethod,
      };
    })
  : [];

export const normalizeReceipts = (value) => Array.isArray(value)
  ? value.filter((item) => item
    && typeof item === 'object'
    && typeof item.id === 'string'
    && typeof item.number === 'string'
    && ['service', 'store'].includes(item.kind)
    && typeof item.transactionId === 'string'
    && typeof item.issuedAt === 'string'
    && Array.isArray(item.lines))
  : [];

export const receiptIdForTransaction = (kind, transactionId) => `receipt-${kind}-${transactionId}`;

export const receiptNumberForTransaction = (kind, transactionId) => {
  const compactId = String(transactionId).replace(/^(payment|clothing-sale)-/i, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
  return `GAT-${kind === 'service' ? 'SVC' : 'STR'}-${compactId.toUpperCase()}`;
};

export const createServiceReceipt = (state, payment) => {
  const order = (state.orders ?? []).find((item) => item.id === payment.orderId);
  if (!order) return null;
  const branch = (state.branches ?? []).find((item) => item.id === order.branchId);
  const customer = (state.customers ?? []).find((item) => item.id === order.customerId);
  const issuer = (state.users ?? []).find((item) => item.id === payment.receivedByUserId);
  const amountCents = integerCents(payment.amount);
  const paidBeforeCents = (state.payments ?? [])
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
    ...(customer?.phone ? { customerPhone: customer.phone } : {}),
    orderId: order.id,
    orderNumber: order.number,
    issuedAt: payment.paidAt,
    issuedByUserId: payment.receivedByUserId,
    issuedByName: issuer?.name ?? 'Team member',
    paymentMethod: payment.method,
    ...(payment.reference ? { reference: payment.reference } : {}),
    lines: (order.items ?? []).map((item) => ({
      id: item.id,
      description: item.description,
      detail: (state.services ?? []).find((service) => service.id === item.serviceId)?.name,
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

export const createStoreReceipt = (state, sale, product) => {
  const transactionId = sale.transactionId ?? sale.id;
  const relatedSales = [sale, ...normalizeClothingSales(state.clothingSales).filter((entry) => entry.id !== sale.id && (entry.transactionId ?? entry.id) === transactionId)];
  const branch = (state.branches ?? []).find((entry) => entry.id === sale.branchId);
  const issuer = (state.users ?? []).find((entry) => entry.id === sale.soldByUserId);
  const customer = sale.customerId ? (state.customers ?? []).find((entry) => entry.id === sale.customerId) : undefined;
  const total = relatedSales.reduce((sum, entry) => sum + integerCents(entry.total), 0) / 100;
  return {
    id: receiptIdForTransaction('store', transactionId),
    number: receiptNumberForTransaction('store', transactionId),
    kind: 'store',
    transactionId,
    branchId: sale.branchId,
    branchName: branch?.name ?? branch?.shortName ?? 'Branch',
    ...(customer ? { customerId: customer.id } : {}),
    customerName: customer?.name ?? 'Walk-in customer',
    ...(customer?.phone ? { customerPhone: customer.phone } : {}),
    issuedAt: sale.soldAt,
    issuedByUserId: sale.soldByUserId,
    issuedByName: issuer?.name ?? 'Team member',
    paymentMethod: sale.paymentMethod,
    lines: relatedSales.map((entry) => {
      const item = entry.id === sale.id && product ? product : (state.clothingItems ?? []).find((candidate) => candidate.id === entry.itemId);
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

export const ensureTransactionReceipts = (state) => {
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
