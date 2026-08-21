import { dateTime, getActiveUser, money, orderPaid, orderTotal, visibleOrders } from '@gatsi/domain';
import { CheckCircle2, FileText, Printer, ReceiptText } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button, Card, Empty, PageTitle } from '../components/ui';
import { useAppStore } from '../store/AppStore';

export function ReceiptsPage() {
  const { state } = useAppStore();
  const user = getActiveUser(state)!;
  const orders = visibleOrders(state).filter((order) => orderPaid(state, order.id) > 0);
  const paid = orders.reduce((sum, order) => sum + orderPaid(state, order.id), 0);
  return <><PageTitle eyebrow="Payments" title="Receipts" description="A complete record of payments made to Gatsi Comms." /><section className="receipt-summary"><span><ReceiptText /></span><div><small>Total payments recorded</small><strong>{money(paid)}</strong><p><CheckCircle2 /> {orders.length} paid order record{orders.length !== 1 ? 's' : ''}</p></div></section><div className="receipt-grid">{orders.map((order) => { const payments = state.payments.filter((item) => item.orderId === order.id); return <Card className="receipt-card" key={order.id}><div className="receipt-card-head"><span><FileText /></span><div><strong>{order.number}</strong><small>{dateTime(order.createdAt)}</small></div><i>GATSI COMMS</i></div><div className="receipt-card-body"><span>Total amount <b>{money(orderTotal(order))}</b></span><span>Amount paid <b className="green">{money(orderPaid(state, order.id))}</b></span><span>Payments <b>{payments.length}</b></span></div><div className="receipt-payments">{payments.map((payment) => <p key={payment.id}><span>{dateTime(payment.paidAt)} · {payment.method.replaceAll('_', ' ')}</span><b>{money(payment.amount)}</b></p>)}</div><div className="receipt-card-footer"><Link to={`/orders/${order.id}`}><Button variant="secondary">Open order</Button></Link><Button variant="ghost" onClick={() => window.print()}><Printer /> Print</Button></div></Card>; })}{!orders.length ? <Empty title="No receipts yet" body="A receipt will appear after your first payment is recorded." /> : null}</div></>;
}
