import type { AppState, OrderStatus, Service } from './types';

export const statusSequence: OrderStatus[] = [
  'received',
  'sorting',
  'washing',
  'drying',
  'ironing',
  'quality_check',
  'ready',
  'out_for_delivery',
  'collected',
];

export const statusLabels: Record<OrderStatus, string> = {
  received: 'Received',
  sorting: 'Sorting',
  washing: 'Washing',
  drying: 'Drying',
  ironing: 'Ironing',
  quality_check: 'Quality check',
  ready: 'Ready for collection',
  out_for_delivery: 'Out for delivery',
  collected: 'Collected',
  cancelled: 'Cancelled',
};

const services: Service[] = [
  { id: 'svc-wash-fold', name: 'Wash & Fold', category: 'laundry', unit: 'kg', price: 3, turnaroundHours: 24, description: 'Everyday laundry, washed, dried and neatly folded.', active: true },
  { id: 'svc-shirt', name: 'Shirt / Blouse', category: 'dry_cleaning', unit: 'item', price: 2.5, turnaroundHours: 24, description: 'Professional cleaning and pressing for shirts and blouses.', active: true },
  { id: 'svc-suit', name: 'Two-piece Suit', category: 'dry_cleaning', unit: 'set', price: 8, turnaroundHours: 48, description: 'Gentle dry cleaning and finishing for a two-piece suit.', active: true },
  { id: 'svc-dress', name: 'Dress', category: 'dry_cleaning', unit: 'item', price: 6, turnaroundHours: 48, description: 'Careful fabric-specific cleaning for day and formal dresses.', active: true },
  { id: 'svc-duvet', name: 'Duvet / Comforter', category: 'speciality', unit: 'item', price: 10, turnaroundHours: 72, description: 'Deep clean for single or double duvets and comforters.', active: true },
  { id: 'svc-curtains', name: 'Curtain Cleaning', category: 'speciality', unit: 'metre', price: 2.75, turnaroundHours: 72, description: 'Dust removal, cleaning and pressing for curtains.', active: true },
  { id: 'svc-uniform', name: 'School Uniform Set', category: 'laundry', unit: 'set', price: 4, turnaroundHours: 24, description: 'Wash, stain treatment and press for school uniforms.', active: true },
  { id: 'svc-textile', name: 'Custom Textile Care', category: 'textile', unit: 'item', price: 12, turnaroundHours: 96, description: 'Assessment and specialist care for bespoke textiles.', active: true },
];

