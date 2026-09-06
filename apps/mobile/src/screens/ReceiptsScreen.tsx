import { Feather } from '@expo/vector-icons';
import { dateTime, money, visibleReceipts } from '@gatsi/domain';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { AppHeader } from '../components/AppHeader';
import { Screen } from '../components/Screen';
import { Card, EmptyState } from '../components/ui';
import type { RootStackParamList } from '../navigation/types';
import { useAppStore } from '../store/AppStore';
import { colors, radius } from '../theme';

export function ReceiptsScreen() {
  const { state } = useAppStore();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const receipts = visibleReceipts(state);
  const received = receipts.reduce((sum, receipt) => sum + receipt.amountPaid, 0);
  return <Screen>
    <AppHeader title="Receipts" subtitle="Service payments and store sales" back />
    <View style={styles.hero}><View><Text style={styles.heroLabel}>VISIBLE TRANSACTIONS</Text><Text style={styles.heroValue}>{money(received)}</Text><Text style={styles.heroMeta}>{receipts.length} receipt{receipts.length === 1 ? '' : 's'}</Text></View><View style={styles.heroIcon}><Feather name="file-text" size={24} color={colors.primary} /></View></View>
    {receipts.map((receipt) => <TouchableOpacity key={receipt.id} activeOpacity={0.8} onPress={() => navigation.navigate('Receipt', { receiptId: receipt.id })}>
      <Card style={styles.card}><View style={styles.icon}><Feather name={receipt.kind === 'store' ? 'shopping-bag' : 'scissors'} size={20} color={colors.primary} /></View><View style={styles.flex}><Text style={styles.number}>{receipt.number}</Text><Text style={styles.meta}>{receipt.kind === 'store' ? 'Store sale' : receipt.orderNumber ?? 'Service payment'} · {dateTime(receipt.issuedAt)}</Text><Text style={styles.customer}>{receipt.customerName} · {receipt.paymentMethod.replaceAll('_', ' ')}</Text></View><View style={styles.amount}><Text>{money(receipt.amountPaid)}</Text><Feather name="chevron-right" size={18} color={colors.primary} /></View></Card>
    </TouchableOpacity>)}
    {!receipts.length ? <EmptyState icon="file-text" title="No receipts yet" body="A receipt will appear automatically after every service payment and store sale." /> : null}
  </Screen>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 }, hero: { padding: 18, borderRadius: radius.lg, backgroundColor: colors.primaryLight, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }, heroLabel: { color: colors.primary, fontSize: 9, fontWeight: '900', letterSpacing: 0.7 }, heroValue: { color: colors.ink, fontSize: 23, fontWeight: '900', marginTop: 4 }, heroMeta: { color: colors.muted, fontSize: 10, marginTop: 3 }, heroIcon: { width: 50, height: 50, borderRadius: 16, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }, card: { padding: 14, marginBottom: 11, flexDirection: 'row', alignItems: 'center', gap: 11 }, icon: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' }, number: { color: colors.ink, fontSize: 12, fontWeight: '900' }, meta: { color: colors.muted, fontSize: 9, marginTop: 4 }, customer: { color: colors.primary, fontSize: 9, fontWeight: '700', marginTop: 4, textTransform: 'capitalize' }, amount: { alignItems: 'flex-end', gap: 5 },
});
