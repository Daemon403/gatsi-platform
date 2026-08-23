import { createDemoState } from './data';
import { makeId } from './helpers';
import type { Activity, AppAction, AppState } from './types';

const activity = (state: AppState, values: Omit<Activity, 'id' | 'at'>): Activity => ({
  id: makeId('activity'),
  at: new Date().toISOString(),
  ...values,
});

export const appReducer = (state: AppState, action: AppAction): AppState => {
  switch (action.type) {
    case 'HYDRATE':
      return action.state.version === state.version ? action.state : state;
    case 'LOGIN': {
      const user = state.users.find((item) => item.id === action.userId);
      if (!user) return state;
      return { ...state, activeUserId: user.id, activeBranchId: user.role === 'admin' ? 'all' : user.branchIds[0] ?? state.activeBranchId };
    }
    case 'LOGOUT':
      return { ...state, activeUserId: null };
    case 'SET_BRANCH':
      return { ...state, activeBranchId: action.branchId };
    case 'CREATE_ORDER':
      return {
        ...state,
        orders: [action.order, ...state.orders],
        activities: [activity(state, { branchId: action.order.branchId, userId: action.order.events[0]?.byUserId ?? 'user-admin', message: `created ${action.order.number}`, kind: 'order' }), ...state.activities],
      };
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
    case 'RESET_DEMO':
      return createDemoState();
    default:
      return state;
  }
};
