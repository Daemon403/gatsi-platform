import { Feather } from '@expo/vector-icons';
import { getActiveUser, makeId, money, orderNumber, type Customer, type Order, type User } from '@gatsi/domain';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { AppHeader } from '../components/AppHeader';
import { Screen } from '../components/Screen';
import { Card, Input, PrimaryButton, SectionTitle } from '../components/ui';
import { useAppStore } from '../store/AppStore';
import { apiAction } from '../store/api';
import { colors, radius } from '../theme';

type CustomerDraft = { firstName: string; lastName: string; phone: string; email: string; address: string };
type ServiceLineDraft = { id: string; serviceId: string; description: string; quantity: number; notes: string };
type CreatedCustomerOrder = { orderId: string; orderNumber: string; customerName: string; username: string; password: string };

const emptyCustomerDraft: CustomerDraft = { firstName: '', lastName: '', phone: '', email: '', address: '' };
const normalized = (value: string) => value.trim().toLocaleLowerCase();
const initials = (name: string) => name.split(' ').filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toLocaleUpperCase();

export function CreateOrderScreen() {
  const { state, dispatch } = useAppStore();
  const navigation = useNavigation<any>();
  const user = getActiveUser(state)!;
  const activeServices = useMemo(() => state.services.filter((service) => service.active), [state.services]);
  const availableBranches = state.branches.filter((branch) => branch.active && (user.role === 'admin' || user.branchIds.includes(branch.id)));
  const initialBranchId = availableBranches.some((branch) => branch.id === state.activeBranchId) ? state.activeBranchId : availableBranches[0]?.id ?? '';
  const [branchId, setBranchId] = useState(initialBranchId);
  const [assignedStaffId, setAssignedStaffId] = useState(user.role === 'staff' ? user.id : '');
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [customerDraft, setCustomerDraft] = useState<CustomerDraft>(emptyCustomerDraft);
  const [lines, setLines] = useState<ServiceLineDraft[]>([{ id: makeId('item'), serviceId: activeServices[0]?.id ?? '', description: '', quantity: 1, notes: '' }]);
  const [notes, setNotes] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [createdOrder, setCreatedOrder] = useState<CreatedCustomerOrder | null>(null);

  const branchCustomers = useMemo(() => state.customers.filter((customer) => customer.branchId === branchId), [state.customers, branchId]);
  const matchingCustomers = useMemo(() => {
    const query = normalized(customerQuery);
    if (!query) return branchCustomers.slice(0, 8);
    return branchCustomers.filter((customer) => normalized(`${customer.name} ${customer.phone} ${customer.email}`).includes(query)).slice(0, 8);
  }, [branchCustomers, customerQuery]);
  const selectedCustomer = branchCustomers.find((customer) => customer.id === customerId);
  const showNewCustomer = !selectedCustomer && (creatingCustomer || (Boolean(customerQuery.trim()) && matchingCustomers.length === 0));
  const eligibleStaff = state.users.filter((member) => member.role === 'staff' && member.active !== false && member.verified === true && member.branchIds.includes(branchId));
  const maximumTurnaroundHours = lines.reduce((maximum, line) => Math.max(maximum, activeServices.find((service) => service.id === line.serviceId)?.turnaroundHours ?? 0), 0);
  const total = lines.reduce((sum, line) => sum + (activeServices.find((service) => service.id === line.serviceId)?.price ?? 0) * line.quantity, 0);

  const changeBranch = (nextBranchId: string) => {
    setBranchId(nextBranchId);
    setAssignedStaffId(user.role === 'staff' ? user.id : '');
    setCustomerId('');
    setCustomerQuery('');
    setCreatingCustomer(false);
    setCustomerDraft(emptyCustomerDraft);
    setError('');
  };

  const selectCustomer = (customer: Customer) => {
    setCustomerId(customer.id);
    setCustomerQuery(customer.name);
    setCreatingCustomer(false);
    setError('');
  };

  const updateLine = (lineId: string, updates: Partial<ServiceLineDraft>) => {
    setLines((current) => current.map((line) => line.id === lineId ? { ...line, ...updates } : line));
    setError('');
  };

  const addLine = () => {
    if (lines.length >= 100) return setError('An order can contain no more than 100 service lines.');
    setLines((current) => [...current, { id: makeId('item'), serviceId: activeServices[0]?.id ?? '', description: '', quantity: 1, notes: '' }]);
    setError('');
  };

  const removeLine = (lineId: string) => {
    if (lines.length <= 1) return setError('An order must contain at least one service line.');
    setLines((current) => current.filter((line) => line.id !== lineId));
    setError('');
  };

  const create = async () => {
    if (saving) return;
    if (!branchId || !availableBranches.some((branch) => branch.id === branchId)) return setError('Choose an active branch for this order.');
    if (!activeServices.length) return setError('At least one active service is required before an order can be created.');
    if (lines.length < 1 || lines.length > 100) return setError('An order must contain between 1 and 100 service lines.');
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (!activeServices.some((service) => service.id === line.serviceId)) return setError(`Choose an active service for line ${index + 1}.`);
      if (!line.description.trim()) return setError(`Describe the garments or items on line ${index + 1}.`);
      if (line.description.trim().length > 500) return setError(`The description on line ${index + 1} must be 500 characters or fewer.`);
      if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 100) return setError(`Quantity on line ${index + 1} must be a whole number from 1 to 100.`);
      if (line.notes.trim().length > 500) return setError(`The item note on line ${index + 1} must be 500 characters or fewer.`);
    }
    if (notes.trim().length > 1_000) return setError('Order notes must be 1,000 characters or fewer.');
    if (user.role === 'admin' && assignedStaffId && !eligibleStaff.some((member) => member.id === assignedStaffId)) return setError('The selected team member is no longer active at this branch. Choose another member or leave the order unassigned.');

    let newCustomer: Customer | undefined;
    let newCustomerUser: User | undefined;
    let credentials: { username: string; password: string } | undefined;
    if (!selectedCustomer) {
      if (!showNewCustomer) return setError('Search for and select a customer. If there is no match, complete the new-customer fields.');
      const firstName = customerDraft.firstName.trim();
      const lastName = customerDraft.lastName.trim();
      const phone = customerDraft.phone.trim();
      const email = customerDraft.email.trim().toLocaleLowerCase();
      if (!firstName || !lastName || !phone) return setError('First name, last name and phone are required for a new customer.');
      if (firstName.length > 64 || lastName.length > 80 || `${firstName} ${lastName}`.length > 160) return setError('The first name must be 64 characters or fewer and the full name must be 160 characters or fewer.');
      if (phone.length < 5 || phone.length > 30) return setError('Enter a valid customer phone number.');
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError('Enter a valid email address or leave it blank.');
      if (email.length > 254) return setError('The customer email address is too long.');
      if (customerDraft.address.trim().length > 300) return setError('The customer address must be 300 characters or fewer.');
      if (state.users.some((entry) => entry.username?.toLocaleLowerCase() === firstName.toLocaleLowerCase())) return setError('That login username already exists. Use a different first name or select the existing customer.');
      const newCustomerId = makeId('customer');
      const name = `${firstName} ${lastName}`;
      const password = lastName.toUpperCase();
      newCustomer = { id: newCustomerId, name, phone, email, address: customerDraft.address.trim(), joinedAt: new Date().toISOString(), branchId, loyaltyPoints: 0 };
      newCustomerUser = { id: makeId('user'), role: 'customer', name, email, phone, branchIds: [branchId], customerId: newCustomerId, avatarColor: colors.teal, username: firstName, password, verified: false, active: true };
      credentials = { username: firstName, password };
    }

    const id = makeId('order');
    const createdAt = new Date().toISOString();
    const order: Order = {
      id,
      number: orderNumber(state),
      branchId,
      customerId: selectedCustomer?.id ?? newCustomer!.id,
      ...(user.role === 'staff' ? { assignedStaffId: user.id } : assignedStaffId ? { assignedStaffId } : {}),
      status: 'received',
      priority: urgent ? 'urgent' : 'normal',
      intakeMethod: 'walk_in',
      createdAt,
      dueAt: new Date(Date.now() + maximumTurnaroundHours * 60 * 60 * 1_000).toISOString(),
      notes: notes.trim(),
      discount: 0,
      deliveryFee: 0,
      items: lines.map((line) => {
        const service = activeServices.find((entry) => entry.id === line.serviceId)!;
        return { id: line.id, serviceId: line.serviceId, description: line.description.trim(), quantity: line.quantity, unitPrice: service.price, ...(line.notes.trim() ? { notes: line.notes.trim() } : {}) };
      }),
      events: [{ id: makeId('event'), status: 'received', at: createdAt, byUserId: user.id }],
    };

    setSaving(true);
    setError('');
    try {
      const selectedAdminBranchId = state.activeBranchId;
      const remoteState = newCustomer && newCustomerUser
        ? await apiAction({ type: 'CREATE_CUSTOMER_AND_ORDER', customer: newCustomer, user: newCustomerUser, order })
        : await apiAction({ type: 'CREATE_ORDER', order });
      dispatch({ type: 'HYDRATE', state: user.role === 'admin' ? { ...remoteState, activeBranchId: selectedAdminBranchId } : remoteState });
      if (credentials) {
        setCreatedOrder({ orderId: id, orderNumber: order.number, customerName: newCustomer!.name, ...credentials });
      } else {
        Alert.alert('Order created', `${order.number} is ${order.assignedStaffId ? 'assigned and ' : ''}ready for processing.`, [{ text: 'Open order', onPress: () => navigation.replace('OrderDetail', { orderId: id }) }]);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The order could not be saved. Try again.');
    } finally {
      setSaving(false);
    }
  };

  if (createdOrder) return <Screen>
    <AppHeader title="Order created" subtitle={createdOrder.orderNumber} back />
    <Card style={styles.createdCard}>
      <View style={styles.createdIcon}><Feather name="check-circle" size={32} color={colors.primary} /></View>
      <Text style={styles.createdTitle}>Customer and order created together</Text>
      <Text style={styles.createdBody}>Keep {createdOrder.customerName}'s login details safe. The account must be verified before the customer can sign in.</Text>
      <View style={styles.createdCredentials}>
        <Feather name="key" size={20} color={colors.primary} />
        <View style={styles.flex}><Text style={styles.credentialLabel}>Username</Text><Text selectable style={styles.credentialValue}>{createdOrder.username}</Text></View>
        <View style={styles.flex}><Text style={styles.credentialLabel}>Temporary password</Text><Text selectable style={styles.credentialValue}>{createdOrder.password}</Text></View>
      </View>
      <PrimaryButton title={`Open ${createdOrder.orderNumber}`} onPress={() => navigation.replace('OrderDetail', { orderId: createdOrder.orderId })} />
    </Card>
  </Screen>;

  return <Screen>
    <AppHeader title="Create order" subtitle="Register one or more services at the counter" back />
    <LinearGradient colors={[colors.primary, colors.primaryDark]} style={styles.assistant}>
      <View style={styles.assistantIcon}><Feather name="zap" size={22} color="#fff" /></View>
      <View style={styles.flex}><Text style={styles.assistantTitle}>Complete customer intake</Text><Text style={styles.assistantText}>Find an existing customer or create their login while building a multi-service order.</Text></View>
    </LinearGradient>

    <SectionTitle title="Branch" />
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choiceRow}>{availableBranches.map((branch) => <TouchableOpacity key={branch.id} disabled={saving} onPress={() => changeBranch(branch.id)} style={[styles.choice, branchId === branch.id && styles.choiceActive]}><Feather name="map-pin" size={16} color={branchId === branch.id ? colors.primary : colors.muted} /><Text style={[styles.choiceText, branchId === branch.id && styles.choiceTextActive]}>{branch.shortName}</Text></TouchableOpacity>)}</ScrollView>
    {!availableBranches.length ? <Notice message="No active branch is available for your account." error /> : null}

    <SectionTitle title="Customer" />
    <Input label="Search customer name" icon="search" value={customerQuery} editable={!saving} onChangeText={(value) => { setCustomerQuery(value); setCustomerId(''); setCreatingCustomer(false); setError(''); }} placeholder="Type a name, phone or email" autoCapitalize="words" />
    {selectedCustomer ? <View style={styles.selectedCustomer}><View style={styles.customerAvatar}><Text style={styles.customerAvatarText}>{initials(selectedCustomer.name)}</Text></View><View style={styles.flex}><Text style={styles.customerName}>{selectedCustomer.name}</Text><Text style={styles.customerPhone}>{selectedCustomer.phone}</Text></View><Feather name="check-circle" size={20} color={colors.primary} /></View> : null}
    {!selectedCustomer && !creatingCustomer && matchingCustomers.length ? <View style={styles.customerResults}>{matchingCustomers.map((customer) => <TouchableOpacity key={customer.id} disabled={saving} onPress={() => selectCustomer(customer)} style={styles.customerResult}><View style={styles.customerAvatar}><Text style={styles.customerAvatarText}>{initials(customer.name)}</Text></View><View style={styles.flex}><Text style={styles.customerName}>{customer.name}</Text><Text style={styles.customerPhone}>{customer.phone}{customer.email ? ` · ${customer.email}` : ''}</Text></View><Feather name="chevron-right" size={18} color={colors.subtle} /></TouchableOpacity>)}</View> : null}
    {!selectedCustomer && !creatingCustomer && Boolean(customerQuery.trim()) && matchingCustomers.length ? <TouchableOpacity disabled={saving} onPress={() => setCreatingCustomer(true)} style={styles.addCustomerButton}><Feather name="user-plus" size={17} color={colors.primary} /><Text style={styles.addCustomerText}>No correct match? Add this customer with the order</Text></TouchableOpacity> : null}
    {showNewCustomer ? <NewCustomerForm draft={customerDraft} disabled={saving} onChange={(updates) => { setCustomerDraft((current) => ({ ...current, ...updates })); setError(''); }} /> : null}
    {creatingCustomer && matchingCustomers.length ? <TouchableOpacity disabled={saving} onPress={() => setCreatingCustomer(false)} style={styles.useMatchesButton}><Text style={styles.useMatchesText}>Back to matching customers</Text></TouchableOpacity> : null}

    <SectionTitle title={user.role === 'admin' ? 'Assign team member' : 'Task assignment'} />
    {user.role === 'admin' ? <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choiceRow}>
        <StaffChoice name="Unassigned" detail="Assign this order later" selected={!assignedStaffId} icon="user-x" disabled={saving} onPress={() => setAssignedStaffId('')} />
        {eligibleStaff.map((member) => <StaffChoice key={member.id} name={member.name} detail={member.jobTitle ?? 'Team member'} selected={member.id === assignedStaffId} color={member.avatarColor} disabled={saving} onPress={() => setAssignedStaffId(member.id)} />)}
      </ScrollView>
      {!eligibleStaff.length ? <Notice message="No active staff member is assigned to this branch. You can create the order unassigned." /> : null}
    </> : <View style={styles.selfAssignment}><View style={[styles.staffAvatar, { backgroundColor: user.avatarColor }]}><Text style={styles.staffAvatarText}>{initials(user.name)}</Text></View><View style={styles.flex}><Text style={styles.staffName}>Assigned to you</Text><Text style={styles.staffRole}>{user.name} · {user.jobTitle ?? 'Team member'}</Text></View><Feather name="check-circle" size={19} color={colors.primary} /></View>}

    <SectionTitle title="Service lines" action={lines.length < 100 ? 'Add line' : undefined} onPress={lines.length < 100 ? addLine : undefined} />
    {lines.map((line, index) => <ServiceLine key={line.id} line={line} index={index} services={activeServices} removable={lines.length > 1} disabled={saving} onChange={(updates) => updateLine(line.id, updates)} onRemove={() => removeLine(line.id)} />)}
    {!activeServices.length ? <Notice message="There are no active services available for order intake." error /> : null}
    {lines.length < 100 ? <TouchableOpacity disabled={saving || !activeServices.length} onPress={addLine} style={[styles.addLineButton, (!activeServices.length || saving) && styles.disabled]}><Feather name="plus-circle" size={18} color={colors.primary} /><Text style={styles.addLineText}>Add another service line</Text></TouchableOpacity> : null}

    <Card style={styles.orderDetails}>
      <Input label="Order notes (optional)" icon="file-text" value={notes} editable={!saving} onChangeText={(value) => { setNotes(value); setError(''); }} multiline placeholder="Instructions that apply to the whole order" />
      <TouchableOpacity disabled={saving} onPress={() => setUrgent(!urgent)} style={[styles.priority, urgent && styles.priorityActive]}><View style={[styles.checkbox, urgent && styles.checkboxActive]}>{urgent ? <Feather name="check" size={13} color="#fff" /> : null}</View><View><Text style={styles.priorityTitle}>Urgent priority</Text><Text style={styles.priorityText}>Flag this order for the branch team</Text></View></TouchableOpacity>
      <View style={styles.priceSummary}><View style={styles.flex}><Text style={styles.priceLabel}>{lines.length} service line{lines.length === 1 ? '' : 's'}</Text><Text style={styles.dueText}>Due in about {maximumTurnaroundHours} hour{maximumTurnaroundHours === 1 ? '' : 's'}, based on the longest service</Text></View><Text style={styles.priceValue}>{money(total)}</Text></View>
    </Card>
    {error ? <Notice message={error} error /> : null}
    <View style={styles.submit}><PrimaryButton title={saving ? 'Creating order...' : showNewCustomer ? 'Create customer & order' : 'Create order'} icon="arrow-right" loading={saving} disabled={saving || !availableBranches.length || !activeServices.length} onPress={() => void create()} /></View>
  </Screen>;
}

