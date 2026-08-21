import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppStore } from '../store/AppStore';
import { colors, radius, shadow } from '../theme';
import { PrimaryButton } from '../components/ui';

const accounts = [
  { id: 'user-admin', label: 'Admin', name: 'Promise Gatsi', detail: 'All branches & reports', icon: 'bar-chart-2' as const, color: colors.primary },
  { id: 'user-rudo-staff', label: 'Staff', name: 'Rudo Nyathi', detail: 'Harare CBD operations', icon: 'users' as const, color: colors.blue },
  { id: 'user-customer', label: 'Customer', name: 'Rudo Chikowore', detail: 'Orders, pickup & receipts', icon: 'shopping-bag' as const, color: colors.purple },
];

export function LoginScreen() {
  const { dispatch } = useAppStore();
  const [selected, setSelected] = useState(accounts[0].id);
  return (
    <SafeAreaView style={styles.safe}>
      <LinearGradient colors={[colors.primaryDark, colors.primary, '#16A865']} style={styles.hero}>
        <View style={styles.logo}><Text style={styles.logoText}>G</Text></View>
        <Text style={styles.brand}>Gatsi Comms</Text>
        <Text style={styles.tagline}>Textile & Dry Cleaning Services</Text>
        <View style={styles.heroBadge}><Feather name="check-circle" size={15} color="#fff" /><Text style={styles.heroBadgeText}>Clean operations. Happier customers.</Text></View>
      </LinearGradient>
      <View style={styles.panel}>
        <Text style={styles.title}>Open a demo workspace</Text>
        <Text style={styles.subtitle}>Choose a role to explore every part of the app. Your changes are saved on this device.</Text>
        <View style={styles.accounts}>
          {accounts.map((account) => {
            const active = selected === account.id;
            return (
              <TouchableOpacity key={account.id} activeOpacity={0.8} onPress={() => setSelected(account.id)} style={[styles.account, active && styles.accountActive]}>
                <View style={[styles.accountIcon, { backgroundColor: `${account.color}15` }]}><Feather name={account.icon} size={21} color={account.color} /></View>
                <View style={styles.accountCopy}><Text style={styles.accountLabel}>{account.label}</Text><Text style={styles.accountName}>{account.name}</Text><Text style={styles.accountDetail}>{account.detail}</Text></View>
                <View style={[styles.radio, active && styles.radioActive]}>{active ? <View style={styles.radioDot} /> : null}</View>
              </TouchableOpacity>
            );
          })}
        </View>
        <PrimaryButton title={`Continue as ${accounts.find((item) => item.id === selected)?.label}`} icon="arrow-right" onPress={() => dispatch({ type: 'LOGIN', userId: selected })} />
        <Text style={styles.note}>Demo access - no password required</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  hero: { paddingHorizontal: 26, paddingTop: 34, paddingBottom: 44, alignItems: 'center', borderBottomLeftRadius: 34, borderBottomRightRadius: 34 },
  logo: { width: 68, height: 68, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.18)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center' },
  logoText: { color: '#fff', fontSize: 37, fontWeight: '900' },
  brand: { color: '#fff', fontSize: 30, fontWeight: '900', marginTop: 14, letterSpacing: -0.8 },
  tagline: { color: 'rgba(255,255,255,0.78)', fontSize: 14, marginTop: 5 },
  heroBadge: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 13, paddingVertical: 8, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.12)', marginTop: 18 },
  heroBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  panel: { flex: 1, paddingHorizontal: 22, paddingTop: 28 },
  title: { color: colors.ink, fontSize: 23, fontWeight: '900' },
  subtitle: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 7 },
  accounts: { gap: 11, marginVertical: 22 },
  account: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 13, ...shadow },
  accountActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  accountIcon: { width: 48, height: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  accountCopy: { flex: 1, marginLeft: 12 },
  accountLabel: { color: colors.primary, fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.6 },
  accountName: { color: colors.ink, fontSize: 15, fontWeight: '800', marginTop: 2 },
  accountDetail: { color: colors.muted, fontSize: 11, marginTop: 2 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  radioActive: { borderColor: colors.primary },
  radioDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: colors.primary },
  note: { color: colors.subtle, textAlign: 'center', fontSize: 11, marginTop: 12 },
});
