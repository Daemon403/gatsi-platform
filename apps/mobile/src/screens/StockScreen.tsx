import { Feather } from '@expo/vector-icons';
import { getActiveUser, money, orderPaid, orderTotal, shortDate, visibleOrders } from '@gatsi/domain';
import { useNavigation } from '@react-navigation/native';
import React, { useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { AppHeader } from '../components/AppHeader';
import { Screen } from '../components/Screen';
import { Card, EmptyState } from '../components/ui';
import { useAppStore } from '../store/AppStore';
import { apiAction } from '../store/api';
import { colors, radius } from '../theme';

export function StockScreen() {
  const { state } = useAppStore();
  return getActiveUser(state)!.role === 'customer' ? <ReceiptsView /> : <InventoryView />;
}

function InventoryView() {
  const { state, dispatch } = useAppStore();
  const user = getActiveUser(state)!;
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const supplies = state.inventory.filter((item) => state.activeBranchId === 'all' || item.branchId === state.activeBranchId);
  const lowSupplies = supplies.filter((item) => item.quantity <= item.reorderLevel);
  const inventoryValue = supplies.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);

  const adjustSupply = async (itemId: string, delta: number) => {
    if (busyItemId) return;
    setBusyItemId(itemId);
    try {
      const selectedBranchId = state.activeBranchId;
      const remoteState = await apiAction({ type: 'ADJUST_INVENTORY', itemId, delta, userId: user.id });
      dispatch({ type: 'HYDRATE', state: { ...remoteState, activeBranchId: selectedBranchId } });
    } catch (reason) {
      Alert.alert('Could not adjust stock', reason instanceof Error ? reason.message : 'The supply quantity could not be updated.');
    } finally {
      setBusyItemId(null);
    }
  };

  return <Screen>
    <AppHeader title="Inventory" subtitle="Operating chemicals, packaging and consumables" />
    <View style={styles.inventoryHero}>
      <View><Text style={styles.inventoryLabel}>OPERATING STOCK</Text><Text style={styles.inventoryValue}>{money(inventoryValue)}</Text><Text style={styles.inventoryMeta}>Estimated supply value</Text></View>
      <View style={[styles.heroIcon, lowSupplies.length > 0 && styles.heroIconAlert]}><Feather name={lowSupplies.length > 0 ? 'alert-triangle' : 'package'} size={25} color={lowSupplies.length > 0 ? colors.amber : colors.primary} /></View>
    </View>
    <Text style={styles.sectionNote}>{supplies.length} supply line{supplies.length === 1 ? '' : 's'} · {lowSupplies.length} at or below reorder level</Text>
    {supplies.map((item) => {
      const branch = state.branches.find((entry) => entry.id === item.branchId);
      const isLow = item.quantity <= item.reorderLevel;
      const isBusy = busyItemId === item.id;
      return <Card key={item.id} style={styles.stockCard}>
        <View style={styles.stockTop}>
          <View style={[styles.stockIcon, isLow && styles.stockIconLow]}><Feather name={item.category === 'chemical' ? 'droplet' : 'package'} size={20} color={isLow ? colors.amber : colors.primary} /></View>
          <View style={styles.flex}><Text style={styles.stockName}>{item.name}</Text><Text style={styles.stockMeta}>{item.category} · {branch?.shortName ?? 'Branch'} · reorder at {item.reorderLevel} {item.unit}</Text></View>
          {isLow ? <Text style={styles.lowBadge}>LOW</Text> : null}
        </View>
        <View style={styles.stockBottom}>
          <View><Text style={styles.stockQuantity}>{item.quantity} <Text style={styles.stockUnit}>{item.unit}</Text></Text><Text style={styles.stockCost}>{money(item.unitCost)} per {item.unit}</Text></View>
          <View style={styles.stockActions}>
            <TouchableOpacity accessibilityLabel={`Remove one ${item.unit} of ${item.name}`} disabled={Boolean(busyItemId) || item.quantity <= 0} onPress={() => void adjustSupply(item.id, -1)} style={[styles.adjust, (Boolean(busyItemId) || item.quantity <= 0) && styles.disabled]}><Feather name="minus" size={18} color={colors.red} /></TouchableOpacity>
            <TouchableOpacity accessibilityLabel={`Add five ${item.unit} of ${item.name}`} disabled={Boolean(busyItemId)} onPress={() => void adjustSupply(item.id, 5)} style={[styles.adjust, styles.adjustAdd, Boolean(busyItemId) && styles.disabled]}><Feather name={isBusy ? 'loader' : 'plus'} size={18} color={colors.primary} /></TouchableOpacity>
          </View>
        </View>
      </Card>;
    })}
    {!supplies.length ? <Card><EmptyState icon="package" title="No operating inventory" body="Select another branch to view its chemicals, packaging and consumables." /></Card> : null}
  </Screen>;
}

