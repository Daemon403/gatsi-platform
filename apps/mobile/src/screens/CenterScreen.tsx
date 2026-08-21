import { Feather } from '@expo/vector-icons';
import { getActiveUser, money, nextStatus, orderTotal, visibleOrders } from '@gatsi/domain';
import { useNavigation } from '@react-navigation/native';
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { AppHeader } from '../components/AppHeader';
import { Screen } from '../components/Screen';
import { Card, EmptyState, PrimaryButton, SectionTitle, StatusPill } from '../components/ui';
import { useAppStore } from '../store/AppStore';
import { colors, radius } from '../theme';

export function CenterScreen() {
  const { state } = useAppStore();
  const role = getActiveUser(state)!.role;
  if (role === 'admin') return <CustomersView />;
  if (role === 'staff') return <TasksView />;
  return <ServicesView />;
}

function CustomersView() {
  const { state } = useAppStore();
  const [query, setQuery] = useState('');
  const customers = useMemo(() => state.customers.filter((customer) => (state.activeBranchId === 'all' || customer.branchId === state.activeBranchId) && `${customer.name} ${customer.phone}`.toLowerCase().includes(query.toLowerCase())), [state, query]);
  return <Screen><AppHeader title="Customers" subtitle="Relationships, loyalty and order value" /><View style={styles.search}><Feather name="search" size={18} color={colors.muted} /><TextInput style={styles.searchInput} value={query} onChangeText={setQuery} placeholder="Search customers..." placeholderTextColor={colors.subtle} /></View><Text style={styles.count}>{customers.length} customer records</Text>{customers.map((customer) => {
    const orders = state.orders.filter((order) => order.customerId === customer.id); const spend = orders.reduce((sum, order) => sum + orderTotal(order), 0); const branch = state.branches.find((item) => item.id === customer.branchId);
    return <Card key={customer.id} style={styles.customerCard}><View style={styles.customerTop}><View style={styles.avatar}><Text style={styles.avatarText}>{customer.name.slice(0, 2).toUpperCase()}</Text></View><View style={{ flex: 1 }}><Text style={styles.customerName}>{customer.name}</Text><Text style={styles.customerMeta}>{customer.phone}</Text><Text style={styles.customerMeta}>{branch?.shortName}</Text></View><TouchableOpacity style={styles.callButton}><Feather name="phone" size={17} color={colors.primary} /></TouchableOpacity></View><View style={styles.customerStats}><View><Text style={styles.statValue}>{orders.length}</Text><Text style={styles.statLabel}>Orders</Text></View><View><Text style={styles.statValue}>{money(spend)}</Text><Text style={styles.statLabel}>Lifetime value</Text></View><View><Text style={styles.statValue}>{customer.loyaltyPoints}</Text><Text style={styles.statLabel}>Points</Text></View></View></Card>;
  })}</Screen>;
}

function TasksView() {
  const { state, dispatch } = useAppStore();
  const navigation = useNavigation<any>();
  const user = getActiveUser(state)!;
  const tasks = visibleOrders(state).filter((order) => order.status !== 'collected' && order.status !== 'cancelled');
  return <Screen><AppHeader title="My tasks" subtitle="Orders assigned to your branch" /><View style={styles.taskHero}><View><Text style={styles.taskHeroLabel}>Today’s queue</Text><Text style={styles.taskHeroValue}>{tasks.length} active orders</Text></View><View style={styles.taskHeroIcon}><Feather name="check-square" size={25} color={colors.primary} /></View></View>{tasks.map((order) => { const customer = state.customers.find((item) => item.id === order.customerId); const upcoming = nextStatus(order.status); return <Card key={order.id} style={styles.taskCard}><TouchableOpacity onPress={() => navigation.navigate('OrderDetail', { orderId: order.id })}><View style={styles.taskTop}><View><Text style={styles.taskNumber}>{order.number}</Text><Text style={styles.taskCustomer}>{customer?.name}</Text></View><StatusPill status={order.status} /></View><Text style={styles.taskItems}>{order.items.map((item) => `${item.quantity}× ${item.description}`).join(', ')}</Text></TouchableOpacity>{upcoming ? <TouchableOpacity onPress={() => dispatch({ type: 'UPDATE_ORDER_STATUS', orderId: order.id, status: upcoming, userId: user.id })} style={styles.advance}><Text style={styles.advanceText}>Complete stage · move to {upcoming.replaceAll('_', ' ')}</Text><Feather name="arrow-right" size={17} color="#fff" /></TouchableOpacity> : null}</Card>; })}{!tasks.length ? <EmptyState icon="check-circle" title="Queue cleared" body="There are no active orders assigned to this branch." /> : null}</Screen>;
}

