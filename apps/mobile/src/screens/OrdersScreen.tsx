import { Feather } from '@expo/vector-icons';
import { getActiveUser, statusLabels, visibleOrders, type OrderStatus } from '@gatsi/domain';
import { useNavigation } from '@react-navigation/native';
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { AppHeader } from '../components/AppHeader';
import { Screen } from '../components/Screen';
import { EmptyState, OrderCard } from '../components/ui';
import { useAppStore } from '../store/AppStore';
import { colors, radius } from '../theme';

const filters: Array<{ key: 'all' | OrderStatus; label: string }> = [
  { key: 'all', label: 'All' }, { key: 'received', label: 'Received' }, { key: 'washing', label: 'Washing' }, { key: 'quality_check', label: 'Quality' }, { key: 'ready', label: 'Ready' }, { key: 'collected', label: 'Collected' },
];

export function OrdersScreen() {
  const { state } = useAppStore();
  const user = getActiveUser(state)!;
  const navigation = useNavigation<any>();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | OrderStatus>('all');
  const orders = visibleOrders(state);
  const visible = useMemo(() => orders.filter((order) => {
    const customer = state.customers.find((item) => item.id === order.customerId);
    const matchesText = `${order.number} ${customer?.name ?? ''}`.toLowerCase().includes(query.toLowerCase());
    return matchesText && (filter === 'all' || order.status === filter);
  }), [orders, query, filter, state.customers]);

  return (
    <Screen>
      <AppHeader title={user.role === 'customer' ? 'Track orders' : 'Orders'} subtitle={user.role === 'customer' ? 'Follow every stage of garment care' : 'Track and manage branch orders'} />
      <View style={styles.searchRow}>
        <View style={styles.search}><Feather name="search" size={18} color={colors.muted} /><TextInput value={query} onChangeText={setQuery} style={styles.searchInput} placeholder="Search order or customer..." placeholderTextColor={colors.subtle} /></View>
        {user.role !== 'customer' ? <TouchableOpacity onPress={() => navigation.navigate('CreateOrder')} style={styles.add}><Feather name="plus" size={23} color="#fff" /></TouchableOpacity> : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        {filters.map((item) => {
          const active = filter === item.key;
          const count = item.key === 'all' ? orders.length : orders.filter((order) => order.status === item.key).length;
          return <TouchableOpacity key={item.key} onPress={() => setFilter(item.key)} style={[styles.filter, active && styles.filterActive]}><Text style={[styles.filterText, active && styles.filterTextActive]}>{item.label}</Text><View style={[styles.filterCount, active && styles.filterCountActive]}><Text style={[styles.filterCountText, active && styles.filterCountTextActive]}>{count}</Text></View></TouchableOpacity>;
        })}
      </ScrollView>
      <Text style={styles.resultText}>{visible.length} {visible.length === 1 ? 'order' : 'orders'} {filter !== 'all' ? `in ${statusLabels[filter]}` : ''}</Text>
      {visible.map((order) => <OrderCard key={order.id} state={state} order={order} onPress={() => navigation.navigate('OrderDetail', { orderId: order.id })} />)}
      {!visible.length ? <EmptyState icon="search" title="No matching orders" body="Try another search term or switch the status filter." /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  searchRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  search: { flex: 1, height: 52, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 15, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md },
  searchInput: { flex: 1, color: colors.ink, fontSize: 14 },
  add: { width: 52, height: 52, backgroundColor: colors.primary, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  filters: { gap: 8, paddingBottom: 16 },
  filter: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: colors.surface, borderRadius: 999, borderWidth: 1, borderColor: colors.border },
  filterActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { color: colors.muted, fontWeight: '700', fontSize: 12 },
  filterTextActive: { color: '#fff' },
  filterCount: { minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  filterCountActive: { backgroundColor: 'rgba(255,255,255,0.2)' },
  filterCountText: { color: colors.ink, fontSize: 10, fontWeight: '800' },
  filterCountTextActive: { color: '#fff' },
  resultText: { color: colors.muted, fontSize: 12, marginBottom: 12 },
});
