import { dateTime, money, visibleReceipts } from '@gatsi/domain';
import { ArrowLeft, Printer, ReceiptText } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { Button, Empty, PageTitle } from '../components/ui';
import { useAppStore } from '../store/AppStore';

export function ReceiptDetailPage() {
  const { receiptId } = useParams();
  const { state } = useAppStore();
  const receipt = visibleReceipts(state).find((item) => item.id === receiptId);
  if (!receipt) return <Empty warning title="Receipt not found" body="This receipt is not available in your current workspace." />;

  return <>
    <PageTitle
      eyebrow="Transaction receipt"
      title={receipt.number}
      description={`${receipt.kind === 'store' ? 'Store sale' : 'Service payment'} · ${dateTime(receipt.issuedAt)}`}
      actions={<><Link to="/receipts"><Button variant="secondary"><ArrowLeft /> Receipts</Button></Link><Button onClick={() => window.print()}><Printer /> Print receipt</Button></>}
    />
    <article className="transaction-receipt">
      <header className="transaction-receipt-brand">
        <span>G</span>
        <div><strong>GATSI COMMS</strong><small>Textile, Dry Cleaning & Store</small></div>
        <ReceiptText />
      </header>
      <section className="transaction-receipt-title"><span>OFFICIAL RECEIPT</span><strong>{receipt.number}</strong></section>
      <section className="transaction-receipt-meta">
        <div><small>DATE & TIME</small><strong>{dateTime(receipt.issuedAt)}</strong></div>
        <div><small>TRANSACTION</small><strong>{receipt.kind === 'store' ? 'Store sale' : 'Service payment'}</strong></div>
        <div><small>BRANCH</small><strong>{receipt.branchName}</strong></div>
        <div><small>CUSTOMER</small><strong>{receipt.customerName}</strong>{receipt.customerPhone ? <span>{receipt.customerPhone}</span> : null}</div>
        {receipt.orderNumber ? <div><small>ORDER</small><strong>{receipt.orderNumber}</strong></div> : null}
        <div><small>RECEIVED BY</small><strong>{receipt.issuedByName}</strong></div>
      </section>
      <section className="transaction-receipt-lines">
        <div className="transaction-receipt-line-head"><span>Description</span><span>Qty</span><span>Unit price</span><span>Amount</span></div>
        {receipt.lines.map((line) => <div className="transaction-receipt-line" key={line.id}>
          <span><strong>{line.description}</strong>{line.detail ? <small>{line.detail}</small> : null}{line.listUnitPrice !== undefined && line.listUnitPrice !== line.unitPrice ? <small>Initial price: {money(line.listUnitPrice)}</small> : null}</span>
          <b>{line.quantity}</b><b>{money(line.unitPrice)}</b><b>{money(line.total)}</b>
        </div>)}
      </section>
      <section className="transaction-receipt-totals">
        <div><span>Subtotal</span><b>{money(receipt.subtotal)}</b></div>
        {receipt.discount ? <div><span>Discount</span><b>−{money(receipt.discount)}</b></div> : null}
        {receipt.fees ? <div><span>Pickup / delivery</span><b>{money(receipt.fees)}</b></div> : null}
        <div><span>Transaction total</span><b>{money(receipt.total)}</b></div>
        <div className="transaction-paid"><span>Paid on this receipt</span><strong>{money(receipt.amountPaid)}</strong></div>
        {receipt.kind === 'service' ? <div><span>Balance after payment</span><b>{money(receipt.balanceAfter)}</b></div> : null}
      </section>
      <section className="transaction-receipt-payment">
        <span>Payment method <b>{receipt.paymentMethod.replaceAll('_', ' ')}</b></span>
        {receipt.reference ? <span>Reference <b>{receipt.reference}</b></span> : null}
      </section>
      <footer><strong>Thank you for your business</strong><span>This receipt is a permanent record of the transaction above.</span></footer>
    </article>
  </>;
}
