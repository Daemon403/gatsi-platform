import { Feather } from '@expo/vector-icons';
import { branchRevenue, getActiveUser, makeId, money, type AppAction, type User } from '@gatsi/domain';
import React, { useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { AppHeader } from '../components/AppHeader';
import { Screen } from '../components/Screen';
import { Card, EmptyState, Input, PrimaryButton, SectionTitle } from '../components/ui';
import { useAppStore } from '../store/AppStore';
import { apiAction } from '../store/api';
import { colors, radius } from '../theme';

type CreatedCredentials = { name: string; username: string; password: string };

const strongPassword = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{10,}$/;
const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const errorMessage = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;
const initials = (name: string) => name.split(' ').filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase();

export function MoreScreen() {
  const { state, dispatch } = useAppStore();
  const currentUser = getActiveUser(state)!;
  const isAdmin = currentUser.role === 'admin';
  const activeBranches = state.branches.filter((branch) => branch.active);
  const defaultBranchId = state.activeBranchId === 'all' ? activeBranches[0]?.id ?? '' : state.activeBranchId;
  const visibleAtBranch = (member: User) => isAdmin
    ? state.activeBranchId === 'all' || member.branchIds.includes(state.activeBranchId)
    : member.branchIds.some((id) => currentUser.branchIds.includes(id));
  const activeStaff = state.users.filter((member) => member.role === 'staff' && member.active !== false && visibleAtBranch(member));
  const archivedStaff = state.users.filter((member) => member.role === 'staff' && member.active === false && visibleAtBranch(member));

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [branchId, setBranchId] = useState(defaultBranchId);
  const [credentials, setCredentials] = useState<CreatedCredentials | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [formError, setFormError] = useState('');
  const [memberErrors, setMemberErrors] = useState<Record<string, string>>({});
  const [restoreBranches, setRestoreBranches] = useState<Record<string, string>>({});
  const [restorePasswords, setRestorePasswords] = useState<Record<string, string>>({});

  const hydrateFromAction = async (action: AppAction) => {
    const remoteState = await apiAction(action);
    dispatch({ type: 'HYDRATE', state: remoteState });
  };

  const resetForm = () => {
    setName(''); setPhone(''); setEmail(''); setJobTitle(''); setUsername(''); setPassword('');
    setShowPassword(false); setBranchId(defaultBranchId); setFormError('');
  };

  const toggleStaffForm = () => {
    setAdding((current) => { if (!current) setBranchId(defaultBranchId); return !current; });
    setCredentials(null);
    setFormError('');
  };

  const addStaff = async () => {
    if (saving) return;
    if (!name.trim() || !phone.trim() || !email.trim() || !jobTitle.trim() || !username.trim() || !password || !branchId) {
      setFormError('Complete every field and choose a branch.'); return;
    }
    if (!validEmail.test(email.trim())) { setFormError('Enter a valid email address.'); return; }
    if (username.trim().length < 3) { setFormError('The login username must be at least 3 characters.'); return; }
    if (!strongPassword.test(password)) {
      setFormError('Use at least 10 characters with an uppercase letter, lowercase letter and number.'); return;
    }

    const newUser: User = {
      id: makeId('user'), role: 'staff', name: name.trim(), email: email.trim(), phone: phone.trim(),
      branchIds: [branchId], jobTitle: jobTitle.trim(), avatarColor: colors.blue, clockedIn: false,
      username: username.trim(), password, verified: true, active: true,
    };
    setSaving(true); setFormError('');
    try {
      await hydrateFromAction({ type: 'CREATE_STAFF', user: newUser });
      setCredentials({ name: newUser.name, username: newUser.username!, password });
      setAdding(false); resetForm();
    } catch (error) { setFormError(errorMessage(error, 'The team member could not be created.')); }
    finally { setSaving(false); }
  };

  const runMemberAction = async (member: User, action: AppAction, fallback: string) => {
    if (busyUserId) return false;
    setBusyUserId(member.id);
    setMemberErrors((errors) => ({ ...errors, [member.id]: '' }));
    try { await hydrateFromAction(action); return true; }
    catch (error) {
      setMemberErrors((errors) => ({ ...errors, [member.id]: errorMessage(error, fallback) }));
      return false;
    } finally { setBusyUserId(null); }
  };

  const archiveStaff = (member: User) => Alert.alert(
    'Archive team member?',
    `${member.name}'s login will be disabled, while their history and records are retained.`,
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Archive', style: 'destructive', onPress: () => void runMemberAction(member, { type: 'ARCHIVE_STAFF', userId: member.id }, 'The team member could not be archived.') },
    ],
  );

  const updateBranch = async (member: User, nextBranchId: string) => {
    if (member.branchIds.length === 1 && member.branchIds[0] === nextBranchId) return;
    await runMemberAction(member, { type: 'UPDATE_STAFF_BRANCHES', userId: member.id, branchIds: [nextBranchId] }, 'The branch assignment could not be changed.');
  };

  const restoreStaff = async (member: User, fallbackBranchId: string) => {
    const nextBranchId = restoreBranches[member.id] ?? fallbackBranchId;
    const nextPassword = restorePasswords[member.id]?.trim() ?? '';
    if (!nextBranchId) {
      setMemberErrors((errors) => ({ ...errors, [member.id]: 'Choose a branch before restoring this account.' })); return;
    }
    if (nextPassword && !strongPassword.test(nextPassword)) {
      setMemberErrors((errors) => ({ ...errors, [member.id]: 'A new password needs at least 10 characters with uppercase, lowercase and a number.' })); return;
    }
    const restored = await runMemberAction(
      member,
      { type: 'RESTORE_STAFF', userId: member.id, branchIds: [nextBranchId], ...(nextPassword ? { password: nextPassword } : {}) },
      'The team member could not be restored.',
    );
    if (restored) {
      setRestorePasswords((passwords) => ({ ...passwords, [member.id]: '' }));
      if (nextPassword && member.username) setCredentials({ name: member.name, username: member.username, password: nextPassword });
    }
  };

  const logout = () => dispatch({ type: 'LOGOUT' });
  const reset = () => Alert.alert('Reset local data?', 'This removes local changes and restores the original records.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Reset', style: 'destructive', onPress: () => dispatch({ type: 'RESET_DEMO' }) },
  ]);

  return <Screen>
    <AppHeader title="More" subtitle="Account, branches and workspace settings" />
    <Card style={styles.profile}>
      <View style={[styles.avatar, { backgroundColor: currentUser.avatarColor }]}><Text style={styles.avatarText}>{initials(currentUser.name)}</Text></View>
      <View style={styles.flex}><Text style={styles.name}>{currentUser.name}</Text><Text style={styles.role}>{currentUser.role} - {currentUser.jobTitle ?? currentUser.email}</Text><Text style={styles.email}>{currentUser.email}</Text></View>
      <View style={styles.verified}><Feather name="check" size={14} color="#fff" /></View>
    </Card>

    {credentials ? <Card style={styles.credentials}>
      <View style={styles.credentialsIcon}><Feather name="key" size={19} color={colors.primary} /></View>
      <View style={styles.flex}>
        <Text style={styles.credentialsTitle}>Login ready for {credentials.name}</Text>
        <Text style={styles.credentialsLine}>Username: <Text style={styles.credentialsValue}>{credentials.username}</Text></Text>
        <Text style={styles.credentialsLine}>Temporary password: <Text style={styles.credentialsValue}>{credentials.password}</Text></Text>
        <Text style={styles.credentialsHint}>Share these details securely. The password is only displayed here.</Text>
      </View>
      <TouchableOpacity accessibilityLabel="Dismiss credentials" onPress={() => setCredentials(null)} style={styles.dismiss}><Feather name="x" size={18} color={colors.muted} /></TouchableOpacity>
    </Card> : null}

    {isAdmin ? <>
      <SectionTitle title="Branches" />
      {state.branches.map((branch) => {
        const orders = state.orders.filter((order) => order.branchId === branch.id);
        const branchStaff = state.users.filter((member) => member.role === 'staff' && member.active !== false && member.branchIds.includes(branch.id));
        return <Card key={branch.id} style={styles.branchCard}>
          <View style={styles.branchTop}><View style={styles.branchIcon}><Feather name="map-pin" size={20} color={colors.primary} /></View><View style={styles.flex}><Text style={styles.branchName}>{branch.name}</Text><Text style={styles.branchAddress}>{branch.address}</Text></View><View style={[styles.openPill, !branch.active && styles.closedPill]}><Text style={[styles.openText, !branch.active && styles.closedText]}>{branch.active ? 'Open' : 'Closed'}</Text></View></View>
          <View style={styles.branchStats}><Stat value={orders.length} label="Orders" /><Stat value={branchStaff.length} label="Active staff" /><Stat value={money(branchRevenue(state, branch.id))} label="Revenue" /></View>
        </Card>;
      })}
    </> : null}

    {currentUser.role !== 'customer' ? <>
      <SectionTitle title={isAdmin ? 'Team members' : 'Branch teammates'} action={isAdmin ? (adding ? 'Cancel' : 'Add staff') : undefined} onPress={isAdmin ? toggleStaffForm : undefined} />
      {isAdmin && adding ? <Card style={styles.staffForm}>
        <View style={styles.formHeading}><View style={styles.formHeadingIcon}><Feather name="user-plus" size={20} color={colors.primary} /></View><View style={styles.flex}><Text style={styles.formTitle}>Create staff account</Text><Text style={styles.formSubtitle}>Add login details and assign this member to one branch.</Text></View></View>
        <Input label="Full name *" icon="user" value={name} editable={!saving} autoCapitalize="words" onChangeText={(value) => { setName(value); setFormError(''); }} placeholder="Team member's name" />
        <Input label="Job title *" icon="briefcase" value={jobTitle} editable={!saving} autoCapitalize="words" onChangeText={(value) => { setJobTitle(value); setFormError(''); }} placeholder="e.g. Laundry attendant" />
        <Input label="Phone *" icon="phone" value={phone} editable={!saving} keyboardType="phone-pad" autoComplete="tel" onChangeText={(value) => { setPhone(value); setFormError(''); }} placeholder="Contact number" />
        <Input label="Email *" icon="mail" value={email} editable={!saving} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" onChangeText={(value) => { setEmail(value); setFormError(''); }} placeholder="name@example.com" />
        <Input label="Login username *" icon="at-sign" value={username} editable={!saving} autoCapitalize="none" autoCorrect={false} onChangeText={(value) => { setUsername(value); setFormError(''); }} placeholder="Editable login username" />
        <Input label="Temporary password *" icon="lock" value={password} editable={!saving} secureTextEntry={!showPassword} autoCapitalize="none" autoCorrect={false} onChangeText={(value) => { setPassword(value); setFormError(''); }} placeholder="At least 10 characters" />
        <TouchableOpacity disabled={saving} onPress={() => setShowPassword((current) => !current)} style={styles.showPassword}><Feather name={showPassword ? 'eye-off' : 'eye'} size={15} color={colors.primary} /><Text style={styles.showPasswordText}>{showPassword ? 'Hide password' : 'Show password'}</Text></TouchableOpacity>
        <Text style={styles.passwordHint}>Must contain uppercase and lowercase letters, a number, and at least 10 characters.</Text>
        <Text style={styles.fieldLabel}>Assigned branch *</Text>
        <BranchChoices branches={activeBranches} selectedId={branchId} disabled={saving} onSelect={(id) => { setBranchId(id); setFormError(''); }} />
        {formError ? <ErrorNotice message={formError} /> : null}
        <View style={styles.formActions}><PrimaryButton title="Cancel" icon="x" secondary compact disabled={saving} onPress={() => { setAdding(false); resetForm(); }} /><View style={styles.formPrimary}><PrimaryButton title="Create account" icon="user-plus" compact loading={saving} disabled={!branchId} onPress={() => void addStaff()} /></View></View>
      </Card> : null}

      {activeStaff.map((member) => {
        const selectedBranchId = member.branchIds[0] ?? '';
        const assignedOrders = state.orders.filter((order) => order.assignedStaffId === member.id && !['collected', 'cancelled'].includes(order.status)).length;
        return <Card key={member.id} style={styles.personCard}>
          <View style={styles.personTop}><View style={[styles.personAvatar, { backgroundColor: member.avatarColor }]}><Text style={styles.personAvatarText}>{initials(member.name)}</Text></View><View style={styles.flex}><Text style={styles.personName}>{member.name}</Text><Text style={styles.personRole}>{member.jobTitle}</Text></View><View style={[styles.presence, member.clockedIn && styles.presenceIn]}><Text style={[styles.presenceText, member.clockedIn && styles.presenceTextIn]}>{member.clockedIn ? 'On shift' : 'Off shift'}</Text></View></View>
          <View style={styles.contactRows}><ContactLine icon="phone" text={member.phone} /><ContactLine icon="mail" text={member.email} /><ContactLine icon="shopping-bag" text={`${assignedOrders} active ${assignedOrders === 1 ? 'order' : 'orders'}`} /></View>
          {isAdmin ? <>
            <Text style={styles.fieldLabel}>Assigned branch</Text>
            <BranchChoices branches={activeBranches} selectedId={selectedBranchId} disabled={busyUserId === member.id} onSelect={(id) => void updateBranch(member, id)} />
            {memberErrors[member.id] ? <ErrorNotice message={memberErrors[member.id]} /> : null}
            <TouchableOpacity disabled={Boolean(busyUserId)} onPress={() => archiveStaff(member)} style={[styles.archiveButton, Boolean(busyUserId) && styles.disabled]}><Feather name="archive" size={16} color={colors.red} /><Text style={styles.archiveButtonText}>{busyUserId === member.id ? 'Saving...' : 'Archive member'}</Text></TouchableOpacity>
          </> : null}
        </Card>;
      })}
      {!activeStaff.length ? <Card><EmptyState icon="users" title="No active team members" body={isAdmin ? 'Add a team member or select another branch.' : 'There are no active team members assigned to your branch.'} /></Card> : null}

      {isAdmin ? <>
        <SectionTitle title={`Archived team (${archivedStaff.length})`} />
        {archivedStaff.map((member) => {
          const existingActiveBranch = member.branchIds.find((id) => activeBranches.some((branch) => branch.id === id));
          const restoreBranchId = restoreBranches[member.id] ?? existingActiveBranch ?? defaultBranchId;
          const restorePassword = restorePasswords[member.id] ?? '';
          return <Card key={member.id} style={[styles.personCard, styles.archivedCard]}>
            <View style={styles.personTop}><View style={[styles.personAvatar, styles.archivedAvatar, { backgroundColor: member.avatarColor }]}><Text style={styles.personAvatarText}>{initials(member.name)}</Text></View><View style={styles.flex}><Text style={styles.personName}>{member.name}</Text><Text style={styles.personRole}>{member.jobTitle}</Text></View><View style={styles.archivedPill}><Text style={styles.archivedPillText}>Archived</Text></View></View>
            <View style={styles.contactRows}><ContactLine icon="phone" text={member.phone} /><ContactLine icon="mail" text={member.email} /><ContactLine icon="shield" text="Work history retained" /></View>
            <Text style={styles.fieldLabel}>Branch when restored</Text>
            <BranchChoices branches={activeBranches} selectedId={restoreBranchId} disabled={busyUserId === member.id} onSelect={(id) => { setRestoreBranches((branches) => ({ ...branches, [member.id]: id })); setMemberErrors((errors) => ({ ...errors, [member.id]: '' })); }} />
            <Input label="New password (optional)" icon="key" value={restorePassword} editable={busyUserId !== member.id} secureTextEntry autoCapitalize="none" autoCorrect={false} onChangeText={(value) => { setRestorePasswords((passwords) => ({ ...passwords, [member.id]: value })); setMemberErrors((errors) => ({ ...errors, [member.id]: '' })); }} placeholder="Leave blank to retain password" style={styles.restoreInput} />
            <Text style={styles.passwordHint}>If changed, use 10+ characters with uppercase, lowercase and a number.</Text>
            {memberErrors[member.id] ? <ErrorNotice message={memberErrors[member.id]} /> : null}
            <PrimaryButton title={busyUserId === member.id ? 'Restoring...' : 'Restore account'} icon="rotate-ccw" compact loading={busyUserId === member.id} disabled={!restoreBranchId || Boolean(busyUserId && busyUserId !== member.id)} onPress={() => void restoreStaff(member, restoreBranchId)} />
          </Card>;
        })}
        {!archivedStaff.length ? <Card><EmptyState icon="archive" title="No archived team members" body="Archived accounts will appear here and can be restored later." /></Card> : null}
      </> : null}
    </> : <>
      <SectionTitle title="Help & contact" />
      <Card style={styles.helpCard}><MenuItem icon="phone" title="Call Gatsi Comms" detail={state.branches.find((branch) => branch.id === state.activeBranchId)?.phone ?? state.branches[0].phone} /><MenuItem icon="message-circle" title="WhatsApp support" detail="Chat with a garment care adviser" /><MenuItem icon="award" title="Loyalty programme" detail="Earn one point for every dollar spent" /></Card>
    </>}

    <SectionTitle title="Workspace" />
    <Card style={styles.menu}><MenuItem icon="log-out" title="Sign out" detail="Return to secure account login" onPress={logout} /><MenuItem icon="refresh-cw" title="Reset local data" detail="Restore the original records" onPress={reset} danger /></Card>
    <Text style={styles.version}>Gatsi Comms Suite - Version 1.0.0</Text>
  </Screen>;
}

