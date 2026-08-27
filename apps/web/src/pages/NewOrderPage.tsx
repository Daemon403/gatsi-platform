import { getActiveUser, makeId, money, orderNumber, type Order, type User } from '@gatsi/domain';
import { ArrowLeft, CheckCircle2, MapPin, Package2, ShoppingBag, UserCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Card, FormField, PageTitle } from '../components/ui';
import { useAppStore } from '../store/AppStore';
import { apiAction } from '../store/api';

const actionError = (error: unknown) => error instanceof Error ? error.message : 'The order could not be created.';

export function NewOrderPage() {
  const { state, dispatch } = useAppStore();
  const navigate = useNavigate();
  const user = getActiveUser(state)!;
  const branches = state.branches.filter((branch) => branch.active && (user.role === 'admin' || user.branchIds.includes(branch.id)));
  const requestedBranchId = state.activeBranchId === 'all' ? branches[0]?.id ?? '' : state.activeBranchId;
  const initialBranchId = branches.some((branch) => branch.id === requestedBranchId) ? requestedBranchId : branches[0]?.id ?? '';
  const staffForBranch = (nextBranchId: string): User[] => state.users.filter((member) =>
    member.role === 'staff'
    && member.active !== false
    && member.verified === true
    && member.branchIds.includes(nextBranchId),
  );

  const [branchId, setBranchId] = useState(initialBranchId);
  const customers = state.customers.filter((customer) => customer.branchId === branchId);
  const eligibleStaff = staffForBranch(branchId);
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? '');
  const [assignedStaffId, setAssignedStaffId] = useState(user.role === 'staff' ? user.id : '');
  const [serviceId, setServiceId] = useState(state.services.find((service) => service.active)?.id ?? state.services[0]?.id ?? '');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [discount, setDiscount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const service = state.services.find((item) => item.id === serviceId) ?? state.services[0];
  const total = Math.max(0, service.price * quantity - discount);
  const dueAt = useMemo(() => new Date(Date.now() + service.turnaroundHours * 3600000).toISOString(), [service]);

  const changeBranch = (nextBranchId: string) => {
    setBranchId(nextBranchId);
    setCustomerId(state.customers.find((customer) => customer.branchId === nextBranchId)?.id ?? '');
    if (user.role === 'admin') setAssignedStaffId('');
    setError('');
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting || !customerId || !description.trim() || !branchId) return;
    const assigneeId = user.role === 'staff' ? user.id : assignedStaffId || undefined;
    const selectedAssigneeIsEligible = !assigneeId || staffForBranch(branchId).some((member) => member.id === assigneeId);
    if (!selectedAssigneeIsEligible || (user.role === 'staff' && !assigneeId)) {
      setError(user.role === 'admin'
        ? 'The selected staff member is no longer active at this branch.'
        : 'Your account is not assigned to the selected branch.');
      return;
    }

    const id = makeId('order');
    const order: Order = {
      id,
      number: orderNumber(state),
      branchId,
      customerId,
      ...(assigneeId ? { assignedStaffId: assigneeId } : {}),
      items: [{ id: makeId('item'), serviceId, description: description.trim(), quantity, unitPrice: service.price }],
      status: 'received',
      priority: urgent ? 'urgent' : 'normal',
      intakeMethod: 'walk_in',
      createdAt: new Date().toISOString(),
      dueAt,
      notes,
      discount,
      deliveryFee: 0,
      events: [{ id: makeId('event'), status: 'received', at: new Date().toISOString(), byUserId: user.id }],
    };

    setSubmitting(true);
    setError('');
    try {
      const remoteState = await apiAction({ type: 'CREATE_ORDER', order });
      dispatch({
        type: 'HYDRATE',
        state: user.role === 'admin' ? { ...remoteState, activeBranchId: state.activeBranchId } : remoteState,
      });
      navigate(`/orders/${id}`);
    } catch (reason) {
      setError(actionError(reason));
    } finally {
      setSubmitting(false);
    }
  };

  return <>
    <PageTitle eyebrow="Counter intake" title="Create a new order" description="Register the customer, garment service, assigned team member and care notes." actions={<Link to="/orders"><Button variant="secondary"><ArrowLeft /> Back to orders</Button></Link>} />
    <form className="new-order-layout" onSubmit={(event) => void submit(event)}>
      <div className="new-order-main">
        <Card className="form-section">
          <div className="form-section-heading"><span><MapPin /></span><div><h2>Branch, customer & assignment</h2><p>Choose where the order will be processed and who is responsible for it.</p></div></div>
          <div className="form-grid two">
            <FormField label="Processing branch">
              <select required disabled={submitting} value={branchId} onChange={(event) => changeBranch(event.target.value)}>
                {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </select>
            </FormField>
            <FormField label="Customer">
              <select required disabled={submitting} value={customerId} onChange={(event) => { setCustomerId(event.target.value); setError(''); }}>
                <option value="">Select customer</option>
                {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name} - {customer.phone}</option>)}
              </select>
            </FormField>
            <FormField
              label="Assigned team member"
              hint={user.role === 'staff'
                ? 'Jobs entered by staff are automatically assigned to their account.'
                : eligibleStaff.length ? 'Assignment is optional. Only active, verified staff at this branch are available.' : 'This branch has no active staff; the order can remain unassigned.'}
            >
              {user.role === 'staff'
                ? <div className="self-assignment"><UserCheck /><span><strong>{user.name}</strong><small>{user.jobTitle ?? 'Staff member'} - automatically assigned</small></span></div>
                : <select disabled={submitting} value={assignedStaffId} onChange={(event) => { setAssignedStaffId(event.target.value); setError(''); }}>
                  <option value="">Unassigned</option>
                  {eligibleStaff.map((member) => <option key={member.id} value={member.id}>{member.name} - {member.jobTitle ?? 'Staff'}</option>)}
                </select>}
            </FormField>
          </div>
        </Card>

        <Card className="form-section">
          <div className="form-section-heading"><span><Package2 /></span><div><h2>Garment service</h2><p>Pricing and turnaround are calculated automatically.</p></div></div>
          <div className="service-picker">{state.services.filter((item) => item.active).map((item) => <button disabled={submitting} type="button" key={item.id} onClick={() => setServiceId(item.id)} className={serviceId === item.id ? 'selected' : ''}><span><ShoppingBag /></span><strong>{item.name}</strong><small>{money(item.price)} / {item.unit}</small>{serviceId === item.id ? <CheckCircle2 /> : null}</button>)}</div>
          <div className="form-grid two">
            <FormField label="Garment description"><input required disabled={submitting} value={description} onChange={(event) => { setDescription(event.target.value); setError(''); }} placeholder="e.g. Four white shirts with collar stains" /></FormField>
            <FormField label={`Quantity (${service.unit})`}><div className="quantity-control"><button disabled={submitting} type="button" onClick={() => setQuantity(Math.max(1, quantity - 1))}>-</button><strong>{quantity}</strong><button disabled={submitting} type="button" onClick={() => setQuantity(quantity + 1)}>+</button></div></FormField>
          </div>
          <FormField label="Care notes" hint="Optional notes are visible to the assigned branch team."><textarea disabled={submitting} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Fabric concerns, stains or customer instructions..." /></FormField>
          <label className={`urgent-toggle ${urgent ? 'selected' : ''}`}><input disabled={submitting} type="checkbox" checked={urgent} onChange={(event) => setUrgent(event.target.checked)} /><span><CheckCircle2 /></span><div><strong>Urgent priority</strong><small>Flag this order for expedited branch attention.</small></div></label>
        </Card>
      </div>

      <aside className="order-summary"><Card>
        <span className="eyebrow">Live estimate</span><h2>Order summary</h2>
        <div className="summary-service"><Package2 /><div><strong>{service.name}</strong><span>{quantity} {service.unit}{quantity !== 1 ? 's' : ''}</span></div><b>{money(service.price * quantity)}</b></div>
        <FormField label="Discount (USD)"><input disabled={submitting} type="number" min="0" max={service.price * quantity} step="0.5" value={discount} onChange={(event) => setDiscount(Number(event.target.value))} /></FormField>
        <div className="summary-line"><span>Assigned to</span><strong>{user.role === 'staff' ? user.name : eligibleStaff.find((member) => member.id === assignedStaffId)?.name ?? 'Not assigned'}</strong></div>
        <div className="summary-line"><span>Turnaround</span><strong>{service.turnaroundHours} hours</strong></div>
        <div className="summary-line"><span>Expected due</span><strong>{new Date(dueAt).toLocaleDateString()}</strong></div>
        <div className="summary-total"><span>Estimated total</span><strong>{money(total)}</strong></div>
        {error ? <span className="intake-error" role="alert">{error}</span> : null}
        <Button disabled={submitting || !branchId || !customerId} type="submit" className="full-width">{submitting ? 'Creating order...' : 'Create order'} <span aria-hidden="true">-&gt;</span></Button>
      </Card></aside>
    </form>
  </>;
}
