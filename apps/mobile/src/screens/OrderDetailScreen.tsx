import { Feather } from '@expo/vector-icons';
import { dateTime, getActiveUser, money, nextStatus, orderBalance, orderPaid, orderSubtotal, orderTotal, shortDate, statusLabels, statusSequence, makeId, type PaymentMethod } from '@gatsi/domain';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import React, { useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { AppHeader } from '../components/AppHeader';
import { Screen } from '../components/Screen';
import { Card, Input, PrimaryButton, SectionTitle, StatusPill } from '../components/ui';
import { RootStackParamList } from '../navigation/types';
import { useAppStore } from '../store/AppStore';
import { colors, radius } from '../theme';

const methods: PaymentMethod[] = ['cash', 'ecocash', 'card', 'bank_transfer'];

export function OrderDetailScreen() {
  const { params } = useRoute<RouteProp<RootStackParamList, 'OrderDetail'>>();
  const navigation = useNavigation<any>();
  const { state, dispatch } = useAppStore();
  const user = getActiveUser(state)!;
  const order = state.orders.find((item) => item.id === params.orderId);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  if (!order) return <Screen><AppHeader title="Order not found" back /></Screen>;
  const customer = state.customers.find((item) => item.id === order.customerId);
  const branch = state.branches.find((item) => item.id === order.branchId);
  const paid = orderPaid(state, order.id);
  const balance = orderBalance(state, order);
  const upcoming = nextStatus(order.status);

  const recordPayment = () => {
    const amount = Number(paymentAmount);
    if (!amount || amount <= 0 || amount > balance + 0.001) return Alert.alert('Check amount', `Enter an amount up to ${money(balance)}.`);
    dispatch({ type: 'ADD_PAYMENT', payment: { id: makeId('payment'), orderId: order.id, amount, method, paidAt: new Date().toISOString(), receivedByUserId: user.id } });
    setPaymentAmount('');
    Alert.alert('Payment saved', `${money(amount)} was recorded for ${order.number}.`);
  };

  return (
    <Screen>
      <AppHeader title="Order details" subtitle={order.number} back />
      <Card style={styles.summary}>
        <View style={styles.summaryTop}><View><Text style={styles.number}>{order.number}</Text><Text style={styles.customer}>{customer?.name}</Text></View><StatusPill status={order.status} /></View>
        <View style={styles.summaryGrid}>
          <View><Text style={styles.summaryLabel}>Due</Text><Text style={styles.summaryValue}>{shortDate(order.dueAt)}</Text></View>
          <View><Text style={styles.summaryLabel}>Branch</Text><Text style={styles.summaryValue}>{branch?.shortName}</Text></View>
          <View><Text style={styles.summaryLabel}>Intake</Text><Text style={styles.summaryValue}>{order.intakeMethod.replaceAll('_', ' ')}</Text></View>
        </View>
        {order.priority === 'urgent' ? <View style={styles.urgent}><Feather name="alert-circle" size={15} color={colors.red} /><Text style={styles.urgentText}>Urgent priority order</Text></View> : null}
      </Card>

      <SectionTitle title="Garments & services" />
      <Card style={styles.itemsCard}>
        {order.items.map((item, index) => {
          const service = state.services.find((entry) => entry.id === item.serviceId);
          return <View key={item.id} style={[styles.item, index > 0 && styles.itemBorder]}><View style={styles.itemIcon}><Feather name="package" size={18} color={colors.primary} /></View><View style={{ flex: 1 }}><Text style={styles.itemTitle}>{item.description}</Text><Text style={styles.itemMeta}>{service?.name} · {item.quantity} × {money(item.unitPrice)}</Text></View><Text style={styles.itemPrice}>{money(item.quantity * item.unitPrice)}</Text></View>;
        })}
        <View style={styles.totals}>
          <View style={styles.totalRow}><Text style={styles.totalLabel}>Subtotal</Text><Text style={styles.totalValue}>{money(orderSubtotal(order))}</Text></View>
          {order.discount ? <View style={styles.totalRow}><Text style={styles.totalLabel}>Discount</Text><Text style={[styles.totalValue, { color: colors.primary }]}>-{money(order.discount)}</Text></View> : null}
          {order.deliveryFee ? <View style={styles.totalRow}><Text style={styles.totalLabel}>Pickup / delivery</Text><Text style={styles.totalValue}>{money(order.deliveryFee)}</Text></View> : null}
          <View style={[styles.totalRow, styles.grandTotal]}><Text style={styles.grandLabel}>Total</Text><Text style={styles.grandValue}>{money(orderTotal(order))}</Text></View>
          <View style={styles.totalRow}><Text style={styles.totalLabel}>Paid</Text><Text style={[styles.totalValue, { color: colors.primary }]}>{money(paid)}</Text></View>
          <View style={styles.totalRow}><Text style={styles.balanceLabel}>Balance</Text><Text style={styles.balanceValue}>{money(balance)}</Text></View>
        </View>
      </Card>

      {user.role !== 'customer' && upcoming ? <>
        <SectionTitle title="Processing action" />
        <Card style={styles.actionCard}><View style={styles.actionIcon}><Feather name="fast-forward" size={22} color={colors.primary} /></View><View style={{ flex: 1 }}><Text style={styles.actionTitle}>Move to {statusLabels[upcoming]}</Text><Text style={styles.actionBody}>Adds a timestamped update visible to the customer.</Text></View><TouchableOpacity onPress={() => dispatch({ type: 'UPDATE_ORDER_STATUS', orderId: order.id, status: upcoming, userId: user.id })} style={styles.actionButton}><Feather name="arrow-right" size={20} color="#fff" /></TouchableOpacity></Card>
      </> : null}

      <SectionTitle title="Care journey" />
      <Card style={styles.timelineCard}>
        {statusSequence.slice(0, 9).map((status, index) => {
          const event = [...order.events].reverse().find((entry) => entry.status === status);
          const reached = Boolean(event) || statusSequence.indexOf(order.status) >= index;
          return <View key={status} style={styles.timelineItem}><View style={styles.timelineAxis}><View style={[styles.timelineDot, reached && styles.timelineDotReached]}>{reached ? <Feather name="check" size={11} color="#fff" /> : null}</View>{index < 8 ? <View style={[styles.timelineLine, reached && styles.timelineLineReached]} /> : null}</View><View style={styles.timelineCopy}><Text style={[styles.timelineTitle, reached && styles.timelineTitleReached]}>{statusLabels[status]}</Text><Text style={styles.timelineMeta}>{event ? dateTime(event.at) : 'Pending'}</Text>{event?.note ? <Text style={styles.timelineNote}>{event.note}</Text> : null}</View></View>;
        })}
      </Card>

      {user.role !== 'customer' && balance > 0 ? <>
        <SectionTitle title="Record payment" />
        <Card style={styles.paymentCard}>
          <Input label={`Amount (max ${money(balance)})`} icon="dollar-sign" keyboardType="decimal-pad" value={paymentAmount} onChangeText={setPaymentAmount} placeholder="0.00" />
          <Text style={styles.methodLabel}>Payment method</Text>
          <View style={styles.methods}>{methods.map((item) => <TouchableOpacity key={item} onPress={() => setMethod(item)} style={[styles.method, method === item && styles.methodActive]}><Text style={[styles.methodText, method === item && styles.methodTextActive]}>{item.replaceAll('_', ' ')}</Text></TouchableOpacity>)}</View>
          <PrimaryButton title="Save payment" icon="check" onPress={recordPayment} />
        </Card>
      </> : null}

      {paid > 0 ? <View style={styles.receiptButton}><PrimaryButton secondary title="View receipt" icon="file-text" onPress={() => navigation.navigate('Receipt', { orderId: order.id })} /></View> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  summary: { padding: 18 }, summaryTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }, number: { color: colors.ink, fontSize: 21, fontWeight: '900' }, customer: { color: colors.primary, marginTop: 5, fontWeight: '700' },
  summaryGrid: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 20, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.border }, summaryLabel: { color: colors.subtle, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }, summaryValue: { color: colors.ink, fontSize: 12, fontWeight: '700', marginTop: 4, textTransform: 'capitalize' },
  urgent: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: colors.redSoft, borderRadius: radius.sm, padding: 10, marginTop: 16 }, urgentText: { color: colors.red, fontSize: 12, fontWeight: '800' },
  itemsCard: { paddingHorizontal: 16 }, item: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15, gap: 11 }, itemBorder: { borderTopWidth: 1, borderTopColor: colors.border }, itemIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' }, itemTitle: { color: colors.ink, fontWeight: '800', fontSize: 13 }, itemMeta: { color: colors.muted, fontSize: 11, marginTop: 4 }, itemPrice: { color: colors.ink, fontWeight: '800', fontSize: 13 },
  totals: { borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: 14, gap: 9 }, totalRow: { flexDirection: 'row', justifyContent: 'space-between' }, totalLabel: { color: colors.muted, fontSize: 12 }, totalValue: { color: colors.ink, fontSize: 12, fontWeight: '700' }, grandTotal: { paddingTop: 9, borderTopWidth: 1, borderTopColor: colors.border }, grandLabel: { color: colors.ink, fontWeight: '900' }, grandValue: { color: colors.ink, fontSize: 17, fontWeight: '900' }, balanceLabel: { color: colors.ink, fontWeight: '900' }, balanceValue: { color: colors.red, fontWeight: '900' },
  actionCard: { padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }, actionIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' }, actionTitle: { color: colors.ink, fontSize: 14, fontWeight: '800' }, actionBody: { color: colors.muted, fontSize: 11, marginTop: 4 }, actionButton: { width: 42, height: 42, borderRadius: 13, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  timelineCard: { paddingHorizontal: 16, paddingTop: 16 }, timelineItem: { flexDirection: 'row', minHeight: 64 }, timelineAxis: { width: 28, alignItems: 'center' }, timelineDot: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center' }, timelineDotReached: { backgroundColor: colors.primary }, timelineLine: { width: 2, flex: 1, backgroundColor: colors.border }, timelineLineReached: { backgroundColor: colors.primaryLight }, timelineCopy: { flex: 1, paddingLeft: 8, paddingBottom: 15 }, timelineTitle: { color: colors.subtle, fontSize: 13, fontWeight: '700' }, timelineTitleReached: { color: colors.ink }, timelineMeta: { color: colors.subtle, fontSize: 10, marginTop: 3 }, timelineNote: { color: colors.muted, fontSize: 11, fontStyle: 'italic', marginTop: 4 },
  paymentCard: { padding: 16, gap: 14 }, methodLabel: { color: colors.ink, fontWeight: '700', fontSize: 13 }, methods: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, method: { paddingHorizontal: 11, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border }, methodActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary }, methodText: { color: colors.muted, fontSize: 11, textTransform: 'capitalize', fontWeight: '700' }, methodTextActive: { color: colors.primary }, receiptButton: { marginTop: 18 },
});
