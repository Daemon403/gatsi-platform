import { Feather } from '@expo/vector-icons';
import { getActiveUser, money, orderPaid, orderTotal, shortDate, visibleOrders } from '@gatsi/domain';
import { useNavigation } from '@react-navigation/native';
import React from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { AppHeader } from '../components/AppHeader';
import { Screen } from '../components/Screen';
import { Card, EmptyState, PrimaryButton, SectionTitle } from '../components/ui';
import { useAppStore } from '../store/AppStore';
import { colors, radius } from '../theme';

export function StockScreen() {
  const { state } = useAppStore();
  const user = getActiveUser(state)!;
  return user.role === 'customer' ? <ReceiptsView /> : <InventoryView />;
}

function InventoryView() {
  const { state, dispatch } = useAppStore();
  const user = getActiveUser(state)!;
  const items = state.inventory.filter((item) => state.activeBranchId === 'all' || item.branchId === state.activeBranchId);
  const low = items.filter((item) => item.quantity <= item.reorderLevel);
  return <Screen><AppHeader title="Inventory" subtitle="Chemicals, packaging and consumables" /><View style={styles.inventoryHero}><View><Text style={styles.inventoryLabel}>Stock health</Text><Text style={styles.inventoryValue}>{low.length ? `${low.length} need attention` : 'All levels healthy'}</Text></View><Feather name={low.length ? 'alert-triangle' : 'check-circle'} size={28} color={low.length ? colors.amber : colors.primary} /></View><SectionTitle title="Branch stock" />{items.map((item) => { const branch = state.branches.find((entry) => entry.id === item.branchId); const isLow = item.quantity <= item.reorderLevel; return <Card key={item.id} style={styles.stockCard}><View style={styles.stockTop}><View style={[styles.stockIcon, isLow && styles.stockIconLow]}><Feather name="droplet" size={20} color={isLow ? colors.amber : colors.primary} /></View><View style={{ flex: 1 }}><Text style={styles.stockName}>{item.name}</Text><Text style={styles.stockMeta}>{branch?.shortName} · Reorder at {item.reorderLevel} {item.unit}</Text></View>{isLow ? <View style={styles.lowPill}><Text style={styles.lowText}>Low</Text></View> : null}</View><View style={styles.stockBottom}><View><Text style={styles.stockQuantity}>{item.quantity} <Text style={styles.stockUnit}>{item.unit}</Text></Text><Text style={styles.stockCost}>{money(item.unitCost)} per {item.unit.replace(/s$/, '')}</Text></View><View style={styles.stockActions}><TouchableOpacity onPress={() => dispatch({ type: 'ADJUST_INVENTORY', itemId: item.id, delta: -1, userId: user.id })} style={styles.adjust}><Feather name="minus" size={18} color={colors.red} /></TouchableOpacity><TouchableOpacity onPress={() => dispatch({ type: 'ADJUST_INVENTORY', itemId: item.id, delta: 5, userId: user.id })} style={[styles.adjust, styles.adjustAdd]}><Feather name="plus" size={18} color={colors.primary} /></TouchableOpacity></View></View></Card>; })}{!items.length ? <EmptyState title="No inventory" body="There are no stock records for this branch yet." /> : null}</Screen>;
}

function ReceiptsView() {
  const { state } = useAppStore();
  const navigation = useNavigation<any>();
  const paidOrders = visibleOrders(state).filter((order) => orderPaid(state, order.id) > 0);
  return <Screen><AppHeader title="Receipts" subtitle="Payments and order history" />{paidOrders.map((order) => { const paid = orderPaid(state, order.id); return <Card key={order.id} style={styles.receiptCard}><View style={styles.receiptIcon}><Feather name="file-text" size={22} color={colors.primary} /></View><View style={{ flex: 1 }}><Text style={styles.receiptNumber}>{order.number}</Text><Text style={styles.receiptMeta}>{shortDate(order.createdAt)} · {order.items.length} service line{order.items.length > 1 ? 's' : ''}</Text><Text style={styles.receiptAmount}>{money(paid)} paid <Text style={styles.receiptTotal}>/ {money(orderTotal(order))}</Text></Text></View><TouchableOpacity onPress={() => navigation.navigate('Receipt', { orderId: order.id })} style={styles.receiptOpen}><Feather name="chevron-right" size={20} color={colors.primary} /></TouchableOpacity></Card>; })}{!paidOrders.length ? <EmptyState icon="file-text" title="No receipts yet" body="Receipts appear here as soon as a payment is recorded." /> : null}</Screen>;
}

const styles = StyleSheet.create({
  inventoryHero: { padding: 18, borderRadius: radius.lg, backgroundColor: colors.primaryLight, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, inventoryLabel: { color: colors.primary, fontSize: 12, fontWeight: '700' }, inventoryValue: { color: colors.ink, fontSize: 21, fontWeight: '900', marginTop: 4 },
  stockCard: { padding: 16, marginBottom: 12 }, stockTop: { flexDirection: 'row', alignItems: 'center', gap: 11 }, stockIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' }, stockIconLow: { backgroundColor: colors.amberSoft }, stockName: { color: colors.ink, fontSize: 14, fontWeight: '800' }, stockMeta: { color: colors.muted, fontSize: 10, marginTop: 4 }, lowPill: { backgroundColor: colors.amberSoft, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 99 }, lowText: { color: colors.amber, fontWeight: '900', fontSize: 10 }, stockBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 13, marginTop: 13 }, stockQuantity: { color: colors.ink, fontSize: 19, fontWeight: '900' }, stockUnit: { color: colors.muted, fontSize: 11, fontWeight: '600' }, stockCost: { color: colors.subtle, fontSize: 10, marginTop: 3 }, stockActions: { flexDirection: 'row', gap: 8 }, adjust: { width: 38, height: 38, borderRadius: 11, backgroundColor: colors.redSoft, alignItems: 'center', justifyContent: 'center' }, adjustAdd: { backgroundColor: colors.primaryLight },
  receiptCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15, marginBottom: 11 }, receiptIcon: { width: 47, height: 47, borderRadius: 15, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' }, receiptNumber: { color: colors.ink, fontWeight: '900', fontSize: 14 }, receiptMeta: { color: colors.muted, fontSize: 10, marginTop: 4 }, receiptAmount: { color: colors.primary, fontSize: 12, fontWeight: '800', marginTop: 6 }, receiptTotal: { color: colors.subtle, fontWeight: '600' }, receiptOpen: { width: 37, height: 37, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
});