function ReceiptsView() {
  const { state } = useAppStore();
  const navigation = useNavigation<any>();
  const paidOrders = visibleOrders(state).filter((order) => orderPaid(state, order.id) > 0);
  return <Screen>
    <AppHeader title="Receipts" subtitle="Payments and order history" />
    {paidOrders.map((order) => {
      const paid = orderPaid(state, order.id);
      return <Card key={order.id} style={styles.receiptCard}>
        <View style={styles.receiptIcon}><Feather name="file-text" size={22} color={colors.primary} /></View>
        <View style={styles.flex}><Text style={styles.receiptNumber}>{order.number}</Text><Text style={styles.receiptMeta}>{shortDate(order.createdAt)} · {order.items.length} service line{order.items.length === 1 ? '' : 's'}</Text><Text style={styles.receiptAmount}>{money(paid)} paid <Text style={styles.receiptTotal}>/ {money(orderTotal(order))}</Text></Text></View>
        <TouchableOpacity accessibilityLabel={`Open receipt ${order.number}`} onPress={() => navigation.navigate('Receipt', { orderId: order.id })} style={styles.receiptOpen}><Feather name="chevron-right" size={20} color={colors.primary} /></TouchableOpacity>
      </Card>;
    })}
    {!paidOrders.length ? <EmptyState icon="file-text" title="No receipts yet" body="Receipts appear here as soon as a payment is recorded." /> : null}
  </Screen>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  inventoryHero: { padding: 18, borderRadius: radius.lg, backgroundColor: colors.primaryLight, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  inventoryLabel: { color: colors.primary, fontSize: 10, fontWeight: '900', letterSpacing: 0.7 },
  inventoryValue: { color: colors.ink, fontSize: 21, fontWeight: '900', marginTop: 4 },
  inventoryMeta: { color: colors.muted, fontSize: 10, marginTop: 4 },
  heroIcon: { width: 50, height: 50, borderRadius: 16, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  heroIconAlert: { backgroundColor: colors.amberSoft },
  sectionNote: { color: colors.muted, fontSize: 10, fontWeight: '700', marginBottom: 13 },
  stockCard: { padding: 16, marginBottom: 12 },
  stockTop: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  stockIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  stockIconLow: { backgroundColor: colors.amberSoft },
  stockName: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  stockMeta: { color: colors.muted, fontSize: 9, lineHeight: 14, marginTop: 4, textTransform: 'capitalize' },
  lowBadge: { color: colors.amber, backgroundColor: colors.amberSoft, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 99, fontSize: 8, fontWeight: '900' },
  stockBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 13, marginTop: 13 },
  stockQuantity: { color: colors.ink, fontSize: 19, fontWeight: '900' },
  stockUnit: { color: colors.muted, fontSize: 11, fontWeight: '600' },
  stockCost: { color: colors.subtle, fontSize: 10, marginTop: 3 },
  stockActions: { flexDirection: 'row', gap: 8 },
  adjust: { width: 38, height: 38, borderRadius: 11, backgroundColor: colors.redSoft, alignItems: 'center', justifyContent: 'center' },
  adjustAdd: { backgroundColor: colors.primaryLight },
  disabled: { opacity: 0.45 },
  receiptCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15, marginBottom: 11 },
  receiptIcon: { width: 47, height: 47, borderRadius: 15, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  receiptNumber: { color: colors.ink, fontWeight: '900', fontSize: 14 },
  receiptMeta: { color: colors.muted, fontSize: 10, marginTop: 4 },
  receiptAmount: { color: colors.primary, fontSize: 12, fontWeight: '800', marginTop: 6 },
  receiptTotal: { color: colors.subtle, fontWeight: '600' },
  receiptOpen: { width: 37, height: 37, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
});
