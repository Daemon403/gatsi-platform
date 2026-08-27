import { Feather } from '@expo/vector-icons';
import { dateTime, getActiveUser, unreadNotifications, visibleNotifications, type AppNotification } from '@gatsi/domain';
import { useNavigation } from '@react-navigation/native';
import React, { useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { AppHeader } from '../components/AppHeader';
import { Screen } from '../components/Screen';
import { Card, EmptyState, SectionTitle } from '../components/ui';
import { useAppStore } from '../store/AppStore';
import { apiAction } from '../store/api';
import { colors, radius } from '../theme';

const notificationIcons: Record<AppNotification['kind'], keyof typeof Feather.glyphMap> = {
  order: 'package',
  payment: 'credit-card',
  inventory: 'box',
  staff: 'users',
  pickup: 'truck',
};

const iconFor = (kind: AppNotification['kind']) => notificationIcons[kind];

export function NotificationsScreen() {
  const { state, dispatch } = useAppStore();
  const navigation = useNavigation<any>();
  const user = getActiveUser(state)!;
  const notifications = visibleNotifications(state);
  const unread = unreadNotifications(state);
  const [markingRead, setMarkingRead] = useState(false);
  const title = user.role === 'customer' ? 'Order updates' : user.role === 'staff' ? 'Task notifications' : 'Notifications';
  const subtitle = user.role === 'customer'
      ? 'Updates for your garment orders'
      : user.role === 'staff'
      ? 'Updates for jobs relevant to you'
      : 'Operational updates across your workspace';

  const markAllRead = async () => {
    if (markingRead || !unread.length) return;
    setMarkingRead(true);
    try {
      const selectedAdminBranchId = state.activeBranchId;
      const remoteState = await apiAction({ type: 'MARK_ALL_NOTIFICATIONS_READ' });
      dispatch({ type: 'HYDRATE', state: user.role === 'admin' ? { ...remoteState, activeBranchId: selectedAdminBranchId } : remoteState });
    } catch (error) {
      Alert.alert('Could not update notifications', error instanceof Error ? error.message : 'Try again in a moment.');
    } finally {
      setMarkingRead(false);
    }
  };

  return <Screen>
    <AppHeader title={title} subtitle={subtitle} back showNotifications={false} />
    <SectionTitle title={`${notifications.length} ${notifications.length === 1 ? 'update' : 'updates'}`} action={unread.length ? (markingRead ? 'Marking...' : 'Mark all read') : undefined} onPress={unread.length && !markingRead ? () => void markAllRead() : undefined} />
    {notifications.map((notification) => {
      const isUnread = !notification.readByUserIds.includes(user.id);
      const canOpenOrder = Boolean(notification.orderId && state.orders.some((order) => order.id === notification.orderId));
      return <TouchableOpacity key={notification.id} disabled={!canOpenOrder} activeOpacity={0.78} onPress={() => canOpenOrder && navigation.navigate('OrderDetail', { orderId: notification.orderId })}>
        <Card style={[styles.notification, isUnread && styles.unreadNotification]}>
          <View style={[styles.icon, isUnread && styles.unreadIcon]}>
            <Feather name={iconFor(notification.kind)} size={20} color={colors.primary} />
          </View>
          <View style={styles.content}>
            <View style={styles.heading}><Text style={styles.title}>{notification.title}</Text>{isUnread ? <View style={styles.unreadDot} /> : null}</View>
            <Text style={styles.detail}>{notification.message}</Text>
            <Text style={styles.time}>{dateTime(notification.at)}</Text>
          </View>
          {canOpenOrder ? <Feather name="chevron-right" size={18} color={colors.subtle} /> : null}
        </Card>
      </TouchableOpacity>;
    })}
    {!notifications.length ? <Card><EmptyState icon="bell" title="No notifications" body={user.role === 'staff' ? 'New jobs assigned to you will appear here.' : 'There are no updates for your account right now.'} /></Card> : null}
  </Screen>;
}

const styles = StyleSheet.create({
  notification: { padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 11 },
  unreadNotification: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  icon: { width: 43, height: 43, borderRadius: radius.sm, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  unreadIcon: { backgroundColor: '#fff' },
  content: { flex: 1 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, color: colors.ink, fontSize: 13, fontWeight: '900' },
  unreadDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.primary },
  time: { color: colors.subtle, fontSize: 9, marginTop: 5 },
  detail: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 4 },
});
