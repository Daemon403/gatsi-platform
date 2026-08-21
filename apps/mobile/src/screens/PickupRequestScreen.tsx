import { Feather } from '@expo/vector-icons';
import { getActiveUser, makeId, type PickupRequest } from '@gatsi/domain';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { AppHeader } from '../components/AppHeader';
import { Screen } from '../components/Screen';
import { Card, Input, PrimaryButton, SectionTitle } from '../components/ui';
import { useAppStore } from '../store/AppStore';
import { colors, radius } from '../theme';

export function PickupRequestScreen() {
  const { state, dispatch } = useAppStore();
  const navigation = useNavigation<any>();
  const user = getActiveUser(state)!;
  const customer = state.customers.find((item) => item.id === user.customerId);
  const [branchId, setBranchId] = useState(user.branchIds[0] ?? state.branches[0].id);
  const [address, setAddress] = useState(customer?.address ?? '');
  const [date, setDate] = useState(new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
  const [instructions, setInstructions] = useState('');
  const submit = () => {
    if (!customer || !address.trim() || !date) return Alert.alert('Details needed', 'Enter the pickup address and preferred date.');
    const request: PickupRequest = { id: makeId('pickup'), customerId: customer.id, branchId, address: address.trim(), preferredAt: new Date(`${date}T09:00:00`).toISOString(), instructions, status: 'requested', createdAt: new Date().toISOString() };
    dispatch({ type: 'CREATE_PICKUP', request });
    Alert.alert('Pickup requested', 'The branch will confirm your time shortly.', [{ text: 'Done', onPress: () => navigation.goBack() }]);
  };
  return <Screen><AppHeader title="Book a pickup" subtitle="We collect and return your garments" back /><LinearGradient colors={[colors.primary, colors.primaryDark]} style={styles.hero}><View style={styles.heroIcon}><Feather name="truck" size={27} color="#fff" /></View><View style={{ flex: 1 }}><Text style={styles.heroTitle}>Door-to-door garment care</Text><Text style={styles.heroText}>Choose your nearest branch and tell us where to collect.</Text></View></LinearGradient><SectionTitle title="Select branch" /><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.branches}>{state.branches.map((branch) => <TouchableOpacity key={branch.id} onPress={() => setBranchId(branch.id)} style={[styles.branch, branchId === branch.id && styles.branchActive]}><Feather name="map-pin" size={17} color={branchId === branch.id ? colors.primary : colors.muted} /><Text style={[styles.branchText, branchId === branch.id && styles.branchTextActive]}>{branch.shortName}</Text></TouchableOpacity>)}</ScrollView><Card style={styles.form}><Input label="Pickup address *" icon="map-pin" value={address} onChangeText={setAddress} multiline placeholder="Full street address and landmark" /><Input label="Preferred date *" icon="calendar" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" /><Input label="Collection instructions" icon="message-square" value={instructions} onChangeText={setInstructions} multiline placeholder="Gate access, best contact time, garment estimate..." /><View style={styles.notice}><Feather name="info" size={17} color={colors.blue} /><Text style={styles.noticeText}>A standard $3 collection fee may be added when your garments are checked in.</Text></View><PrimaryButton title="Request pickup" icon="arrow-right" onPress={submit} /></Card></Screen>;
}

const styles = StyleSheet.create({ hero: { borderRadius: radius.lg, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 14 }, heroIcon: { width: 55, height: 55, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }, heroTitle: { color: '#fff', fontSize: 17, fontWeight: '900' }, heroText: { color: 'rgba(255,255,255,0.75)', fontSize: 11, lineHeight: 16, marginTop: 5 }, branches: { gap: 9 }, branch: { height: 43, paddingHorizontal: 13, borderRadius: 13, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: 7 }, branchActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft }, branchText: { color: colors.muted, fontWeight: '700', fontSize: 12 }, branchTextActive: { color: colors.primary }, form: { padding: 16, gap: 17, marginTop: 18 }, notice: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, padding: 12, borderRadius: radius.sm, backgroundColor: colors.blueSoft }, noticeText: { flex: 1, color: colors.blue, fontSize: 11, lineHeight: 16 } });
