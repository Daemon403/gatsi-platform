import { getActiveUser, type ProfileUpdate } from '@gatsi/domain';
import { useNavigation } from '@react-navigation/native';
import React, { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { AppHeader } from '../components/AppHeader';
import { Screen } from '../components/Screen';
import { Card, Input, PrimaryButton } from '../components/ui';
import { useAppStore } from '../store/AppStore';
import { apiAction } from '../store/api';
import { colors } from '../theme';

export function ProfileScreen() {
  const { state, dispatch } = useAppStore();
  const navigation = useNavigation();
  const user = getActiveUser(state)!;
  const [draft, setDraft] = useState<ProfileUpdate>({ name: user.name, email: user.email, phone: user.phone, jobTitle: user.jobTitle ?? '' });
  const [saving, setSaving] = useState(false);
  const update = (key: keyof ProfileUpdate, value: string) => setDraft((current) => ({ ...current, [key]: value }));
  const save = async () => {
    if (saving) return;
    if (!draft.name.trim() || !draft.phone.trim()) return Alert.alert('Details needed', 'Name and phone are required.');
    setSaving(true);
    try {
      const updates = { ...draft, name: draft.name.trim(), email: draft.email.trim(), phone: draft.phone.trim(), jobTitle: (draft.jobTitle ?? '').trim() };
      const remoteState = await apiAction({ type: 'UPDATE_PROFILE', updates });
      dispatch({ type: 'HYDRATE', state: remoteState });
      Alert.alert('Profile updated', 'Your account details have been saved.', [{ text: 'Done', onPress: () => navigation.goBack() }]);
    } catch (error) {
      Alert.alert('Could not update profile', error instanceof Error ? error.message : 'Your profile could not be saved. Try again.');
    } finally {
      setSaving(false);
    }
  };
  return <Screen>
    <AppHeader title="Edit profile" subtitle="Keep your account details current" back />
    <Card style={styles.form}>
      <Input label="Full name" icon="user" value={draft.name} onChangeText={(value) => update('name', value)} autoCapitalize="words" />
      <Input label="Email address" icon="mail" value={draft.email} onChangeText={(value) => update('email', value)} keyboardType="email-address" autoCapitalize="none" />
      <Input label="Phone number" icon="phone" value={draft.phone} onChangeText={(value) => update('phone', value)} keyboardType="phone-pad" />
      {user.role !== 'customer' ? <Input label="Job title" icon="briefcase" value={draft.jobTitle} onChangeText={(value) => update('jobTitle', value)} /> : null}
      <View style={styles.actions}><PrimaryButton title="Save changes" icon="check" onPress={save} loading={saving} /><PrimaryButton title="Cancel" icon="x" onPress={() => navigation.goBack()} secondary disabled={saving} /></View>
    </Card>
  </Screen>;
}

const styles = StyleSheet.create({
  form: { padding: 16, gap: 16 },
  actions: { gap: 10, marginTop: 6 },
});