function BranchChoices({ branches, selectedId, disabled, onSelect }: { branches: Array<{ id: string; shortName: string; name: string }>; selectedId: string; disabled?: boolean; onSelect: (id: string) => void }) {
  return <View style={styles.branchChoices}>{branches.map((branch) => {
    const selected = branch.id === selectedId;
    return <TouchableOpacity key={branch.id} disabled={disabled} accessibilityRole="radio" accessibilityState={{ checked: selected, disabled }} accessibilityLabel={branch.name} onPress={() => onSelect(branch.id)} style={[styles.branchChoice, selected && styles.branchChoiceSelected, disabled && styles.disabled]}><Feather name={selected ? 'check-circle' : 'map-pin'} size={15} color={selected ? colors.primary : colors.muted} /><Text style={[styles.branchChoiceText, selected && styles.branchChoiceTextSelected]}>{branch.shortName}</Text></TouchableOpacity>;
  })}{!branches.length ? <Text style={styles.noBranches}>No active branches are available.</Text> : null}</View>;
}

function ContactLine({ icon, text }: { icon: keyof typeof Feather.glyphMap; text: string }) {
  return <View style={styles.contactLine}><Feather name={icon} size={14} color={colors.muted} /><Text style={styles.contactText}>{text}</Text></View>;
}

