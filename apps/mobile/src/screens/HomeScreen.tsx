import { Feather } from '@expo/vector-icons';
import { branchRevenue, getActiveUser, money, orderBalance, visibleOrders } from '@gatsi/domain';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { AppHeader } from '../components/AppHeader';
import { Screen } from '../components/Screen';
import { MetricCard, OrderCard, QuickAction, SectionTitle } from '../components/ui';
import { useAppStore } from '../store/AppStore';
import { colors, radius, shadow } from '../theme';

export function HomeScreen() {
  const { state, dispatch } = useAppStore();
  const navigation = useNavigation<any>();
  const user = getActiveUser(state)!;
  const orders = visibleOrders(state);
  const active = orders.filter((order) => !['collected', 'cancelled'].includes(order.status));
  const completed = orders.filter((order) => order.status === 'collected');
  const outstanding = orders.reduce((sum, order) => sum + orderBalance(state, order), 0);
  const revenue = branchRevenue(state, user.role === 'customer' ? 'all' : state.activeBranchId);
  const current = active[0];

  const actions = user.role === 'admin' ? [
    { label: 'New order', icon: 'plus-square' as const, action: () => navigation.navigate('CreateOrder') },
    { label: 'Customers', icon: 'users' as const, action: () => navigation.navigate('Center') },
    { label: 'Inventory', icon: 'package' as const, action: () => navigation.navigate('Stock') },
    { label: 'All orders', icon: 'list' as const, action: () => navigation.navigate('Orders') },
  ] : user.role === 'staff' ? [
    { label: 'New order', icon: 'plus-square' as const, action: () => navigation.navigate('CreateOrder') },
    { label: 'My tasks', icon: 'check-square' as const, action: () => navigation.navigate('Center') },
    { label: 'Stock use', icon: 'package' as const, action: () => navigation.navigate('Stock') },
    { label: user.clockedIn ? 'Clock out' : 'Clock in', icon: 'clock' as const, action: () => dispatch({ type: 'CLOCK_TOGGLE', userId: user.id }) },
  ] : [
    { label: 'Book pickup', icon: 'truck' as const, action: () => navigation.navigate('PickupRequest') },
    { label: 'Track order', icon: 'map-pin' as const, action: () => navigation.navigate('Orders') },
    { label: 'Services', icon: 'grid' as const, action: () => navigation.navigate('Center') },
    { label: 'Receipts', icon: 'file-text' as const, action: () => navigation.navigate('Stock') },
  ];

  return (
    <Screen>
      <AppHeader />
      {user.role === 'admin' ? (
        <LinearGradient colors={[colors.primary, colors.primaryDark]} style={styles.hero}>
          <View><Text style={styles.heroEyebrow}>Revenue collected</Text><Text style={styles.heroAmount}>{money(revenue)}</Text><Text style={styles.heroDetail}>{state.activeBranchId === 'all' ? 'Across all active branches' : 'Current branch performance'}</Text></View>
          <View style={styles.heroIcon}><Feather name="trending-up" size={28} color="#fff" /></View>
        </LinearGradient>
      ) : user.role === 'staff' ? (
        <LinearGradient colors={[colors.primary, '#16A865']} style={styles.hero}>
          <View style={{ flex: 1 }}><Text style={styles.heroEyebrow}>Shift status</Text><Text style={styles.heroAmount}>{user.clockedIn ? 'Clocked in' : 'Not clocked in'}</Text><Text style={styles.heroDetail}>{user.clockedIn ? `${active.length} active orders need attention` : 'Clock in to start your workspace'}</Text></View>
          <TouchableOpacity onPress={() => dispatch({ type: 'CLOCK_TOGGLE', userId: user.id })} style={styles.shiftButton}><Feather name={user.clockedIn ? 'log-out' : 'log-in'} size={20} color={colors.primary} /></TouchableOpacity>
        </LinearGradient>
      ) : current ? (
        <TouchableOpacity activeOpacity={0.85} onPress={() => navigation.navigate('OrderDetail', { orderId: current.id })}>
          <LinearGradient colors={[colors.primary, colors.primaryDark]} style={styles.hero}>
            <View style={{ flex: 1 }}><Text style={styles.heroEyebrow}>Latest order</Text><Text style={styles.heroOrder}>{current.number}</Text><Text style={styles.heroAmountSmall}>{current.status.replaceAll('_', ' ')}</Text><Text style={styles.heroDetail}>Tap to follow each care stage</Text></View>
            <View style={styles.heroIcon}><Feather name="chevron-right" size={28} color="#fff" /></View>
          </LinearGradient>
        </TouchableOpacity>
      ) : (
        <LinearGradient colors={[colors.primary, colors.primaryDark]} style={styles.hero}><View><Text style={styles.heroEyebrow}>Welcome to Gatsi Comms</Text><Text style={styles.heroAmountSmall}>Your clothes, cared for.</Text><Text style={styles.heroDetail}>Book a pickup whenever you are ready.</Text></View></LinearGradient>
      )}

      <View style={styles.metrics}>
        {user.role === 'customer' ? <>
          <MetricCard label="Active orders" value={active.length} icon="refresh-cw" />
          <MetricCard label="Loyalty points" value={state.customers.find((item) => item.id === user.customerId)?.loyaltyPoints ?? 0} icon="award" tone="amber" />
          <MetricCard label="Completed" value={completed.length} icon="check-circle" tone="blue" />
          <MetricCard label="Balance due" value={money(outstanding)} icon="credit-card" tone={outstanding ? 'red' : 'green'} />
        </> : <>
          <MetricCard label="Active orders" value={active.length} icon="shopping-bag" detail="In the care workflow" />
          <MetricCard label="Ready today" value={orders.filter((item) => item.status === 'ready').length} icon="check-circle" tone="blue" detail="Awaiting collection" />
          <MetricCard label="Outstanding" value={money(outstanding)} icon="credit-card" tone="amber" detail="Across visible orders" />
          <MetricCard label="Low stock" value={state.inventory.filter((item) => (state.activeBranchId === 'all' || item.branchId === state.activeBranchId) && item.quantity <= item.reorderLevel).length} icon="alert-triangle" tone="red" detail="Needs replenishment" />
        </>}
      </View>

      <SectionTitle title="Quick actions" />
      <View style={styles.actions}>{actions.map((action) => <QuickAction key={action.label} {...action} onPress={action.action} />)}</View>

      <SectionTitle title={user.role === 'customer' ? 'Your recent orders' : 'Today’s workflow'} action="View all" onPress={() => navigation.navigate('Orders')} />
      {orders.slice(0, 3).map((order) => <OrderCard key={order.id} state={state} order={order} onPress={() => navigation.navigate('OrderDetail', { orderId: order.id })} />)}
      {!orders.length ? <View style={styles.noOrders}><Text style={styles.noOrdersText}>No orders here yet.</Text></View> : null}

      {user.role !== 'customer' ? <>
        <SectionTitle title="Team activity" />
        <View style={styles.activityCard}>
          {state.activities.filter((item) => state.activeBranchId === 'all' || item.branchId === state.activeBranchId).slice(0, 4).map((item, index) => {
            const actor = state.users.find((userItem) => userItem.id === item.userId);
            return <View key={item.id} style={[styles.activity, index > 0 && styles.activityBorder]}><View style={[styles.avatar, { backgroundColor: actor?.avatarColor ?? colors.primary }]}><Text style={styles.avatarText}>{actor?.name.split(' ').map((part) => part[0]).join('').slice(0, 2)}</Text></View><View style={{ flex: 1 }}><Text style={styles.activityMessage}><Text style={{ fontWeight: '800' }}>{actor?.name}</Text> {item.message}</Text><Text style={styles.activityMeta}>{new Date(item.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text></View></View>;
          })}
        </View>
      </> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radius.lg, padding: 22, minHeight: 150, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', overflow: 'hidden', ...shadow },
  heroEyebrow: { color: 'rgba(255,255,255,0.78)', fontSize: 13, fontWeight: '600' },
  heroAmount: { color: '#fff', fontSize: 31, fontWeight: '900', marginTop: 8, letterSpacing: -1 },
  heroOrder: { color: 'rgba(255,255,255,0.78)', fontSize: 14, fontWeight: '700', marginTop: 10 },
  heroAmountSmall: { color: '#fff', fontSize: 24, fontWeight: '900', marginTop: 3, textTransform: 'capitalize' },
  heroDetail: { color: 'rgba(255,255,255,0.72)', fontSize: 12, marginTop: 9 },
  heroIcon: { width: 54, height: 54, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.13)', alignItems: 'center', justifyContent: 'center' },
  shiftButton: { width: 54, height: 54, borderRadius: 17, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 11, marginTop: 16 },
  actions: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 18 },
  noOrders: { padding: 24, backgroundColor: colors.surface, borderRadius: radius.md },
  noOrdersText: { textAlign: 'center', color: colors.muted },
  activityCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 16, marginBottom: 16 },
  activity: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  activityBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 12, fontWeight: '900' },
  activityMessage: { color: colors.ink, fontSize: 13, lineHeight: 18 },
  activityMeta: { color: colors.subtle, fontSize: 11, marginTop: 3 },
});