function NewCustomerForm({ draft, disabled, onChange }: { draft: CustomerDraft; disabled: boolean; onChange: (updates: Partial<CustomerDraft>) => void }) {
  return <Card style={styles.customerForm}>
    <View style={styles.formHeading}><View style={styles.formHeadingIcon}><Feather name="user-plus" size={18} color={colors.primary} /></View><View style={styles.flex}><Text style={styles.formTitle}>No customer matched</Text><Text style={styles.formSubtitle}>Create the customer and this order together.</Text></View></View>
    <View style={styles.twoColumns}><Input style={styles.halfField} label="First name *" value={draft.firstName} editable={!disabled} onChangeText={(value) => onChange({ firstName: value })} autoCapitalize="words" /><Input style={styles.halfField} label="Last name *" value={draft.lastName} editable={!disabled} onChangeText={(value) => onChange({ lastName: value })} autoCapitalize="words" /></View>
    <Input label="Phone *" value={draft.phone} editable={!disabled} onChangeText={(value) => onChange({ phone: value })} keyboardType="phone-pad" />
    <Input label="Email (optional)" value={draft.email} editable={!disabled} onChangeText={(value) => onChange({ email: value })} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
    <Input label="Address (optional)" value={draft.address} editable={!disabled} onChangeText={(value) => onChange({ address: value })} />
    <View style={styles.credentialsPreview}><Feather name="key" size={17} color={colors.primary} /><Text style={styles.credentialsText}>Login uses the first name as username and the last name in capitals as the temporary password.</Text></View>
  </Card>;
}

