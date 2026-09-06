import { Feather } from '@expo/vector-icons';
import { buildLiveOperationsSummary, getActiveUser, money, transactionSummary, type DailyOperationsSummary, type OperationsMetrics } from '@gatsi/domain';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { AppHeader } from '../components/AppHeader';
import { Screen } from '../components/Screen';
import { Card, EmptyState, PrimaryButton, SectionTitle } from '../components/ui';
import { useAppStore } from '../store/AppStore';
import { apiCurrentOperationsSummary, apiGenerateOperationsSummary, apiOperationsSummaries } from '../store/api';
import { colors, radius } from '../theme';

type MetricKey = keyof OperationsMetrics;

const metrics: Array<{ key: MetricKey; label: string; icon: keyof typeof Feather.glyphMap; money?: boolean; tone?: 'green' | 'blue' | 'amber' | 'red' }> = [
  { key: 'ordersCreated', label: 'Orders created', icon: 'shopping-bag', tone: 'blue' },
  { key: 'ordersCollected', label: 'Orders collected', icon: 'check-circle' },
  { key: 'activeOrders', label: 'Active orders', icon: 'refresh-cw', tone: 'blue' },
  { key: 'urgentOrders', label: 'Urgent orders', icon: 'alert-circle', tone: 'red' },
  { key: 'paymentsRecorded', label: 'Service payments', icon: 'credit-card' },
  { key: 'revenueCollected', label: 'Service revenue', icon: 'trending-up', money: true },
  { key: 'outstandingBalance', label: 'Outstanding', icon: 'clock', money: true, tone: 'amber' },
  { key: 'pickupsRequested', label: 'Pickups requested', icon: 'truck', tone: 'blue' },
  { key: 'pendingPickups', label: 'Pending pickups', icon: 'map-pin', tone: 'amber' },
  { key: 'activeStaff', label: 'Active staff', icon: 'users' },
  { key: 'lowStockItems', label: 'Low stock', icon: 'package', tone: 'red' },
  { key: 'operationalEvents', label: 'Operations events', icon: 'activity', tone: 'blue' },
  { key: 'clothingSales', label: 'Store transactions', icon: 'shopping-cart', tone: 'blue' },
  { key: 'clothingUnitsSold', label: 'Store units sold', icon: 'shopping-bag' },
  { key: 'clothingRevenue', label: 'Store revenue', icon: 'dollar-sign', money: true },
];

const branchMetricKeys: MetricKey[] = ['ordersCreated', 'ordersCollected', 'activeOrders', 'revenueCollected', 'outstandingBalance', 'activeStaff'];

const palettes = {
  green: { foreground: colors.primary, background: colors.primaryLight },
  blue: { foreground: colors.blue, background: colors.blueSoft },
  amber: { foreground: colors.amber, background: colors.amberSoft },
  red: { foreground: colors.red, background: colors.redSoft },
};

export function OperationsSummariesScreen() {
  const { state } = useAppStore();
  const currentUser = getActiveUser(state);

  if (currentUser?.role !== 'admin') {
    return <Screen>
      <AppHeader title="Access unavailable" subtitle="Administrator permission is required" back />
      <Card><EmptyState icon="lock" title="Daily summaries are restricted" body="Sign in with an administrator account to review company-wide operations." /></Card>
    </Screen>;
  }

  return <AdminOperationsSummaries />;
}

