import { Feather } from '@expo/vector-icons';
import { getActiveUser, makeId, money, type Service } from '@gatsi/domain';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { AppHeader } from '../components/AppHeader';
import { Screen } from '../components/Screen';
import { Card, EmptyState, Input, PrimaryButton, SectionTitle } from '../components/ui';
import { useAppStore } from '../store/AppStore';
import { apiAction } from '../store/api';
import { colors, radius } from '../theme';

const categories: Service['category'][] = ['laundry', 'dry_cleaning', 'textile', 'speciality'];
const units: Service['unit'][] = ['item', 'kg', 'pair', 'set', 'metre'];

export function ServicesManagementScreen() {
  const { state, dispatch } = useAppStore();
  const currentUser = getActiveUser(state);
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [busyServiceId, setBusyServiceId] = useState<string | null>(null);
  const [serviceErrors, setServiceErrors] = useState<Record<string, string>>({});

  if (currentUser?.role !== 'admin') {
    return <Screen>
      <AppHeader title="Access unavailable" subtitle="Administrator permission is required" back />
      <Card><EmptyState icon="lock" title="Services are restricted" body="Sign in with an administrator account to manage the service catalogue." /></Card>
    </Screen>;
  }

  const changeServiceAvailability = async (service: Service) => {
    if (busyServiceId) return;
    setBusyServiceId(service.id);
    setServiceErrors((errors) => ({ ...errors, [service.id]: '' }));
    try {
      const selectedAdminBranchId = state.activeBranchId;
      const remoteState = await apiAction({
        type: 'UPDATE_SERVICE',
        serviceId: service.id,
        updates: {
          name: service.name,
          category: service.category,
          unit: service.unit,
          price: service.price,
          turnaroundHours: service.turnaroundHours,
          description: service.description,
          active: !service.active,
        },
      });
      dispatch({ type: 'HYDRATE', state: { ...remoteState, activeBranchId: selectedAdminBranchId } });
      setEditingServiceId(null);
    } catch (reason) {
      setServiceErrors((errors) => ({
        ...errors,
        [service.id]: reason instanceof Error ? reason.message : `The service could not be ${service.active ? 'removed' : 'restored'}. Please try again.`,
      }));
    } finally {
      setBusyServiceId(null);
    }
  };

  const requestServiceAvailabilityChange = (service: Service) => {
    if (!service.active) {
      void changeServiceAvailability(service);
      return;
    }
    Alert.alert(
      'Remove service?',
      `${service.name} will be hidden from new job intake and the customer catalogue. Existing order history is retained and the service can be restored later.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove service', style: 'destructive', onPress: () => void changeServiceAvailability(service) },
      ],
    );
  };

  return <Screen>
    <AppHeader title="Services" subtitle="Pricing, turnaround and catalogue availability" back />
    <SectionTitle title="Service catalogue" action={creating ? 'Close' : 'Add service'} onPress={() => setCreating((value) => !value)} />
    {creating ? <Card style={styles.createCard}><ServiceCreator onClose={() => setCreating(false)} /></Card> : null}
    {state.services.map((service) => <Card key={service.id} style={styles.serviceCard}>
      <View style={styles.serviceTop}>
        <View style={styles.serviceIcon}><Feather name={service.category === 'speciality' ? 'star' : 'package'} size={20} color={colors.primary} /></View>
        <View style={styles.flex}>
          <Text style={styles.serviceName}>{service.name}</Text>
          <Text style={styles.serviceDescription}>{service.description}</Text>
        </View>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={`Edit ${service.name}`}
          onPress={() => setEditingServiceId((current) => current === service.id ? null : service.id)}
          style={styles.editButton}
        >
          <Feather name={editingServiceId === service.id ? 'x' : 'edit-2'} size={17} color={colors.primary} />
        </TouchableOpacity>
      </View>
      <View style={styles.serviceMeta}>
        <View><Text style={styles.metaValue}>{money(service.price)} / {service.unit}</Text><Text style={styles.metaLabel}>Price</Text></View>
        <View><Text style={styles.metaValue}>{service.turnaroundHours}h</Text><Text style={styles.metaLabel}>Turnaround</Text></View>
        <View style={[styles.statusPill, !service.active && styles.statusPillInactive]}><Text style={[styles.statusText, !service.active && styles.statusTextInactive]}>{service.active ? 'Active' : 'Inactive'}</Text></View>
      </View>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={`${service.active ? 'Remove' : 'Restore'} ${service.name}`}
        disabled={Boolean(busyServiceId)}
        onPress={() => requestServiceAvailabilityChange(service)}
        style={[styles.availabilityButton, service.active ? styles.removeButton : styles.restoreButton, busyServiceId && styles.disabled]}
      >
        {busyServiceId === service.id
          ? <ActivityIndicator size="small" color={service.active ? colors.red : colors.primary} />
          : <Feather name={service.active ? 'archive' : 'rotate-ccw'} size={16} color={service.active ? colors.red : colors.primary} />}
        <Text style={[styles.availabilityButtonText, service.active ? styles.removeButtonText : styles.restoreButtonText]}>{service.active ? 'Remove service' : 'Restore service'}</Text>
      </TouchableOpacity>
      {serviceErrors[service.id] ? <ErrorNotice message={serviceErrors[service.id]} /> : null}
      {editingServiceId === service.id ? <ServiceEditor service={service} onClose={() => setEditingServiceId(null)} /> : null}
    </Card>)}
    {!state.services.length ? <Card><EmptyState icon="package" title="No services" body="No service records are available yet." /></Card> : null}
  </Screen>;
}

function ServiceCreator({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useAppStore();
  const [name, setName] = useState('');
  const [category, setCategory] = useState<Service['category']>('laundry');
  const [unit, setUnit] = useState<Service['unit']>('item');
  const [price, setPrice] = useState('');
  const [turnaroundHours, setTurnaroundHours] = useState('24');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const create = async () => {
    if (saving) return;
    const parsedPrice = Number(price);
    const parsedTurnaround = Number(turnaroundHours);
    if (!name.trim() || !description.trim()) {
      setError('Service name and description are required.');
      return;
    }
    if (!price.trim() || !Number.isFinite(parsedPrice) || parsedPrice < 0 || parsedPrice > 1_000_000) {
      setError('Enter a valid price between zero and 1,000,000.');
      return;
    }
    if (!turnaroundHours.trim() || !Number.isInteger(parsedTurnaround) || parsedTurnaround < 1 || parsedTurnaround > 8_760) {
      setError('Turnaround must be a whole number between 1 and 8,760 hours.');
      return;
    }

    const service: Service = {
      id: makeId('service'),
      name: name.trim(),
      category,
      unit,
      price: parsedPrice,
      turnaroundHours: parsedTurnaround,
      description: description.trim(),
      active: true,
    };
    setSaving(true);
    setError('');
    try {
      const selectedAdminBranchId = state.activeBranchId;
      const remoteState = await apiAction({ type: 'CREATE_SERVICE', service });
      dispatch({ type: 'HYDRATE', state: { ...remoteState, activeBranchId: selectedAdminBranchId } });
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The service could not be created. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return <View style={styles.creator}>
    <View style={styles.editorHeading}>
      <View style={styles.editorHeadingIcon}><Feather name="plus" size={18} color={colors.primary} /></View>
      <View style={styles.flex}><Text style={styles.editorTitle}>Add service</Text><Text style={styles.editorSubtitle}>New active services appear during job intake and in the customer catalogue.</Text></View>
    </View>
    <Input label="Service name *" value={name} editable={!saving} onChangeText={(value) => { setName(value); setError(''); }} autoCapitalize="words" />
    <Input label="Description *" value={description} editable={!saving} onChangeText={(value) => { setDescription(value); setError(''); }} multiline />
    <Text style={styles.fieldLabel}>Category</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choiceRow}>
      {categories.map((item) => <Choice key={item} label={item.replaceAll('_', ' ')} selected={item === category} disabled={saving} onPress={() => setCategory(item)} />)}
    </ScrollView>
    <Text style={styles.fieldLabel}>Billing unit</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choiceRow}>
      {units.map((item) => <Choice key={item} label={item} selected={item === unit} disabled={saving} onPress={() => setUnit(item)} />)}
    </ScrollView>
    <View style={styles.numberFields}>
      <Input style={styles.numberField} label="Price *" value={price} editable={!saving} onChangeText={(value) => { setPrice(value); setError(''); }} keyboardType="decimal-pad" />
      <Input style={styles.numberField} label="Turnaround hours *" value={turnaroundHours} editable={!saving} onChangeText={(value) => { setTurnaroundHours(value); setError(''); }} keyboardType="number-pad" />
    </View>
    {error ? <ErrorNotice message={error} /> : null}
    <View style={styles.actions}>
      <PrimaryButton title="Cancel" icon="x" secondary compact disabled={saving} onPress={onClose} />
      <View style={styles.flex}><PrimaryButton title="Create service" icon="plus" compact loading={saving} onPress={() => void create()} /></View>
    </View>
  </View>;
}

function ServiceEditor({ service, onClose }: { service: Service; onClose: () => void }) {
  const { state, dispatch } = useAppStore();
  const [name, setName] = useState(service.name);
  const [category, setCategory] = useState<Service['category']>(service.category);
  const [unit, setUnit] = useState<Service['unit']>(service.unit);
  const [price, setPrice] = useState(String(service.price));
  const [turnaroundHours, setTurnaroundHours] = useState(String(service.turnaroundHours));
  const [description, setDescription] = useState(service.description);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (saving) return;
    const parsedPrice = Number(price);
    const parsedTurnaround = Number(turnaroundHours);
    if (!name.trim() || !description.trim()) {
      setError('Service name and description are required.');
      return;
    }
    if (!price.trim() || !Number.isFinite(parsedPrice) || parsedPrice < 0 || parsedPrice > 1_000_000) {
      setError('Enter a valid price between zero and 1,000,000.');
      return;
    }
    if (!turnaroundHours.trim() || !Number.isInteger(parsedTurnaround) || parsedTurnaround < 1 || parsedTurnaround > 8_760) {
      setError('Turnaround must be a whole number between 1 and 8,760 hours.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const selectedAdminBranchId = state.activeBranchId;
      const remoteState = await apiAction({
        type: 'UPDATE_SERVICE',
        serviceId: service.id,
        updates: {
          name: name.trim(),
          category,
          unit,
          price: parsedPrice,
          turnaroundHours: parsedTurnaround,
          description: description.trim(),
          active: service.active,
        },
      });
      dispatch({ type: 'HYDRATE', state: { ...remoteState, activeBranchId: selectedAdminBranchId } });
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The service could not be updated. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return <View style={styles.editor}>
    <View style={styles.editorHeading}>
      <View style={styles.editorHeadingIcon}><Feather name="edit-3" size={17} color={colors.primary} /></View>
      <View style={styles.flex}><Text style={styles.editorTitle}>Edit service</Text><Text style={styles.editorSubtitle}>Changes apply to future order intake and the customer catalogue.</Text></View>
    </View>
    <Input label="Service name *" value={name} editable={!saving} onChangeText={(value) => { setName(value); setError(''); }} autoCapitalize="words" />
    <Input label="Description *" value={description} editable={!saving} onChangeText={(value) => { setDescription(value); setError(''); }} multiline />
    <Text style={styles.fieldLabel}>Category</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choiceRow}>
      {categories.map((item) => <Choice key={item} label={item.replaceAll('_', ' ')} selected={item === category} disabled={saving} onPress={() => setCategory(item)} />)}
    </ScrollView>
    <Text style={styles.fieldLabel}>Billing unit</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choiceRow}>
      {units.map((item) => <Choice key={item} label={item} selected={item === unit} disabled={saving} onPress={() => setUnit(item)} />)}
    </ScrollView>
    <View style={styles.numberFields}>
      <Input style={styles.numberField} label="Price *" value={price} editable={!saving} onChangeText={(value) => { setPrice(value); setError(''); }} keyboardType="decimal-pad" />
      <Input style={styles.numberField} label="Turnaround hours *" value={turnaroundHours} editable={!saving} onChangeText={(value) => { setTurnaroundHours(value); setError(''); }} keyboardType="number-pad" />
    </View>
    {error ? <ErrorNotice message={error} /> : null}
    <View style={styles.actions}>
      <PrimaryButton title="Cancel" icon="x" secondary compact disabled={saving} onPress={onClose} />
      <View style={styles.flex}><PrimaryButton title="Save service" icon="check" compact loading={saving} onPress={() => void save()} /></View>
    </View>
  </View>;
}

function ErrorNotice({ message }: { message: string }) {
  return <View style={styles.errorNotice}><Feather name="alert-circle" size={16} color={colors.red} /><Text style={styles.errorText}>{message}</Text></View>;
}

function Choice({ label, selected, disabled, onPress }: { label: string; selected: boolean; disabled: boolean; onPress: () => void }) {
  return <TouchableOpacity
    disabled={disabled}
    accessibilityRole="radio"
    accessibilityState={{ checked: selected, disabled }}
    onPress={onPress}
    style={[styles.choice, selected && styles.choiceSelected, disabled && styles.disabled]}
  >
    <Feather name={selected ? 'check-circle' : 'circle'} size={14} color={selected ? colors.primary : colors.muted} />
    <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{label}</Text>
  </TouchableOpacity>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  createCard: { padding: 15, marginBottom: 14 },
  creator: { gap: 13 },
  serviceCard: { padding: 15, marginBottom: 11 },
  serviceTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  serviceIcon: { width: 43, height: 43, borderRadius: 14, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  serviceName: { color: colors.ink, fontSize: 14, fontWeight: '900' },
  serviceDescription: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 4 },
  editButton: { width: 36, height: 36, borderRadius: 11, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  serviceMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 13, marginTop: 13, borderTopWidth: 1, borderTopColor: colors.border },
  metaValue: { color: colors.ink, fontSize: 12, fontWeight: '900', textTransform: 'capitalize' },
  metaLabel: { color: colors.subtle, fontSize: 8, marginTop: 3, textTransform: 'uppercase' },
  statusPill: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 99, backgroundColor: colors.primaryLight },
  statusPillInactive: { backgroundColor: colors.redSoft },
  statusText: { color: colors.primary, fontSize: 9, fontWeight: '900' },
  statusTextInactive: { color: colors.red },
  availabilityButton: { minHeight: 42, marginTop: 13, borderRadius: radius.sm, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  removeButton: { borderColor: colors.red, backgroundColor: colors.redSoft },
  restoreButton: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  availabilityButtonText: { fontSize: 11, fontWeight: '900' },
  removeButtonText: { color: colors.red },
  restoreButtonText: { color: colors.primary },
  editor: { gap: 13, paddingTop: 16, marginTop: 16, borderTopWidth: 1, borderTopColor: colors.border },
  editorHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  editorHeadingIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  editorTitle: { color: colors.ink, fontSize: 14, fontWeight: '900' },
  editorSubtitle: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 3 },
  fieldLabel: { color: colors.ink, fontSize: 12, fontWeight: '800' },
  choiceRow: { gap: 8, paddingRight: 5 },
  choice: { minHeight: 38, paddingHorizontal: 11, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: 6 },
  choiceSelected: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  choiceText: { color: colors.muted, fontSize: 10, fontWeight: '800', textTransform: 'capitalize' },
  choiceTextSelected: { color: colors.primary },
  numberFields: { flexDirection: 'row', justifyContent: 'space-between' },
  numberField: { width: '48%' },
  errorNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, padding: 10, borderRadius: radius.sm, backgroundColor: colors.redSoft },
  errorText: { flex: 1, color: colors.red, fontSize: 10, lineHeight: 15, fontWeight: '700' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  disabled: { opacity: 0.48 },
});
