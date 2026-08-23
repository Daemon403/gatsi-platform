import { getActiveUser, makeId, money, orderNumber, type Order } from '@gatsi/domain';
import { ArrowLeft, CheckCircle2, MapPin, Package2, Plus, ShoppingBag } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Card, FormField, PageTitle } from '../components/ui';
import { useAppStore } from '../store/AppStore';

export function NewOrderPage() {
  const { state, dispatch } = useAppStore();
  const navigate = useNavigate();
  const user = getActiveUser(state)!;
  const branches = user.role === 'admin' ? state.branches : state.branches.filter((item) => user.branchIds.includes(item.id));
  const initialBranch = state.activeBranchId === 'all' ? branches[0].id : state.activeBranchId;
  const [branchId, setBranchId] = useState(initialBranch);
  const customers = state.customers.filter((item) => item.branchId === branchId);
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? '');
  const [serviceId, setServiceId] = useState(state.services[0].id);
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [discount, setDiscount] = useState(0);
  const service = state.services.find((item) => item.id === serviceId)!;
  const total = Math.max(0, service.price * quantity - discount);
  const dueAt = useMemo(() => new Date(Date.now() + service.turnaroundHours * 3600000).toISOString(), [service]);
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!customerId || !description.trim()) return;
    const id = makeId('order');
    const order: Order = { id, number: orderNumber(state), branchId, customerId, assignedStaffId: user.role === 'staff' ? user.id : state.users.find((item) => item.role === 'staff' && item.active !== false && item.branchIds.includes(branchId))?.id, items: [{ id: makeId('item'), serviceId, description: description.trim(), quantity, unitPrice: service.price }], status: 'received', priority: urgent ? 'urgent' : 'normal', intakeMethod: 'walk_in', createdAt: new Date().toISOString(), dueAt, notes, discount, deliveryFee: 0, events: [{ id: makeId('event'), status: 'received', at: new Date().toISOString(), byUserId: user.id }] };
    dispatch({ type: 'CREATE_ORDER', order });
    navigate(`/orders/${id}`);
  };
  return <><PageTitle eyebrow="Counter intake" title="Create a new order" description="Register the customer, garment service, quantity and care notes." actions={<Link to="/orders"><Button variant="secondary"><ArrowLeft /> Back to orders</Button></Link>} /><form className="new-order-layout" onSubmit={submit}><div className="new-order-main"><Card className="form-section"><div className="form-section-heading"><span><MapPin /></span><div><h2>Branch & customer</h2><p>Choose where this order will be processed.</p></div></div><div className="form-grid two"><FormField label="Processing branch"><select value={branchId} onChange={(event) => { setBranchId(event.target.value); setCustomerId(state.customers.find((item) => item.branchId === event.target.value)?.id ?? ''); }}>{branches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></FormField><FormField label="Customer"><select required value={customerId} onChange={(event) => setCustomerId(event.target.value)}><option value="">Select customer</option>{customers.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.phone}</option>)}</select></FormField></div></Card><Card className="form-section"><div className="form-section-heading"><span><Package2 /></span><div><h2>Garment service</h2><p>Pricing and turnaround are calculated automatically.</p></div></div><div className="service-picker">{state.services.filter((item) => item.active).map((item) => <button type="button" key={item.id} onClick={() => setServiceId(item.id)} className={serviceId === item.id ? 'selected' : ''}><span><ShoppingBag /></span><strong>{item.name}</strong><small>{money(item.price)} / {item.unit}</small>{serviceId === item.id ? <CheckCircle2 /> : null}</button>)}</div><div className="form-grid two"><FormField label="Garment description"><input required value={description} onChange={(event) => setDescription(event.target.value)} placeholder="e.g. Four white shirts with collar stains" /></FormField><FormField label={`Quantity (${service.unit})`}><div className="quantity-control"><button type="button" onClick={() => setQuantity(Math.max(1, quantity - 1))}>−</button><strong>{quantity}</strong><button type="button" onClick={() => setQuantity(quantity + 1)}>+</button></div></FormField></div><FormField label="Care notes" hint="Optional notes are visible to the branch team."><textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Fabric concerns, stains or customer instructions..." /></FormField><label className={`urgent-toggle ${urgent ? 'selected' : ''}`}><input type="checkbox" checked={urgent} onChange={(event) => setUrgent(event.target.checked)} /><span><CheckCircle2 /></span><div><strong>Urgent priority</strong><small>Flag this order for expedited branch attention.</small></div></label></Card></div><aside className="order-summary"><Card><span className="eyebrow">Live estimate</span><h2>Order summary</h2><div className="summary-service"><Package2 /><div><strong>{service.name}</strong><span>{quantity} {service.unit}{quantity !== 1 ? 's' : ''}</span></div><b>{money(service.price * quantity)}</b></div><FormField label="Discount (USD)"><input type="number" min="0" max={service.price * quantity} step="0.5" value={discount} onChange={(event) => setDiscount(Number(event.target.value))} /></FormField><div className="summary-line"><span>Turnaround</span><strong>{service.turnaroundHours} hours</strong></div><div className="summary-line"><span>Expected due</span><strong>{new Date(dueAt).toLocaleDateString()}</strong></div><div className="summary-total"><span>Estimated total</span><strong>{money(total)}</strong></div><Button type="submit" className="full-width">Create order <span>→</span></Button></Card></aside></form></>;
}