function AdminOperationsSummaries() {
  const { state } = useAppStore();
  const localLive = useMemo(() => buildLiveOperationsSummary(state), [state]);
  const [live, setLive] = useState(localLive);
  const [liveSource, setLiveSource] = useState<'database' | 'device'>('device');
  const [items, setItems] = useState<DailyOperationsSummary[]>([]);
  const [selectedId, setSelectedId] = useState('live');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshingLive, setRefreshingLive] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [liveError, setLiveError] = useState('');
  const summaries = useMemo(() => [...items].sort((left, right) => (
    right.date.localeCompare(left.date) || right.generatedAt.localeCompare(left.generatedAt)
  )), [items]);
  const selected = selectedId === 'live' ? live : summaries.find((summary) => summary.id === selectedId) ?? live;
  const selectedIsLive = selected.id === live.id;

  useEffect(() => {
    setLive(localLive);
    setLiveSource('device');
  }, [localLive]);

  const refreshLive = useCallback(async (showProgress = true) => {
    if (showProgress) setRefreshingLive(true);
    setLiveError('');
    try {
      const response = await apiCurrentOperationsSummary();
      setLive(response.summary);
      setLiveSource('database');
    } catch (reason) {
      setLiveError(reason instanceof Error ? reason.message : 'The database could not be reached. The device snapshot remains available.');
    } finally {
      if (showProgress) setRefreshingLive(false);
    }
  }, []);

  const load = async (asRefresh = false) => {
    if (asRefresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const response = await apiOperationsSummaries();
      setItems(response.items);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Operations summaries could not be loaded.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    void refreshLive(false);
    const timer = setInterval(() => void refreshLive(false), 60_000);
    return () => clearInterval(timer);
  }, [refreshLive]);

  const refreshAll = async () => {
    await Promise.all([load(true), refreshLive(false)]);
  };

  const generateLatest = async () => {
    if (generating) return;
    setGenerating(true);
    setError('');
    try {
      const { summary } = await apiGenerateOperationsSummary();
      setItems((current) => [summary, ...current.filter((item) => item.date !== summary.date)]);
      setSelectedId(summary.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The latest daily summary could not be generated.');
    } finally {
      setGenerating(false);
    }
  };

  return <Screen refreshControl={<RefreshControl refreshing={refreshing || refreshingLive} onRefresh={() => void refreshAll()} tintColor={colors.primary} colors={[colors.primary]} />}>
    <AppHeader title="Operations summaries" subtitle="Live today and completed-day history" back />

    <Card style={styles.generationCard}>
      <View style={styles.generationHeading}>
        <View style={styles.generationIcon}><Feather name="activity" size={22} color={colors.primary} /></View>
        <View style={styles.flex}>
          <Text style={styles.generationTitle}>Today is always available</Text>
          <Text style={styles.generationBody}>Order and transaction totals refresh from the database every minute. If offline, the latest device snapshot remains visible.</Text>
        </View>
      </View>
      <PrimaryButton title="Refresh today now" icon="refresh-cw" loading={refreshingLive} onPress={() => void refreshLive()} />
      <PrimaryButton title="Save latest completed day" icon="calendar" secondary loading={generating} disabled={loading} onPress={() => void generateLatest()} />
    </Card>

    {liveError ? <ErrorNotice message={`${liveError} Showing the latest device snapshot.`} /> : null}
    {error ? <ErrorNotice message={error} retry={!items.length ? () => void load() : undefined} /> : null}

    {loading ? <Card style={styles.loadingCard}><View style={styles.loadingIcon}><Feather name="bar-chart-2" size={25} color={colors.primary} /></View><Text style={styles.loadingTitle}>Loading operations summaries...</Text></Card> : null}

    {!loading && !summaries.length ? <Card style={styles.historyEmpty}><EmptyState icon="calendar" title="No completed-day history yet" body="Today’s live summary is available. Historical snapshots appear after a completed business day is saved." /></Card> : null}

    <SectionTitle title="Reporting period" action={refreshing ? 'Refreshing...' : 'Refresh all'} onPress={!refreshing ? () => void refreshAll() : undefined} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateChoices}>
        <TouchableOpacity accessibilityRole="radio" accessibilityState={{ checked: selectedIsLive }} onPress={() => setSelectedId('live')} style={[styles.dateChoice, styles.liveChoice, selectedIsLive && styles.dateChoiceActive]}>
          <Text style={[styles.dateChoiceEyebrow, styles.liveChoiceEyebrow, selectedIsLive && styles.dateChoiceEyebrowActive]}>LIVE · {liveSource === 'database' ? 'DATABASE' : 'DEVICE'}</Text>
          <Text style={[styles.dateChoiceText, selectedIsLive && styles.dateChoiceTextActive]}>Today</Text>
        </TouchableOpacity>
        {summaries.map((summary, index) => {
          const active = summary.id === selected?.id;
          return <TouchableOpacity
            key={summary.id}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            onPress={() => setSelectedId(summary.id)}
            style={[styles.dateChoice, active && styles.dateChoiceActive]}
          >
            <Text style={[styles.dateChoiceEyebrow, active && styles.dateChoiceEyebrowActive]}>{index === 0 ? 'LATEST' : 'SNAPSHOT'}</Text>
            <Text style={[styles.dateChoiceText, active && styles.dateChoiceTextActive]}>{shortReportDate(summary.date)}</Text>
          </TouchableOpacity>;
        })}
      </ScrollView>

      <SummaryDetails summary={selected} live={selectedIsLive} latest={!selectedIsLive && selected.id === summaries[0]?.id} />
  </Screen>;
}