function ErrorNotice({ message }: { message: string }) {
  return <View style={styles.errorNotice}><Feather name="alert-circle" size={16} color={colors.red} /><Text style={styles.errorText}>{message}</Text></View>;
}

function Stat({ value, label }: { value: string | number; label: string }) {
  return <View><Text style={styles.branchValue}>{value}</Text><Text style={styles.branchLabel}>{label}</Text></View>;
}

function MenuItem({ icon, title, detail, onPress, danger }: { icon: keyof typeof Feather.glyphMap; title: string; detail: string; onPress?: () => void; danger?: boolean }) {
  return <TouchableOpacity disabled={!onPress} onPress={onPress} style={styles.menuItem}><View style={[styles.menuIcon, danger && styles.menuIconDanger]}><Feather name={icon} size={18} color={danger ? colors.red : colors.primary} /></View><View style={styles.flex}><Text style={[styles.menuTitle, danger && styles.menuTitleDanger]}>{title}</Text><Text style={styles.menuDetail}>{detail}</Text></View>{onPress ? <Feather name="chevron-right" size={19} color={colors.subtle} /> : null}</TouchableOpacity>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  profile: { padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 58, height: 58, borderRadius: 19, alignItems: 'center', justifyContent: 'center' }, avatarText: { color: '#fff', fontSize: 18, fontWeight: '900' },
  name: { color: colors.ink, fontSize: 17, fontWeight: '900' }, role: { color: colors.primary, fontSize: 11, fontWeight: '700', textTransform: 'capitalize', marginTop: 4 }, email: { color: colors.muted, fontSize: 10, marginTop: 3 }, verified: { width: 25, height: 25, borderRadius: 13, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  credentials: { marginTop: 14, padding: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 11, borderColor: colors.primary }, credentialsIcon: { width: 39, height: 39, borderRadius: 12, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' }, credentialsTitle: { color: colors.ink, fontSize: 13, fontWeight: '900', marginBottom: 5 }, credentialsLine: { color: colors.muted, fontSize: 11, lineHeight: 18 }, credentialsValue: { color: colors.ink, fontWeight: '900' }, credentialsHint: { color: colors.primary, fontSize: 9, lineHeight: 14, marginTop: 4 }, dismiss: { padding: 4 },
  branchCard: { padding: 15, marginBottom: 11 }, branchTop: { flexDirection: 'row', alignItems: 'center', gap: 11 }, branchIcon: { width: 43, height: 43, borderRadius: 14, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' }, branchName: { color: colors.ink, fontSize: 14, fontWeight: '800' }, branchAddress: { color: colors.muted, fontSize: 10, marginTop: 4 }, openPill: { backgroundColor: colors.primaryLight, borderRadius: 99, paddingHorizontal: 9, paddingVertical: 5 }, closedPill: { backgroundColor: colors.redSoft }, openText: { color: colors.primary, fontSize: 9, fontWeight: '900' }, closedText: { color: colors.red }, branchStats: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 13, marginTop: 13 }, branchValue: { color: colors.ink, fontSize: 14, fontWeight: '900' }, branchLabel: { color: colors.subtle, textTransform: 'uppercase', fontSize: 8, marginTop: 3 },
  staffForm: { padding: 16, gap: 15, marginBottom: 14 }, formHeading: { flexDirection: 'row', gap: 11, alignItems: 'center', marginBottom: 2 }, formHeadingIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' }, formTitle: { color: colors.ink, fontSize: 15, fontWeight: '900' }, formSubtitle: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 3 }, fieldLabel: { color: colors.ink, fontSize: 12, fontWeight: '800', marginTop: 3 }, showPassword: { alignSelf: 'flex-end', flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -8 }, showPasswordText: { color: colors.primary, fontSize: 10, fontWeight: '800' }, passwordHint: { color: colors.muted, fontSize: 9, lineHeight: 14, marginTop: -8 },
  branchChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, branchChoice: { minHeight: 38, paddingHorizontal: 11, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: 6 }, branchChoiceSelected: { borderColor: colors.primary, backgroundColor: colors.primaryLight }, branchChoiceText: { color: colors.muted, fontSize: 10, fontWeight: '800' }, branchChoiceTextSelected: { color: colors.primary }, noBranches: { color: colors.red, fontSize: 10 },
  errorNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, padding: 10, borderRadius: radius.sm, backgroundColor: colors.redSoft }, errorText: { flex: 1, color: colors.red, fontSize: 10, lineHeight: 15, fontWeight: '700' }, formActions: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 2 }, formPrimary: { flex: 1 },
  personCard: { padding: 14, gap: 13, marginBottom: 10 }, personTop: { flexDirection: 'row', alignItems: 'center', gap: 11 }, personAvatar: { width: 45, height: 45, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, personAvatarText: { color: '#fff', fontSize: 11, fontWeight: '900' }, personName: { color: colors.ink, fontSize: 13, fontWeight: '900' }, personRole: { color: colors.muted, fontSize: 10, marginTop: 3 }, presence: { backgroundColor: colors.background, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 99 }, presenceIn: { backgroundColor: colors.primaryLight }, presenceText: { color: colors.muted, fontSize: 9, fontWeight: '800' }, presenceTextIn: { color: colors.primary },
  contactRows: { gap: 7, paddingVertical: 10, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border }, contactLine: { flexDirection: 'row', alignItems: 'center', gap: 8 }, contactText: { flex: 1, color: colors.muted, fontSize: 10 }, archiveButton: { minHeight: 39, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.red, backgroundColor: colors.redSoft, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, archiveButtonText: { color: colors.red, fontSize: 11, fontWeight: '900' }, disabled: { opacity: 0.48 }, archivedCard: { borderColor: '#D9DDE5' }, archivedAvatar: { opacity: 0.62 }, archivedPill: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 99, backgroundColor: '#EEF0F4' }, archivedPillText: { color: colors.muted, fontSize: 9, fontWeight: '900' }, restoreInput: { marginTop: 1 },
  helpCard: { paddingHorizontal: 14 }, menu: { paddingHorizontal: 14 }, menuItem: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border }, menuIcon: { width: 39, height: 39, borderRadius: 12, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' }, menuIconDanger: { backgroundColor: colors.redSoft }, menuTitle: { color: colors.ink, fontSize: 13, fontWeight: '800' }, menuTitleDanger: { color: colors.red }, menuDetail: { color: colors.muted, fontSize: 10, marginTop: 3 }, version: { color: colors.subtle, fontSize: 10, textAlign: 'center', marginTop: 24 },
});
