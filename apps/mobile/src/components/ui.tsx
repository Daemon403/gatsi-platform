import { Feather } from '@expo/vector-icons';
import { orderBalance, orderProgress, shortDate, statusLabels, type AppState, type Order, type OrderStatus } from '@gatsi/domain';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { colors, radius, shadow } from '../theme';

export function Card({ children, style }: React.PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({ title, action, onPress }: { title: string; action?: string; onPress?: () => void }) {
  return (
    <View style={styles.sectionTitleRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action ? <TouchableOpacity onPress={onPress}><Text style={styles.sectionAction}>{action}</Text></TouchableOpacity> : null}
    </View>
  );
}

export function PrimaryButton({ title, onPress, icon = 'arrow-right', loading, disabled, secondary, compact }: { title: string; onPress: () => void; icon?: keyof typeof Feather.glyphMap; loading?: boolean; disabled?: boolean; secondary?: boolean; compact?: boolean }) {
  return (
    <TouchableOpacity activeOpacity={0.85} disabled={disabled || loading} onPress={onPress} style={[styles.button, secondary && styles.buttonSecondary, compact && styles.buttonCompact, (disabled || loading) && styles.buttonDisabled]}>
      {loading ? <ActivityIndicator color={secondary ? colors.primary : '#fff'} /> : <>
        <Text style={[styles.buttonText, secondary && styles.buttonTextSecondary]}>{title}</Text>
        {icon ? <Feather name={icon} size={18} color={secondary ? colors.primary : '#fff'} /> : null}
      </>}
    </TouchableOpacity>
  );
}

export function Input({ label, icon, multiline, style, ...props }: TextInputProps & { label: string; icon?: keyof typeof Feather.glyphMap }) {
  return (
    <View style={style}>
      <Text style={styles.inputLabel}>{label}</Text>
      <View style={[styles.inputWrap, multiline && styles.inputMultiline]}>
        {icon ? <Feather name={icon} size={18} color={colors.primary} style={styles.inputIcon} /> : null}
        <TextInput placeholderTextColor={colors.subtle} multiline={multiline} textAlignVertical={multiline ? 'top' : 'center'} style={[styles.input, multiline && styles.inputTextMultiline]} {...props} />
      </View>
    </View>
  );
}

const statusTone = (status: OrderStatus) => {
  if (status === 'cancelled') return { bg: colors.redSoft, fg: colors.red };
  if (status === 'ready' || status === 'collected') return { bg: colors.primaryLight, fg: colors.primary };
  if (status === 'received' || status === 'sorting') return { bg: colors.amberSoft, fg: colors.amber };
  if (status === 'out_for_delivery') return { bg: '#E9F8F7', fg: colors.teal };
  return { bg: colors.blueSoft, fg: colors.blue };
};

export function StatusPill({ status }: { status: OrderStatus }) {
  const tone = statusTone(status);
  return <View style={[styles.pill, { backgroundColor: tone.bg }]}><Text style={[styles.pillText, { color: tone.fg }]}>{statusLabels[status]}</Text></View>;
}

export function MetricCard({ label, value, icon, tone = 'green', detail }: { label: string; value: string | number; icon: keyof typeof Feather.glyphMap; tone?: 'green' | 'blue' | 'amber' | 'red'; detail?: string }) {
  const palette = {
    green: [colors.primary, colors.primaryLight],
    blue: [colors.blue, colors.blueSoft],
    amber: [colors.amber, colors.amberSoft],
    red: [colors.red, colors.redSoft],
  }[tone];
  return (
    <Card style={styles.metricCard}>
      <View style={[styles.metricIcon, { backgroundColor: palette[1] }]}><Feather name={icon} size={19} color={palette[0]} /></View>
      <Text style={[styles.metricValue, { color: palette[0] }]}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
      {detail ? <Text style={styles.metricDetail}>{detail}</Text> : null}
    </Card>
  );
}

export function QuickAction({ label, icon, onPress, tone = colors.primary }: { label: string; icon: keyof typeof Feather.glyphMap; onPress: () => void; tone?: string }) {
  return (
    <TouchableOpacity activeOpacity={0.75} onPress={onPress} style={styles.quickAction}>
      <View style={[styles.quickIcon, { backgroundColor: `${tone}15` }]}><Feather name={icon} size={24} color={tone} /></View>
      <Text style={styles.quickLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

export function OrderCard({ state, order, onPress }: { state: AppState; order: Order; onPress: () => void }) {
  const customer = state.customers.find((item) => item.id === order.customerId);
  const progress = orderProgress(order.status);
  const balance = orderBalance(state, order);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.orderCard, pressed && { opacity: 0.78 }]}>
      <View style={styles.orderTop}>
        <View style={styles.orderIcon}><Feather name="shopping-bag" size={21} color="#fff" /></View>
        <View style={styles.orderHeading}>
          <Text style={styles.orderNumber}>{order.number}</Text>
          <Text style={styles.orderCustomer} numberOfLines={1}>{customer?.name ?? 'Customer'}</Text>
        </View>
        <StatusPill status={order.status} />
      </View>
      <View style={styles.progressRow}>
        <View style={styles.progressTrack}><View style={[styles.progressBar, { width: `${progress}%` }]} /></View>
        <Text style={styles.progressText}>{progress}%</Text>
      </View>
      <View style={styles.orderMeta}>
        <View style={styles.metaItem}><Feather name="calendar" size={14} color={colors.muted} /><Text style={styles.metaText}>Due {shortDate(order.dueAt)}</Text></View>
        <View style={styles.metaItem}><Feather name="package" size={14} color={colors.muted} /><Text style={styles.metaText}>{order.items.reduce((sum, item) => sum + item.quantity, 0)} items</Text></View>
        {balance > 0 ? <Text style={styles.balance}>${balance.toFixed(2)} due</Text> : <Text style={styles.paid}>Paid</Text>}
      </View>
    </Pressable>
  );
}

export function EmptyState({ icon = 'inbox', title, body }: { icon?: keyof typeof Feather.glyphMap; title: string; body: string }) {
  return <View style={styles.empty}><View style={styles.emptyIcon}><Feather name={icon} size={28} color={colors.primary} /></View><Text style={styles.emptyTitle}>{title}</Text><Text style={styles.emptyBody}>{body}</Text></View>;
}

export const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, ...shadow },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, marginTop: 8 },
  sectionTitle: { fontSize: 19, fontWeight: '800', color: colors.ink },
  sectionAction: { color: colors.primary, fontWeight: '700', fontSize: 14 },
  button: { minHeight: 52, paddingHorizontal: 22, borderRadius: radius.md, backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  buttonCompact: { minHeight: 42, paddingHorizontal: 15, borderRadius: radius.sm },
  buttonSecondary: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.primary },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  buttonTextSecondary: { color: colors.primary },
  inputLabel: { color: colors.ink, fontSize: 14, fontWeight: '700', marginBottom: 8 },
  inputWrap: { minHeight: 52, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, backgroundColor: colors.surface },
  inputMultiline: { minHeight: 104, alignItems: 'flex-start' },
  inputIcon: { marginLeft: 15, marginTop: 1 },
  input: { flex: 1, color: colors.ink, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  inputTextMultiline: { minHeight: 100, paddingTop: 14 },
  pill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  pillText: { fontSize: 11, fontWeight: '800' },
  metricCard: { width: '48.4%', padding: 14, minHeight: 152 },
  metricIcon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  metricValue: { fontSize: 27, fontWeight: '900', letterSpacing: -0.8 },
  metricLabel: { color: colors.ink, fontSize: 13, fontWeight: '700', marginTop: 4 },
  metricDetail: { color: colors.muted, fontSize: 11, marginTop: 8 },
  quickAction: { width: '23%', alignItems: 'center', gap: 8 },
  quickIcon: { width: 54, height: 54, borderRadius: 17, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.primaryLight },
  quickLabel: { fontSize: 11, lineHeight: 14, fontWeight: '700', color: colors.ink, textAlign: 'center' },
  orderCard: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 12, ...shadow },
  orderTop: { flexDirection: 'row', alignItems: 'center' },
  orderIcon: { width: 45, height: 45, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  orderHeading: { flex: 1, marginLeft: 12, marginRight: 8 },
  orderNumber: { fontSize: 15, fontWeight: '800', color: colors.ink },
  orderCustomer: { color: colors.primary, fontSize: 13, marginTop: 4, fontWeight: '600' },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 15 },
  progressTrack: { flex: 1, height: 7, borderRadius: 99, backgroundColor: colors.primaryLight, overflow: 'hidden' },
  progressBar: { height: '100%', borderRadius: 99, backgroundColor: colors.primary },
  progressText: { width: 36, fontSize: 12, fontWeight: '800', color: colors.ink },
  orderMeta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginTop: 13 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText: { color: colors.muted, fontSize: 11 },
  balance: { color: colors.red, fontSize: 11, fontWeight: '800', marginLeft: 'auto' },
  paid: { color: colors.primary, fontSize: 11, fontWeight: '800', marginLeft: 'auto' },
  empty: { alignItems: 'center', paddingVertical: 42, paddingHorizontal: 28 },
  emptyIcon: { width: 60, height: 60, borderRadius: 20, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { color: colors.ink, fontSize: 18, fontWeight: '800', marginTop: 16 },
  emptyBody: { color: colors.muted, textAlign: 'center', lineHeight: 20, marginTop: 7 },
});