function ServicesView() {
  const { state } = useAppStore();
  const navigation = useNavigation<any>();
  return <Screen><AppHeader title="Services" subtitle="Transparent prices and turnaround times" /><View style={styles.serviceHero}><Text style={styles.serviceHeroTitle}>Fresh, finished and ready.</Text><Text style={styles.serviceHeroBody}>From everyday laundry to specialist textile care, every item is tagged and traceable.</Text><PrimaryButton compact title="Book a pickup" icon="truck" onPress={() => navigation.navigate('PickupRequest')} /></View><SectionTitle title="Service menu" />{state.services.filter((item) => item.active).map((service) => <Card key={service.id} style={styles.serviceCard}><View style={styles.serviceIcon}><Feather name={service.category === 'speciality' ? 'star' : 'package'} size={21} color={colors.primary} /></View><View style={{ flex: 1 }}><Text style={styles.serviceTitle}>{service.name}</Text><Text style={styles.serviceBody}>{service.description}</Text><View style={styles.serviceMeta}><Text style={styles.servicePrice}>{money(service.price)} / {service.unit}</Text><Text style={styles.turnaround}>{service.turnaroundHours}h turnaround</Text></View></View></Card>)}</Screen>;
}

const styles = StyleSheet.create({
  search: { height: 52, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 15, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md }, searchInput: { flex: 1, color: colors.ink }, count: { color: colors.muted, fontSize: 12, marginVertical: 13 },
  customerCard: { padding: 16, marginBottom: 12 }, customerTop: { flexDirection: 'row', alignItems: 'center', gap: 12 }, avatar: { width: 48, height: 48, borderRadius: 15, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' }, avatarText: { color: colors.primary, fontWeight: '900' }, customerName: { color: colors.ink, fontSize: 15, fontWeight: '800' }, customerMeta: { color: colors.muted, fontSize: 11, marginTop: 3 }, callButton: { width: 39, height: 39, borderRadius: 12, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' }, customerStats: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 14, marginTop: 14, borderTopWidth: 1, borderTopColor: colors.border }, statValue: { color: colors.ink, fontSize: 14, fontWeight: '900' }, statLabel: { color: colors.subtle, fontSize: 9, marginTop: 3, textTransform: 'uppercase' },
  taskHero: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.primaryLight, borderRadius: radius.lg, padding: 18, marginBottom: 16 }, taskHeroLabel: { color: colors.primary, fontSize: 12, fontWeight: '700' }, taskHeroValue: { color: colors.ink, fontSize: 22, fontWeight: '900', marginTop: 4 }, taskHeroIcon: { width: 51, height: 51, borderRadius: 16, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  taskCard: { padding: 16, marginBottom: 12 }, taskTop: { flexDirection: 'row', justifyContent: 'space-between' }, taskNumber: { color: colors.ink, fontWeight: '900' }, taskCustomer: { color: colors.primary, fontSize: 12, marginTop: 4, fontWeight: '600' }, taskItems: { color: colors.muted, fontSize: 11, marginTop: 12, lineHeight: 16 }, advance: { marginTop: 14, backgroundColor: colors.primary, minHeight: 42, borderRadius: radius.sm, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7, paddingHorizontal: 12 }, advanceText: { color: '#fff', fontSize: 11, fontWeight: '800', textTransform: 'capitalize' },
  serviceHero: { backgroundColor: colors.primaryDark, borderRadius: radius.lg, padding: 20, gap: 10 }, serviceHeroTitle: { color: '#fff', fontSize: 22, fontWeight: '900' }, serviceHeroBody: { color: 'rgba(255,255,255,0.75)', fontSize: 12, lineHeight: 18, marginBottom: 4 }, serviceCard: { padding: 15, marginBottom: 11, flexDirection: 'row', gap: 12 }, serviceIcon: { width: 47, height: 47, borderRadius: 15, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' }, serviceTitle: { color: colors.ink, fontSize: 14, fontWeight: '800' }, serviceBody: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 4 }, serviceMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 9 }, servicePrice: { color: colors.primary, fontSize: 12, fontWeight: '900' }, turnaround: { color: colors.subtle, fontSize: 10 },
});
