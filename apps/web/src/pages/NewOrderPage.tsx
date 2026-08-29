import {
  getActiveUser,
  makeId,
  money,
  orderNumber,
  type AppAction,
  type Customer,
  type Order,
  type User,
} from '@gatsi/domain';
import { ArrowLeft, CheckCircle2, Copy, KeyRound, MapPin, Package2, Plus, Search, Trash2, UserCheck, UserPlus } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Card, FormField, PageTitle } from '../components/ui';
import { useAppStore } from '../store/AppStore';
import { apiAction } from '../store/api';

type LineDraft = {
  id: string;
  serviceId: string;
  description: string;
  quantity: string;
  notes: string;
};

type CreatedOrderCredentials = {
  orderId: string;
  orderNumber: string;
  customerName: string;
  username: string;
  password: string;
};

type CustomerMode = 'existing' | 'new';

const actionError = (error: unknown) => error instanceof Error ? error.message : 'The order could not be created.';
const newLine = (serviceId: string): LineDraft => ({ id: makeId('item'), serviceId, description: '', quantity: '1', notes: '' });

export function NewOrderPage() {
  const { state, dispatch } = useAppStore();
  const navigate = useNavigate();
  const user = getActiveUser(state)!;
  const branches = state.branches.filter((branch) => branch.active && (user.role === 'admin' || user.branchIds.includes(branch.id)));
  const requestedBranchId = state.activeBranchId === 'all' ? branches[0]?.id ?? '' : state.activeBranchId;
  const initialBranchId = branches.some((branch) => branch.id === requestedBranchId) ? requestedBranchId : branches[0]?.id ?? '';
  const activeServices = state.services.filter((service) => service.active);
  const initialServiceId = activeServices[0]?.id ?? '';
  const [intakeStartedAt] = useState(() => Date.now());

  const staffForBranch = (nextBranchId: string): User[] => state.users.filter((member) =>
    member.role === 'staff'
    && member.active !== false
    && member.verified === true
    && member.branchIds.includes(nextBranchId),
  );

  const [branchId, setBranchId] = useState(initialBranchId);
  const [customerMode, setCustomerMode] = useState<CustomerMode>('existing');
  const [customerId, setCustomerId] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [assignedStaffId, setAssignedStaffId] = useState(user.role === 'staff' ? user.id : '');
  const [lines, setLines] = useState<LineDraft[]>(() => [newLine(initialServiceId)]);
  const [notes, setNotes] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [discount, setDiscount] = useState('0');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [createdOrder, setCreatedOrder] = useState<CreatedOrderCredentials | null>(null);
  const [copied, setCopied] = useState(false);

  const branchCustomers = useMemo(
    () => state.customers.filter((customer) => customer.branchId === branchId),
    [branchId, state.customers],
  );
  const selectedCustomer = branchCustomers.find((customer) => customer.id === customerId);
  const matchingCustomers = useMemo(() => {
    const query = customerSearch.trim().toLocaleLowerCase();
    const matches = query
      ? branchCustomers.filter((customer) => `${customer.name} ${customer.phone} ${customer.email}`.toLocaleLowerCase().includes(query))
      : branchCustomers;
    return matches.slice(0, 8);
  }, [branchCustomers, customerSearch]);
  const eligibleStaff = staffForBranch(branchId);

  const lineCalculations = lines.map((line) => {
    const service = activeServices.find((entry) => entry.id === line.serviceId);
    const quantity = Number(line.quantity);
    const validQuantity = Number.isInteger(quantity) && quantity > 0;
    return {
      line,
      service,
      quantity,
      amount: service && validQuantity ? service.price * quantity : 0,
    };
  });
  const subtotal = lineCalculations.reduce((sum, entry) => sum + entry.amount, 0);
  const discountAmount = Number(discount);
  const validDiscountAmount = Number.isFinite(discountAmount) && discountAmount >= 0 ? discountAmount : 0;
  const total = Math.max(0, subtotal - validDiscountAmount);
  const turnaroundHours = lineCalculations.reduce((maximum, entry) => Math.max(maximum, entry.service?.turnaroundHours ?? 0), 0);
  const dueAt = new Date(intakeStartedAt + turnaroundHours * 3_600_000).toISOString();

  const clearError = () => setError('');

  const changeBranch = (nextBranchId: string) => {
    setBranchId(nextBranchId);
    setCustomerMode('existing');
    setCustomerId('');
    setCustomerSearch('');
    setCustomerSearchOpen(false);
    if (user.role === 'admin') setAssignedStaffId('');
    clearError();
  };

  const selectCustomer = (customer: Customer) => {
    setCustomerId(customer.id);
    setCustomerSearch(customer.name);
    setCustomerSearchOpen(false);
    clearError();
  };

  const showNewCustomerForm = () => {
    setCustomerMode('new');
    setCustomerId('');
    setCustomerSearchOpen(false);
    clearError();
  };

  const showExistingCustomerSearch = () => {
    setCustomerMode('existing');
    setCustomerId('');
    setCustomerSearch('');
    clearError();
  };

  const updateLine = (lineId: string, updates: Partial<LineDraft>) => {
    setLines((current) => current.map((line) => line.id === lineId ? { ...line, ...updates } : line));
    clearError();
  };

  const addLine = () => {
    if (lines.length >= 100 || !initialServiceId) return;
    setLines((current) => [...current, newLine(initialServiceId)]);
    clearError();
  };

  const removeLine = (lineId: string) => {
    if (lines.length <= 1) return;
    setLines((current) => current.filter((line) => line.id !== lineId));
    clearError();
  };

  const validate = () => {
    if (!branchId || !branches.some((branch) => branch.id === branchId)) return 'Choose an active processing branch.';
    if (customerMode === 'existing' && !selectedCustomer) return 'Search for and select an existing customer, or create a new customer.';
    if (customerMode === 'new') {
      if (![firstName, lastName, phone].every((value) => value.trim())) return 'First name, last name and phone are required for a new customer.';
      if (firstName.trim().length > 64 || lastName.trim().length > 80 || `${firstName.trim()} ${lastName.trim()}`.length > 160 || phone.trim().length > 64) return 'The new customer details are too long.';
      if (email.trim().length > 254 || address.trim().length > 300) return 'The email or address is too long.';
      if (!/^[+()0-9 .-]+$/.test(phone.trim()) || phone.replace(/\D/g, '').length < 5) return 'Enter a valid customer phone number with at least five digits.';
      if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Enter a valid customer email address or leave it blank.';
      if (state.users.some((entry) => entry.username?.trim().toLocaleLowerCase() === firstName.trim().toLocaleLowerCase())) return 'That login username already exists. Use a different first name or select the existing customer.';
    }
    if (lines.length < 1 || lines.length > 100) return 'An order must contain between 1 and 100 service lines.';
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const service = activeServices.find((entry) => entry.id === line.serviceId);
      const quantity = Number(line.quantity);
      if (!service) return `Choose an active service for line ${index + 1}.`;
      if (!line.description.trim()) return `Enter a description for line ${index + 1}.`;
      if (line.description.trim().length > 500) return `The description on line ${index + 1} is too long.`;
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10_000) return `Quantity on line ${index + 1} must be a whole number from 1 to 10,000.`;
      if (line.notes.trim().length > 1_000) return `Item notes on line ${index + 1} are too long.`;
    }
    if (!Number.isFinite(discountAmount) || discountAmount < 0 || discountAmount > subtotal) return 'Discount must be a valid amount between zero and the subtotal.';
    if (notes.trim().length > 2_000) return 'Order notes are too long.';
    const assigneeId = user.role === 'staff' ? user.id : assignedStaffId || undefined;
    const assigneeIsEligible = !assigneeId || staffForBranch(branchId).some((member) => member.id === assigneeId);
    if (!assigneeIsEligible || (user.role === 'staff' && !assigneeId)) return user.role === 'admin'
      ? 'The selected staff member is no longer active at this branch.'
      : 'Your account is not assigned to the selected branch.';
    return '';
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    const validationError = validate();
    if (validationError) { setError(validationError); return; }

    const now = new Date().toISOString();
    const customerIdForOrder = customerMode === 'new' ? makeId('customer') : selectedCustomer!.id;
    const orderId = makeId('order');
    const number = orderNumber(state);
    const assigneeId = user.role === 'staff' ? user.id : assignedStaffId || undefined;
    const order: Order = {
      id: orderId,
      number,
      branchId,
      customerId: customerIdForOrder,
      ...(assigneeId ? { assignedStaffId: assigneeId } : {}),
      items: lineCalculations.map(({ line, service, quantity }) => ({
        id: line.id,
        serviceId: service!.id,
        description: line.description.trim(),
        quantity,
        unitPrice: service!.price,
        ...(line.notes.trim() ? { notes: line.notes.trim() } : {}),
      })),
      status: 'received',
      priority: urgent ? 'urgent' : 'normal',
      intakeMethod: 'walk_in',
      createdAt: now,
      dueAt: new Date(new Date(now).getTime() + turnaroundHours * 3_600_000).toISOString(),
      notes: notes.trim(),
      discount: discountAmount,
      deliveryFee: 0,
      events: [{ id: makeId('event'), status: 'received', at: now, byUserId: user.id }],
    };

    let action: AppAction;
    let credentials: CreatedOrderCredentials | null = null;
    if (customerMode === 'new') {
      const trimmedFirstName = firstName.trim();
      const trimmedLastName = lastName.trim();
      const fullName = `${trimmedFirstName} ${trimmedLastName}`;
      const username = trimmedFirstName;
      const password = trimmedLastName.toUpperCase();
      const customerUserId = makeId('user');
      const customer: Customer = {
        id: customerIdForOrder,
        name: fullName,
        phone: phone.trim(),
        email: email.trim(),
        address: address.trim(),
        joinedAt: now,
        branchId,
        loyaltyPoints: 0,
      };
      const customerUser: User = {
        id: customerUserId,
        role: 'customer',
        name: fullName,
        email: email.trim(),
        phone: phone.trim(),
        branchIds: [branchId],
        customerId: customerIdForOrder,
        avatarColor: '#0EA5A4',
        username,
        password,
        verified: false,
        active: true,
      };
      action = { type: 'CREATE_CUSTOMER_AND_ORDER', customer, user: customerUser, order };
      credentials = { orderId, orderNumber: number, customerName: fullName, username, password };
    } else {
      action = { type: 'CREATE_ORDER', order };
    }

    const selectedAdminBranchId = state.activeBranchId;
    setSubmitting(true);
    setError('');
    try {
      const remoteState = await apiAction(action);
      dispatch({
        type: 'HYDRATE',
        state: user.role === 'admin' ? { ...remoteState, activeBranchId: selectedAdminBranchId } : remoteState,
      });
      if (credentials) {
        setCreatedOrder(credentials);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        navigate(`/orders/${orderId}`);
      }
    } catch (reason) {
      setError(actionError(reason));
    } finally {
      setSubmitting(false);
    }
  };

  const copyCredentials = async () => {
    if (!createdOrder) return;
    try {
      await navigator.clipboard.writeText(`Gatsi login\nUsername: ${createdOrder.username}\nPassword: ${createdOrder.password}`);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  if (createdOrder) return <>
    <PageTitle eyebrow="Counter intake" title="Order created" description={`${createdOrder.orderNumber} and the customer's login account were created together.`} actions={<Link to="/orders"><Button variant="secondary"><ArrowLeft /> Back to orders</Button></Link>} />
    <div role="status" aria-live="polite"><Card className="intake-created-card">
      <span className="intake-created-icon"><CheckCircle2 /></span>
      <div className="intake-created-copy">
        <span className="eyebrow">Keep these details safe</span>
        <h2>{createdOrder.customerName}'s account is ready for verification</h2>
        <p>Give these one-time generated login details to the customer securely. They remain visible here until you leave this page.</p>
        <div className="intake-credentials"><KeyRound /><span><small>Username</small><strong>{createdOrder.username}</strong></span><span><small>Password</small><strong>{createdOrder.password}</strong></span></div>
        <p className="intake-verification-note">The customer account must be verified before it can sign in.</p>
        <div className="intake-created-actions">
          <Button type="button" variant="secondary" onClick={() => void copyCredentials()}><Copy /> {copied ? 'Copied' : 'Copy login details'}</Button>
          <Button type="button" onClick={() => navigate(`/orders/${createdOrder.orderId}`)}>Open {createdOrder.orderNumber} <span aria-hidden="true">→</span></Button>
        </div>
      </div>
    </Card></div>
  </>;

  const customerReady = customerMode === 'existing'
    ? Boolean(selectedCustomer)
    : Boolean(firstName.trim() && lastName.trim() && phone.trim());

  return <>
    <PageTitle eyebrow="Counter intake" title="Create a new order" description="Find or create the customer, then add every service item to one branch order." actions={<Link to="/orders"><Button variant="secondary"><ArrowLeft /> Back to orders</Button></Link>} />
    <form className="new-order-layout" onSubmit={(event) => void submit(event)} noValidate>
      <div className="new-order-main">
        <Card className="form-section">
          <div className="form-section-heading"><span><MapPin /></span><div><h2>Branch, customer &amp; assignment</h2><p>Customer search is limited to the selected branch.</p></div></div>
          <div className="form-grid two">
            <FormField label="Processing branch">
              <select required disabled={submitting} value={branchId} onChange={(event) => changeBranch(event.target.value)}>
                <option value="">Choose a branch</option>
                {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </select>
            </FormField>

            {customerMode === 'existing' ? <div
              className="field customer-combobox"
              onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setCustomerSearchOpen(false); }}
            >
              <label htmlFor="customer-search">Customer</label>
              <div className="customer-search-input"><Search /><input
                id="customer-search"
                role="combobox"
                aria-autocomplete="list"
                aria-controls="customer-suggestions"
                aria-expanded={customerSearchOpen}
                autoComplete="off"
                disabled={submitting}
                value={customerSearch}
                onFocus={() => setCustomerSearchOpen(true)}
                onChange={(event) => { setCustomerSearch(event.target.value); setCustomerId(''); setCustomerSearchOpen(true); clearError(); }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setCustomerSearchOpen(false);
                  if (event.key === 'Enter' && customerSearchOpen && matchingCustomers[0]) {
                    event.preventDefault();
                    selectCustomer(matchingCustomers[0]);
                  }
                }}
                placeholder="Search name, phone or email..."
              />{selectedCustomer ? <CheckCircle2 /> : null}</div>
              {customerSearchOpen ? <div className="customer-suggestions" id="customer-suggestions" role="listbox" aria-label="Matching customers">
                {matchingCustomers.map((customer) => <button type="button" role="option" aria-selected={customer.id === customerId} key={customer.id} onClick={() => selectCustomer(customer)}><span>{customer.name.slice(0, 2).toUpperCase()}</span><div><strong>{customer.name}</strong><small>{customer.phone}{customer.email ? ` · ${customer.email}` : ''}</small></div></button>)}
                {!matchingCustomers.length ? <button type="button" onClick={showNewCustomerForm}><span><UserPlus /></span><div><strong>Add a new customer</strong><small>No match at this branch. Enter their details with this order.</small></div></button> : null}
              </div> : null}
              {selectedCustomer ? <small className="selected-customer-note"><UserCheck /> Selected: {selectedCustomer.name} · {selectedCustomer.phone}</small> : <small>Select a matching customer before submitting.</small>}
              <button className="new-customer-link" type="button" disabled={submitting} onClick={showNewCustomerForm}><UserPlus /> Customer not found? Add them with this order</button>
            </div> : <div className="new-customer-mode"><UserPlus /><div><strong>Creating a new customer</strong><small>The customer and order will be saved together.</small></div><button type="button" disabled={submitting} onClick={showExistingCustomerSearch}>Use existing customer</button></div>}

            <FormField
              label="Assigned team member"
              hint={user.role === 'staff'
                ? 'Jobs entered by staff are automatically assigned to their account.'
                : eligibleStaff.length ? 'Optional. Only active, verified staff at this branch are available.' : 'This branch has no active staff; the order can remain unassigned.'}
            >
              {user.role === 'staff'
                ? <div className="self-assignment"><UserCheck /><span><strong>{user.name}</strong><small>{user.jobTitle ?? 'Staff member'} · automatically assigned</small></span></div>
                : <select disabled={submitting} value={assignedStaffId} onChange={(event) => { setAssignedStaffId(event.target.value); clearError(); }}>
                  <option value="">Unassigned</option>
                  {eligibleStaff.map((member) => <option key={member.id} value={member.id}>{member.name} · {member.jobTitle ?? 'Staff'}</option>)}
                </select>}
            </FormField>
          </div>

          {customerMode === 'new' ? <div className="inline-customer-fields">
            <div className="inline-customer-heading"><div><span className="eyebrow">New customer</span><h3>Contact and login details</h3></div><small>Username: first name · Password: last name in capitals</small></div>
            <div className="form-grid two">
              <FormField label="First name"><input required maxLength={64} disabled={submitting} value={firstName} onChange={(event) => { setFirstName(event.target.value); clearError(); }} autoComplete="given-name" /></FormField>
              <FormField label="Last name"><input required maxLength={80} disabled={submitting} value={lastName} onChange={(event) => { setLastName(event.target.value); clearError(); }} autoComplete="family-name" /></FormField>
              <FormField label="Phone"><input required type="tel" maxLength={64} disabled={submitting} value={phone} onChange={(event) => { setPhone(event.target.value); clearError(); }} autoComplete="tel" /></FormField>
              <FormField label="Email (optional)"><input type="email" maxLength={254} disabled={submitting} value={email} onChange={(event) => { setEmail(event.target.value); clearError(); }} autoComplete="email" /></FormField>
              <div className="inline-customer-address"><FormField label="Address (optional)"><input maxLength={300} disabled={submitting} value={address} onChange={(event) => { setAddress(event.target.value); clearError(); }} autoComplete="street-address" /></FormField></div>
            </div>
          </div> : null}
        </Card>

        <Card className="form-section">
          <div className="form-section-heading service-lines-heading"><span><Package2 /></span><div><h2>Service lines</h2><p>Add each garment or product line. Prices come from the service catalogue.</p></div><Button type="button" variant="secondary" disabled={submitting || lines.length >= 100 || !initialServiceId} onClick={addLine}><Plus /> Add line</Button></div>
          <div className="service-line-list">
            {lines.map((line, index) => {
              const calculation = lineCalculations[index];
              const service = calculation.service;
              return <section className="service-line-editor" key={line.id} aria-labelledby={`line-title-${line.id}`}>
                <header><div><span>{index + 1}</span><strong id={`line-title-${line.id}`}>Service line {index + 1}</strong></div><div><b>{money(calculation.amount)}</b><button type="button" aria-label={`Remove service line ${index + 1}`} disabled={submitting || lines.length === 1} onClick={() => removeLine(line.id)}><Trash2 /></button></div></header>
                <div className="form-grid two">
                  <FormField label="Service"><select required disabled={submitting} value={line.serviceId} onChange={(event) => updateLine(line.id, { serviceId: event.target.value })}><option value="">Choose a service</option>{activeServices.map((entry) => <option key={entry.id} value={entry.id}>{entry.name} · {money(entry.price)} / {entry.unit}</option>)}</select></FormField>
                  <FormField label="Description"><input required maxLength={500} disabled={submitting} value={line.description} onChange={(event) => updateLine(line.id, { description: event.target.value })} placeholder="e.g. White shirt with collar stains" /></FormField>
                  <FormField label={`Quantity${service ? ` (${service.unit})` : ''}`}><input required type="number" min="1" max="10000" step="1" disabled={submitting} value={line.quantity} onChange={(event) => updateLine(line.id, { quantity: event.target.value })} /></FormField>
                  <div className="service-line-price"><span>Catalogue price</span><strong>{service ? money(service.price) : '—'} <small>{service ? `per ${service.unit}` : ''}</small></strong><small>{service ? `${service.turnaroundHours} hour turnaround` : 'Choose a service'}</small></div>
                  <div className="service-line-notes"><FormField label="Item notes (optional)" hint="Stains, fabric concerns or instructions for this line only."><textarea maxLength={1000} disabled={submitting} value={line.notes} onChange={(event) => updateLine(line.id, { notes: event.target.value })} placeholder="Notes for this item..." /></FormField></div>
                </div>
              </section>;
            })}
          </div>
          <div className="service-line-footer"><span>{lines.length} of 100 lines</span><Button type="button" variant="secondary" disabled={submitting || lines.length >= 100 || !initialServiceId} onClick={addLine}><Plus /> Add another service</Button></div>
          <FormField label="General order notes" hint="Optional notes that apply to the whole order."><textarea maxLength={2000} disabled={submitting} value={notes} onChange={(event) => { setNotes(event.target.value); clearError(); }} placeholder="Overall care or collection instructions..." /></FormField>
          <label className={`urgent-toggle ${urgent ? 'selected' : ''}`}><input disabled={submitting} type="checkbox" checked={urgent} onChange={(event) => setUrgent(event.target.checked)} /><span><CheckCircle2 /></span><div><strong>Urgent priority</strong><small>Flag this order for expedited branch attention.</small></div></label>
        </Card>
      </div>

      <aside className="order-summary"><Card>
        <span className="eyebrow">Live estimate</span><h2>Order summary</h2>
        <div className="summary-service-list">{lineCalculations.map(({ line, service, quantity, amount }, index) => <div className="summary-service" key={line.id}><Package2 /><div><strong>{service?.name ?? `Line ${index + 1}`}</strong><span>{Number.isInteger(quantity) && quantity > 0 ? quantity : '—'} {service?.unit ?? ''} · {line.description.trim() || 'Description needed'}</span></div><b>{money(amount)}</b></div>)}</div>
        <div className="summary-line"><span>Subtotal</span><strong>{money(subtotal)}</strong></div>
        <FormField label="Discount (USD)"><input disabled={submitting} type="number" min="0" max={subtotal} step="0.01" value={discount} onChange={(event) => { setDiscount(event.target.value); clearError(); }} /></FormField>
        <div className="summary-line"><span>Assigned to</span><strong>{user.role === 'staff' ? user.name : eligibleStaff.find((member) => member.id === assignedStaffId)?.name ?? 'Not assigned'}</strong></div>
        <div className="summary-line"><span>Turnaround</span><strong>{turnaroundHours ? `${turnaroundHours} hours` : 'Choose services'}</strong></div>
        <div className="summary-line"><span>Expected due</span><strong>{turnaroundHours ? new Date(dueAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—'}</strong></div>
        <div className="summary-total"><span>Estimated amount due</span><strong>{money(total)}</strong></div>
        {error ? <span className="intake-error" role="alert">{error}</span> : null}
        {!activeServices.length ? <span className="intake-error" role="alert">No active services are available. Ask an administrator to add or restore a service.</span> : null}
        <Button disabled={submitting || !branchId || !customerReady || !activeServices.length || !lines.length} type="submit" className="full-width">{submitting ? 'Creating order...' : customerMode === 'new' ? 'Create customer & order' : 'Create order'} <span aria-hidden="true">→</span></Button>
      </Card></aside>
    </form>
  </>;
}
