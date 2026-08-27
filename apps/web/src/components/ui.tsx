import { getActiveUser, orderBalance, orderProgress, shortDate, statusLabels, type AppState, type Order, type OrderStatus } from '@gatsi/domain';
import { AlertTriangle, CheckCircle2, Package2 } from 'lucide-react';
import type { ButtonHTMLAttributes, PropsWithChildren, ReactNode } from 'react';
import { Link } from 'react-router-dom';

export function PageTitle({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return <div className="page-title"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1>{description ? <p>{description}</p> : null}</div>{actions ? <div className="page-actions">{actions}</div> : null}</div>;
}

export function Card({ children, className = '' }: PropsWithChildren<{ className?: string }>) { return <section className={`card ${className}`}>{children}</section>; }

export function Button({ children, variant = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }) {
  return <button className={`button button-${variant} ${className}`} {...props}>{children}</button>;
}

const tone = (status: OrderStatus) => ['ready', 'collected'].includes(status) ? 'green' : ['received', 'sorting'].includes(status) ? 'amber' : status === 'cancelled' ? 'red' : 'blue';
export function StatusPill({ status }: { status: OrderStatus }) { return <span className={`status status-${tone(status)}`}>{statusLabels[status]}</span>; }

export function Metric({ label, value, detail, tone = 'green', icon }: { label: string; value: string | number; detail: string; tone?: 'green' | 'blue' | 'amber' | 'red' | 'purple'; icon: ReactNode }) {
  return <Card className="metric"><div className={`metric-icon tone-${tone}`}>{icon}</div><strong>{value}</strong><span>{label}</span><small>{detail}</small></Card>;
}

export function OrderRow({ state, order }: { state: AppState; order: Order }) {
  const currentUser = getActiveUser(state);
  const customer = state.customers.find((item) => item.id === order.customerId);
  const branch = state.branches.find((item) => item.id === order.branchId);
  const assignedStaff = state.users.find((item) => item.id === order.assignedStaffId && item.role === 'staff');
  const progress = orderProgress(order.status);
  const balance = orderBalance(state, order);
  return <Link className="order-row" to={`/orders/${order.id}`}><div className="order-symbol"><Package2 size={20} /></div><div className="order-main"><div className="order-title-line"><strong>{order.number}</strong><StatusPill status={order.status} /></div><span className="customer-link">{customer?.name}</span><div className="progress-line"><div className="progress-track"><i style={{ width: `${progress}%` }} /></div><b>{progress}%</b></div><div className="order-meta"><span>{branch?.shortName}</span><span>Due {shortDate(order.dueAt)}</span><span>{order.items.reduce((sum, item) => sum + item.quantity, 0)} items</span>{currentUser?.role !== 'customer' ? <span>Assigned to {assignedStaff?.name ?? 'Unassigned'}</span> : null}{balance > 0 ? <em>{balance.toFixed(2)} USD due</em> : <em className="paid">Paid</em>}</div></div></Link>;
}

export function Empty({ title, body, warning = false }: { title: string; body: string; warning?: boolean }) {
  const Icon = warning ? AlertTriangle : CheckCircle2;
  return <div className="empty"><span><Icon size={25} /></span><strong>{title}</strong><p>{body}</p></div>;
}

export function FormField({ label, children, hint }: PropsWithChildren<{ label: string; hint?: string }>) { return <label className="field"><span>{label}</span>{children}{hint ? <small>{hint}</small> : null}</label>; }
