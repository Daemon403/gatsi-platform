import { Feather } from '@expo/vector-icons';
import { getActiveBranch, getActiveUser, unreadNotifications } from '@gatsi/domain';
import { useNavigation } from '@react-navigation/native';
import React from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAppStore } from '../store/AppStore';
import { colors, radius, shadow } from '../theme';

export function AppHeader({ title, subtitle, back = false, showNotifications = true }: { title?: string; subtitle?: string; back?: boolean; showNotifications?: boolean }) {
  const { state, dispatch, sync, syncNow } = useAppStore();
  const user = getActiveUser(state);
  const branch = getActiveBranch(state);
  const navigation = useNavigation<any>();
  const unread = unreadNotifications(state);

  const cycleBranch = () => {
    if (user?.role !== 'admin') return;
    const ids = ['all', ...state.branches.filter((item) => item.active).map((item) => item.id)];
    const next = ids[(ids.indexOf(state.activeBranchId) + 1) % ids.length] ?? 'all';
    dispatch({ type: 'SET_BRANCH', branchId: next });
  };
  const syncLabel = sync.phase === 'offline'
    ? `Offline${sync.pendingCount ? ` · ${sync.pendingCount} saved` : ''}`
    : sync.phase === 'syncing'
      ? `Syncing${sync.pendingCount ? ` ${sync.pendingCount}` : ''}`
      : sync.phase === 'error'
        ? 'Sync issue'
        : sync.pendingCount ? `${sync.pendingCount} pending` : '';

  return (
    <View style={styles.header}>
      {back ? (
        <TouchableOpacity style={styles.squareButton} onPress={() => navigation.goBack()}><Feather name="arrow-left" size={23} color={colors.ink} /></TouchableOpacity>
      ) : (
        <View style={styles.brandMark}><View style={styles.brandCut} /><Text style={styles.brandLetter}>G</Text></View>
      )}
      <View style={styles.heading}>
        <Text style={styles.title}>{title ?? `Hello, ${user?.name.split(' ')[0] ?? 'there'} 👋`}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : (
          <TouchableOpacity activeOpacity={user?.role === 'admin' ? 0.6 : 1} onPress={cycleBranch} style={styles.branchRow}>
            <Feather name="map-pin" size={13} color={colors.primary} />
            <Text style={styles.branchText}>{state.activeBranchId === 'all' ? 'All branches' : branch?.shortName}</Text>
            {user?.role === 'admin' ? <Feather name="chevron-down" size={14} color={colors.primary} /> : null}
          </TouchableOpacity>
        )}
        {syncLabel ? <TouchableOpacity disabled={sync.phase === 'syncing'} onPress={() => {
          if (sync.phase === 'error' && sync.lastError) {
            Alert.alert('Sync issue', `${sync.lastError}\n\nThe server version was restored for any rejected change.`, [{ text: 'Dismiss' }, { text: 'Try again', onPress: () => void syncNow() }]);
          } else void syncNow();
        }} style={[styles.syncRow, sync.phase === 'offline' && styles.syncOffline, sync.phase === 'error' && styles.syncError]}>
          <Feather name={sync.phase === 'offline' ? 'cloud-off' : sync.phase === 'error' ? 'alert-circle' : 'refresh-cw'} size={11} color={sync.phase === 'error' ? colors.red : sync.phase === 'offline' ? colors.amber : colors.primary} />
          <Text style={[styles.syncText, sync.phase === 'offline' && styles.syncTextOffline, sync.phase === 'error' && styles.syncTextError]}>{syncLabel}</Text>
        </TouchableOpacity> : null}
      </View>
      {showNotifications ? <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Notifications, ${unread.length} unread`} onPress={() => navigation.navigate('Notifications')} style={styles.squareButton}>
        <Feather name="bell" size={21} color={colors.ink} />
        {unread.length ? <View style={styles.notificationBadge}><Text style={styles.notificationCount}>{unread.length > 9 ? '9+' : unread.length}</Text></View> : null}
      </TouchableOpacity> : <View style={styles.squarePlaceholder} />}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  brandMark: { width: 50, height: 50, borderRadius: 15, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  brandCut: { position: 'absolute', width: 22, height: 56, backgroundColor: '#fff', opacity: 0.24, transform: [{ rotate: '45deg' }] },
  brandLetter: { color: '#fff', fontSize: 26, fontWeight: '900' },
  squareButton: { width: 48, height: 48, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', ...shadow },
  heading: { flex: 1 },
  title: { color: colors.ink, fontSize: 21, fontWeight: '900', letterSpacing: -0.4 },
  subtitle: { color: colors.muted, fontSize: 13, marginTop: 4 },
  branchRow: { flexDirection: 'row', gap: 5, alignItems: 'center', marginTop: 5 },
  branchText: { color: colors.primary, fontSize: 13, fontWeight: '700' },
  syncRow: { alignSelf: 'flex-start', marginTop: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 99, backgroundColor: colors.primarySoft, flexDirection: 'row', alignItems: 'center', gap: 4 },
  syncOffline: { backgroundColor: colors.amberSoft }, syncError: { backgroundColor: colors.redSoft }, syncText: { color: colors.primary, fontSize: 9, fontWeight: '800' }, syncTextOffline: { color: colors.amber }, syncTextError: { color: colors.red },
  squarePlaceholder: { width: 48, height: 48 },
  notificationBadge: { minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, backgroundColor: colors.red, borderWidth: 2, borderColor: '#fff', position: 'absolute', top: 5, right: 5, alignItems: 'center', justifyContent: 'center' },
  notificationCount: { color: '#fff', fontSize: 8, fontWeight: '900' },
});
