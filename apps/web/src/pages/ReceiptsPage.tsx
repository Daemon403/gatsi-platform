import { dateTime, money, visibleReceipts } from '@gatsi/domain';
import { CheckCircle2, FileText, ReceiptText, Store } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button, Card, Empty, PageTitle } from '../components/ui';
import { useAppStore } from '../store/AppStore';

export function ReceiptsPage() {
  const { state } = useAppStore();
  const receipts = visibleReceipts(state);
  const received = receipts.reduce((sum, receipt) => sum + receipt.amountPaid, 0);
  const serviceCount = receipts.filter((receipt) => receipt.kind === 'service').length;
  const storeCount = receipts.length - serviceCount;

  return <>
    <PageTitle eyebrow="Transactions" title="Receipts" description="One permanent receipt for every service payment and store sale." />
    <section className="receipt-summary">
      <span><ReceiptText /></span>
      <div>
        <small>Total received on visible receipts</small>
        <strong>{money(received)}</strong>
        <p><CheckCircle2 /> {receipts.length} transaction{receipts.length === 1 ? '' : 's'} · {serviceCount} service · {storeCount} store</p>
      </div>
    </section>
    <div className="receipt-grid">
      {receipts.map((receipt) => <Card className="receipt-card" key={receipt.id}>
        <div className="receipt-card-head">
          <span>{receipt.kind === 'store' ? <Store /> : <FileText />}</span>
          <div><strong>{receipt.number}</strong><small>{dateTime(receipt.issuedAt)}</small></div>
          <i>{receipt.kind === 'store' ? 'STORE SALE' : 'SERVICE PAYMENT'}</i>
        </div>
        <div className="receipt-card-body">
          <span>Customer <b>{receipt.customerName}</b></span>
          <span>{receipt.kind === 'service' ? 'Order' : 'Item'} <b>{receipt.orderNumber ?? receipt.lines[0]?.description ?? 'Store sale'}</b></span>
          <span>Paid <b className="green">{money(receipt.amountPaid)}</b></span>
        </div>
        <div className="receipt-payments">
          <p><span>Payment method</span><b>{receipt.paymentMethod.replaceAll('_', ' ')}</b></p>
          <p><span>Branch</span><b>{receipt.branchName}</b></p>
          {receipt.balanceAfter > 0 ? <p><span>Balance after payment</span><b>{money(receipt.balanceAfter)}</b></p> : null}
        </div>
        <div className="receipt-card-footer">
          {receipt.orderId ? <Link to={`/orders/${receipt.orderId}`}><Button variant="ghost">Open order</Button></Link> : null}
          <Link to={`/receipts/${receipt.id}`}><Button variant="secondary">View receipt</Button></Link>
        </div>
      </Card>)}
      {!receipts.length ? <Empty title="No receipts yet" body="Receipts will appear automatically when a service payment or store sale is recorded." /> : null}
    </div>
  </>;
}
