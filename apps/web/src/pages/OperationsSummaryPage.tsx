import { buildLiveOperationsSummary, getActiveUser, money, transactionSummary, type DailyOperationsSummary, type OperationsMetrics } from '@gatsi/domain';
import { CalendarDays, Radio, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, Empty, PageTitle } from '../components/ui';
import { useAppStore } from '../store/AppStore';
import { apiCurrentOperationsSummary, apiGenerateOperationsSummary, apiOperationsSummaries } from '../store/api';

type MetricKey = keyof OperationsMetrics;

const metrics: Array<{ key: MetricKey; label: string; money?: boolean }> = [
  { key: 'ordersCreated', label: 'Orders created' },
  { key: 'ordersCollected', label: 'Orders collected' },
  { key: 'activeOrders', label: 'Active orders' },
  { key: 'urgentOrders', label: 'Urgent orders' },
  { key: 'paymentsRecorded', label: 'Service payments' },
  { key: 'revenueCollected', label: 'Service revenue', money: true },
  { key: 'outstandingBalance', label: 'Outstanding balance', money: true },
  { key: 'pickupsRequested', label: 'Pickups requested' },
  { key: 'pendingPickups', label: 'Pending pickups' },
  { key: 'activeStaff', label: 'Active staff' },
  { key: 'lowStockItems', label: 'Low-stock items' },
  { key: 'operationalEvents', label: 'Operational events' },
  { key: 'clothingSales', label: 'Store transactions' },
  { key: 'clothingUnitsSold', label: 'Store units sold' },
  { key: 'clothingRevenue', label: 'Store revenue', money: true },
];

const errorMessage = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;