export const createDemoState = (): AppState => ({
  version: 1,
  activeUserId: null,
  activeBranchId: 'branch-cbd',
  branches: [
    { id: 'branch-cbd', name: 'Harare CBD Branch', shortName: 'Harare CBD', address: '12 Jason Moyo Avenue, Harare', phone: '+263 77 410 2201', managerId: 'user-admin', active: true },
    { id: 'branch-avondale', name: 'Avondale Branch', shortName: 'Avondale', address: '8 King George Road, Avondale', phone: '+263 77 410 2202', managerId: 'user-mary', active: true },
    { id: 'branch-murewa', name: 'Murewa Branch', shortName: 'Murewa', address: 'Stand 41, Murewa Centre', phone: '+263 77 410 2203', managerId: 'user-tinashe', active: true },
  ],
  users: [
    { id: 'user-admin', role: 'admin', name: 'Promise Gatsi', email: 'admin@gatsicomms.co.zw', phone: '+263 77 100 9001', branchIds: ['branch-cbd', 'branch-avondale', 'branch-murewa'], jobTitle: 'Managing Director', avatarColor: '#008D4C', username: 'Promise', password: 'GATSI', verified: true, active: true },
    { id: 'user-mary', role: 'staff', name: 'Mary Dube', email: 'mary@gatsicomms.co.zw', phone: '+263 77 100 9002', branchIds: ['branch-avondale'], jobTitle: 'Branch Supervisor', avatarColor: '#6D4AFF', clockedIn: true, lastClockIn: '2026-08-21T06:58:00.000Z', username: 'Mary', password: 'DUBE', verified: true, active: true },
    { id: 'user-tinashe', role: 'staff', name: 'Tinashe Moyo', email: 'tinashe@gatsicomms.co.zw', phone: '+263 77 100 9003', branchIds: ['branch-murewa'], jobTitle: 'Cleaning Technician', avatarColor: '#1677FF', clockedIn: false, username: 'Tinashe', password: 'MOYO', verified: true, active: true },
    { id: 'user-rudo-staff', role: 'staff', name: 'Rudo Nyathi', email: 'rudo.staff@gatsicomms.co.zw', phone: '+263 77 100 9004', branchIds: ['branch-cbd'], jobTitle: 'Front Desk & Quality', avatarColor: '#F59E0B', clockedIn: true, lastClockIn: '2026-08-21T07:16:00.000Z', username: 'RudoStaff', password: 'NYATHI', verified: true, active: true },
    { id: 'user-customer', role: 'customer', name: 'Rudo Chikowore', email: 'rudo@example.com', phone: '+263 77 555 0199', branchIds: ['branch-cbd'], customerId: 'customer-rudo', avatarColor: '#0EA5A4', username: 'Rudo', password: 'CHIKOWORE', verified: true, active: true },
  ],
  customers: [
    { id: 'customer-rudo', name: 'Rudo Chikowore', phone: '+263 77 555 0199', email: 'rudo@example.com', address: '32 Fife Avenue, Harare', joinedAt: '2026-01-18T09:00:00.000Z', branchId: 'branch-cbd', loyaltyPoints: 185 },
    { id: 'customer-tariro', name: 'Tariro Holdings', phone: '+263 71 230 1088', email: 'admin@tariro.co.zw', address: '7 Samora Machel Avenue, Harare', joinedAt: '2025-11-04T10:00:00.000Z', branchId: 'branch-cbd', loyaltyPoints: 420 },
    { id: 'customer-nyasha', name: 'Nyasha Bhebhe', phone: '+263 78 300 4421', email: 'nyasha@example.com', address: '17 West Road, Avondale', joinedAt: '2026-03-12T11:00:00.000Z', branchId: 'branch-avondale', loyaltyPoints: 92 },
    { id: 'customer-mhofu', name: 'Mhofu Lodge', phone: '+263 77 621 0310', email: 'ops@mhofulodge.co.zw', address: 'Murewa Centre, Murewa', joinedAt: '2026-02-02T07:30:00.000Z', branchId: 'branch-murewa', loyaltyPoints: 510 },
    { id: 'customer-cc', name: 'CC', phone: '+263 77 000 0003', email: 'cc@example.com', address: 'Harare, Zimbabwe', joinedAt: '2026-07-28T18:00:00.000Z', branchId: 'branch-cbd', loyaltyPoints: 3 },
  ],
  services,
  orders: [
    {
      id: 'order-8619', number: 'GAT-2607-8619', branchId: 'branch-cbd', customerId: 'customer-cc', assignedStaffId: 'user-rudo-staff', status: 'collected', priority: 'normal', intakeMethod: 'walk_in', createdAt: '2026-07-28T20:26:00.000Z', dueAt: '2026-07-30T14:00:00.000Z', collectedAt: '2026-07-30T12:00:00.000Z', discount: 0, deliveryFee: 0,
      items: [{ id: 'item-8619-1', serviceId: 'svc-wash-fold', description: 'dadad', quantity: 1, unitPrice: 3 }],
      events: [{ id: 'event-8619-1', status: 'received', at: '2026-07-28T20:26:00.000Z', byUserId: 'user-rudo-staff' }, { id: 'event-8619-2', status: 'collected', at: '2026-07-30T12:00:00.000Z', byUserId: 'user-rudo-staff' }],
    },
    {
      id: 'order-1042', number: 'GAT-2608-1042', branchId: 'branch-cbd', customerId: 'customer-rudo', assignedStaffId: 'user-rudo-staff', status: 'washing', priority: 'normal', intakeMethod: 'pickup', createdAt: '2026-08-20T08:10:00.000Z', dueAt: '2026-08-22T14:00:00.000Z', discount: 2, deliveryFee: 3,
      items: [{ id: 'item-1042-1', serviceId: 'svc-shirt', description: 'White office shirts', quantity: 4, unitPrice: 2.5 }, { id: 'item-1042-2', serviceId: 'svc-suit', description: 'Navy two-piece suit', quantity: 1, unitPrice: 8 }],
      events: [{ id: 'event-1042-1', status: 'received', at: '2026-08-20T08:10:00.000Z', byUserId: 'user-rudo-staff' }, { id: 'event-1042-2', status: 'sorting', at: '2026-08-20T09:20:00.000Z', byUserId: 'user-rudo-staff' }, { id: 'event-1042-3', status: 'washing', at: '2026-08-21T07:30:00.000Z', byUserId: 'user-rudo-staff', note: 'Stain treatment applied to collar.' }],
    },
    {
      id: 'order-1049', number: 'GAT-2608-1049', branchId: 'branch-cbd', customerId: 'customer-tariro', assignedStaffId: 'user-rudo-staff', status: 'ready', priority: 'urgent', intakeMethod: 'walk_in', createdAt: '2026-08-19T11:35:00.000Z', dueAt: '2026-08-21T13:00:00.000Z', discount: 5, deliveryFee: 0,
      items: [{ id: 'item-1049-1', serviceId: 'svc-curtains', description: 'Boardroom curtains', quantity: 12, unitPrice: 2.75 }],
      events: [{ id: 'event-1049-1', status: 'received', at: '2026-08-19T11:35:00.000Z', byUserId: 'user-rudo-staff' }, { id: 'event-1049-2', status: 'ready', at: '2026-08-21T09:15:00.000Z', byUserId: 'user-rudo-staff', note: 'Quality check passed.' }],
    },
    {
      id: 'order-1052', number: 'GAT-2608-1052', branchId: 'branch-avondale', customerId: 'customer-nyasha', assignedStaffId: 'user-mary', status: 'ironing', priority: 'normal', intakeMethod: 'online', createdAt: '2026-08-20T14:45:00.000Z', dueAt: '2026-08-22T10:00:00.000Z', discount: 0, deliveryFee: 3,
      items: [{ id: 'item-1052-1', serviceId: 'svc-dress', description: 'Emerald evening dress', quantity: 1, unitPrice: 6 }, { id: 'item-1052-2', serviceId: 'svc-shirt', description: 'Silk blouse', quantity: 2, unitPrice: 2.5 }],
      events: [{ id: 'event-1052-1', status: 'received', at: '2026-08-20T14:45:00.000Z', byUserId: 'user-mary' }, { id: 'event-1052-2', status: 'ironing', at: '2026-08-21T08:55:00.000Z', byUserId: 'user-mary' }],
    },
    {
      id: 'order-1057', number: 'GAT-2608-1057', branchId: 'branch-murewa', customerId: 'customer-mhofu', assignedStaffId: 'user-tinashe', status: 'sorting', priority: 'urgent', intakeMethod: 'pickup', createdAt: '2026-08-21T06:40:00.000Z', dueAt: '2026-08-23T12:00:00.000Z', discount: 10, deliveryFee: 5,
      items: [{ id: 'item-1057-1', serviceId: 'svc-wash-fold', description: 'Guest linen - mixed load', quantity: 18, unitPrice: 3 }, { id: 'item-1057-2', serviceId: 'svc-duvet', description: 'King comforters', quantity: 3, unitPrice: 10 }],
      events: [{ id: 'event-1057-1', status: 'received', at: '2026-08-21T06:40:00.000Z', byUserId: 'user-tinashe' }, { id: 'event-1057-2', status: 'sorting', at: '2026-08-21T08:10:00.000Z', byUserId: 'user-tinashe' }],
    },
    {
      id: 'order-1031', number: 'GAT-2608-1031', branchId: 'branch-avondale', customerId: 'customer-nyasha', assignedStaffId: 'user-mary', status: 'collected', priority: 'normal', intakeMethod: 'walk_in', createdAt: '2026-08-15T09:05:00.000Z', dueAt: '2026-08-17T12:00:00.000Z', collectedAt: '2026-08-17T11:20:00.000Z', discount: 0, deliveryFee: 0,
      items: [{ id: 'item-1031-1', serviceId: 'svc-duvet', description: 'Double duvet', quantity: 1, unitPrice: 10 }],
      events: [{ id: 'event-1031-1', status: 'received', at: '2026-08-15T09:05:00.000Z', byUserId: 'user-mary' }, { id: 'event-1031-2', status: 'collected', at: '2026-08-17T11:20:00.000Z', byUserId: 'user-mary' }],
    },
  ],
  payments: [
    { id: 'payment-8619', orderId: 'order-8619', amount: 3, method: 'cash', paidAt: '2026-07-30T12:00:00.000Z', receivedByUserId: 'user-rudo-staff' },
    { id: 'payment-1042', orderId: 'order-1042', amount: 10, method: 'ecocash', paidAt: '2026-08-20T08:12:00.000Z', reference: 'MP26082071', receivedByUserId: 'user-rudo-staff' },
    { id: 'payment-1049', orderId: 'order-1049', amount: 28, method: 'bank_transfer', paidAt: '2026-08-19T11:40:00.000Z', reference: 'TRH-8820', receivedByUserId: 'user-rudo-staff' },
    { id: 'payment-1031', orderId: 'order-1031', amount: 10, method: 'cash', paidAt: '2026-08-17T11:20:00.000Z', receivedByUserId: 'user-mary' },
  ],
  pickupRequests: [
    { id: 'pickup-1', customerId: 'customer-rudo', branchId: 'branch-cbd', address: '32 Fife Avenue, Harare', preferredAt: '2026-08-20T07:30:00.000Z', instructions: 'Call at the gate.', status: 'picked_up', createdAt: '2026-08-19T16:10:00.000Z' },
    { id: 'pickup-2', customerId: 'customer-mhofu', branchId: 'branch-murewa', address: 'Mhofu Lodge, Murewa Centre', preferredAt: '2026-08-21T06:00:00.000Z', instructions: 'Collect from housekeeping.', status: 'picked_up', createdAt: '2026-08-20T15:40:00.000Z' },
  ],
  inventory: [
    { id: 'inv-cbd-detergent', branchId: 'branch-cbd', name: 'Commercial detergent', category: 'chemical', unit: 'litres', quantity: 34, reorderLevel: 15, unitCost: 2.1 },
    { id: 'inv-cbd-solvent', branchId: 'branch-cbd', name: 'Dry-cleaning solvent', category: 'chemical', unit: 'litres', quantity: 11, reorderLevel: 12, unitCost: 5.4 },
    { id: 'inv-cbd-bags', branchId: 'branch-cbd', name: 'Garment covers', category: 'packaging', unit: 'pieces', quantity: 86, reorderLevel: 40, unitCost: 0.18 },
    { id: 'inv-av-detergent', branchId: 'branch-avondale', name: 'Commercial detergent', category: 'chemical', unit: 'litres', quantity: 22, reorderLevel: 15, unitCost: 2.1 },
    { id: 'inv-av-tags', branchId: 'branch-avondale', name: 'Numbered garment tags', category: 'consumable', unit: 'rolls', quantity: 3, reorderLevel: 4, unitCost: 4.8 },
    { id: 'inv-mur-detergent', branchId: 'branch-murewa', name: 'Commercial detergent', category: 'chemical', unit: 'litres', quantity: 19, reorderLevel: 15, unitCost: 2.1 },
    { id: 'inv-mur-bags', branchId: 'branch-murewa', name: 'Garment covers', category: 'packaging', unit: 'pieces', quantity: 27, reorderLevel: 30, unitCost: 0.18 },
  ],
  clothingItems: [],
  clothingSales: [],
  activities: [
    { id: 'activity-1', branchId: 'branch-cbd', userId: 'user-rudo-staff', message: 'marked GAT-2608-1049 ready for collection', kind: 'order', at: '2026-08-21T09:15:00.000Z' },
    { id: 'activity-2', branchId: 'branch-avondale', userId: 'user-mary', message: 'started ironing GAT-2608-1052', kind: 'order', at: '2026-08-21T08:55:00.000Z' },
    { id: 'activity-3', branchId: 'branch-murewa', userId: 'user-tinashe', message: 'received the Mhofu Lodge pickup', kind: 'pickup', at: '2026-08-21T08:10:00.000Z' },
    { id: 'activity-4', branchId: 'branch-cbd', userId: 'user-rudo-staff', message: 'clocked in at the front desk', kind: 'staff', at: '2026-08-21T07:16:00.000Z' },
  ],
  notifications: [
    { id: 'notification-1', title: 'Order ready for collection', message: 'GAT-2608-1049 is ready for collection.', kind: 'order', at: '2026-08-21T09:15:00.000Z', branchId: 'branch-cbd', orderId: 'order-1049', customerId: 'customer-tariro', actorUserId: 'user-rudo-staff', recipientUserIds: ['user-rudo-staff'], readByUserIds: [] },
    { id: 'notification-2', title: 'Order moved to washing', message: 'GAT-2608-1042 moved to washing.', kind: 'order', at: '2026-08-21T07:30:00.000Z', branchId: 'branch-cbd', orderId: 'order-1042', customerId: 'customer-rudo', actorUserId: 'user-rudo-staff', recipientUserIds: ['user-rudo-staff', 'user-customer'], readByUserIds: [] },
    { id: 'notification-3', title: 'Order moved to ironing', message: 'GAT-2608-1052 moved to ironing.', kind: 'order', at: '2026-08-21T08:55:00.000Z', branchId: 'branch-avondale', orderId: 'order-1052', customerId: 'customer-nyasha', actorUserId: 'user-mary', recipientUserIds: ['user-mary'], readByUserIds: [] },
    { id: 'notification-4', title: 'New assigned job', message: 'GAT-2608-1057 was assigned to Tinashe Moyo.', kind: 'order', at: '2026-08-21T06:40:00.000Z', branchId: 'branch-murewa', orderId: 'order-1057', customerId: 'customer-mhofu', actorUserId: 'user-tinashe', recipientUserIds: ['user-tinashe'], readByUserIds: ['user-tinashe'] },
  ],
});
