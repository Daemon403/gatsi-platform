import { createDemoState } from './data';
import { makeId, normalizeClothingSales, normalizeNotifications, notificationRelatesToUser } from './helpers';
import type { Activity, AppAction, AppNotification, AppState, Order } from './types';

const activity = (state: AppState, values: Omit<Activity, 'id' | 'at'>): Activity => ({
  id: makeId('activity'),
  at: new Date().toISOString(),
  ...values,
});

const orderRecipientUserIds = (state: AppState, order: Order, actorUserId: string) => [...new Set([
  actorUserId,
  order.assignedStaffId,
  ...state.users.filter((user) => user.role === 'customer' && user.active !== false && user.customerId === order.customerId).map((user) => user.id),
].filter((value): value is string => Boolean(value)))];

const orderNotification = (
  state: AppState,
  order: Order,
  actorUserId: string,
  values: Pick<AppNotification, 'title' | 'message'>,
): AppNotification => ({
  id: makeId('notification'),
  kind: 'order',
  at: new Date().toISOString(),
  branchId: order.branchId,
  orderId: order.id,
  customerId: order.customerId,
  actorUserId,
  recipientUserIds: orderRecipientUserIds(state, order, actorUserId),
  readByUserIds: [],
  ...values,
});

export const appReducer = (state: AppState, action: AppAction): AppState => {
  switch (action.type) {
    case 'HYDRATE':
      return action.state.version === state.version
        ? {
          ...action.state,
          notifications: normalizeNotifications(action.state.notifications),
          clothingItems: Array.isArray(action.state.clothingItems) ? action.state.clothingItems : [],
          clothingSales: normalizeClothingSales(action.state.clothingSales),
        }
        : state;
    case 'LOGIN': {
      const user = state.users.find((item) => item.id === action.userId);
      if (!user) return state;
      return { ...state, activeUserId: user.id, activeBranchId: user.role === 'admin' ? 'all' : user.branchIds[0] ?? state.activeBranchId };
    }
    case 'LOGOUT':
      return { ...state, activeUserId: null };
    case 'SET_BRANCH':
      return { ...state, activeBranchId: action.branchId };
    case 'CREATE_ORDER': {
      const creator = state.users.find((user) => user.id === state.activeUserId);
      const incomingOrder = creator?.role === 'staff' ? { ...action.order, assignedStaffId: creator.id } : action.order;
      const actorUserId = creator?.id ?? incomingOrder.events[0]?.byUserId ?? 'user-admin';
      const order = creator && incomingOrder.events.length
        ? { ...incomingOrder, events: incomingOrder.events.map((event, index) => index === 0 ? { ...event, byUserId: creator.id } : event) }
        : incomingOrder;
      const assignee = state.users.find((user) => user.id === order.assignedStaffId);
      return {
        ...state,
        orders: [order, ...state.orders],
        activities: [activity(state, { branchId: order.branchId, userId: actorUserId, message: `created ${order.number}`, kind: 'order' }), ...state.activities],
        notifications: [orderNotification(state, order, actorUserId, {
          title: order.assignedStaffId ? 'New assigned job' : 'New job intake',
          message: assignee ? `${order.number} was assigned to ${assignee.name}.` : `${order.number} was received and is awaiting assignment.`,
        }), ...(state.notifications ?? [])].slice(0, 500),
      };
    }
    case 'UPDATE_ORDER_STATUS': {
      const target = state.orders.find((order) => order.id === action.orderId);
      if (!target) return state;
      return {
        ...state,
        orders: state.orders.map((order) => order.id === action.orderId ? {
          ...order,
          status: action.status,
          collectedAt: action.status === 'collected' ? new Date().toISOString() : order.collectedAt,
          events: [...order.events, { id: makeId('event'), status: action.status, at: new Date().toISOString(), byUserId: action.userId, note: action.note }],
        } : order),
        activities: [activity(state, { branchId: target.branchId, userId: action.userId, message: `moved ${target.number} to ${action.status.replaceAll('_', ' ')}`, kind: 'order' }), ...state.activities],
        notifications: [orderNotification(state, target, action.userId, {
          title: `${target.number} updated`,
          message: `Order moved to ${action.status.replaceAll('_', ' ')}.`,
        }), ...(state.notifications ?? [])].slice(0, 500),
      };
    }
    case 'ADD_PAYMENT': {
      const order = state.orders.find((item) => item.id === action.payment.orderId);
      if (!order) return state;
      return {
        ...state,
        payments: [action.payment, ...state.payments],
        activities: [activity(state, { branchId: order.branchId, userId: action.payment.receivedByUserId, message: `recorded a $${action.payment.amount.toFixed(2)} payment for ${order.number}`, kind: 'payment' }), ...state.activities],
      };
    }
    case 'CREATE_PICKUP':
      return {
        ...state,
        pickupRequests: [action.request, ...state.pickupRequests],
        activities: [activity(state, { branchId: action.request.branchId, userId: state.activeUserId ?? 'user-admin', message: 'created a new pickup request', kind: 'pickup' }), ...state.activities],
      };
    case 'UPDATE_PICKUP': {
      const request = state.pickupRequests.find((item) => item.id === action.requestId);
      if (!request) return state;
      return {
        ...state,
        pickupRequests: state.pickupRequests.map((item) => item.id === action.requestId ? { ...item, status: action.status } : item),
        activities: [activity(state, { branchId: request.branchId, userId: action.userId, message: `marked pickup ${action.status.replaceAll('_', ' ')}`, kind: 'pickup' }), ...state.activities],
      };
    }
    case 'ADJUST_INVENTORY': {
      const item = state.inventory.find((entry) => entry.id === action.itemId);
      if (!item) return state;
      return {
        ...state,
        inventory: state.inventory.map((entry) => entry.id === action.itemId ? { ...entry, quantity: Math.max(0, entry.quantity + action.delta) } : entry),
        activities: [activity(state, { branchId: item.branchId, userId: action.userId, message: `${action.delta > 0 ? 'added' : 'used'} ${Math.abs(action.delta)} ${item.unit} of ${item.name}`, kind: 'inventory' }), ...state.activities],
      };
    }
    case 'CREATE_CLOTHING_ITEM':
      return { ...state, clothingItems: [action.item, ...(state.clothingItems ?? [])] };
    case 'UPDATE_CLOTHING_ITEM':
      return {
        ...state,
        clothingItems: (state.clothingItems ?? []).map((item) => item.id === action.itemId ? { ...item, ...action.updates } : item),
      };
    case 'ADJUST_CLOTHING_STOCK': {
      const item = (state.clothingItems ?? []).find((entry) => entry.id === action.itemId);
      if (!item || !Number.isInteger(action.delta)) return state;
      return {
        ...state,
        clothingItems: state.clothingItems.map((entry) => entry.id === item.id ? { ...entry, quantity: Math.max(0, entry.quantity + action.delta) } : entry),
        activities: [activity(state, {
          branchId: item.branchId,
          userId: action.userId,
          message: `adjusted ${item.name} stock by ${action.delta > 0 ? '+' : ''}${action.delta}`,
          kind: 'inventory',
        }), ...state.activities],
      };
    }
    case 'RECORD_CLOTHING_SALE': {
      const item = (state.clothingItems ?? []).find((entry) => entry.id === action.sale.itemId);
      const unitPrice = action.sale.unitPrice;
      if (
        !item
        || !Number.isInteger(action.sale.quantity)
        || action.sale.quantity < 1
        || action.sale.quantity > item.quantity
        || typeof unitPrice !== 'number'
        || !Number.isFinite(unitPrice)
        || unitPrice < 0
        || unitPrice > 1_000_000
        || Math.abs(unitPrice - Number(unitPrice.toFixed(2))) > 1e-9
      ) return state;
      const sale = {
        ...action.sale,
        branchId: item.branchId,
        listUnitPrice: item.price,
        unitPrice,
        total: Number((unitPrice * action.sale.quantity).toFixed(2)),
      };
      return {
        ...state,
        clothingItems: state.clothingItems.map((entry) => entry.id === item.id ? { ...entry, quantity: entry.quantity - action.sale.quantity } : entry),
        clothingSales: [sale, ...(state.clothingSales ?? [])],
        activities: [activity(state, {
          branchId: item.branchId,
          userId: action.sale.soldByUserId,
          message: `sold ${action.sale.quantity} ${item.name}`,
          kind: 'inventory',
        }), ...state.activities],
      };
    }
    case 'CLOCK_TOGGLE': {
      const user = state.users.find((item) => item.id === action.userId);
      if (!user) return state;
      const clockedIn = !user.clockedIn;
      return {
        ...state,
        users: state.users.map((item) => item.id === action.userId ? { ...item, clockedIn, lastClockIn: clockedIn ? new Date().toISOString() : item.lastClockIn } : item),
        activities: [activity(state, { branchId: user.branchIds[0] ?? state.activeBranchId, userId: user.id, message: `clocked ${clockedIn ? 'in' : 'out'}`, kind: 'staff' }), ...state.activities],
      };
    }
    case 'CREATE_CUSTOMER':
      return { ...state, customers: [action.customer, ...state.customers], users: [{ ...action.user, verified: true, active: true }, ...state.users] };
    case 'CREATE_BRANCH':
      return { ...state, branches: [action.branch, ...state.branches] };
    case 'CREATE_SERVICE':
      return { ...state, services: [action.service, ...state.services] };
    case 'UPDATE_BRANCH': {
      const target = state.branches.find((branch) => branch.id === action.branchId);
      if (!target) return state;
      const nextBranches = state.branches.map((branch) => branch.id === action.branchId ? { ...branch, ...action.updates } : branch);
      const activeUser = state.users.find((user) => user.id === state.activeUserId);
      const activeBranchId = state.activeBranchId === action.branchId && !action.updates.active
        ? (activeUser?.role === 'admin' ? 'all' : nextBranches.find((branch) => branch.active && activeUser?.branchIds.includes(branch.id))?.id ?? state.activeBranchId)
        : state.activeBranchId;
      return { ...state, branches: nextBranches, activeBranchId };
    }
    case 'UPDATE_SERVICE': {
      if (!state.services.some((service) => service.id === action.serviceId)) return state;
      return {
        ...state,
        services: state.services.map((service) => service.id === action.serviceId ? { ...service, ...action.updates } : service),
      };
    }
    case 'UPDATE_CUSTOMER': {
      if (!state.customers.some((customer) => customer.id === action.customerId)) return state;
      return {
        ...state,
        customers: state.customers.map((customer) => customer.id === action.customerId ? { ...customer, ...action.updates } : customer),
        users: state.users.map((user) => user.role === 'customer' && user.customerId === action.customerId ? {
          ...user,
          name: action.updates.name,
          email: action.updates.email,
          phone: action.updates.phone,
          branchIds: [action.updates.branchId],
        } : user),
      };
    }
    case 'UPDATE_PROFILE': {
      const user = state.users.find((item) => item.id === state.activeUserId);
      if (!user) return state;
      return {
        ...state,
        users: state.users.map((item) => item.id === user.id ? { ...item, ...action.updates } : item),
        customers: user.role === 'customer' && user.customerId
          ? state.customers.map((customer) => customer.id === user.customerId ? { ...customer, name: action.updates.name, email: action.updates.email, phone: action.updates.phone } : customer)
          : state.customers,
      };
    }
    case 'CREATE_STAFF': {
      const { password: _password, ...incoming } = action.user;
      const user = { ...incoming, role: 'staff' as const, active: true, verified: true, clockedIn: false };
      return {
        ...state,
        users: [user, ...state.users],
        activities: [activity(state, {
          branchId: user.branchIds[0] ?? state.activeBranchId,
          userId: state.activeUserId ?? 'user-admin',
          message: `added ${user.name} to the team`,
          kind: 'staff',
        }), ...state.activities],
      };
    }
    case 'ARCHIVE_STAFF': {
      const target = state.users.find((item) => item.id === action.userId && item.role === 'staff');
      if (!target || target.active === false) return state;
      const archivedAt = new Date().toISOString();
      return {
        ...state,
        users: state.users.map((item) => item.id === action.userId ? {
          ...item,
          active: false,
          clockedIn: false,
          archivedAt,
          archivedByUserId: state.activeUserId ?? undefined,
          restoredAt: undefined,
          restoredByUserId: undefined,
        } : item),
        activities: [activity(state, {
          branchId: target.branchIds[0] ?? state.activeBranchId,
          userId: state.activeUserId ?? 'user-admin',
          message: `archived ${target.name}'s team account`,
          kind: 'staff',
        }), ...state.activities],
      };
    }
    case 'RESTORE_STAFF': {
      const target = state.users.find((item) => item.id === action.userId && item.role === 'staff');
      if (!target || target.active !== false) return state;
      const restoredAt = new Date().toISOString();
      return {
        ...state,
        users: state.users.map((item) => {
          if (item.id !== action.userId) return item;
          const { archivedAt: _archivedAt, archivedByUserId: _archivedByUserId, ...preserved } = item;
          return {
            ...preserved,
            branchIds: action.branchIds ?? item.branchIds,
            active: true,
            clockedIn: false,
            restoredAt,
            restoredByUserId: state.activeUserId ?? undefined,
          };
        }),
        activities: [activity(state, {
          branchId: action.branchIds?.[0] ?? target.branchIds[0] ?? state.activeBranchId,
          userId: state.activeUserId ?? 'user-admin',
          message: `restored ${target.name}'s team account`,
          kind: 'staff',
        }), ...state.activities],
      };
    }
    case 'UPDATE_STAFF_BRANCHES': {
      const target = state.users.find((item) => item.id === action.userId && item.role === 'staff' && item.active !== false);
      if (!target) return state;
      return {
        ...state,
        users: state.users.map((item) => item.id === action.userId ? { ...item, branchIds: action.branchIds } : item),
        activities: [activity(state, {
          branchId: action.branchIds[0] ?? target.branchIds[0] ?? state.activeBranchId,
          userId: state.activeUserId ?? 'user-admin',
          message: `updated ${target.name}'s branch assignment`,
          kind: 'staff',
        }), ...state.activities],
      };
    }
    case 'MARK_ALL_NOTIFICATIONS_READ': {
      const user = state.users.find((item) => item.id === state.activeUserId);
      if (!user) return state;
      return {
        ...state,
        notifications: normalizeNotifications(state.notifications).map((item) => notificationRelatesToUser(state, item, user) && !(item.readByUserIds ?? []).includes(user.id)
          ? { ...item, readByUserIds: [...(item.readByUserIds ?? []), user.id] }
          : item),
      };
    }
    case 'RESET_DEMO':
      return createDemoState();
    default:
      return state;
  }
};
