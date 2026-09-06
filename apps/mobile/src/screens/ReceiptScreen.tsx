import { Feather } from '@expo/vector-icons';
import { dateTime, money, visibleReceipts } from '@gatsi/domain';
import { RouteProp, useRoute } from '@react-navigation/native';
import React from 'react';
import { Alert, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { AppHeader } from '../components/AppHeader';
import { Screen } from '../components/Screen';
import { EmptyState } from '../components/ui';
import { RootStackParamList } from '../navigation/types';
import { useAppStore } from '../store/AppStore';
import { colors, radius, shadow } from '../theme';

const shareText = (receipt: ReturnType<typeof visibleReceipts>[number]) => [
  'GATSI COMMS — OFFICIAL RECEIPT',
  receipt.number,
  `${receipt.kind === 'store' ? 'Store sale' : 'Service payment'} · ${dateTime(receipt.issuedAt)}`,
  `Customer: ${receipt.customerName}`,
  receipt.orderNumber ? `Order: ${receipt.orderNumber}` : undefined,
  ...receipt.lines.map((line) => `${line.quantity} × ${line.description} @ ${money(line.unitPrice)} = ${money(line.total)}`),
  `Paid: ${money(receipt.amountPaid)} (${receipt.paymentMethod.replaceAll('_', ' ')})`,
  receipt.kind === 'service' ? `Balance after payment: ${money(receipt.balanceAfter)}` : undefined,
  'Thank you for your business.',
].filter(Boolean).join('\n');

export function ReceiptScreen() {
  const { params } = useRoute<RouteProp<RootStackParamList, 'Receipt'>>();
  const { state } = useAppStore();
  const receipt = visibleReceipts(state).find((item) => item.id === params.receiptId);
  if (!receipt) return <Screen><AppHeader title="Receipt" back /><EmptyState icon="alert-circle" title="Receipt not found" body="This receipt is not available in your current workspace." /></Screen>;

  const share = async () => {
    try {
      await Share.share({ title: receipt.number, message: shareText(receipt) });
    } catch (reason) {
      Alert.alert('Could not share receipt', reason instanceof Error ? reason.message : 'Try again.');
    }
  };

  return <Screen>
    <AppHeader title="Receipt" subtitle={receipt.number} back />
    <View style={styles.receipt}>
      <View style={styles.brand}><View style={styles.logo}><Text style={styles.logoText}>G</Text></View><Text style={styles.brandName}>GATSI COMMS</Text><Text style={styles.brandLine}>Textile, Dry Cleaning & Store</Text></View>
      <View style={styles.rule} />
      <View style={styles.typeRow}><Text style={styles.type}>{receipt.kind === 'store' ? 'STORE SALE' : 'SERVICE PAYMENT'}</Text><Text style={styles.receiptNumber}>{receipt.number}</Text></View>
      <View style={styles.infoRow}><View style={styles.infoColumn}><Text style={styles.label}>DATE & TIME</Text><Text style={styles.value}>{dateTime(receipt.issuedAt)}</Text></View><View style={[styles.infoColumn, styles.right]}><Text style={styles.label}>BRANCH</Text><Text style={styles.value}>{receipt.branchName}</Text></View></View>
      <View style={styles.infoRow}><View style={styles.infoColumn}><Text style={styles.label}>CUSTOMER</Text><Text style={styles.value}>{receipt.customerName}</Text>{receipt.customerPhone ? <Text style={styles.small}>{receipt.customerPhone}</Text> : null}</View><View style={[styles.infoColumn, styles.right]}><Text style={styles.label}>{receipt.orderNumber ? 'ORDER' : 'RECEIVED BY'}</Text><Text style={styles.value}>{receipt.orderNumber ?? receipt.issuedByName}</Text></View></View>
      {receipt.orderNumber ? <View style={styles.receivedBy}><Text style={styles.label}>RECEIVED BY</Text><Text style={styles.value}>{receipt.issuedByName}</Text></View> : null}
      <Text style={styles.heading}>ITEMS</Text>
      {receipt.lines.map((line) => <View key={line.id} style={styles.item}>
        <View style={styles.flex}><Text style={styles.itemName}>{line.description}</Text>{line.detail ? <Text style={styles.small}>{line.detail}</Text> : null}<Text style={styles.small}>{line.quantity} × {money(line.unitPrice)}</Text>{line.listUnitPrice !== undefined && line.listUnitPrice !== line.unitPrice ? <Text style={styles.initialPrice}>Initial price: {money(line.listUnitPrice)} each</Text> : null}</View>
        <Text style={styles.itemAmount}>{money(line.total)}</Text>
      </View>)}
      <View style={styles.rule} />
      <View style={styles.totalRow}><Text style={styles.totalLabel}>Subtotal</Text><Text style={styles.totalText}>{money(receipt.subtotal)}</Text></View>
      {receipt.discount ? <View style={styles.totalRow}><Text style={styles.totalLabel}>Discount</Text><Text style={styles.totalText}>−{money(receipt.discount)}</Text></View> : null}
      {receipt.fees ? <View style={styles.totalRow}><Text style={styles.totalLabel}>Pickup / delivery</Text><Text style={styles.totalText}>{money(receipt.fees)}</Text></View> : null}
      <View style={styles.totalRow}><Text style={styles.totalLabel}>Transaction total</Text><Text style={styles.totalText}>{money(receipt.total)}</Text></View>
      <View style={[styles.totalRow, styles.paidRow]}><Text style={styles.grandLabel}>Paid on this receipt</Text><Text style={styles.grandText}>{money(receipt.amountPaid)}</Text></View>
      {receipt.kind === 'service' ? <View style={styles.totalRow}><Text style={styles.totalLabel}>Balance after payment</Text><Text style={styles.totalText}>{money(receipt.balanceAfter)}</Text></View> : null}
      <View style={styles.payment}><Text style={styles.paymentText}>PAYMENT METHOD</Text><Text style={styles.paymentAmount}>{receipt.paymentMethod.replaceAll('_', ' ')}</Text></View>
      {receipt.reference ? <View style={styles.payment}><Text style={styles.paymentText}>REFERENCE</Text><Text style={styles.paymentAmount}>{receipt.reference}</Text></View> : null}
      <View style={styles.thanks}><Text style={styles.thanksText}>THANK YOU FOR YOUR BUSINESS</Text><Text style={styles.thanksSub}>This is a permanent record of this transaction.</Text></View>
    </View>
    <View style={styles.actions}><TouchableOpacity onPress={() => void share()} style={styles.action}><Feather name="share-2" size={19} color={colors.primary} /><Text style={styles.actionText}>Share</Text></TouchableOpacity><TouchableOpacity onPress={() => Alert.alert('Print receipt', 'Use Share to send this receipt to a connected printing app, or print it from the web dashboard.')} style={styles.action}><Feather name="printer" size={19} color={colors.primary} /><Text style={styles.actionText}>Print</Text></TouchableOpacity></View>
  </Screen>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 }, receipt: { backgroundColor: '#fff', borderRadius: radius.md, padding: 22, borderWidth: 1, borderColor: colors.border, ...shadow }, brand: { alignItems: 'center', paddingBottom: 18 }, logo: { width: 49, height: 49, borderRadius: 15, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }, logoText: { color: '#fff', fontSize: 25, fontWeight: '900' }, brandName: { color: colors.ink, fontSize: 17, fontWeight: '900', marginTop: 10 }, brandLine: { color: colors.muted, fontSize: 10, marginTop: 3 },
  rule: { height: 1, backgroundColor: colors.border, marginVertical: 14 }, typeRow: { alignItems: 'center', gap: 5, marginBottom: 18 }, type: { color: colors.primary, fontSize: 10, fontWeight: '900', letterSpacing: 1 }, receiptNumber: { color: colors.ink, fontSize: 10, fontWeight: '800', textAlign: 'center' }, infoRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 17, gap: 12 }, infoColumn: { flex: 1 }, right: { alignItems: 'flex-end' }, label: { color: colors.subtle, fontSize: 8, fontWeight: '800', letterSpacing: 0.8 }, value: { color: colors.ink, fontSize: 11, fontWeight: '700', marginTop: 4 }, small: { color: colors.muted, fontSize: 9, marginTop: 3 }, receivedBy: { marginBottom: 12 }, heading: { color: colors.ink, fontSize: 10, fontWeight: '900', letterSpacing: 0.8, marginTop: 10, marginBottom: 9 }, item: { flexDirection: 'row', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.background }, itemName: { color: colors.ink, fontSize: 11, fontWeight: '700' }, initialPrice: { color: colors.amber, fontSize: 9, marginTop: 3 }, itemAmount: { color: colors.ink, fontSize: 11, fontWeight: '800' }, totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }, totalLabel: { color: colors.muted, fontSize: 10 }, totalText: { color: colors.ink, fontSize: 10, fontWeight: '700' }, paidRow: { borderTopWidth: 2, borderTopColor: colors.ink, marginTop: 6, paddingTop: 10 }, grandLabel: { color: colors.ink, fontSize: 11, fontWeight: '900' }, grandText: { color: colors.primary, fontSize: 14, fontWeight: '900' }, payment: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 }, paymentText: { color: colors.muted, fontSize: 9 }, paymentAmount: { color: colors.ink, fontSize: 10, fontWeight: '800', textTransform: 'capitalize' }, thanks: { alignItems: 'center', backgroundColor: colors.primarySoft, borderRadius: radius.sm, padding: 15, marginTop: 18 }, thanksText: { color: colors.primary, fontSize: 10, fontWeight: '900', letterSpacing: 0.5 }, thanksSub: { color: colors.muted, fontSize: 9, marginTop: 4 }, actions: { flexDirection: 'row', gap: 10, marginTop: 15 }, action: { flex: 1, height: 48, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, actionText: { color: colors.primary, fontWeight: '800' },
});
