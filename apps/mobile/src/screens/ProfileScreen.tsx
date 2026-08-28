import { getActiveUser, type ProfileUpdate } from '@gatsi/domain';
import { useNavigation } from '@react-navigation/native';
import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { AppHeader } from '../components/AppHeader';
import { Screen } from '../components/Screen';
import { Card, Input, PrimaryButton } from '../components/ui';
import { useAppStore } from '../store/AppStore';
import { apiAction, apiChangePassword } from '../store/api';
import { colors, radius } from '../theme';

export function ProfileScreen() {
  const { state, dispatch } = useAppStore();
  const navigation = useNavigation();
  const user = getActiveUser(state)!;
  const [draft, setDraft] = useState<ProfileUpdate>({ name: user.name, email: user.email, phone: user.phone, jobTitle: user.jobTitle ?? '', username: user.username ?? '' });
  const [saving, setSaving] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
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

  return <Screen>
    <AppHeader title="Account & profile" subtitle="Manage your details and sign-in security" back />
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

    <View style={styles.footerAction}>
      <PrimaryButton title="Done" icon="arrow-left" onPress={() => navigation.goBack()} secondary disabled={saving || changingPassword} />
    </View>
  </Screen>;
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
  footerAction: { marginTop: -2 },
});