function ServiceLine({ line, index, services, removable, disabled, onChange, onRemove }: { line: ServiceLineDraft; index: number; services: { id: string; name: string; price: number; unit: string }[]; removable: boolean; disabled: boolean; onChange: (updates: Partial<ServiceLineDraft>) => void; onRemove: () => void }) {
  const service = services.find((item) => item.id === line.serviceId);
  return <Card style={styles.lineCard}>
    <View style={styles.lineHeading}><View><Text style={styles.lineTitle}>Line {index + 1}</Text><Text style={styles.lineSubtitle}>{service ? `${money(service.price)} per ${service.unit}` : 'Choose a service'}</Text></View>{removable ? <TouchableOpacity accessibilityLabel={`Remove service line ${index + 1}`} disabled={disabled} onPress={onRemove} style={styles.removeLine}><Feather name="trash-2" size={16} color={colors.red} /></TouchableOpacity> : null}</View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.serviceChoices}>{services.map((item) => { const selected = item.id === line.serviceId; return <TouchableOpacity key={item.id} disabled={disabled} onPress={() => onChange({ serviceId: item.id })} style={[styles.serviceChoice, selected && styles.serviceChoiceActive]}><Feather name={selected ? 'check-circle' : 'package'} size={16} color={selected ? colors.primary : colors.muted} /><Text style={[styles.serviceName, selected && styles.serviceNameActive]}>{item.name}</Text><Text style={styles.servicePrice}>{money(item.price)}</Text></TouchableOpacity>; })}</ScrollView>
    <Input label="Item description *" icon="edit-3" value={line.description} editable={!disabled} onChangeText={(value) => onChange({ description: value })} placeholder="e.g. White shirts with collar stains" />
    <Input label="Item note (optional)" icon="file-text" value={line.notes} editable={!disabled} onChangeText={(value) => onChange({ notes: value })} placeholder="Fabric, stain or care instruction" />
    <View><Text style={styles.fieldLabel}>Quantity (1–100)</Text><View style={styles.stepper}><TouchableOpacity disabled={disabled || line.quantity <= 1} onPress={() => onChange({ quantity: Math.max(1, line.quantity - 1) })} style={[styles.stepButton, line.quantity <= 1 && styles.disabled]}><Feather name="minus" size={18} color={colors.ink} /></TouchableOpacity><Text style={styles.quantity}>{line.quantity}</Text><TouchableOpacity disabled={disabled || line.quantity >= 100} onPress={() => onChange({ quantity: Math.min(100, line.quantity + 1) })} style={[styles.stepButton, line.quantity >= 100 && styles.disabled]}><Feather name="plus" size={18} color={colors.primary} /></TouchableOpacity><Text style={styles.unit}>{service?.unit ?? 'item'}{line.quantity === 1 ? '' : 's'}</Text><Text style={styles.lineTotal}>{money((service?.price ?? 0) * line.quantity)}</Text></View></View>
  </Card>;
}

