export type Role = 'admin' | 'staff' | 'customer';

export type OrderStatus =
  | 'received'
  | 'sorting'
  | 'washing'
  | 'drying'
  | 'ironing'
  | 'quality_check'
  | 'ready'
  | 'out_for_delivery'
  | 'collected'
  | 'cancelled';

export type PaymentMethod = 'cash' | 'ecocash' | 'card' | 'bank_transfer';

export type Branch = {
  id: string;
  name: string;
  shortName: string;
  address: string;
  phone: string;
  managerId: string;
  active: boolean;
};

export type User = {
  id: string;
  role: Role;
  name: string;
  email: string;
  phone: string;
  branchIds: string[];
  customerId?: string;
  jobTitle?: string;
  avatarColor: string;
  clockedIn?: boolean;
  lastClockIn?: string;
  username?: string;
  password?: string;
  verified?: boolean;
  active?: boolean;
};

export type CustomerMeasurements = {
  unit: 'cm' | 'in';
  height?: number;
  neck?: number;
  chest?: number;
  waist?: number;
  hips?: number;
  shoulder?: number;
  sleeve?: number;
  inseam?: number;
};

export type Customer = {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  joinedAt: string;
  branchId: string;
  loyaltyPoints: number;
  measurements?: CustomerMeasurements;
};

export type Service = {
  id: string;
  name: string;
  category: 'laundry' | 'dry_cleaning' | 'textile' | 'speciality';
  unit: 'item' | 'kg' | 'pair' | 'set' | 'metre';
  price: number;
  turnaroundHours: number;
  description: string;
  active: boolean;
};

export type OrderItem = {
  id: string;
  serviceId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  notes?: string;
};

export type StatusEvent = {
  id: string;
  status: OrderStatus;
  at: string;
  byUserId: string;
  note?: string;
};

export type Order = {
  id: string;
  number: string;
  branchId: string;
  customerId: string;
  assignedStaffId?: string;
  items: OrderItem[];
  status: OrderStatus;
  priority: 'normal' | 'urgent';
  intakeMethod: 'walk_in' | 'pickup' | 'online';
  createdAt: string;
  dueAt: string;
  collectedAt?: string;
  notes?: string;
  discount: number;
  deliveryFee: number;
  events: StatusEvent[];
};

export type Payment = {
  id: string;
  orderId: string;
  amount: number;
  method: PaymentMethod;
  paidAt: string;
  reference?: string;
  receivedByUserId: string;
};

export type PickupRequest = {
  id: string;
  customerId: string;
  branchId: string;
  address: string;
  preferredAt: string;
  instructions: string;
  status: 'requested' | 'scheduled' | 'picked_up' | 'cancelled';
  createdAt: string;
};

export type InventoryItem = {
  id: string;
  branchId: string;
  name: string;
  category: 'chemical' | 'packaging' | 'textile' | 'consumable';
  unit: string;
  quantity: number;
  reorderLevel: number;
  unitCost: number;
};

export type Activity = {
  id: string;
  branchId: string;
  userId: string;
  message: string;
  kind: 'order' | 'payment' | 'inventory' | 'staff' | 'pickup';
  at: string;
};

export type AppState = {
  version: number;
  activeUserId: string | null;
  activeBranchId: string;
  branches: Branch[];
  users: User[];
  customers: Customer[];
  services: Service[];
  orders: Order[];
  payments: Payment[];
  pickupRequests: PickupRequest[];
  inventory: InventoryItem[];
  activities: Activity[];
};

export type AppAction =
  | { type: 'HYDRATE'; state: AppState }
  | { type: 'LOGIN'; userId: string }
  | { type: 'LOGOUT' }
  | { type: 'SET_BRANCH'; branchId: string }
  | { type: 'CREATE_ORDER'; order: Order }
  | { type: 'UPDATE_ORDER_STATUS'; orderId: string; status: OrderStatus; userId: string; note?: string }
  | { type: 'ADD_PAYMENT'; payment: Payment }
  | { type: 'CREATE_PICKUP'; request: PickupRequest }
  | { type: 'UPDATE_PICKUP'; requestId: string; status: PickupRequest['status']; userId: string }
  | { type: 'ADJUST_INVENTORY'; itemId: string; delta: number; userId: string }
  | { type: 'CLOCK_TOGGLE'; userId: string }
  | { type: 'CREATE_CUSTOMER'; customer: Customer; user: User }
  | { type: 'RESET_DEMO' };
