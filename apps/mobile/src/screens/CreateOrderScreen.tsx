import { Feather } from '@expo/vector-icons';
import { getActiveUser, makeId, money, orderNumber, type Order } from '@gatsi/domain';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { AppHeader } from '../components/AppHeader';
import { Screen } from '../components/Screen';
import { Card, Input, PrimaryButton, SectionTitle } from '../components/ui';
import { useAppStore } from '../store/AppStore';
import { colors, radius } from '../theme';

export function CreateOrderScreen() {
  const { state, dispatch } = useAppStore();
  const navigation = useNavigation<any>();
  const user = getActiveUser(state)!;
  const availableBranches = user.role === 'admin' ? state.branches : state.branches.filter((item) => user.branchIds.includes(item.id));
  const initialBranch = state.activeBranchId === 'all' ? availableBranches[0]?.id : state.activeBranchId;
  const [branchId, setBranchId] = useState(initialBranch ?? state.branches[0].id);
  const customers = state.customers.filter((item) => item.branchId === branchId);
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? state.customers[0].id);
  const [serviceId, setServiceId] = useState(state.services[0].id);
  const [quantity, setQuantity] = useState(1);
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [urgent, setUrgent] = useState(false);
  const service = state.services.find((item) => item.id === serviceId)!;
  const total = service.price * quantity;

  const dueAt = useMemo(() => new Date(Date.now() + service.turnaroundHours * 60 * 60 * 1000).toISOString(), [service]);

  const create = () => {
    if (!customerId || !description.trim()) return Alert.alert('Details needed', 'Select a customer and describe the garments in this order.');
    const id = makeId('order');
    const order: Order = {
      id,
      number: orderNumber(state),
      branchId,
      customerId,
      assignedStaffId: user.role === 'staff' ? user.id : state.users.find((item) => item.role === 'staff' && item.active !== false && item.branchIds.includes(branchId))?.id,
      status: 'received',
      priority: urgent ? 'urgent' : 'normal',
      intakeMethod: 'walk_in',
      createdAt: new Date().toISOString(),
      dueAt,
      notes,
      discount: 0,
      deliveryFee: 0,
      items: [{ id: makeId('item'), serviceId, description: description.trim(), quantity, unitPrice: service.price }],
      events: [{ id: makeId('event'), status: 'received', at: new Date().toISOString(), byUserId: user.id }],
    };
    dispatch({ type: 'CREATE_ORDER', order });
    Alert.alert('Order created', `${order.number} is ready for processing.`, [{ text: 'Open order', onPress: () => navigation.replace('OrderDetail', { orderId: id }) }]);
  };

  return (
    <Screen>
      <AppHeader title="Create order" subtitle="Register garments at the counter" back />
      <LinearGradient colors={[colors.primary, colors.primaryDark]} style={styles.assistant}>
        <View style={styles.assistantIcon}><Feather name="zap" size={22} color="#fff" /></View><View style={{ flex: 1 }}><Text style={styles.assistantTitle}>Fast garment intake</Text><Text style={styles.assistantText}>Choose a service, count the items and add care notes. Pricing and due time update automatically.</Text></View>
      </LinearGradient>

      <SectionTitle title="Branch" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choiceRow}>{availableBranches.map((branch) => <TouchableOpacity key={branch.id} onPress={() => { setBranchId(branch.id); setCustomerId(state.customers.find((item) => item.branchId === branch.id)?.id ?? ''); }} style={[styles.choice, branchId === branch.id && styles.choiceActive]}><Feather name="map-pin" size={16} color={branchId === branch.id ? colors.primary : colors.muted} /><Text style={[styles.choiceText, branchId === branch.id && styles.choiceTextActive]}>{branch.shortName}</Text></TouchableOpacity>)}</ScrollView>

      <SectionTitle title="Customer" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choiceRow}>{customers.map((customer) => <TouchableOpacity key={customer.id} onPress={() => setCustomerId(customer.id)} style={[styles.customerChoice, customerId === customer.id && styles.customerChoiceActive]}><View style={styles.customerAvatar}><Text style={styles.customerAvatarText}>{customer.name.slice(0, 2).toUpperCase()}</Text></View><View><Text style={styles.customerName}>{customer.name}</Text><Text style={styles.customerPhone}>{customer.phone}</Text></View>{customerId === customer.id ? <Feather name="check-circle" size={18} color={colors.primary} /> : null}</TouchableOpacity>)}</ScrollView>

      <SectionTitle title="Service" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choiceRow}>{state.services.filter((item) => item.active).map((item) => <TouchableOpacity key={item.id} onPress={() => setServiceId(item.id)} style={[styles.serviceChoice, serviceId === item.id && styles.serviceChoiceActive]}><View style={[styles.serviceIcon, serviceId === item.id && { backgroundColor: colors.primary }]}><Feather name="package" size={18} color={serviceId === item.id ? '#fff' : colors.primary} /></View><Text style={styles.serviceName}>{item.name}</Text><Text style={styles.servicePrice}>{money(item.price)} / {item.unit}</Text></TouchableOpacity>)}</ScrollView>

      <Card style={styles.form}>
        <Input label="Garment description *" icon="edit-3" value={description} onChangeText={setDescription} placeholder="e.g. 4 white shirts with collar stains" />
        <View><Text style={styles.fieldLabel}>Quantity</Text><View style={styles.stepper}><TouchableOpacity onPress={() => setQuantity(Math.max(1, quantity - 1))} style={styles.stepButton}><Feather name="minus" size={18} color={colors.ink} /></TouchableOpacity><Text style={styles.quantity}>{quantity}</Text><TouchableOpacity onPress={() => setQuantity(quantity + 1)} style={styles.stepButton}><Feather name="plus" size={18} color={colors.primary} /></TouchableOpacity><Text style={styles.unit}>{service.unit}{quantity > 1 ? 's' : ''}</Text></View></View>
        <Input label="Care notes (optional)" icon="file-text" value={notes} onChangeText={setNotes} multiline placeholder="Stains, fabric concerns or customer instructions..." />
        <TouchableOpacity onPress={() => setUrgent(!urgent)} style={[styles.priority, urgent && styles.priorityActive]}><View style={[styles.checkbox, urgent && styles.checkboxActive]}>{urgent ? <Feather name="check" size={13} color="#fff" /> : null}</View><View><Text style={styles.priorityTitle}>Urgent priority</Text><Text style={styles.priorityText}>Flag this order for the branch team</Text></View></TouchableOpacity>
        <View style={styles.priceSummary}><View><Text style={styles.priceLabel}>Estimated total</Text><Text style={styles.dueText}>Due in about {service.turnaroundHours} hours</Text></View><Text style={styles.priceValue}>{money(total)}</Text></View>
      </Card>
      <View style={styles.submit}><PrimaryButton title="Create order" icon="arrow-right" onPress={create} /></View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  assistant: { borderRadius: radius.lg, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 13 }, assistantIcon: { width: 45, height: 45, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' }, assistantTitle: { color: '#fff', fontSize: 16, fontWeight: '900' }, assistantText: { color: 'rgba(255,255,255,0.76)', fontSize: 11, lineHeight: 16, marginTop: 4 },
  choiceRow: { gap: 9, paddingBottom: 2 }, choice: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 13, height: 43, borderRadius: 13, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, choiceActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft }, choiceText: { color: colors.muted, fontSize: 12, fontWeight: '700' }, choiceTextActive: { color: colors.primary },
  customerChoice: { minWidth: 215, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, customerChoiceActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft }, customerAvatar: { width: 39, height: 39, borderRadius: 13, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' }, customerAvatarText: { color: colors.primary, fontWeight: '900', fontSize: 12 }, customerName: { color: colors.ink, fontSize: 12, fontWeight: '800' }, customerPhone: { color: colors.muted, fontSize: 10, marginTop: 3 },
  serviceChoice: { width: 145, padding: 13, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, serviceChoiceActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft }, serviceIcon: { width: 36, height: 36, borderRadius: 11, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' }, serviceName: { color: colors.ink, fontWeight: '800', fontSize: 12, marginTop: 10 }, servicePrice: { color: colors.primary, fontWeight: '700', fontSize: 10, marginTop: 5 },
  form: { padding: 16, gap: 17, marginTop: 18 }, fieldLabel: { color: colors.ink, fontSize: 14, fontWeight: '700', marginBottom: 8 }, stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, minHeight: 52, paddingHorizontal: 8 }, stepButton: { width: 38, height: 38, borderRadius: 11, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }, quantity: { color: colors.ink, fontSize: 18, fontWeight: '900', width: 50, textAlign: 'center' }, unit: { color: colors.muted, fontSize: 12, marginLeft: 'auto', marginRight: 10 },
  priority: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: 13 }, priorityActive: { borderColor: colors.red, backgroundColor: colors.redSoft }, checkbox: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }, checkboxActive: { backgroundColor: colors.red, borderColor: colors.red }, priorityTitle: { color: colors.ink, fontSize: 13, fontWeight: '800' }, priorityText: { color: colors.muted, fontSize: 10, marginTop: 3 }, priceSummary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.primarySoft, padding: 14, borderRadius: radius.sm }, priceLabel: { color: colors.ink, fontSize: 12, fontWeight: '800' }, dueText: { color: colors.muted, fontSize: 10, marginTop: 3 }, priceValue: { color: colors.primary, fontSize: 23, fontWeight: '900' }, submit: { marginTop: 16 },
});
