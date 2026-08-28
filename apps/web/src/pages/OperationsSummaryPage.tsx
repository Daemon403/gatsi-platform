import { getActiveUser, money, type DailyOperationsSummary, type OperationsMetrics } from '@gatsi/domain';
import { CalendarDays, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button, Card, Empty, PageTitle } from '../components/ui';
import { useAppStore } from '../store/AppStore';
import { apiGenerateOperationsSummary, apiOperationsSummaries } from '../store/api';

type MetricKey = keyof OperationsMetrics;

const metrics: Array<{ key: MetricKey; label: string; money?: boolean }> = [
  { key: 'ordersCreated', label: 'Orders created' },
  { key: 'ordersCollected', label: 'Orders collected' },
  { key: 'activeOrders', label: 'Active orders' },
  { key: 'urgentOrders', label: 'Urgent orders' },
  { key: 'paymentsRecorded', label: 'Payments recorded' },
  { key: 'revenueCollected', label: 'Revenue collected', money: true },
  { key: 'outstandingBalance', label: 'Outstanding balance', money: true },
  { key: 'pickupsRequested', label: 'Pickups requested' },
  { key: 'pendingPickups', label: 'Pending pickups' },
  { key: 'activeStaff', label: 'Active staff' },
  { key: 'lowStockItems', label: 'Low-stock items' },
  { key: 'operationalEvents', label: 'Operational events' },
  { key: 'clothingSales', label: 'Clothing sales' },
  { key: 'clothingUnitsSold', label: 'Clothing units sold' },
  { key: 'clothingRevenue', label: 'Clothing revenue', money: true },
];

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function reportDate(date: string) {
  return new Intl.DateTimeFormat('en-ZW', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Africa/Harare',
  }).format(new Date(`${date}T12:00:00+02:00`));
}

function generatedTime(value: string) {
  return new Intl.DateTimeFormat('en-ZW', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Harare',
  }).format(new Date(value));
}

function valueOf(metricsValue: OperationsMetrics, key: MetricKey, asMoney = false) {
  const value = Number(metricsValue[key] ?? 0);
  return asMoney ? money(value) : value.toLocaleString();
}

export function OperationsSummaryPage() {
  const { state } = useAppStore();
  const currentUser = getActiveUser(state);

  if (currentUser?.role !== 'admin') return null;
  return <AdminOperationsSummaryPage />;
}

function AdminOperationsSummaryPage() {
  const [summaries, setSummaries] = useState<DailyOperationsSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const sortedSummaries = [...summaries].sort((left, right) => (
    right.date.localeCompare(left.date) || right.generatedAt.localeCompare(left.generatedAt)
  ));

  useEffect(() => {
    let mounted = true;
    void apiOperationsSummaries()
      .then(({ items }) => {
        if (mounted) setSummaries(items);
      })
      .catch((nextError) => {
        if (mounted) setError(errorMessage(nextError, 'Operations summaries could not be loaded.'));
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
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
      eyebrow="Daily reporting"
      title="Operations summaries"
      description="Review each day’s order flow, revenue, pickups, staffing and stock health across every branch."
      actions={<Button disabled={generating} onClick={() => void generateLatest()}><RefreshCw className={generating ? 'spinning' : ''} /> {generating ? 'Generating…' : 'Generate latest daily summary'}</Button>}
    />

    {error ? <div className="management-error" role="alert">{error}</div> : null}

    {loading ? <Card className="operations-loading"><RefreshCw className="spinning" /><strong>Loading operations summaries</strong><span>Retrieving the latest daily snapshots…</span></Card> : !sortedSummaries.length ? <Card><Empty title="No operations summaries yet" body="Generate the latest completed-day summary to create the first permanent daily snapshot." /></Card> : <div className="operations-summary-list">
      {sortedSummaries.map((summary) => <SummaryCard key={summary.id} summary={summary} />)}
    </div>}
  </>;
}

function SummaryCard({ summary }: { summary: DailyOperationsSummary }) {
  return <Card className="operations-summary-card">
    <div className="operations-summary-head">
      <div><span><CalendarDays /></span><section><small>Operations snapshot</small><h2>{reportDate(summary.date)}</h2></section></div>
      <p>Generated {generatedTime(summary.generatedAt)} <span>CAT</span></p>
    </div>

    <div className="operations-metrics">
      {metrics.map((metric) => <div key={metric.key}><span>{metric.label}</span><strong>{valueOf(summary.totals, metric.key, metric.money)}</strong></div>)}
    </div>

    <div className="operations-branch-heading"><div><span className="eyebrow">Branch breakdown</span><h3>Daily operations by location</h3></div><small>{summary.branches.length} branch{summary.branches.length === 1 ? '' : 'es'}</small></div>
    <div className="operations-table-scroll">
      <table className="operations-table">
        <thead><tr><th>Branch</th>{metrics.map((metric) => <th key={metric.key}>{metric.label}</th>)}</tr></thead>
        <tbody>{summary.branches.map((branch) => <tr key={branch.branchId}><th scope="row">{branch.branchName}</th>{metrics.map((metric) => <td key={metric.key}>{valueOf(branch, metric.key, metric.money)}</td>)}</tr>)}</tbody>
      </table>
      {!summary.branches.length ? <p className="operations-no-branches">No branch data was recorded for this summary.</p> : null}
    </div>
  </Card>;
}
