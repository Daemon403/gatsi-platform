import { Feather } from '@expo/vector-icons';
import { getActiveUser } from '@gatsi/domain';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { AppHeader } from '../components/AppHeader';
import { Screen } from '../components/Screen';
import { Card, SectionTitle } from '../components/ui';
import type { RootStackParamList } from '../navigation/types';
import { useAppStore } from '../store/AppStore';
import { colors } from '../theme';

const initials = (name: string) => name.split(' ').filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase();

export function MoreScreen() {
  const { state, dispatch } = useAppStore();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const currentUser = getActiveUser(state)!;
  const canViewTeam = currentUser.role === 'admin' || currentUser.role === 'staff';
  const canViewBranches = currentUser.role === 'admin';

  const logout = () => dispatch({ type: 'LOGOUT' });
  const reset = () => Alert.alert('Reset local data?', 'This removes local changes and restores the original records.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Reset', style: 'destructive', onPress: () => dispatch({ type: 'RESET_DEMO' }) },
  ]);

  return <Screen>
    <AppHeader title="More" subtitle="Account and workspace settings" />
    <TouchableOpacity activeOpacity={0.8} onPress={() => navigation.navigate('Profile')}>
    <Card style={styles.profile}>
      <View style={[styles.avatar, { backgroundColor: currentUser.avatarColor }]}><Text style={styles.avatarText}>{initials(currentUser.name)}</Text></View>
      <View style={styles.flex}><Text style={styles.name}>{currentUser.name}</Text><Text style={styles.role}>{currentUser.role} - {currentUser.jobTitle ?? currentUser.email}</Text><Text style={styles.email}>{currentUser.email}</Text></View>
      <View style={styles.verified}><Feather name="check" size={14} color="#fff" /></View>
    </Card>
    </TouchableOpacity>
    <Text style={styles.editHint}>Tap your profile to edit your details</Text>

    {canViewTeam ? <>
      <SectionTitle title="Management" />
      <Card style={styles.menu}>
        <MenuItem
          icon="users"
          title="Team"
          detail={currentUser.role === 'admin' ? 'Add, assign, archive and restore staff accounts' : 'View teammates assigned to your branches'}
          onPress={() => navigation.navigate('Team')}
        />
        {canViewBranches ? <MenuItem
          icon="map-pin"
          title="Branches"
          detail="Review and edit locations, contacts and availability"
          onPress={() => navigation.navigate('Branches')}
        /> : null}
        {currentUser.role === 'admin' ? <MenuItem
          icon="package"
          title="Services"
          detail="Edit pricing, turnaround times and catalogue availability"
          onPress={() => navigation.navigate('ServicesManagement')}
        /> : null}
        {currentUser.role === 'admin' ? <MenuItem
          icon="bar-chart-2"
          title="Daily operations summaries"
          detail="Review permanent completed-day snapshots across all branches"
          onPress={() => navigation.navigate('OperationsSummaries')}
        /> : null}
      </Card>
    </> : <>
      <SectionTitle title="Help & contact" />
      <Card style={styles.menu}>
        <MenuItem icon="phone" title="Call Gatsi Comms" detail={state.branches.find((branch) => branch.id === state.activeBranchId)?.phone ?? state.branches[0]?.phone ?? 'Contact your nearest branch'} />
        <MenuItem icon="message-circle" title="WhatsApp support" detail="Chat with a garment care adviser" />
        <MenuItem icon="award" title="Loyalty programme" detail="Earn one point for every dollar spent" />
      </Card>
    </>}

    <SectionTitle title="Workspace" />
    <Card style={styles.menu}>
      <MenuItem icon="log-out" title="Sign out" detail="Return to secure account login" onPress={logout} />
      <MenuItem icon="refresh-cw" title="Reset local data" detail="Restore the original records" onPress={reset} danger />
    </Card>
    <Text style={styles.version}>Gatsi Comms Suite - Version 1.0.0</Text>
  </Screen>;
}

function MenuItem({ icon, title, detail, onPress, danger }: { icon: keyof typeof Feather.glyphMap; title: string; detail: string; onPress?: () => void; danger?: boolean }) {
  return <TouchableOpacity disabled={!onPress} onPress={onPress} accessibilityRole={onPress ? 'button' : undefined} style={styles.menuItem}>
    <View style={[styles.menuIcon, danger && styles.menuIconDanger]}><Feather name={icon} size={18} color={danger ? colors.red : colors.primary} /></View>
    <View style={styles.flex}><Text style={[styles.menuTitle, danger && styles.menuTitleDanger]}>{title}</Text><Text style={styles.menuDetail}>{detail}</Text></View>
    {onPress ? <Feather name="chevron-right" size={19} color={colors.subtle} /> : null}
  </TouchableOpacity>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  profile: { padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 58, height: 58, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 18, fontWeight: '900' },
  name: { color: colors.ink, fontSize: 17, fontWeight: '900' },
  role: { color: colors.primary, fontSize: 11, fontWeight: '700', textTransform: 'capitalize', marginTop: 4 },
  email: { color: colors.muted, fontSize: 10, marginTop: 3 },
  verified: { width: 25, height: 25, borderRadius: 13, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  editHint: { color: colors.primary, fontSize: 11, fontWeight: '700', textAlign: 'center', marginTop: -6, marginBottom: 10 },
  menu: { paddingHorizontal: 14 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  menuIcon: { width: 39, height: 39, borderRadius: 12, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  menuIconDanger: { backgroundColor: colors.redSoft },
  menuTitle: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  menuTitleDanger: { color: colors.red },
  menuDetail: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 3 },
  version: { color: colors.subtle, fontSize: 10, textAlign: 'center', marginTop: 24 },
});
