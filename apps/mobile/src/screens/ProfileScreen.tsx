import { Feather } from '@expo/vector-icons';
import { getActiveUser, type ProfileUpdate, type SynchronizationMode } from '@gatsi/domain';
import { useNavigation } from '@react-navigation/native';
import React, { useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { AppHeader } from '../components/AppHeader';
import { Screen } from '../components/Screen';
import { Card, Input, PrimaryButton } from '../components/ui';
import { useAppStore } from '../store/AppStore';
import { apiAction, apiChangePassword } from '../store/api';
import { colors, radius } from '../theme';

export function ProfileScreen() {
  const { state, dispatch, sync, syncNow } = useAppStore();
  const navigation = useNavigation();
  const user = getActiveUser(state)!;
  const [draft, setDraft] = useState<ProfileUpdate>({ name: user.name, email: user.email, phone: user.phone, jobTitle: user.jobTitle ?? '', username: user.username ?? '' });
  const [saving, setSaving] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [savingSyncMode, setSavingSyncMode] = useState(false);
  const synchronizationMode = state.settings?.synchronizationMode ?? 'reconnect';
  const update = (key: keyof ProfileUpdate, value: string) => setDraft((current) => ({ ...current, [key]: value }));
  const save = async () => {
    if (saving) return;
    if (!draft.name.trim() || !draft.phone.trim()) return Alert.alert('Details needed', 'Name and phone are required.');
    if (user.role === 'admin' && !/^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/.test((draft.username ?? '').trim())) {
      return Alert.alert('Invalid username', 'Use 3 to 64 characters, starting with a letter or number, followed by letters, numbers, dots, underscores or hyphens.');
    }
    setSaving(true);
    try {
      const updates: ProfileUpdate = {
        ...draft,
        name: draft.name.trim(),
        email: draft.email.trim(),
        phone: draft.phone.trim(),
        jobTitle: (draft.jobTitle ?? '').trim(),
        username: user.role === 'admin' ? (draft.username ?? '').trim() : user.username,
      };
      const remoteState = await apiAction({ type: 'UPDATE_PROFILE', updates });
      dispatch({ type: 'HYDRATE', state: remoteState });
      Alert.alert('Profile updated', 'Your account details have been saved.');
    } catch (error) {
      Alert.alert('Could not update profile', error instanceof Error ? error.message : 'Your profile could not be saved. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async () => {
    if (changingPassword) return;
    if (!currentPassword) return Alert.alert('Current password required', 'Enter the password you use to sign in.');
    if (newPassword.length < 10 || !/[a-z]/.test(newPassword) || !/[A-Z]/.test(newPassword) || !/\d/.test(newPassword)) {
      return Alert.alert('Password is not strong enough', 'Use at least 10 characters with an uppercase letter, a lowercase letter and a number.');
    }
    if (newPassword !== confirmPassword) return Alert.alert('Passwords do not match', 'Confirm the same new password in both fields.');
    if (currentPassword === newPassword) return Alert.alert('Choose a new password', 'Your new password must be different from your current password.');
    setChangingPassword(true);
    try {
      await apiChangePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      Alert.alert('Password changed', 'Your new password is ready for your next sign-in.');
    } catch (error) {
      Alert.alert('Could not change password', error instanceof Error ? error.message : 'Your password could not be changed. Try again.');
    } finally {
      setChangingPassword(false);
    }
  };

  const saveSynchronizationMode = async (mode: SynchronizationMode) => {
    if (savingSyncMode || mode === synchronizationMode) return;
    setSavingSyncMode(true);
    try {
      const remoteState = await apiAction({ type: 'UPDATE_SYNC_SETTINGS', synchronizationMode: mode });
      dispatch({ type: 'HYDRATE', state: remoteState });
      Alert.alert('Synchronization updated', mode === 'reconnect'
        ? 'Devices will synchronize whenever connectivity returns.'
        : 'Devices will synchronize the first time they are online each day. Users can still synchronize manually.');
    } catch (error) {
      Alert.alert('Could not update synchronization', error instanceof Error ? error.message : 'The synchronization schedule could not be saved.');
    } finally {
      setSavingSyncMode(false);
    }
  };

  const synchronizeNow = async () => {
    await syncNow();
    Alert.alert('Synchronization requested', 'Queued work has been sent if the server is reachable.');
  };

  return <Screen>
    <AppHeader title="Account settings" subtitle="Profile, security and synchronization" back />
    <Text style={styles.sectionLabel}>Profile details</Text>
    <Card style={styles.form}>
      <Input label="Full name" icon="user" value={draft.name} onChangeText={(value) => update('name', value)} autoCapitalize="words" />
      <Input label="Email address" icon="mail" value={draft.email} onChangeText={(value) => update('email', value)} keyboardType="email-address" autoCapitalize="none" />
      <Input label="Phone number" icon="phone" value={draft.phone} onChangeText={(value) => update('phone', value)} keyboardType="phone-pad" />
      {user.role !== 'customer' ? <Input label="Job title" icon="briefcase" value={draft.jobTitle} onChangeText={(value) => update('jobTitle', value)} /> : null}
      {user.role === 'admin' ? <>
        <Input label="Login username" icon="at-sign" value={draft.username} onChangeText={(value) => update('username', value)} autoCapitalize="none" autoCorrect={false} />
        <Text style={styles.hint}>Changing your username changes what you enter on the sign-in screen.</Text>
      </> : null}
      <PrimaryButton title="Save profile" icon="check" onPress={() => void save()} loading={saving} />
    </Card>

    <Text style={styles.sectionLabel}>Password</Text>
    <Card style={styles.form}>
      <View style={styles.securityIntro}>
        <View style={styles.securityIcon}><Text style={styles.securityIconText}>*</Text></View>
        <View style={styles.flex}><Text style={styles.securityTitle}>Change your password</Text><Text style={styles.securityBody}>Confirm your current password before replacing it.</Text></View>
      </View>
      <Input label="Current password" icon="lock" value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} textContentType="password" />
      <Input label="New password" icon="key" value={newPassword} onChangeText={setNewPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} textContentType="newPassword" />
      <Input label="Confirm new password" icon="check-circle" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} textContentType="newPassword" />
      <Text style={styles.hint}>At least 10 characters, including uppercase, lowercase and a number.</Text>
      <PrimaryButton title="Change password" icon="shield" onPress={() => void changePassword()} loading={changingPassword} disabled={saving} />
    </Card>

    <Text style={styles.sectionLabel}>Synchronization</Text>
    <Card style={styles.form}>
      <View style={styles.securityIntro}>
        <View style={styles.securityIcon}><Feather name="refresh-cw" size={19} color={colors.primary} /></View>
        <View style={styles.flex}><Text style={styles.securityTitle}>Device synchronization</Text><Text style={styles.securityBody}>Control when queued operational data is exchanged with PostgreSQL.</Text></View>
      </View>
      {user.role === 'admin' ? <View style={styles.syncOptions} accessibilityRole="radiogroup">
        <SyncModeOption
          selected={synchronizationMode === 'reconnect'}
          disabled={savingSyncMode}
          title="Whenever connectivity is restored"
          detail="Send queued work after every reconnect and synchronize online work immediately."
          onPress={() => void saveSynchronizationMode('reconnect')}
        />
        <SyncModeOption
          selected={synchronizationMode === 'daily'}
          disabled={savingSyncMode}
          title="First time online each day"
          detail="After the first daily sync, queue later work until tomorrow or a manual sync."
          onPress={() => void saveSynchronizationMode('daily')}
        />
      </View> : <Text style={styles.syncPolicy}>Automatic schedule: <Text style={styles.syncPolicyStrong}>{synchronizationMode === 'daily' ? 'First time online each day' : 'Whenever connectivity is restored'}</Text></Text>}
      <View style={styles.syncStatus}>
        <Text style={styles.syncStatusText}>{sync.pendingCount ? `${sync.pendingCount} queued ${sync.pendingCount === 1 ? 'change' : 'changes'}` : 'No queued changes'}</Text>
        <Text style={styles.syncStatusText}>{sync.lastSyncedAt ? `Last synchronized ${new Date(sync.lastSyncedAt).toLocaleString('en-ZW')}` : 'Not synchronized on this device yet'}</Text>
      </View>
      <PrimaryButton title={sync.phase === 'syncing' ? 'Synchronizing...' : 'Synchronize now'} icon="refresh-cw" onPress={() => void synchronizeNow()} loading={sync.phase === 'syncing'} disabled={savingSyncMode} secondary />
    </Card>

    <View style={styles.footerAction}>
      <PrimaryButton title="Done" icon="arrow-left" onPress={() => navigation.goBack()} secondary disabled={saving || changingPassword} />
    </View>
  </Screen>;
}

function SyncModeOption({ selected, disabled, title, detail, onPress }: { selected: boolean; disabled: boolean; title: string; detail: string; onPress: () => void }) {
  return <TouchableOpacity
    accessibilityRole="radio"
    accessibilityState={{ checked: selected, disabled }}
    disabled={disabled}
    onPress={onPress}
    style={[styles.syncOption, selected && styles.syncOptionSelected, disabled && styles.syncOptionDisabled]}
  >
    <View style={[styles.syncRadio, selected && styles.syncRadioSelected]}>{selected ? <View style={styles.syncRadioDot} /> : null}</View>
    <View style={styles.flex}><Text style={styles.syncOptionTitle}>{title}</Text><Text style={styles.syncOptionDetail}>{detail}</Text></View>
  </TouchableOpacity>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  sectionLabel: { color: colors.ink, fontSize: 18, fontWeight: '900', marginBottom: 12, marginTop: 8 },
  form: { padding: 16, gap: 16, marginBottom: 18 },
  hint: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: -7 },
  securityIntro: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingBottom: 3 },
  securityIcon: { width: 42, height: 42, borderRadius: radius.sm, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  securityIconText: { color: colors.primary, fontSize: 22, fontWeight: '900' },
  securityTitle: { color: colors.ink, fontSize: 14, fontWeight: '900' },
  securityBody: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 3 },
  syncOptions: { gap: 9 },
  syncOption: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 13, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, backgroundColor: colors.surface },
  syncOptionSelected: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  syncOptionDisabled: { opacity: 0.65 },
  syncRadio: { width: 18, height: 18, borderWidth: 2, borderColor: colors.subtle, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  syncRadioSelected: { borderColor: colors.primary },
  syncRadioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  syncOptionTitle: { color: colors.ink, fontSize: 12, fontWeight: '900' },
  syncOptionDetail: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 4 },
  syncPolicy: { color: colors.muted, fontSize: 11, lineHeight: 17 },
  syncPolicyStrong: { color: colors.ink, fontWeight: '800' },
  syncStatus: { padding: 12, borderRadius: radius.sm, backgroundColor: colors.background, gap: 5 },
  syncStatusText: { color: colors.muted, fontSize: 10 },
  footerAction: { marginTop: -2 },
});
