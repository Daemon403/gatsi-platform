import { Feather } from '@expo/vector-icons';
import { getActiveUser } from '@gatsi/domain';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { CenterScreen } from '../screens/CenterScreen';
import { BranchesScreen } from '../screens/BranchesScreen';
import { CreateOrderScreen } from '../screens/CreateOrderScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { MoreScreen } from '../screens/MoreScreen';
import { NotificationsScreen } from '../screens/NotificationsScreen';
import { OrderDetailScreen } from '../screens/OrderDetailScreen';
import { OrdersScreen } from '../screens/OrdersScreen';
import { PickupRequestScreen } from '../screens/PickupRequestScreen';
import { ReceiptScreen } from '../screens/ReceiptScreen';
import { ServicesManagementScreen } from '../screens/ServicesManagementScreen';
import { StockScreen } from '../screens/StockScreen';
import { TeamScreen } from '../screens/TeamScreen';
import { useAppStore } from '../store/AppStore';
import { colors } from '../theme';
import type { RootStackParamList, TabParamList } from './types';

const Root = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<TabParamList>();

const theme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, primary: colors.primary, background: colors.background, card: colors.surface, border: colors.border, text: colors.ink } };

function TabNavigation() {
  const { state } = useAppStore();
  const role = getActiveUser(state)!.role;
  const labels = role === 'admin'
    ? { Center: 'Customers', Stock: 'Inventory' }
    : role === 'staff'
      ? { Center: 'Tasks', Stock: 'Inventory' }
      : { Center: 'Services', Stock: 'Receipts' };
  const icons: Record<keyof TabParamList, keyof typeof Feather.glyphMap> = { Home: 'home', Orders: role === 'customer' ? 'map-pin' : 'shopping-bag', Center: role === 'admin' ? 'users' : role === 'staff' ? 'check-square' : 'grid', Stock: role === 'customer' ? 'file-text' : 'package', More: 'more-horizontal' };
  return (
    <Tabs.Navigator screenOptions={({ route }) => ({
      headerShown: false,
      tabBarHideOnKeyboard: true,
      tabBarActiveTintColor: colors.primary,
      tabBarInactiveTintColor: colors.muted,
      tabBarStyle: styles.tabBar,
      tabBarLabelStyle: styles.tabLabel,
      tabBarIcon: ({ color, focused }) => <View style={[styles.tabIcon, focused && styles.tabIconActive]}><Feather name={icons[route.name]} size={20} color={color} /></View>,
    })}>
      <Tabs.Screen name="Home" component={HomeScreen} />
      <Tabs.Screen name="Orders" component={OrdersScreen} options={{ title: role === 'customer' ? 'Track' : 'Orders' }} />
      <Tabs.Screen name="Center" component={CenterScreen} options={{ title: labels.Center }} />
      <Tabs.Screen name="Stock" component={StockScreen} options={{ title: labels.Stock }} />
      <Tabs.Screen name="More" component={MoreScreen} />
    </Tabs.Navigator>
  );
}

export function AppNavigation() {
  const { state, hydrated } = useAppStore();
  if (!hydrated) return <View style={styles.loading}><View style={styles.loadingMark}><Text style={styles.loadingLetter}>G</Text></View><ActivityIndicator color={colors.primary} style={{ marginTop: 18 }} /></View>;
  if (!state.activeUserId) return <LoginScreen />;
  const role = getActiveUser(state)!.role;
  return (
    <NavigationContainer theme={theme}>
      <Root.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right', contentStyle: { backgroundColor: colors.background } }}>
        <Root.Screen name="Tabs" component={TabNavigation} />
        <Root.Screen name="OrderDetail" component={OrderDetailScreen} />
        <Root.Screen name="CreateOrder" component={CreateOrderScreen} />
        <Root.Screen name="PickupRequest" component={PickupRequestScreen} />
        <Root.Screen name="Receipt" component={ReceiptScreen} />
        <Root.Screen name="Notifications" component={NotificationsScreen} />
        {role !== 'customer' ? <Root.Screen name="Team" component={TeamScreen} /> : null}
        {role === 'admin' ? <Root.Screen name="Branches" component={BranchesScreen} /> : null}
        {role === 'admin' ? <Root.Screen name="ServicesManagement" component={ServicesManagementScreen} /> : null}
      </Root.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }, loadingMark: { width: 68, height: 68, borderRadius: 22, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }, loadingLetter: { color: '#fff', fontSize: 35, fontWeight: '900' },
  tabBar: { height: 78, paddingTop: 7, paddingBottom: 10, borderTopColor: colors.border, backgroundColor: colors.surface }, tabLabel: { fontSize: 10, fontWeight: '700', marginTop: 1 }, tabIcon: { width: 38, height: 31, borderRadius: 11, alignItems: 'center', justifyContent: 'center' }, tabIconActive: { backgroundColor: colors.primaryLight },
});