function StaffChoice({ name, detail, selected, color, icon, disabled, onPress }: { name: string; detail: string; selected: boolean; color?: string; icon?: keyof typeof Feather.glyphMap; disabled: boolean; onPress: () => void }) {
  return <TouchableOpacity disabled={disabled} onPress={onPress} style={[styles.staffChoice, selected && styles.staffChoiceActive, disabled && styles.disabled]}><View style={[styles.staffAvatar, { backgroundColor: color ?? colors.background }]}>{icon ? <Feather name={icon} size={17} color={colors.muted} /> : <Text style={styles.staffAvatarText}>{initials(name)}</Text>}</View><View style={styles.staffText}><Text style={styles.staffName}>{name}</Text><Text style={styles.staffRole}>{detail}</Text></View>{selected ? <Feather name="check-circle" size={18} color={colors.primary} /> : null}</TouchableOpacity>;
}

function Notice({ message, error = false }: { message: string; error?: boolean }) {
  return <View style={[styles.notice, error && styles.noticeError]}><Feather name={error ? 'alert-circle' : 'info'} size={17} color={error ? colors.red : colors.primary} /><Text style={[styles.noticeText, error && styles.noticeTextError]}>{message}</Text></View>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 }, assistant: { borderRadius: radius.lg, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 13 }, assistantIcon: { width: 45, height: 45, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' }, assistantTitle: { color: '#fff', fontSize: 16, fontWeight: '900' }, assistantText: { color: 'rgba(255,255,255,0.76)', fontSize: 11, lineHeight: 16, marginTop: 4 },
  choiceRow: { gap: 9, paddingBottom: 2 }, choice: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 13, height: 43, borderRadius: 13, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, choiceActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft }, choiceText: { color: colors.muted, fontSize: 12, fontWeight: '700' }, choiceTextActive: { color: colors.primary },
  selectedCustomer: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, padding: 13, borderRadius: radius.md, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.primarySoft }, customerResults: { marginTop: 10, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surface }, customerResult: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border }, customerAvatar: { width: 39, height: 39, borderRadius: 13, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' }, customerAvatarText: { color: colors.primary, fontWeight: '900', fontSize: 12 }, customerName: { color: colors.ink, fontSize: 12, fontWeight: '800' }, customerPhone: { color: colors.muted, fontSize: 9, marginTop: 3 },
  addCustomerButton: { minHeight: 45, marginTop: 9, paddingHorizontal: 12, borderRadius: radius.sm, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.primary, backgroundColor: colors.primarySoft, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, addCustomerText: { color: colors.primary, fontSize: 11, fontWeight: '800' }, useMatchesButton: { alignSelf: 'center', padding: 10 }, useMatchesText: { color: colors.primary, fontSize: 11, fontWeight: '800' },
  customerForm: { padding: 16, gap: 13, marginTop: 11 }, formHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 }, formHeadingIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' }, formTitle: { color: colors.ink, fontSize: 14, fontWeight: '900' }, formSubtitle: { color: colors.muted, fontSize: 10, marginTop: 3 }, twoColumns: { flexDirection: 'row', justifyContent: 'space-between' }, halfField: { width: '48%' }, credentialsPreview: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 11, borderRadius: radius.sm, backgroundColor: colors.primaryLight }, credentialsText: { flex: 1, color: colors.primaryDark, fontSize: 10, lineHeight: 15, fontWeight: '700' },
  staffChoice: { minWidth: 220, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, staffChoiceActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft }, staffAvatar: { width: 39, height: 39, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }, staffAvatarText: { color: '#fff', fontSize: 11, fontWeight: '900' }, staffText: { flex: 1 }, staffName: { color: colors.ink, fontSize: 12, fontWeight: '900' }, staffRole: { color: colors.muted, fontSize: 10, marginTop: 3 }, selfAssignment: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13, borderRadius: radius.md, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.primarySoft },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: radius.sm, backgroundColor: colors.primarySoft, padding: 12, marginTop: 10 }, noticeError: { backgroundColor: colors.redSoft }, noticeText: { flex: 1, color: colors.primary, fontSize: 10, lineHeight: 15, fontWeight: '700' }, noticeTextError: { color: colors.red },
  lineCard: { padding: 16, gap: 14, marginBottom: 12 }, lineHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, lineTitle: { color: colors.ink, fontSize: 15, fontWeight: '900' }, lineSubtitle: { color: colors.primary, fontSize: 10, fontWeight: '700', marginTop: 3 }, removeLine: { width: 38, height: 38, borderRadius: 11, backgroundColor: colors.redSoft, alignItems: 'center', justifyContent: 'center' }, serviceChoices: { gap: 8, paddingRight: 4 }, serviceChoice: { minWidth: 132, padding: 11, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, serviceChoiceActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft }, serviceName: { color: colors.ink, fontSize: 10, fontWeight: '800', marginTop: 7 }, serviceNameActive: { color: colors.primaryDark }, servicePrice: { color: colors.primary, fontSize: 10, fontWeight: '900', marginTop: 4 },
  fieldLabel: { color: colors.ink, fontSize: 14, fontWeight: '700', marginBottom: 8 }, stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, minHeight: 52, paddingHorizontal: 8 }, stepButton: { width: 38, height: 38, borderRadius: 11, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }, quantity: { color: colors.ink, fontSize: 18, fontWeight: '900', width: 50, textAlign: 'center' }, unit: { color: colors.muted, fontSize: 11, marginLeft: 5 }, lineTotal: { color: colors.primary, fontSize: 14, fontWeight: '900', marginLeft: 'auto', marginRight: 7 }, addLineButton: { minHeight: 48, borderRadius: radius.md, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.primarySoft }, addLineText: { color: colors.primary, fontSize: 12, fontWeight: '900' },
  orderDetails: { padding: 16, gap: 17, marginTop: 18 }, priority: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: 13 }, priorityActive: { borderColor: colors.red, backgroundColor: colors.redSoft }, checkbox: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }, checkboxActive: { backgroundColor: colors.red, borderColor: colors.red }, priorityTitle: { color: colors.ink, fontSize: 13, fontWeight: '800' }, priorityText: { color: colors.muted, fontSize: 10, marginTop: 3 }, priceSummary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, backgroundColor: colors.primarySoft, padding: 14, borderRadius: radius.sm }, priceLabel: { color: colors.ink, fontSize: 12, fontWeight: '800' }, dueText: { color: colors.muted, fontSize: 9, lineHeight: 14, marginTop: 3, maxWidth: 210 }, priceValue: { color: colors.primary, fontSize: 22, fontWeight: '900' }, submit: { marginTop: 16 }, disabled: { opacity: 0.45 },
  createdCard: { marginTop: 22, padding: 22, alignItems: 'center', gap: 13 }, createdIcon: { width: 68, height: 68, borderRadius: 22, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }, createdTitle: { color: colors.ink, fontSize: 20, fontWeight: '900', textAlign: 'center' }, createdBody: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' }, createdCredentials: { width: '100%', padding: 15, borderRadius: radius.md, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.primarySoft, flexDirection: 'row', alignItems: 'center', gap: 12 }, credentialLabel: { color: colors.muted, fontSize: 9, fontWeight: '700', textTransform: 'uppercase' }, credentialValue: { color: colors.ink, fontSize: 14, fontWeight: '900', marginTop: 3 },
});
