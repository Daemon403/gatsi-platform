import { Feather } from '@expo/vector-icons';
import { getActiveBranch, getActiveUser } from '@gatsi/domain';
import { useNavigation } from '@react-navigation/native';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAppStore } from '../store/AppStore';
import { colors, radius, shadow } from '../theme';

export function AppHeader({ title, subtitle, back = false }: { title?: string; subtitle?: string; back?: boolean }) {
  const { state, dispatch } = useAppStore();
  const user = getActiveUser(state);
  const branch = getActiveBranch(state);
  const navigation = useNavigation();

  const cycleBranch = () => {
    if (user?.role !== 'admin') return;
    const ids = ['all', ...state.branches.filter((item) => item.active).map((item) => item.id)];
    const next = ids[(ids.indexOf(state.activeBranchId) + 1) % ids.length] ?? 'all';
    dispatch({ type: 'SET_BRANCH', branchId: next });
  };

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
      </View>
      <TouchableOpacity style={styles.squareButton}><Feather name="bell" size={21} color={colors.ink} /><View style={styles.notificationDot} /></TouchableOpacity>
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
  notificationDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary, borderWidth: 2, borderColor: '#fff', position: 'absolute', top: 10, right: 10 },
});
