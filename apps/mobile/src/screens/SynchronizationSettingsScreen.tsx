import { Feather } from '@expo/vector-icons';
import { getActiveUser, type SynchronizationMode } from '@gatsi/domain';
import React, { useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { AppHeader } from '../components/AppHeader';
import { Screen } from '../components/Screen';
import { Card, PrimaryButton } from '../components/ui';
import { useAppStore } from '../store/AppStore';
import { apiAction } from '../store/api';
import { colors, radius } from '../theme';

export function SynchronizationSettingsScreen() {
  const { state, dispatch, sync, syncNow } = useAppStore();
  const user = getActiveUser(state)!;
  const [savingMode, setSavingMode] = useState(false);
  const mode = state.settings?.synchronizationMode ?? 'reconnect';

  const saveMode = async (nextMode: SynchronizationMode) => {
    if (savingMode || nextMode === mode) return;
    setSavingMode(true);
    try {
      const remoteState = await apiAction({ type: 'UPDATE_SYNC_SETTINGS', synchronizationMode: nextMode });
      dispatch({ type: 'HYDRATE', state: remoteState });
      Alert.alert('Synchronization updated', nextMode === 'reconnect'
        ? 'This mobile app will synchronize whenever connectivity returns.'
        : 'This mobile app will synchronize the first time it is online each day. A user can still synchronize manually.');
    } catch (error) {
      Alert.alert('Could not update synchronization', error instanceof Error ? error.message : 'The synchronization schedule could not be saved.');
    } finally {
      setSavingMode(false);
    }
  };

  const synchronizeNow = async () => {
    await syncNow();
    Alert.alert('Synchronization requested', 'Queued work has been sent if the server is reachable.');
  };

  return <Screen>
    <AppHeader title="Synchronization settings" subtitle="Mobile automatic synchronization" back />
    <Card style={styles.notice}>
      <View style={styles.noticeIcon}><Feather name="smartphone" size={22} color={colors.primary} /></View>
      <View style={styles.flex}><Text style={styles.noticeTitle}>Mobile-only schedule</Text><Text style={styles.noticeBody}>This setting controls mobile devices. The web app always synchronizes automatically.</Text></View>
    </Card>

    <Text style={styles.sectionLabel}>When should mobile synchronize?</Text>
    <Card style={styles.form}>
      {user.role === 'admin' ? <View style={styles.options} accessibilityRole="radiogroup">
        <ModeOption
          selected={mode === 'reconnect'}
          disabled={savingMode}
          title="Whenever connectivity is restored"
          detail="Send queued work after every reconnect and send online work immediately."
          onPress={() => void saveMode('reconnect')}
        />
        <ModeOption
          selected={mode === 'daily'}
          disabled={savingMode}
          title="First time online each day"
          detail="After the first daily sync, queue later work until tomorrow or a manual sync."
          onPress={() => void saveMode('daily')}
        />
      </View> : <Text style={styles.readOnly}>Automatic schedule: <Text style={styles.readOnlyStrong}>{mode === 'daily' ? 'First time online each day' : 'Whenever connectivity is restored'}</Text></Text>}

      <View style={styles.status}>
        <View><Text style={styles.statusLabel}>DEVICE STATUS</Text><Text style={styles.statusValue}>{sync.phase === 'syncing' ? 'Synchronizing' : sync.phase === 'offline' ? 'Offline' : sync.phase === 'error' ? 'Sync issue' : 'Online'}</Text></View>
        <View style={styles.statusRight}><Text style={styles.statusLabel}>QUEUED</Text><Text style={styles.statusValue}>{sync.pendingCount}</Text></View>
        <Text style={styles.lastSync}>{sync.lastSyncedAt ? `Last synchronized ${new Date(sync.lastSyncedAt).toLocaleString('en-ZW')}` : 'Not synchronized on this device yet'}</Text>
      </View>
      <PrimaryButton title={sync.phase === 'syncing' ? 'Synchronizing...' : 'Synchronize now'} icon="refresh-cw" onPress={() => void synchronizeNow()} loading={sync.phase === 'syncing'} disabled={savingMode} secondary />
    </Card>
  </Screen>;
}

function ModeOption({ selected, disabled, title, detail, onPress }: { selected: boolean; disabled: boolean; title: string; detail: string; onPress: () => void }) {
  return <TouchableOpacity
    accessibilityRole="radio"
    accessibilityState={{ checked: selected, disabled }}
    disabled={disabled}
    onPress={onPress}
    style={[styles.option, selected && styles.optionSelected, disabled && styles.optionDisabled]}
  >
    <View style={[styles.radio, selected && styles.radioSelected]}>{selected ? <View style={styles.radioDot} /> : null}</View>
    <View style={styles.flex}><Text style={styles.optionTitle}>{title}</Text><Text style={styles.optionDetail}>{detail}</Text></View>
  </TouchableOpacity>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  notice: { padding: 15, flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 20, backgroundColor: colors.primaryLight },
  noticeIcon: { width: 44, height: 44, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  noticeTitle: { color: colors.ink, fontSize: 14, fontWeight: '900' },
  noticeBody: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 3 },
  sectionLabel: { color: colors.ink, fontSize: 18, fontWeight: '900', marginBottom: 12 },
  form: { padding: 16, gap: 16 },
  options: { gap: 10 },
  option: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, backgroundColor: colors.surface },
  optionSelected: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  optionDisabled: { opacity: 0.65 },
  radio: { width: 20, height: 20, borderWidth: 2, borderColor: colors.subtle, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  radioSelected: { borderColor: colors.primary },
  radioDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.primary },
  optionTitle: { color: colors.ink, fontSize: 13, fontWeight: '900' },
  optionDetail: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 4 },
  readOnly: { color: colors.muted, fontSize: 11, lineHeight: 17 },
  readOnlyStrong: { color: colors.ink, fontWeight: '800' },
  status: { padding: 13, borderRadius: radius.sm, backgroundColor: colors.background, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 },
  statusRight: { alignItems: 'flex-end' },
  statusLabel: { color: colors.subtle, fontSize: 8, fontWeight: '800' },
  statusValue: { color: colors.ink, fontSize: 13, fontWeight: '900', marginTop: 3 },
  lastSync: { width: '100%', color: colors.muted, fontSize: 10, marginTop: 3 },
});
