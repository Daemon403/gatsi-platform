import { Feather } from '@expo/vector-icons';
import { getActiveUser, makeId, money, nextStatus, orderTotal, visibleOrders, type Customer, type CustomerMeasurements } from '@gatsi/domain';
import { useNavigation } from '@react-navigation/native';
import React, { useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { AppHeader } from '../components/AppHeader';
import { Screen } from '../components/Screen';
import { Card, EmptyState, Input, PrimaryButton, SectionTitle, StatusPill } from '../components/ui';
import { useAppStore } from '../store/AppStore';
import { apiAction, apiVerifyCustomer } from '../store/api';
import { colors, radius } from '../theme';

export function CenterScreen() {
  const { state } = useAppStore();
  const role = getActiveUser(state)!.role;
  if (role === 'admin') return <CustomersView />;
  if (role === 'staff') return <TasksView />;
  return <ServicesView />;
}

function CustomersView() {
  const { state, dispatch } = useAppStore();
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [unit, setUnit] = useState<CustomerMeasurements['unit']>('cm');
  const [measurements, setMeasurements] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [verifyingUserId, setVerifyingUserId] = useState<string | null>(null);
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  const savingRef = useRef(false);
  const customers = useMemo(() => state.customers.filter((customer) => (state.activeBranchId === 'all' || customer.branchId === state.activeBranchId) && `${customer.name} ${customer.phone}`.toLowerCase().includes(query.toLowerCase())), [state, query]);
  const fields = ['height', 'neck', 'chest', 'waist', 'hips', 'shoulder', 'sleeve', 'inseam'];
  const save = async () => {
    if (savingRef.current) return;
    const username = firstName.trim();
    const normalizedLastName = lastName.trim();
    const password = normalizedLastName.toUpperCase();
    if (!username || !normalizedLastName || !phone.trim()) {
      setError('First name, last name and phone are required.');
      return;
    }
    if (state.users.some((user) => user.username?.toLowerCase() === username.toLowerCase())) {
      setError('That username already exists. Use a different first name.');
      return;
    }

    const customerId = makeId('customer');
    const branchId = state.activeBranchId === 'all' ? state.branches[0].id : state.activeBranchId;
    const values = Object.fromEntries(Object.entries(measurements).filter(([, value]) => value !== '').map(([key, value]) => [key, Number(value)]));
    const action = {
      type: 'CREATE_CUSTOMER' as const,
      customer: {
        id: customerId,
        name: `${username} ${normalizedLastName}`,
        phone: phone.trim(),
        email: email.trim(),
        address: address.trim(),
        joinedAt: new Date().toISOString(),
        branchId,
        loyaltyPoints: 0,
        measurements: { unit, ...values },
      },
      user: {
        id: makeId('user'),
        role: 'customer' as const,
        name: `${username} ${normalizedLastName}`,
        email: email.trim(),
        phone: phone.trim(),
        branchIds: [branchId],
        customerId,
        avatarColor: colors.teal,
        username,
        password,
      },
    };

    savingRef.current = true;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const remote = await apiAction(action);
      dispatch({ type: 'HYDRATE', state: remote });
      setMessage(`Login created · Username: ${username} · Password: ${password} · Verification pending`);
      setAdding(false);
      setFirstName('');
      setLastName('');
      setPhone('');
      setEmail('');
      setAddress('');
      setMeasurements({});
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The customer could not be saved. Please try again.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const verifyCustomer = async (userId: string, customerName: string) => {
    if (verifyingUserId) return;
    setVerifyingUserId(userId);
    setError('');
    setMessage('');
    try {
      const remote = await apiVerifyCustomer(userId);
      dispatch({ type: 'HYDRATE', state: remote });
      setMessage(`${customerName}'s account is verified and ready for sign in.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The customer account could not be verified.');
    } finally {
      setVerifyingUserId(null);
    }
  };
  return <Screen><AppHeader title="Customers" subtitle="Relationships, measurements and order value" /><PrimaryButton title={adding ? 'Close customer form' : 'Add customer'} icon={adding ? 'x' : 'user-plus'} secondary={adding} disabled={saving} onPress={() => { setAdding(!adding); setError(''); setMessage(''); }} />{message ? <View style={styles.success}><Feather name="key" size={18} color={colors.primary} /><Text style={styles.successText}>{message}</Text></View> : null}{error ? <View style={styles.errorBanner}><Feather name="alert-circle" size={18} color={colors.red} /><Text style={styles.errorText}>{error}</Text></View> : null}{adding ? <Card style={styles.customerForm}><Text style={styles.formTitle}>Onboard a customer</Text><View style={styles.formGap}><Input label="First name *" value={firstName} onChangeText={setFirstName} autoCapitalize="words" /><Input label="Last name *" value={lastName} onChangeText={setLastName} autoCapitalize="words" /><Input label="Phone *" value={phone} onChangeText={setPhone} keyboardType="phone-pad" /><Input label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" /><Input label="Address" value={address} onChangeText={setAddress} /></View><View style={styles.measurementTitle}><View><Text style={styles.formTitle}>Measurements</Text><Text style={styles.measurementHint}>Optional — add what is available</Text></View><View style={styles.unitToggle}>{(['cm', 'in'] as const).map((item) => <TouchableOpacity key={item} onPress={() => setUnit(item)} style={[styles.unitButton, unit === item && styles.unitButtonActive]}><Text style={[styles.unitText, unit === item && styles.unitTextActive]}>{item}</Text></TouchableOpacity>)}</View></View><View style={styles.mobileMeasurementGrid}>{fields.map((field) => <Input key={field} style={styles.measurementInput} label={`${field[0].toUpperCase()}${field.slice(1)} (${unit})`} value={measurements[field] ?? ''} onChangeText={(value) => setMeasurements((current) => ({ ...current, [field]: value }))} keyboardType="decimal-pad" />)}</View><PrimaryButton title="Save customer" icon="check" loading={saving} disabled={saving} onPress={save} /></Card> : null}<View style={styles.search}><Feather name="search" size={18} color={colors.muted} /><TextInput style={styles.searchInput} value={query} onChangeText={setQuery} placeholder="Search customers..." placeholderTextColor={colors.subtle} /></View><Text style={styles.count}>{customers.length} customer records</Text>{customers.map((customer) => {
    const orders = state.orders.filter((order) => order.customerId === customer.id);
    const spend = orders.reduce((sum, order) => sum + orderTotal(order), 0);
    const branch = state.branches.find((item) => item.id === customer.branchId);
    const customerUser = state.users.find((user) => user.customerId === customer.id && user.role === 'customer');
    const verified = customerUser?.verified === true;
    return <Card key={customer.id} style={styles.customerCard}><View style={styles.customerTop}><View style={styles.avatar}><Text style={styles.avatarText}>{customer.name.slice(0, 2).toUpperCase()}</Text></View><View style={{ flex: 1 }}><Text style={styles.customerName}>{customer.name}</Text><Text style={styles.customerMeta}>{customer.phone}</Text><Text style={styles.customerMeta}>{branch?.shortName}</Text></View><TouchableOpacity accessibilityRole="button" accessibilityLabel={`Edit ${customer.name}`} onPress={() => setEditingCustomerId((current) => current === customer.id ? null : customer.id)} style={styles.editCustomerButton}><Feather name={editingCustomerId === customer.id ? 'x' : 'edit-2'} size={17} color={colors.primary} /></TouchableOpacity><TouchableOpacity style={styles.callButton}><Feather name="phone" size={17} color={colors.primary} /></TouchableOpacity></View>{customerUser ? <View style={styles.verificationRow}><View style={[styles.verificationPill, verified && styles.verificationPillVerified]}><Feather name={verified ? 'check-circle' : 'clock'} size={13} color={verified ? colors.primary : colors.amber} /><Text style={[styles.verificationText, verified && styles.verificationTextVerified]}>{verified ? 'Account verified' : 'Verification pending'}</Text></View>{!verified ? <TouchableOpacity disabled={Boolean(verifyingUserId)} onPress={() => void verifyCustomer(customerUser.id, customer.name)} style={[styles.verifyButton, verifyingUserId && styles.verifyButtonDisabled]}><Text style={styles.verifyButtonText}>{verifyingUserId === customerUser.id ? 'Verifying…' : 'Verify account'}</Text></TouchableOpacity> : null}</View> : null}<View style={styles.customerStats}><View><Text style={styles.statValue}>{orders.length}</Text><Text style={styles.statLabel}>Orders</Text></View><View><Text style={styles.statValue}>{money(spend)}</Text><Text style={styles.statLabel}>Lifetime value</Text></View><View><Text style={styles.statValue}>{customer.loyaltyPoints}</Text><Text style={styles.statLabel}>Points</Text></View></View>{editingCustomerId === customer.id ? <CustomerEditForm customer={customer} onClose={() => setEditingCustomerId(null)} /> : null}</Card>;
  })}</Screen>;
}

type MeasurementField = Exclude<keyof CustomerMeasurements, 'unit'>;
const measurementFields: MeasurementField[] = ['height', 'neck', 'chest', 'waist', 'hips', 'shoulder', 'sleeve', 'inseam'];

function CustomerEditForm({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const { state, dispatch } = useAppStore();
  const [name, setName] = useState(customer.name);
  const [phone, setPhone] = useState(customer.phone);
  const [email, setEmail] = useState(customer.email);
  const [address, setAddress] = useState(customer.address);
  const [branchId, setBranchId] = useState(customer.branchId);
  const [loyaltyPoints, setLoyaltyPoints] = useState(String(customer.loyaltyPoints));
  const [unit, setUnit] = useState<CustomerMeasurements['unit']>(customer.measurements?.unit ?? 'cm');
  const [measurementValues, setMeasurementValues] = useState<Partial<Record<MeasurementField, string>>>(() => Object.fromEntries(
    measurementFields.map((field) => [field, customer.measurements?.[field] === undefined ? '' : String(customer.measurements[field])]),
  ));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const activeBranches = state.branches.filter((branch) => branch.active);

  const save = async () => {
    if (saving) return;
    const parsedPoints = Number(loyaltyPoints);
    if (!name.trim() || !phone.trim() || !address.trim()) {
      setError('Customer name, phone and address are required.');
      return;
    }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter a valid email address or leave it blank.');
      return;
    }
    if (!activeBranches.some((branch) => branch.id === branchId)) {
      setError('Choose an open branch for this customer.');
      return;
    }
    if (!loyaltyPoints.trim() || !Number.isInteger(parsedPoints) || parsedPoints < 0) {
      setError('Loyalty points must be a whole number of zero or more.');
      return;
    }

    const parsedMeasurements: Partial<Record<MeasurementField, number>> = {};
    for (const field of measurementFields) {
      const value = measurementValues[field]?.trim() ?? '';
      if (!value) continue;
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1_000) {
        setError(`${field[0].toUpperCase()}${field.slice(1)} must be between zero and 1,000.`);
        return;
      }
      parsedMeasurements[field] = parsed;
    }

    setSaving(true);
    setError('');
    try {
      const selectedAdminBranchId = state.activeBranchId;
      const remoteState = await apiAction({
        type: 'UPDATE_CUSTOMER',
        customerId: customer.id,
        updates: {
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim(),
          address: address.trim(),
          branchId,
          loyaltyPoints: parsedPoints,
          measurements: { unit, ...parsedMeasurements },
        },
      });
      dispatch({ type: 'HYDRATE', state: { ...remoteState, activeBranchId: selectedAdminBranchId } });
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The customer could not be updated. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return <View style={styles.customerEditor}>
    <View style={styles.editHeading}>
      <View style={styles.editHeadingIcon}><Feather name="edit-3" size={17} color={colors.primary} /></View>
      <View style={{ flex: 1 }}><Text style={styles.editTitle}>Edit customer</Text><Text style={styles.editSubtitle}>Keep contact, branch and measurement details current.</Text></View>
    </View>
    <Input label="Customer name *" value={name} editable={!saving} onChangeText={(value) => { setName(value); setError(''); }} autoCapitalize="words" />
    <Input label="Phone *" value={phone} editable={!saving} onChangeText={(value) => { setPhone(value); setError(''); }} keyboardType="phone-pad" />
    <Input label="Email" value={email} editable={!saving} onChangeText={(value) => { setEmail(value); setError(''); }} keyboardType="email-address" autoCapitalize="none" />
    <Input label="Address *" value={address} editable={!saving} onChangeText={(value) => { setAddress(value); setError(''); }} />
    <Input label="Loyalty points" value={loyaltyPoints} editable={!saving} onChangeText={(value) => { setLoyaltyPoints(value); setError(''); }} keyboardType="number-pad" />
    <Text style={styles.editFieldLabel}>Home branch *</Text>
    <View style={styles.editBranchChoices}>
      {activeBranches.map((branch) => {
        const selected = branch.id === branchId;
        return <TouchableOpacity
          key={branch.id}
          disabled={saving}
          accessibilityRole="radio"
          accessibilityState={{ checked: selected, disabled: saving }}
          onPress={() => { setBranchId(branch.id); setError(''); }}
          style={[styles.editBranchChoice, selected && styles.editBranchChoiceSelected, saving && styles.editDisabled]}
        >
          <Feather name={selected ? 'check-circle' : 'map-pin'} size={14} color={selected ? colors.primary : colors.muted} />
          <Text style={[styles.editBranchText, selected && styles.editBranchTextSelected]}>{branch.shortName}</Text>
        </TouchableOpacity>;
      })}
    </View>
    <View style={styles.measurementTitle}>
      <View><Text style={styles.editTitle}>Measurements</Text><Text style={styles.measurementHint}>Optional — update what is available</Text></View>
      <View style={styles.unitToggle}>{(['cm', 'in'] as const).map((item) => <TouchableOpacity key={item} disabled={saving} onPress={() => setUnit(item)} style={[styles.unitButton, unit === item && styles.unitButtonActive]}><Text style={[styles.unitText, unit === item && styles.unitTextActive]}>{item}</Text></TouchableOpacity>)}</View>
    </View>
    <View style={styles.mobileMeasurementGrid}>{measurementFields.map((field) => <Input key={field} style={styles.measurementInput} label={`${field[0].toUpperCase()}${field.slice(1)} (${unit})`} value={measurementValues[field] ?? ''} editable={!saving} onChangeText={(value) => { setMeasurementValues((current) => ({ ...current, [field]: value })); setError(''); }} keyboardType="decimal-pad" />)}</View>
    {error ? <View style={styles.editError}><Feather name="alert-circle" size={16} color={colors.red} /><Text style={styles.editErrorText}>{error}</Text></View> : null}
    <View style={styles.editActions}>
      <PrimaryButton title="Cancel" icon="x" secondary compact disabled={saving} onPress={onClose} />
      <View style={{ flex: 1 }}><PrimaryButton title="Save customer" icon="check" compact loading={saving} onPress={() => void save()} /></View>
    </View>
  </View>;
}

function TasksView() {
  const { state, dispatch } = useAppStore();
  const navigation = useNavigation<any>();
  const user = getActiveUser(state)!;
  const tasks = visibleOrders(state).filter((order) => order.assignedStaffId === user.id && order.status !== 'collected' && order.status !== 'cancelled');
  return <Screen><AppHeader title="My tasks" subtitle="Orders assigned to you" /><View style={styles.taskHero}><View><Text style={styles.taskHeroLabel}>Today’s queue</Text><Text style={styles.taskHeroValue}>{tasks.length} active orders</Text></View><View style={styles.taskHeroIcon}><Feather name="check-square" size={25} color={colors.primary} /></View></View>{tasks.map((order) => { const customer = state.customers.find((item) => item.id === order.customerId); const upcoming = nextStatus(order.status); return <Card key={order.id} style={styles.taskCard}><TouchableOpacity onPress={() => navigation.navigate('OrderDetail', { orderId: order.id })}><View style={styles.taskTop}><View><Text style={styles.taskNumber}>{order.number}</Text><Text style={styles.taskCustomer}>{customer?.name}</Text></View><StatusPill status={order.status} /></View><Text style={styles.taskItems}>{order.items.map((item) => `${item.quantity}× ${item.description}`).join(', ')}</Text></TouchableOpacity>{upcoming ? <TouchableOpacity onPress={() => dispatch({ type: 'UPDATE_ORDER_STATUS', orderId: order.id, status: upcoming, userId: user.id })} style={styles.advance}><Text style={styles.advanceText}>Complete stage · move to {upcoming.replaceAll('_', ' ')}</Text><Feather name="arrow-right" size={17} color="#fff" /></TouchableOpacity> : null}</Card>; })}{!tasks.length ? <EmptyState icon="check-circle" title="Queue cleared" body="There are no active orders assigned to you." /> : null}</Screen>;
}

function ServicesView() {
  const { state } = useAppStore();
  const navigation = useNavigation<any>();
  return <Screen><AppHeader title="Services" subtitle="Transparent prices and turnaround times" /><View style={styles.serviceHero}><Text style={styles.serviceHeroTitle}>Fresh, finished and ready.</Text><Text style={styles.serviceHeroBody}>From everyday laundry to specialist textile care, every item is tagged and traceable.</Text><PrimaryButton compact title="Book a pickup" icon="truck" onPress={() => navigation.navigate('PickupRequest')} /></View><SectionTitle title="Service menu" />{state.services.filter((item) => item.active).map((service) => <Card key={service.id} style={styles.serviceCard}><View style={styles.serviceIcon}><Feather name={service.category === 'speciality' ? 'star' : 'package'} size={21} color={colors.primary} /></View><View style={{ flex: 1 }}><Text style={styles.serviceTitle}>{service.name}</Text><Text style={styles.serviceBody}>{service.description}</Text><View style={styles.serviceMeta}><Text style={styles.servicePrice}>{money(service.price)} / {service.unit}</Text><Text style={styles.turnaround}>{service.turnaroundHours}h turnaround</Text></View></View></Card>)}</Screen>;
}

const styles = StyleSheet.create({
  search: { height: 52, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 15, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md }, searchInput: { flex: 1, color: colors.ink }, count: { color: colors.muted, fontSize: 12, marginVertical: 13 },
  customerCard: { padding: 16, marginBottom: 12 }, customerTop: { flexDirection: 'row', alignItems: 'center', gap: 9 }, avatar: { width: 48, height: 48, borderRadius: 15, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' }, avatarText: { color: colors.primary, fontWeight: '900' }, customerName: { color: colors.ink, fontSize: 15, fontWeight: '800' }, customerMeta: { color: colors.muted, fontSize: 11, marginTop: 3 }, editCustomerButton: { width: 39, height: 39, borderRadius: 12, backgroundColor: colors.blueSoft, alignItems: 'center', justifyContent: 'center' }, callButton: { width: 39, height: 39, borderRadius: 12, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' }, customerStats: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 14, marginTop: 14, borderTopWidth: 1, borderTopColor: colors.border }, statValue: { color: colors.ink, fontSize: 14, fontWeight: '900' }, statLabel: { color: colors.subtle, fontSize: 9, marginTop: 3, textTransform: 'uppercase' },
  customerEditor: { gap: 13, paddingTop: 16, marginTop: 16, borderTopWidth: 1, borderTopColor: colors.border }, editHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 }, editHeadingIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' }, editTitle: { color: colors.ink, fontSize: 14, fontWeight: '900' }, editSubtitle: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 3 }, editFieldLabel: { color: colors.ink, fontSize: 12, fontWeight: '800' }, editBranchChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, editBranchChoice: { minHeight: 38, paddingHorizontal: 11, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: 6 }, editBranchChoiceSelected: { borderColor: colors.primary, backgroundColor: colors.primaryLight }, editBranchText: { color: colors.muted, fontSize: 10, fontWeight: '800' }, editBranchTextSelected: { color: colors.primary }, editDisabled: { opacity: 0.48 }, editError: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, padding: 10, borderRadius: radius.sm, backgroundColor: colors.redSoft }, editErrorText: { flex: 1, color: colors.red, fontSize: 10, lineHeight: 15, fontWeight: '700' }, editActions: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  customerForm: { padding: 17, marginTop: 13, marginBottom: 14 }, formTitle: { color: colors.ink, fontSize: 17, fontWeight: '900' }, formGap: { gap: 13, marginTop: 15 }, measurementTitle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 22, marginBottom: 12 }, measurementHint: { color: colors.muted, fontSize: 10, marginTop: 3 }, unitToggle: { flexDirection: 'row', padding: 3, borderRadius: 9, backgroundColor: colors.background }, unitButton: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 7 }, unitButtonActive: { backgroundColor: colors.primary }, unitText: { color: colors.muted, fontWeight: '800', fontSize: 11 }, unitTextActive: { color: '#fff' }, mobileMeasurementGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 11 }, measurementInput: { width: '48%' }, success: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 13, marginTop: 12, borderRadius: radius.sm, backgroundColor: colors.primaryLight }, successText: { flex: 1, color: colors.primaryDark, fontSize: 11, fontWeight: '700', lineHeight: 16 }, errorBanner: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 13, marginTop: 12, borderRadius: radius.sm, backgroundColor: colors.redSoft, borderWidth: 1, borderColor: '#F6C6C8' }, errorText: { flex: 1, color: colors.red, fontSize: 11, fontWeight: '700', lineHeight: 16 }, verificationRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 14 }, verificationPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, paddingVertical: 7, borderRadius: 999, backgroundColor: colors.amberSoft }, verificationPillVerified: { backgroundColor: colors.primaryLight }, verificationText: { color: colors.amber, fontSize: 10, fontWeight: '800' }, verificationTextVerified: { color: colors.primary }, verifyButton: { paddingHorizontal: 11, paddingVertical: 8, borderRadius: radius.sm, backgroundColor: colors.primary }, verifyButtonDisabled: { opacity: 0.55 }, verifyButtonText: { color: '#fff', fontSize: 10, fontWeight: '900' },
  taskHero: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.primaryLight, borderRadius: radius.lg, padding: 18, marginBottom: 16 }, taskHeroLabel: { color: colors.primary, fontSize: 12, fontWeight: '700' }, taskHeroValue: { color: colors.ink, fontSize: 22, fontWeight: '900', marginTop: 4 }, taskHeroIcon: { width: 51, height: 51, borderRadius: 16, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  taskCard: { padding: 16, marginBottom: 12 }, taskTop: { flexDirection: 'row', justifyContent: 'space-between' }, taskNumber: { color: colors.ink, fontWeight: '900' }, taskCustomer: { color: colors.primary, fontSize: 12, marginTop: 4, fontWeight: '600' }, taskItems: { color: colors.muted, fontSize: 11, marginTop: 12, lineHeight: 16 }, advance: { marginTop: 14, backgroundColor: colors.primary, minHeight: 42, borderRadius: radius.sm, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7, paddingHorizontal: 12 }, advanceText: { color: '#fff', fontSize: 11, fontWeight: '800', textTransform: 'capitalize' },
  serviceHero: { backgroundColor: colors.primaryDark, borderRadius: radius.lg, padding: 20, gap: 10 }, serviceHeroTitle: { color: '#fff', fontSize: 22, fontWeight: '900' }, serviceHeroBody: { color: 'rgba(255,255,255,0.75)', fontSize: 12, lineHeight: 18, marginBottom: 4 }, serviceCard: { padding: 15, marginBottom: 11, flexDirection: 'row', gap: 12 }, serviceIcon: { width: 47, height: 47, borderRadius: 15, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' }, serviceTitle: { color: colors.ink, fontSize: 14, fontWeight: '800' }, serviceBody: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 4 }, serviceMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 9 }, servicePrice: { color: colors.primary, fontSize: 12, fontWeight: '900' }, turnaround: { color: colors.subtle, fontSize: 10 },
});