function SummaryDetails({ summary, live, latest }: { summary: DailyOperationsSummary; live: boolean; latest: boolean }) {
  const transactions = transactionSummary(summary.totals);
  return <>
    <Card style={[styles.summaryHeadingCard, live && styles.summaryHeadingLive]}>
      <View style={styles.summaryCalendar}><Feather name={live ? 'radio' : 'calendar'} size={21} color="#fff" /></View>
      <View style={styles.flex}>
        <Text style={styles.summaryEyebrow}>{live ? 'LIVE TODAY' : latest ? 'LATEST COMPLETED DAY' : 'OPERATIONS SNAPSHOT'}</Text>
        <Text style={styles.summaryDate}>{reportDate(summary.date)}</Text>
        <Text style={styles.generatedAt}>{live ? 'Updated' : 'Generated'} {generatedTime(summary.generatedAt)} CAT</Text>
      </View>
    </Card>

    <View style={styles.keySummaryGrid}>
      <KeySummary label="Orders today" value={summary.totals.ordersCreated.toLocaleString()} />
      <KeySummary label="Active orders" value={summary.totals.activeOrders.toLocaleString()} />
      <KeySummary label="Transactions" value={transactions.count.toLocaleString()} />
      <KeySummary label="Transaction revenue" value={money(transactions.revenue)} />
    </View>

    <SectionTitle title="Company totals" />
    <View style={styles.metricGrid}>
      {metrics.map((metric) => <Metric key={metric.key} metricsValue={summary.totals} metric={metric} />)}
    </View>

    <SectionTitle title={`Branch breakdown (${summary.branches.length})`} />
    {summary.branches.map((branch) => <Card key={branch.branchId} style={styles.branchCard}>
      <View style={styles.branchHeading}>
        <View style={styles.branchIcon}><Feather name="map-pin" size={19} color={colors.primary} /></View>
        <View style={styles.flex}><Text style={styles.branchName}>{branch.branchName}</Text><Text style={styles.branchSubtitle}>{live ? 'Today’s activity and current workload' : 'Completed-day snapshot and current workload'}</Text></View>
      </View>
      <View style={styles.branchGrid}>
        {branchMetricKeys.map((key) => {
          const metric = metrics.find((item) => item.key === key)!;
          return <View key={key} style={styles.branchMetric}>
            <Text style={styles.branchMetricLabel}>{metric.label}</Text>
            <Text style={styles.branchMetricValue}>{formatMetric(branch, metric)}</Text>
          </View>;
        })}
      </View>
      <View style={styles.branchAlerts}>
        <AlertPill label={`${branch.urgentOrders} urgent`} alert={branch.urgentOrders > 0} />
        <AlertPill label={`${branch.pendingPickups} pickups`} alert={branch.pendingPickups > 0} />
        <AlertPill label={`${branch.lowStockItems} low stock`} alert={branch.lowStockItems > 0} />
      </View>
    </Card>)}
    {!summary.branches.length ? <Card><EmptyState icon="map-pin" title="No branch breakdown" body="No branch data was available when this snapshot was generated." /></Card> : null}
  </>;
}

function KeySummary({ label, value }: { label: string; value: string }) {
  return <View style={styles.keySummary}><Text style={styles.keySummaryLabel}>{label}</Text><Text style={styles.keySummaryValue}>{value}</Text></View>;
}

function Metric({ metricsValue, metric }: { metricsValue: OperationsMetrics; metric: typeof metrics[number] }) {
  const palette = palettes[metric.tone ?? 'green'];
  return <Card style={styles.metricCard}>
    <View style={[styles.metricIcon, { backgroundColor: palette.background }]}><Feather name={metric.icon} size={17} color={palette.foreground} /></View>
    <Text style={[styles.metricValue, { color: palette.foreground }]}>{formatMetric(metricsValue, metric)}</Text>
    <Text style={styles.metricLabel}>{metric.label}</Text>
  </Card>;
}

function AlertPill({ label, alert }: { label: string; alert: boolean }) {
  return <View style={[styles.alertPill, alert && styles.alertPillActive]}><Text style={[styles.alertPillText, alert && styles.alertPillTextActive]}>{label}</Text></View>;
}

function ErrorNotice({ message, retry }: { message: string; retry?: () => void }) {
  return <Card style={styles.errorNotice}>
    <Feather name="alert-circle" size={18} color={colors.red} />
    <Text style={styles.errorText}>{message}</Text>
    {retry ? <TouchableOpacity onPress={retry}><Text style={styles.retryText}>Retry</Text></TouchableOpacity> : null}
  </Card>;
}

function formatMetric(value: OperationsMetrics, metric: typeof metrics[number]) {
  const amount = Number(value[metric.key] ?? 0);
  return metric.money ? money(amount) : amount.toLocaleString();
}

