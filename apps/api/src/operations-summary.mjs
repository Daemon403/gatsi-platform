const TIMEZONE = 'Africa/Harare';
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function harareDateKey(value = new Date()) {
  const parsed = value instanceof Date ? value : new Date(value);
  const parts = Object.fromEntries(dateFormatter.formatToParts(parsed).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function previousHarareDateKey(now = new Date()) {
  return harareDateKey(new Date(now.getTime() - 86_400_000));
}

export function validSummaryDate(value) {
  if (!DATE_PATTERN.test(String(value ?? ''))) return false;
  const [year, month, day] = String(value).split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

const emptyMetrics = () => ({
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

const orderTotal = (order) => Math.max(0,
  (order.items ?? []).reduce((sum, item) => sum + Number(item.quantity ?? 0) * Number(item.unitPrice ?? 0), 0)
  - Number(order.discount ?? 0)
  + Number(order.deliveryFee ?? 0));

const orderPaid = (state, orderId) => (state.payments ?? [])
  .filter((payment) => payment.orderId === orderId)
  .reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0);

const orderBalance = (state, order) => Math.max(0, orderTotal(order) - orderPaid(state, order.id));

function fallbackWindow(date) {
  const windowStart = new Date(`${date}T00:00:00+02:00`);
  const windowEnd = new Date(windowStart.getTime() + 86_400_000);
  return { windowStart: windowStart.toISOString(), windowEnd: windowEnd.toISOString() };
}

export function buildDailyOperationsSummary(state, requestedDate = harareDateKey(), window) {
  const date = validSummaryDate(requestedDate) ? requestedDate : harareDateKey();
  const { windowStart, windowEnd } = window ?? fallbackWindow(date);
  const orders = Array.isArray(state.orders) ? state.orders : [];
  const payments = Array.isArray(state.payments) ? state.payments : [];
  const pickups = Array.isArray(state.pickupRequests) ? state.pickupRequests : [];
  const users = Array.isArray(state.users) ? state.users : [];
  const inventory = Array.isArray(state.inventory) ? state.inventory : [];
  const clothingItems = Array.isArray(state.clothingItems) ? state.clothingItems : [];
  const activities = Array.isArray(state.activities) ? state.activities : [];
  const clothingSales = Array.isArray(state.clothingSales) ? state.clothingSales : [];
  const branches = (Array.isArray(state.branches) ? state.branches : []).map((branch) => {
    const branchOrders = orders.filter((order) => order.branchId === branch.id);
    const orderIds = new Set(branchOrders.map((order) => order.id));
    const branchPayments = payments.filter((payment) => orderIds.has(payment.orderId));
    const branchClothingSales = clothingSales.filter((sale) => sale.branchId === branch.id && harareDateKey(sale.soldAt) === date);
    return {
      branchId: branch.id,
      branchName: branch.name,
      ordersCreated: branchOrders.filter((order) => harareDateKey(order.createdAt) === date).length,
      ordersCollected: branchOrders.filter((order) => order.collectedAt && harareDateKey(order.collectedAt) === date).length,
      activeOrders: branchOrders.filter((order) => !['collected', 'cancelled'].includes(order.status)).length,
      urgentOrders: branchOrders.filter((order) => order.priority === 'urgent' && !['collected', 'cancelled'].includes(order.status)).length,
      paymentsRecorded: branchPayments.filter((payment) => harareDateKey(payment.paidAt) === date).length,
      revenueCollected: branchPayments
        .filter((payment) => harareDateKey(payment.paidAt) === date)
        .reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0),
      outstandingBalance: branchOrders.reduce((sum, order) => sum + orderBalance(state, order), 0),
      pickupsRequested: pickups.filter((request) => request.branchId === branch.id && harareDateKey(request.createdAt) === date).length,
      pendingPickups: pickups.filter((request) => request.branchId === branch.id && ['requested', 'scheduled'].includes(request.status)).length,
      activeStaff: users.filter((user) => user.role === 'staff' && user.active !== false && (user.branchIds ?? []).includes(branch.id)).length,
      lowStockItems: inventory.filter((item) => item.branchId === branch.id && Number(item.quantity) <= Number(item.reorderLevel)).length
        + clothingItems.filter((item) => item.branchId === branch.id && item.active !== false && Number(item.quantity) <= Number(item.reorderLevel)).length,
      operationalEvents: activities.filter((item) => item.branchId === branch.id && harareDateKey(item.at) === date).length,
      clothingSales: branchClothingSales.length,
      clothingUnitsSold: branchClothingSales.reduce((sum, sale) => sum + Number(sale.quantity ?? 0), 0),
      clothingRevenue: branchClothingSales.reduce((sum, sale) => sum + Number(sale.total ?? 0), 0),
    };
  });
  const totals = branches.reduce((sum, branch) => {
    for (const key of Object.keys(sum)) sum[key] += Number(branch[key] ?? 0);
    return sum;
  }, emptyMetrics());
  return {
    id: `operations-summary-${date}`,
    date,
    timezone: TIMEZONE,
    windowStart,
    windowEnd,
    generatedAt: new Date().toISOString(),
    totals,
    branches,
  };
}

async function summaryWindow(client, date) {
  const result = await client.query(
    `SELECT ($1::date::timestamp AT TIME ZONE $2) AS window_start,
            (($1::date + 1)::timestamp AT TIME ZONE $2) AS window_end`,
    [date, TIMEZONE],
  );
  return {
    windowStart: result.rows[0].window_start.toISOString(),
    windowEnd: result.rows[0].window_end.toISOString(),
  };
}

export async function storeDailyOperationsSummary(client, summary, sourceStateUpdatedAt, { replace = false } = {}) {
  const values = [
    summary.date,
    summary.timezone,
    summary.windowStart,
    summary.windowEnd,
    summary.generatedAt,
    sourceStateUpdatedAt,
    JSON.stringify(summary),
  ];
  const inserted = await client.query(
    `INSERT INTO daily_operations_summaries
      (summary_date, timezone, window_start, window_end, generated_at, source_state_updated_at, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (summary_date, timezone) DO NOTHING
     RETURNING payload`,
    values,
  );
  if (inserted.rowCount) return { summary: inserted.rows[0].payload, created: true, replaced: false };

  if (replace) {
    const updated = await client.query(
      `UPDATE daily_operations_summaries
       SET window_start=$3, window_end=$4, generated_at=$5, source_state_updated_at=$6,
           schema_version=1, payload=$7
       WHERE summary_date=$1 AND timezone=$2
       RETURNING payload`,
      values,
    );
    return { summary: updated.rows[0].payload, created: false, replaced: true };
  }

  const existing = await client.query(
    'SELECT payload FROM daily_operations_summaries WHERE summary_date=$1 AND timezone=$2',
    [summary.date, summary.timezone],
  );
  return { summary: existing.rows[0].payload, created: false, replaced: false };
}

export async function generateAndStoreDailyOperationsSummary(client, requestedDate = previousHarareDateKey(), options) {
  if (!validSummaryDate(requestedDate)) throw Object.assign(new Error('Summary date must use YYYY-MM-DD.'), { status: 422 });
  const row = (await client.query('SELECT payload, updated_at FROM app_state WHERE singleton=true')).rows[0];
  if (!row) throw new Error('Application state has not been initialized.');
  const window = await summaryWindow(client, requestedDate);
  const summary = buildDailyOperationsSummary(row.payload, requestedDate, window);
  return storeDailyOperationsSummary(client, summary, row.updated_at, options);
}

export async function listDailyOperationsSummaries(client, requestedLimit = 31) {
  const limit = Math.min(400, Math.max(1, Number.parseInt(String(requestedLimit), 10) || 31));
  const result = await client.query(
    `SELECT payload
     FROM daily_operations_summaries
     WHERE timezone=$1
     ORDER BY summary_date DESC
     LIMIT $2`,
    [TIMEZONE, limit],
  );
  return result.rows.map((row) => row.payload);
}