function reportDate(date: string) {
  return new Intl.DateTimeFormat('en-ZW', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Harare' }).format(new Date(`${date}T12:00:00+02:00`));
}

function generatedTime(value: string) {
  return new Intl.DateTimeFormat('en-ZW', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Africa/Harare' }).format(new Date(value));
}

function valueOf(metricsValue: OperationsMetrics, key: MetricKey, asMoney = false) {
  const value = Number(metricsValue[key] ?? 0);
  return asMoney ? money(value) : value.toLocaleString();
}

export function OperationsSummaryPage() {
  const { state } = useAppStore();
  if (getActiveUser(state)?.role !== 'admin') return null;
  return <AdminOperationsSummaryPage />;
}

function AdminOperationsSummaryPage() {
  const { state } = useAppStore();
  const localLive = useMemo(() => buildLiveOperationsSummary(state), [state]);
  const [live, setLive] = useState(localLive);
  const [liveSource, setLiveSource] = useState<'database' | 'device'>('device');
  const [summaries, setSummaries] = useState<DailyOperationsSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshingLive, setRefreshingLive] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [liveError, setLiveError] = useState('');
  const sortedSummaries = [...summaries].sort((left, right) => right.date.localeCompare(left.date) || right.generatedAt.localeCompare(left.generatedAt));

  useEffect(() => {
    setLive(localLive);
    setLiveSource('device');
  }, [localLive]);

  const refreshLive = useCallback(async (showProgress = true) => {
    if (showProgress) setRefreshingLive(true);
    setLiveError('');
    try {
      const { summary } = await apiCurrentOperationsSummary();
      setLive(summary);
      setLiveSource('database');
    } catch (nextError) {
      setLiveError(errorMessage(nextError, 'The database could not be reached. Showing the latest device snapshot.'));
    } finally {
      if (showProgress) setRefreshingLive(false);
    }
  }, []);

  useEffect(() => {
    void refreshLive(false);
    const timer = window.setInterval(() => void refreshLive(false), 60_000);
    return () => window.clearInterval(timer);
  }, [refreshLive]);

  useEffect(() => {
    let mounted = true;
    void apiOperationsSummaries()
      .then(({ items }) => { if (mounted) setSummaries(items); })
      .catch((nextError) => { if (mounted) setError(errorMessage(nextError, 'Historical operations summaries could not be loaded.')); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  const generateLatest = async () => {
    if (generating) return;
    setGenerating(true);
    setError('');
    try {
      const { summary } = await apiGenerateOperationsSummary();
      setSummaries((current) => [summary, ...current.filter((item) => item.id !== summary.id)]);
    } catch (nextError) {
      setError(errorMessage(nextError, 'The latest completed-day summary could not be generated.'));
    } finally {
      setGenerating(false);
    }
  };

  return <>
    <PageTitle
      eyebrow="Live reporting"
      title="Operations summaries"
      description="See today’s orders and transactions at any time, with permanent completed-day snapshots retained for history."
      actions={<><Button variant="secondary" disabled={refreshingLive} onClick={() => void refreshLive()}><RefreshCw className={refreshingLive ? 'spinning' : ''} /> {refreshingLive ? 'Refreshing…' : 'Refresh today'}</Button><Button disabled={generating} onClick={() => void generateLatest()}><CalendarDays /> {generating ? 'Generating…' : 'Save latest completed day'}</Button></>}
    />

    <div className="operations-live-heading"><div><span><Radio /> Live</span><h2>Today so far</h2><p>Automatically refreshed every minute from the database while this page is open.</p></div><small>{liveSource === 'database' ? 'Database live' : 'Device snapshot'} · Updated {generatedTime(live.generatedAt)} CAT</small></div>
    {liveError ? <div className="operations-live-note" role="status">{liveError}</div> : null}
    <SummaryCard summary={live} live />

    <div className="operations-history-heading"><div><span className="eyebrow">History</span><h2>Completed daily snapshots</h2></div><small>Permanent end-of-day records</small></div>
    {error ? <div className="management-error" role="alert">{error}</div> : null}
    {loading ? <Card className="operations-loading"><RefreshCw className="spinning" /><strong>Loading daily history</strong><span>Retrieving permanent operations snapshots…</span></Card> : !sortedSummaries.length ? <Card><Empty title="No completed-day summaries yet" body="Today’s live summary is already available above. Historical snapshots appear after the first completed business day is saved." /></Card> : <div className="operations-summary-list">
      {sortedSummaries.map((summary) => <SummaryCard key={summary.id} summary={summary} />)}
    </div>}
  </>;
}

function SummaryCard({ summary, live = false }: { summary: DailyOperationsSummary; live?: boolean }) {
  const transactions = transactionSummary(summary.totals);
  return <Card className={`operations-summary-card ${live ? 'operations-summary-live' : ''}`}>
    <div className="operations-summary-head">
      <div><span>{live ? <Radio /> : <CalendarDays />}</span><section><small>{live ? 'Live operations' : 'Operations snapshot'}</small><h2>{reportDate(summary.date)}</h2></section></div>
      <p>{live ? 'Updated' : 'Generated'} {generatedTime(summary.generatedAt)} <span>CAT</span></p>
    </div>

    <div className="operations-key-summary">
      <div><span>Orders today</span><strong>{summary.totals.ordersCreated.toLocaleString()}</strong></div>
      <div><span>Active orders</span><strong>{summary.totals.activeOrders.toLocaleString()}</strong></div>
      <div><span>Transactions today</span><strong>{transactions.count.toLocaleString()}</strong></div>
      <div><span>Transaction revenue</span><strong>{money(transactions.revenue)}</strong></div>
    </div>

    <div className="operations-metrics">
      {metrics.map((metric) => <div key={metric.key}><span>{metric.label}</span><strong>{valueOf(summary.totals, metric.key, metric.money)}</strong></div>)}
    </div>

    <div className="operations-branch-heading"><div><span className="eyebrow">Branch breakdown</span><h3>{live ? 'Today’s activity by location' : 'Daily operations by location'}</h3></div><small>{summary.branches.length} branch{summary.branches.length === 1 ? '' : 'es'}</small></div>
    <div className="operations-table-scroll">
      <table className="operations-table">
        <thead><tr><th>Branch</th>{metrics.map((metric) => <th key={metric.key}>{metric.label}</th>)}</tr></thead>
        <tbody>{summary.branches.map((branch) => <tr key={branch.branchId}><th scope="row">{branch.branchName}</th>{metrics.map((metric) => <td key={metric.key}>{valueOf(branch, metric.key, metric.money)}</td>)}</tr>)}</tbody>
      </table>
      {!summary.branches.length ? <p className="operations-no-branches">No branches have been added yet.</p> : null}
    </div>
  </Card>;
}
