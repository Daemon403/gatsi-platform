import { Feather } from '@expo/vector-icons';
import { branchRevenue, getActiveUser, makeId, money, type Branch } from '@gatsi/domain';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { AppHeader } from '../components/AppHeader';
import { Screen } from '../components/Screen';
import { Card, EmptyState, Input, PrimaryButton, SectionTitle } from '../components/ui';
import { useAppStore } from '../store/AppStore';
import { apiAction } from '../store/api';
import { colors, radius } from '../theme';

export function BranchesScreen() {
  const { state, dispatch } = useAppStore();
  const currentUser = getActiveUser(state);
  const [editingBranchId, setEditingBranchId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [busyBranchId, setBusyBranchId] = useState<string | null>(null);
  const [branchErrors, setBranchErrors] = useState<Record<string, string>>({});

  if (currentUser?.role !== 'admin') {
    return <Screen>
      <AppHeader title="Access unavailable" subtitle="Administrator permission is required" back />
      <Card><EmptyState icon="lock" title="Branches are restricted" body="Sign in with an administrator account to view branch data." /></Card>
    </Screen>;
  }

  const branches = state.branches;

  const changeBranchAvailability = async (branch: Branch) => {
    if (busyBranchId) return;
    setBusyBranchId(branch.id);
    setBranchErrors((errors) => ({ ...errors, [branch.id]: '' }));
    try {
      const selectedAdminBranchId = state.activeBranchId;
      const nextActive = !branch.active;
      const remoteState = await apiAction({
        type: 'UPDATE_BRANCH',
        branchId: branch.id,
        updates: {
          name: branch.name,
          shortName: branch.shortName,
          address: branch.address,
          phone: branch.phone,
          managerId: branch.managerId,
          active: nextActive,
        },
      });
      const nextActiveBranchId = !nextActive && selectedAdminBranchId === branch.id ? 'all' : selectedAdminBranchId;
      dispatch({ type: 'HYDRATE', state: { ...remoteState, activeBranchId: nextActiveBranchId } });
      setEditingBranchId(null);
    } catch (reason) {
      setBranchErrors((errors) => ({
        ...errors,
        [branch.id]: reason instanceof Error ? reason.message : `The branch could not be ${branch.active ? 'removed' : 'restored'}. Please try again.`,
      }));
    } finally {
      setBusyBranchId(null);
    }
  };

  const requestBranchAvailabilityChange = (branch: Branch) => {
    if (!branch.active) {
      void changeBranchAvailability(branch);
      return;
    }
    Alert.alert(
      'Remove branch?',
      `${branch.name} will be closed and hidden from new assignments. Its history is retained and the branch can be restored later.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove branch', style: 'destructive', onPress: () => void changeBranchAvailability(branch) },
      ],
    );
  };

  return <Screen>
    <AppHeader title="Branches" subtitle="Locations, staffing and performance" back />
    <SectionTitle title="All branches" action={creating ? 'Close' : 'Add branch'} onPress={() => setCreating((value) => !value)} />
    {creating ? <Card style={styles.createCard}><BranchCreator onClose={() => setCreating(false)} /></Card> : null}
    {branches.map((branch) => {
      const orders = state.orders.filter((order) => order.branchId === branch.id);
      const branchStaff = state.users.filter((member) => member.role === 'staff' && member.active !== false && member.branchIds.includes(branch.id));
      return <Card key={branch.id} style={styles.branchCard}>
        <View style={styles.branchTop}>
          <View style={styles.branchIcon}><Feather name="map-pin" size={20} color={colors.primary} /></View>
          <View style={styles.flex}>
            <Text style={styles.branchName}>{branch.name}</Text>
            <Text style={styles.branchAddress}>{branch.address}</Text>
            <Text style={styles.branchPhone}>{branch.phone}</Text>
          </View>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`Edit ${branch.name}`}
            onPress={() => setEditingBranchId((current) => current === branch.id ? null : branch.id)}
            style={styles.editButton}
          >
            <Feather name={editingBranchId === branch.id ? 'x' : 'edit-2'} size={17} color={colors.primary} />
          </TouchableOpacity>
          <View style={[styles.openPill, !branch.active && styles.closedPill]}>
            <Text style={[styles.openText, !branch.active && styles.closedText]}>{branch.active ? 'Open' : 'Closed'}</Text>
          </View>
        </View>
        <View style={styles.branchStats}>
          <Stat value={orders.length} label="Orders" />
          <Stat value={branchStaff.length} label="Active staff" />
          <Stat value={money(branchRevenue(state, branch.id))} label="Revenue" />
        </View>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={`${branch.active ? 'Remove' : 'Restore'} ${branch.name}`}
          disabled={Boolean(busyBranchId)}
          onPress={() => requestBranchAvailabilityChange(branch)}
          style={[styles.availabilityButton, branch.active ? styles.removeButton : styles.restoreButton, busyBranchId && styles.disabled]}
        >
          {busyBranchId === branch.id
            ? <ActivityIndicator size="small" color={branch.active ? colors.red : colors.primary} />
            : <Feather name={branch.active ? 'archive' : 'rotate-ccw'} size={16} color={branch.active ? colors.red : colors.primary} />}
          <Text style={[styles.availabilityButtonText, branch.active ? styles.removeButtonText : styles.restoreButtonText]}>{branch.active ? 'Remove branch' : 'Restore branch'}</Text>
        </TouchableOpacity>
        {branchErrors[branch.id] ? <ErrorNotice message={branchErrors[branch.id]} /> : null}
        {editingBranchId === branch.id ? <BranchEditor branch={branch} onClose={() => setEditingBranchId(null)} /> : null}
      </Card>;
    })}
    {!branches.length ? <Card><EmptyState icon="map-pin" title="No branches" body="No branch records are available yet." /></Card> : null}
  </Screen>;
}

function BranchCreator({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useAppStore();
  const managers = state.users.filter((user) => user.role === 'admin' && user.active !== false && user.verified === true);
  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [managerId, setManagerId] = useState(managers[0]?.id ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const create = async () => {
    if (saving) return;
    if (!name.trim() || !shortName.trim() || !address.trim() || !phone.trim()) {
      setError('Name, short name, address and phone are required.');
      return;
    }
    if (!managers.some((manager) => manager.id === managerId)) {
      setError('Choose an active, verified administrator as the initial branch manager.');
      return;
    }

    const branch: Branch = {
      id: makeId('branch'),
      name: name.trim(),
      shortName: shortName.trim(),
      address: address.trim(),
      phone: phone.trim(),
      managerId,
      active: true,
    };
    setSaving(true);
    setError('');
    try {
      const selectedAdminBranchId = state.activeBranchId;
      const remoteState = await apiAction({ type: 'CREATE_BRANCH', branch });
      dispatch({ type: 'HYDRATE', state: { ...remoteState, activeBranchId: selectedAdminBranchId } });
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The branch could not be created. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return <View style={styles.creator}>
    <View style={styles.editorHeading}>
      <View style={styles.editorIcon}><Feather name="plus" size={18} color={colors.primary} /></View>
      <View style={styles.flex}><Text style={styles.editorTitle}>Add branch</Text><Text style={styles.editorSubtitle}>Create an open location, then assign its staff from Team.</Text></View>
    </View>
    <Input label="Branch name *" value={name} editable={!saving} onChangeText={(value) => { setName(value); setError(''); }} autoCapitalize="words" />
    <Input label="Short name *" value={shortName} editable={!saving} onChangeText={(value) => { setShortName(value); setError(''); }} autoCapitalize="words" />
    <Input label="Address *" value={address} editable={!saving} onChangeText={(value) => { setAddress(value); setError(''); }} />
    <Input label="Phone *" value={phone} editable={!saving} onChangeText={(value) => { setPhone(value); setError(''); }} keyboardType="phone-pad" />
    <Text style={styles.fieldLabel}>Initial branch manager *</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choiceRow}>
      {managers.map((manager) => {
        const selected = manager.id === managerId;
        return <TouchableOpacity
          key={manager.id}
          disabled={saving}
          accessibilityRole="radio"
          accessibilityState={{ checked: selected, disabled: saving }}
          onPress={() => { setManagerId(manager.id); setError(''); }}
          style={[styles.managerChoice, selected && styles.managerChoiceSelected, saving && styles.disabled]}
        >
          <View style={[styles.managerAvatar, { backgroundColor: manager.avatarColor }]}><Text style={styles.managerInitials}>{initials(manager.name)}</Text></View>
          <View style={styles.flex}><Text style={[styles.managerName, selected && styles.managerNameSelected]}>{manager.name}</Text><Text style={styles.managerRole}>{manager.jobTitle ?? manager.role}</Text></View>
          {selected ? <Feather name="check-circle" size={16} color={colors.primary} /> : null}
        </TouchableOpacity>;
      })}
    </ScrollView>
    {!managers.length ? <ErrorNotice message="An active, verified administrator account is required before a branch can be created." /> : null}
    {error ? <ErrorNotice message={error} /> : null}
    <View style={styles.actions}>
      <PrimaryButton title="Cancel" icon="x" secondary compact disabled={saving} onPress={onClose} />
      <View style={styles.flex}><PrimaryButton title="Create branch" icon="plus" compact loading={saving} disabled={!managers.length} onPress={() => void create()} /></View>
    </View>
  </View>;
}

function BranchEditor({ branch, onClose }: { branch: Branch; onClose: () => void }) {
  const { state, dispatch } = useAppStore();
  const [name, setName] = useState(branch.name);
  const [shortName, setShortName] = useState(branch.shortName);
  const [address, setAddress] = useState(branch.address);
  const [phone, setPhone] = useState(branch.phone);
  const [managerId, setManagerId] = useState(branch.managerId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const managers = state.users.filter((user) => user.active !== false && user.verified === true && (
    user.role === 'admin' || (user.role === 'staff' && user.branchIds.includes(branch.id))
  ));

  const save = async () => {
    if (saving) return;
    if (!name.trim() || !shortName.trim() || !address.trim() || !phone.trim()) {
      setError('Name, short name, address and phone are required.');
      return;
    }
    if (!managers.some((manager) => manager.id === managerId)) {
      setError('Choose an active administrator or staff member as branch manager.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const selectedAdminBranchId = state.activeBranchId;
      const remoteState = await apiAction({
        type: 'UPDATE_BRANCH',
        branchId: branch.id,
        updates: {
          name: name.trim(),
          shortName: shortName.trim(),
          address: address.trim(),
          phone: phone.trim(),
          managerId,
          active: branch.active,
        },
      });
      dispatch({ type: 'HYDRATE', state: { ...remoteState, activeBranchId: selectedAdminBranchId } });
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The branch could not be updated. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return <View style={styles.editor}>
    <View style={styles.editorHeading}>
      <View style={styles.editorIcon}><Feather name="edit-3" size={17} color={colors.primary} /></View>
      <View style={styles.flex}><Text style={styles.editorTitle}>Edit branch</Text><Text style={styles.editorSubtitle}>Update public contact details, manager and availability.</Text></View>
    </View>
    <Input label="Branch name *" value={name} editable={!saving} onChangeText={(value) => { setName(value); setError(''); }} autoCapitalize="words" />
    <Input label="Short name *" value={shortName} editable={!saving} onChangeText={(value) => { setShortName(value); setError(''); }} autoCapitalize="words" />
    <Input label="Address *" value={address} editable={!saving} onChangeText={(value) => { setAddress(value); setError(''); }} />
    <Input label="Phone *" value={phone} editable={!saving} onChangeText={(value) => { setPhone(value); setError(''); }} keyboardType="phone-pad" />
    <Text style={styles.fieldLabel}>Branch manager *</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choiceRow}>
      {managers.map((manager) => {
        const selected = manager.id === managerId;
        return <TouchableOpacity
          key={manager.id}
          disabled={saving}
          accessibilityRole="radio"
          accessibilityState={{ checked: selected, disabled: saving }}
          onPress={() => { setManagerId(manager.id); setError(''); }}
          style={[styles.managerChoice, selected && styles.managerChoiceSelected, saving && styles.disabled]}
        >
          <View style={[styles.managerAvatar, { backgroundColor: manager.avatarColor }]}><Text style={styles.managerInitials}>{initials(manager.name)}</Text></View>
          <View style={styles.flex}><Text style={[styles.managerName, selected && styles.managerNameSelected]}>{manager.name}</Text><Text style={styles.managerRole}>{manager.jobTitle ?? manager.role}</Text></View>
          {selected ? <Feather name="check-circle" size={16} color={colors.primary} /> : null}
        </TouchableOpacity>;
      })}
    </ScrollView>
    {error ? <ErrorNotice message={error} /> : null}
    <View style={styles.actions}>
      <PrimaryButton title="Cancel" icon="x" secondary compact disabled={saving} onPress={onClose} />
      <View style={styles.flex}><PrimaryButton title="Save branch" icon="check" compact loading={saving} onPress={() => void save()} /></View>
    </View>
  </View>;
}

function Stat({ value, label }: { value: string | number; label: string }) {
  return <View><Text style={styles.branchValue}>{value}</Text><Text style={styles.branchLabel}>{label}</Text></View>;
}

function ErrorNotice({ message }: { message: string }) {
  return <View style={styles.errorNotice}><Feather name="alert-circle" size={16} color={colors.red} /><Text style={styles.errorText}>{message}</Text></View>;
}

const initials = (name: string) => name.split(' ').filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase();

const styles = StyleSheet.create({
  flex: { flex: 1 },
  createCard: { padding: 15, marginBottom: 14 },
  creator: { gap: 13 },
  branchCard: { padding: 15, marginBottom: 11 },
  branchTop: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  branchIcon: { width: 43, height: 43, borderRadius: 14, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  branchName: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  branchAddress: { color: colors.muted, fontSize: 10, marginTop: 4 },
  branchPhone: { color: colors.primary, fontSize: 10, fontWeight: '700', marginTop: 3 },
  editButton: { width: 36, height: 36, borderRadius: 11, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  openPill: { backgroundColor: colors.primaryLight, borderRadius: 99, paddingHorizontal: 9, paddingVertical: 5 },
  closedPill: { backgroundColor: colors.redSoft },
  openText: { color: colors.primary, fontSize: 9, fontWeight: '900' },
  closedText: { color: colors.red },
  branchStats: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 13, marginTop: 13 },
  branchValue: { color: colors.ink, fontSize: 14, fontWeight: '900' },
  branchLabel: { color: colors.subtle, textTransform: 'uppercase', fontSize: 8, marginTop: 3 },
  availabilityButton: { minHeight: 42, marginTop: 13, borderRadius: radius.sm, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  removeButton: { borderColor: colors.red, backgroundColor: colors.redSoft },
  restoreButton: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  availabilityButtonText: { fontSize: 11, fontWeight: '900' },
  removeButtonText: { color: colors.red },
  restoreButtonText: { color: colors.primary },
  editor: { gap: 13, paddingTop: 16, marginTop: 16, borderTopWidth: 1, borderTopColor: colors.border },
  editorHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  editorIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  editorTitle: { color: colors.ink, fontSize: 14, fontWeight: '900' },
  editorSubtitle: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 3 },
  fieldLabel: { color: colors.ink, fontSize: 12, fontWeight: '800' },
  choiceRow: { gap: 8, paddingRight: 5 },
  managerChoice: { minWidth: 190, minHeight: 56, padding: 9, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: 8 },
  managerChoiceSelected: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  managerAvatar: { width: 35, height: 35, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  managerInitials: { color: '#fff', fontSize: 9, fontWeight: '900' },
  managerName: { color: colors.ink, fontSize: 11, fontWeight: '800' },
  managerNameSelected: { color: colors.primaryDark },
  managerRole: { color: colors.muted, fontSize: 9, marginTop: 3, textTransform: 'capitalize' },
  errorNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, padding: 10, borderRadius: radius.sm, backgroundColor: colors.redSoft },
  errorText: { flex: 1, color: colors.red, fontSize: 10, lineHeight: 15, fontWeight: '700' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  disabled: { opacity: 0.48 },
});