function reportDate(date: string) {
  return new Intl.DateTimeFormat('en-ZW', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Harare' }).format(new Date(`${date}T12:00:00+02:00`));
}

function shortReportDate(date: string) {
  return new Intl.DateTimeFormat('en-ZW', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Harare' }).format(new Date(`${date}T12:00:00+02:00`));
}

function generatedTime(value: string) {
  return new Intl.DateTimeFormat('en-ZW', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Harare' }).format(new Date(value));
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  generationCard: { padding: 15, gap: 14, marginBottom: 8 },
  generationHeading: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  generationIcon: { width: 46, height: 46, borderRadius: 15, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  generationTitle: { color: colors.ink, fontSize: 14, fontWeight: '900' },
  generationBody: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 4 },
  historyEmpty: { marginBottom: 8 },
  loadingCard: { minHeight: 145, alignItems: 'center', justifyContent: 'center', padding: 20, gap: 10 },
  loadingIcon: { width: 50, height: 50, borderRadius: 17, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  loadingTitle: { color: colors.muted, fontSize: 11, fontWeight: '800' },
  dateChoices: { gap: 8, paddingBottom: 14, paddingRight: 4 },
  dateChoice: { minWidth: 118, paddingHorizontal: 13, paddingVertical: 10, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  dateChoiceActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  liveChoice: { borderColor: colors.primary },
  liveChoiceEyebrow: { color: colors.primary },
  dateChoiceEyebrow: { color: colors.subtle, fontSize: 7, fontWeight: '900', letterSpacing: 0.5 },
  dateChoiceEyebrowActive: { color: colors.primary },
  dateChoiceText: { color: colors.ink, fontSize: 10, fontWeight: '800', marginTop: 4 },
  dateChoiceTextActive: { color: colors.primaryDark },
  summaryHeadingCard: { padding: 15, flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: colors.primaryDark, borderColor: colors.primaryDark, marginBottom: 8 },
  summaryHeadingLive: { backgroundColor: colors.primary, borderColor: colors.primary },
  summaryCalendar: { width: 45, height: 45, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  summaryEyebrow: { color: 'rgba(255,255,255,0.68)', fontSize: 7, fontWeight: '900', letterSpacing: 0.7 },
  summaryDate: { color: '#fff', fontSize: 15, fontWeight: '900', marginTop: 3 },
  generatedAt: { color: 'rgba(255,255,255,0.72)', fontSize: 9, marginTop: 4 },
  keySummaryGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 9, marginVertical: 12 },
  keySummary: { width: '48.5%', minHeight: 82, padding: 12, borderRadius: radius.sm, backgroundColor: colors.primaryLight, justifyContent: 'space-between' },
  keySummaryLabel: { color: colors.primary, fontSize: 9, fontWeight: '800' },
  keySummaryValue: { color: colors.ink, fontSize: 18, fontWeight: '900', marginTop: 8 },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 9, marginBottom: 6 },
  metricCard: { width: '48.5%', padding: 12, minHeight: 116 },
  metricIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  metricValue: { fontSize: 16, fontWeight: '900', marginTop: 10 },
  metricLabel: { color: colors.muted, fontSize: 9, lineHeight: 13, marginTop: 3 },
  branchCard: { padding: 14, marginBottom: 11 },
  branchHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  branchIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  branchName: { color: colors.ink, fontSize: 14, fontWeight: '900' },
  branchSubtitle: { color: colors.muted, fontSize: 9, marginTop: 3 },
  branchGrid: { flexDirection: 'row', flexWrap: 'wrap', borderTopWidth: 1, borderTopColor: colors.border, marginTop: 13, paddingTop: 4 },
  branchMetric: { width: '50%', paddingTop: 10 },
  branchMetricLabel: { color: colors.subtle, fontSize: 8, textTransform: 'uppercase' },
  branchMetricValue: { color: colors.ink, fontSize: 13, fontWeight: '900', marginTop: 3 },
  branchAlerts: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 13 },
  alertPill: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 99, backgroundColor: colors.primaryLight },
  alertPillActive: { backgroundColor: colors.redSoft },
  alertPillText: { color: colors.primary, fontSize: 8, fontWeight: '900' },
  alertPillTextActive: { color: colors.red },
  errorNotice: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, marginBottom: 10, borderColor: colors.red, backgroundColor: colors.redSoft },
  errorText: { flex: 1, color: colors.red, fontSize: 10, lineHeight: 15, fontWeight: '700' },
  retryText: { color: colors.red, fontSize: 10, fontWeight: '900' },
});
