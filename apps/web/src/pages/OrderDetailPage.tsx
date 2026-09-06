import {
  dateTime,
  getActiveUser,
  makeId,
  money,
  nextStatus,
  orderBalance,
  orderPaid,
  orderSubtotal,
  orderTotal,
  receiptIdForTransaction,
  shortDate,
  statusLabels,
  statusSequence,
  type PaymentMethod,
} from '@gatsi/domain';
import { ArrowLeft, ArrowRight, CalendarDays, Check, CreditCard, FileText, MapPin, Package2, Printer, Shirt, UserRound } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button, Card, Empty, FormField, PageTitle, StatusPill } from '../components/ui';
import { useAppStore } from '../store/AppStore';
import { apiAction } from '../store/api';

const methods: PaymentMethod[] = ['cash', 'ecocash', 'card', 'bank_transfer'];

export function OrderDetailPage() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const { state, dispatch } = useAppStore();
  const user = getActiveUser(state)!;
  const order = state.orders.find((item) => item.id === orderId);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [reference, setReference] = useState('');
  const [savingPayment, setSavingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState('');

  if (!order) return <Empty warning title="Order not found" body="This order is not available in the current workspace." />;

  const customer = state.customers.find((item) => item.id === order.customerId);
  const branch = state.branches.find((item) => item.id === order.branchId);
  const paid = orderPaid(state, order.id);
  const balance = orderBalance(state, order);
  const canAdvanceOrder = user.role === 'admin' || (user.role === 'staff' && order.assignedStaffId === user.id);
  const upcoming = canAdvanceOrder ? nextStatus(order.status) : null;
  const orderReceipts = state.receipts.filter((receipt) => receipt.kind === 'service' && receipt.orderId === order.id);

  const savePayment = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = Number(amount);
    if (!value || value <= 0 || value > balance || savingPayment) return;
    const payment = {
      id: makeId('payment'),
      orderId: order.id,
      amount: value,
      method,
      ...(reference.trim() ? { reference: reference.trim() } : {}),
      paidAt: new Date().toISOString(),
      receivedByUserId: user.id,
    };
    setSavingPayment(true);
    setPaymentError('');
    try {
      const activeBranchId = state.activeBranchId;
      const remote = await apiAction({ type: 'ADD_PAYMENT', payment }, state);
      dispatch({ type: 'HYDRATE', state: user.role === 'admin' ? { ...remote, activeBranchId } : remote });
      navigate(`/receipts/${receiptIdForTransaction('service', payment.id)}`);
    } catch (reason) {
      setPaymentError(reason instanceof Error ? reason.message : 'The payment could not be recorded.');
    } finally {
      setSavingPayment(false);
    }
  };

  return <>
    <PageTitle
      eyebrow="Order record"
      title={order.number}
      description={`${customer?.name ?? 'Customer'} · ${branch?.name ?? 'Branch'}`}
      actions={<><Link to="/orders"><Button variant="secondary"><ArrowLeft /> Orders</Button></Link><Button variant="secondary" onClick={() => window.print()}><Printer /> Print order</Button></>}
    />
    <div className="order-detail-grid">
      <div className="order-detail-main">
        <Card className="order-overview">
          <div className="overview-head"><div className="order-large-icon"><Shirt /></div><div><span>Current stage</span><h2>{statusLabels[order.status]}</h2></div><StatusPill status={order.status} /></div>
          <div className="overview-facts">
            <div><UserRound /><span>Customer<strong>{customer?.name}</strong></span></div>
            <div><MapPin /><span>Branch<strong>{branch?.shortName}</strong></span></div>
            <div><CalendarDays /><span>Expected due<strong>{shortDate(order.dueAt)}</strong></span></div>
            <div><Package2 /><span>Intake<strong>{order.intakeMethod.replaceAll('_', ' ')}</strong></span></div>
          </div>
          {order.notes ? <div className="order-note"><FileText /><span><strong>Care note</strong>{order.notes}</span></div> : null}
        </Card>
        <Card className="garment-card">
          <div className="card-heading"><div><span className="eyebrow">Order contents</span><h2>Garments & services</h2></div><b>{order.items.reduce((sum, item) => sum + item.quantity, 0)} items</b></div>
          {order.items.map((item) => {
            const service = state.services.find((entry) => entry.id === item.serviceId);
            return <div className="garment-row" key={item.id}><span><Shirt /></span><div><strong>{item.description}</strong><small>{service?.name} · {item.quantity} × {money(item.unitPrice)}</small></div><b>{money(item.quantity * item.unitPrice)}</b></div>;
          })}
        </Card>
        <Card className="journey-card">
          <div className="card-heading"><div><span className="eyebrow">Customer visible</span><h2>Care journey</h2></div></div>
          <div className="journey">{statusSequence.map((status, index) => {
            const statusEvent = [...order.events].reverse().find((item) => item.status === status);
            const reached = Boolean(statusEvent) || statusSequence.indexOf(order.status) >= index;
            return <div className={reached ? 'reached' : ''} key={status}><span>{reached ? <Check /> : index + 1}</span><i /><section><strong>{statusLabels[status]}</strong><small>{statusEvent ? dateTime(statusEvent.at) : 'Pending'}</small>{statusEvent?.note ? <p>{statusEvent.note}</p> : null}</section></div>;
          })}</div>
        </Card>
      </div>
      <aside className="order-detail-side">
        {user.role !== 'customer' && upcoming ? <Card className="stage-action"><span><ArrowRight /></span><h3>Advance workflow</h3><p>Move this order to <strong>{statusLabels[upcoming]}</strong> and timestamp the customer&apos;s tracker.</p><Button className="full-width" onClick={() => dispatch({ type: 'UPDATE_ORDER_STATUS', orderId: order.id, status: upcoming, userId: user.id })}>Complete current stage <ArrowRight /></Button></Card> : null}
        <Card className="payment-summary">
          <span className="eyebrow">Payment</span><h2>Order total</h2>
          <div><span>Subtotal</span><b>{money(orderSubtotal(order))}</b></div>
          {order.discount ? <div><span>Discount</span><b className="green">−{money(order.discount)}</b></div> : null}
          {order.deliveryFee ? <div><span>Pickup / delivery</span><b>{money(order.deliveryFee)}</b></div> : null}
          <div className="payment-total"><span>Total</span><b>{money(orderTotal(order))}</b></div>
          <div><span>Amount paid</span><b className="green">{money(paid)}</b></div>
          <div className="payment-balance"><span>Balance due</span><b>{money(balance)}</b></div>
          {user.role !== 'customer' && balance > 0 ? <form onSubmit={savePayment} className="payment-form">
            <FormField label="Record payment"><input required type="number" step="0.01" min="0.01" max={balance} value={amount} disabled={savingPayment} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" /></FormField>
            <div className="method-grid">{methods.map((item) => <button type="button" disabled={savingPayment} onClick={() => setMethod(item)} className={method === item ? 'selected' : ''} key={item}>{item.replaceAll('_', ' ')}</button>)}</div>
            <FormField label="Reference (optional)"><input maxLength={200} value={reference} disabled={savingPayment} onChange={(event) => setReference(event.target.value)} placeholder="Transaction or POS reference" /></FormField>
            {paymentError ? <p className="management-error" role="alert">{paymentError}</p> : null}
            <Button type="submit" disabled={savingPayment} className="full-width"><CreditCard /> {savingPayment ? 'Saving...' : 'Save & view receipt'}</Button>
          </form> : null}
        </Card>
        {orderReceipts.length ? <Card className="receipt-mini"><FileText /><div><strong>{orderReceipts.length} transaction receipt{orderReceipts.length === 1 ? '' : 's'}</strong><span>Each payment has its own permanent receipt.</span></div><Link to={`/receipts/${orderReceipts[0].id}`}><Button variant="ghost">View latest</Button></Link></Card> : null}
      </aside>
    </div>
  </>;
}
