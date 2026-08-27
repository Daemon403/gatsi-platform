import { getActiveUser, makeId, money, orderTotal, type AppAction, type AppState, type Customer, type CustomerMeasurements } from '@gatsi/domain';
import { CheckCircle2, KeyRound, Mail, Pencil, Phone, Plus, Ruler, Search, Star, UserPlus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button, Card, FormField, PageTitle } from '../components/ui';
import { useAppStore } from '../store/AppStore';
import { apiAction, apiVerifyCustomer } from '../store/api';

type CreatedCredentials = {
  userId: string;
  username: string;
  password: string;
  verified: boolean;
};

type CustomerEditDraft = {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  branchId: string;
  loyaltyPoints: string;
  unit: CustomerMeasurements['unit'];
  measurements: Record<string, string>;
};

const measurementFields = ['height', 'neck', 'chest', 'waist', 'hips', 'shoulder', 'sleeve', 'inseam'] as const;

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function preserveAdminBranch(remoteState: AppState, activeBranchId: string): AppState {
  return { ...remoteState, activeBranchId };
}

function customerToDraft(customer: Customer): CustomerEditDraft {
  const measurements = Object.fromEntries(measurementFields.map((field) => [field, customer.measurements?.[field]?.toString() ?? '']));
  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    email: customer.email,
    address: customer.address,
    branchId: customer.branchId,
    loyaltyPoints: customer.loyaltyPoints.toString(),
    unit: customer.measurements?.unit ?? 'cm',
    measurements,
  };
}

export function CustomersPage() {
  const { state } = useAppStore();
  if (getActiveUser(state)?.role !== 'admin') return null;
  return <AdminCustomersPage />;
}

function AdminCustomersPage() {
  const { state, dispatch } = useAppStore();
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [unit, setUnit] = useState<CustomerMeasurements['unit']>('cm');
  const [measurements, setMeasurements] = useState<Record<string, string>>({});
  const [credentials, setCredentials] = useState<CreatedCredentials | null>(null);
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [formError, setFormError] = useState('');
  const [verificationError, setVerificationError] = useState('');
  const [editDraft, setEditDraft] = useState<CustomerEditDraft | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  const activeBranches = state.branches.filter((branch) => branch.active);
  const branchId = state.activeBranchId !== 'all' && activeBranches.some((branch) => branch.id === state.activeBranchId)
    ? state.activeBranchId
    : activeBranches[0]?.id ?? '';
  const customers = useMemo(
    () => state.customers.filter((customer) => (
      state.activeBranchId === 'all' || customer.branchId === state.activeBranchId
    ) && `${customer.name} ${customer.phone} ${customer.email}`.toLowerCase().includes(query.toLowerCase())),
    [state, query],
  );

  const setMeasurement = (key: string, value: string) => {
    setMeasurements((current) => ({ ...current, [key]: value }));
  };

  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (![firstName, lastName, phone].every((value) => value.trim()) || !branchId) {
      setFormError('First name, last name, phone and an active branch are required.');
      return;
    }

    const customerId = makeId('customer');
    const userId = makeId('user');
    const username = firstName.trim();
    const password = lastName.trim().toUpperCase();
    const values = Object.fromEntries(
      Object.entries(measurements)
        .filter(([, value]) => value !== '')
        .map(([key, value]) => [key, Number(value)]),
    );
    if (Object.values(values).some((value) => !Number.isFinite(value) || value <= 0 || value > 1000)) {
      setFormError('Measurements must be valid numbers greater than zero and no more than 1,000.');
      return;
    }
    const fullName = `${firstName.trim()} ${lastName.trim()}`;
    const action: AppAction = {
      type: 'CREATE_CUSTOMER',
      customer: {
        id: customerId,
        name: fullName,
        phone: phone.trim(),
        email: email.trim(),
        address: address.trim(),
        joinedAt: new Date().toISOString(),
        branchId,
        loyaltyPoints: 0,
        measurements: { unit, ...values },
      },
      user: {
        id: userId,
        role: 'customer',
        name: fullName,
        email: email.trim(),
        phone: phone.trim(),
        branchIds: [branchId],
        customerId,
        avatarColor: '#0EA5A4',
        username,
        password,
        verified: false,
        active: true,
      },
    };

    const selectedAdminBranchId = state.activeBranchId;
    setSaving(true);
    setFormError('');
    try {
      const remoteState = await apiAction(action);
      dispatch({ type: 'HYDRATE', state: preserveAdminBranch(remoteState, selectedAdminBranchId) });
      setCredentials({ userId, username, password, verified: false });
      setAdding(false);
      setFirstName('');
      setLastName('');
      setPhone('');
      setEmail('');
      setAddress('');
      setMeasurements({});
    } catch (error) {
      setFormError(errorMessage(error, 'The customer could not be created.'));
    } finally {
      setSaving(false);
    }
  };

  const verifyCustomer = async () => {
    if (!credentials || credentials.verified || verifying) return;

    const selectedAdminBranchId = state.activeBranchId;
    setVerifying(true);
    setVerificationError('');
    try {
      const remoteState = await apiVerifyCustomer(credentials.userId);
      dispatch({ type: 'HYDRATE', state: preserveAdminBranch(remoteState, selectedAdminBranchId) });
      setCredentials((current) => current ? { ...current, verified: true } : current);
    } catch (error) {
      setVerificationError(errorMessage(error, 'The customer account could not be verified.'));
    } finally {
      setVerifying(false);
    }
  };

  const beginEdit = (customer: Customer) => {
    setAdding(false);
    setCredentials(null);
    setEditDraft(customerToDraft(customer));
    setEditError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const updateEditDraft = <Key extends keyof CustomerEditDraft>(key: Key, value: CustomerEditDraft[Key]) => {
    setEditDraft((current) => current ? { ...current, [key]: value } : current);
    setEditError('');
  };

  const updateEditMeasurement = (key: string, value: string) => {
    setEditDraft((current) => current ? { ...current, measurements: { ...current.measurements, [key]: value } } : current);
    setEditError('');
  };

  const saveCustomer = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editDraft || editSaving) return;

    const name = editDraft.name.trim();
    const nextPhone = editDraft.phone.trim();
    const nextEmail = editDraft.email.trim();
    const nextAddress = editDraft.address.trim();
    if (!name || !nextPhone || !nextAddress || !editDraft.branchId) {
      setEditError('Name, phone, address and branch are required.');
      return;
    }
    if (!state.branches.some((branch) => branch.id === editDraft.branchId)) {
      setEditError('Choose a valid branch.');
      return;
    }
    const loyaltyPoints = Number(editDraft.loyaltyPoints);
    if (!Number.isInteger(loyaltyPoints) || loyaltyPoints < 0 || loyaltyPoints > 1_000_000_000) {
      setEditError('Loyalty points must be a whole number between zero and 1,000,000,000.');
      return;
    }
    const measurementValues: Record<string, number> = {};
    for (const field of measurementFields) {
      const value = editDraft.measurements[field]?.trim() ?? '';
      if (!value) continue;
      const numericValue = Number(value);
      if (!Number.isFinite(numericValue) || numericValue <= 0 || numericValue > 1000) {
        setEditError(`${field[0].toUpperCase()}${field.slice(1)} must be greater than zero and no more than 1,000.`);
        return;
      }
      measurementValues[field] = numericValue;
    }

    const updates = {
      name,
      phone: nextPhone,
      email: nextEmail,
      address: nextAddress,
      branchId: editDraft.branchId,
      loyaltyPoints,
      measurements: { unit: editDraft.unit, ...measurementValues },
    };
    const selectedAdminBranchId = state.activeBranchId;
    const action: AppAction = { type: 'UPDATE_CUSTOMER', customerId: editDraft.id, updates };
    setEditSaving(true);
    setEditError('');
    try {
      const remoteState = await apiAction(action);
      dispatch({ type: 'HYDRATE', state: preserveAdminBranch(remoteState, selectedAdminBranchId) });
      setEditDraft(null);
    } catch (error) {
      setEditError(errorMessage(error, 'The customer could not be updated.'));
    } finally {
      setEditSaving(false);
    }
  };

  return <>
    <PageTitle
      eyebrow="CRM"
      title="Customers"
      description="Order history, measurements, loyalty and lifetime value across every branch."
      actions={<Button onClick={() => {
        const nextAdding = !adding;
        setAdding(nextAdding);
        setEditDraft(null);
        setCredentials(null);
        setFormError('');
        setVerificationError('');
      }}><Plus /> Add customer</Button>}
    />

    {credentials ? <Card className="credential-notice">
      {credentials.verified ? <CheckCircle2 /> : <KeyRound />}
      <div>
        <strong>{credentials.verified ? 'Customer account verified' : 'Customer login created — verification pending'}</strong>
        <span>Username: <b>{credentials.username}</b> · Password: <b>{credentials.password}</b></span>
        <span>{credentials.verified ? 'The customer can now sign in.' : 'Verify this account before giving the customer access.'}</span>
        {verificationError ? <span className="login-error" role="alert">{verificationError}</span> : null}
      </div>
      {!credentials.verified ? <Button
        type="button"
        disabled={verifying}
        onClick={() => void verifyCustomer()}
        style={{ fontSize: '9px', padding: '8px 12px', background: 'var(--green)', color: 'white' }}
      >{verifying ? 'Verifying…' : 'Verify account'}</Button> : null}
      <button type="button" onClick={() => setCredentials(null)} aria-label="Dismiss">×</button>
    </Card> : null}

    {adding ? <Card className="inline-form">
      <div className="card-heading"><div><span className="eyebrow">New record</span><h2>Onboard a customer</h2></div></div>
      <form onSubmit={(event) => void add(event)} className="form-grid two" aria-busy={saving}>
        <FormField label="First name"><input required maxLength={100} disabled={saving} value={firstName} onChange={(event) => { setFirstName(event.target.value); setFormError(''); }} /></FormField>
        <FormField label="Last name"><input required maxLength={100} disabled={saving} value={lastName} onChange={(event) => { setLastName(event.target.value); setFormError(''); }} /></FormField>
        <FormField label="Phone"><input required type="tel" maxLength={64} disabled={saving} value={phone} onChange={(event) => { setPhone(event.target.value); setFormError(''); }} /></FormField>
        <FormField label="Email"><input type="email" maxLength={254} disabled={saving} value={email} onChange={(event) => { setEmail(event.target.value); setFormError(''); }} /></FormField>
        <FormField label="Address"><input maxLength={500} disabled={saving} value={address} onChange={(event) => setAddress(event.target.value)} /></FormField>
        <FormField label="Measurement unit"><select disabled={saving} value={unit} onChange={(event) => setUnit(event.target.value as CustomerMeasurements['unit'])}><option value="cm">Centimetres (cm)</option><option value="in">Inches (in)</option></select></FormField>
        <div className="measurement-section">
          <div className="measurement-heading"><Ruler /><div><strong>Measurements</strong><small>Optional — add what is available</small></div></div>
          <div className="measurement-grid">{measurementFields.map((field) => <FormField key={field} label={`${field[0].toUpperCase()}${field.slice(1)} (${unit})`}><input type="number" min="0.1" max="1000" step="0.1" disabled={saving} value={measurements[field] ?? ''} onChange={(event) => setMeasurement(field, event.target.value)} /></FormField>)}</div>
        </div>
        {formError ? <span className="login-error admin-form-error" role="alert">{formError}</span> : null}
        <div className="form-actions"><Button type="button" variant="secondary" disabled={saving} onClick={() => { setAdding(false); setFormError(''); }}>Cancel</Button><Button type="submit" disabled={saving || !branchId}><UserPlus /> {saving ? 'Saving…' : 'Save customer'}</Button></div>
      </form>
    </Card> : null}

    {editDraft ? <Card className="inline-form admin-edit-form">
      <div className="card-heading"><div><span className="eyebrow">Customer profile</span><h2>Edit {editDraft.name}</h2></div></div>
      <form onSubmit={(event) => void saveCustomer(event)} className="form-grid two" aria-busy={editSaving}>
        <FormField label="Full name"><input required maxLength={200} disabled={editSaving} value={editDraft.name} onChange={(event) => updateEditDraft('name', event.target.value)} /></FormField>
        <FormField label="Phone"><input required type="tel" maxLength={64} disabled={editSaving} value={editDraft.phone} onChange={(event) => updateEditDraft('phone', event.target.value)} /></FormField>
        <FormField label="Email"><input type="email" maxLength={254} disabled={editSaving} value={editDraft.email} onChange={(event) => updateEditDraft('email', event.target.value)} /></FormField>
        <FormField label="Address"><input required maxLength={500} disabled={editSaving} value={editDraft.address} onChange={(event) => updateEditDraft('address', event.target.value)} /></FormField>
        <FormField label="Home branch"><select required disabled={editSaving} value={editDraft.branchId} onChange={(event) => updateEditDraft('branchId', event.target.value)}><option value="">Choose a branch</option>{state.branches.filter((branch) => branch.active || branch.id === editDraft.branchId).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}{branch.active ? '' : ' (inactive)'}</option>)}</select></FormField>
        <FormField label="Loyalty points"><input required type="number" min="0" max="1000000000" step="1" disabled={editSaving} value={editDraft.loyaltyPoints} onChange={(event) => updateEditDraft('loyaltyPoints', event.target.value)} /></FormField>
        <div className="measurement-section">
          <div className="measurement-heading"><Ruler /><div><strong>Measurements</strong><small>Clear a measurement to remove it from the profile.</small></div></div>
          <FormField label="Measurement unit"><select disabled={editSaving} value={editDraft.unit} onChange={(event) => updateEditDraft('unit', event.target.value as CustomerMeasurements['unit'])}><option value="cm">Centimetres (cm)</option><option value="in">Inches (in)</option></select></FormField>
          <div className="measurement-grid customer-edit-measurements">{measurementFields.map((field) => <FormField key={field} label={`${field[0].toUpperCase()}${field.slice(1)} (${editDraft.unit})`}><input type="number" min="0.1" max="1000" step="0.1" disabled={editSaving} value={editDraft.measurements[field] ?? ''} onChange={(event) => updateEditMeasurement(field, event.target.value)} /></FormField>)}</div>
        </div>
        {editError ? <span className="login-error admin-form-error" role="alert">{editError}</span> : null}
        <div className="form-actions"><Button type="button" variant="secondary" disabled={editSaving} onClick={() => { setEditDraft(null); setEditError(''); }}>Cancel</Button><Button type="submit" disabled={editSaving}>{editSaving ? 'Saving…' : 'Save customer'}</Button></div>
      </form>
    </Card> : null}

    <div className="toolbar"><label className="search-box"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, phone or email..." /></label></div>
    <div className="customer-grid">{customers.map((customer) => {
      const orders = state.orders.filter((order) => order.customerId === customer.id);
      const spend = orders.reduce((sum, order) => sum + orderTotal(order), 0);
      const recorded = customer.measurements ? Object.entries(customer.measurements).filter(([key, value]) => key !== 'unit' && value != null) : [];
      const branch = state.branches.find((item) => item.id === customer.branchId);
      return <Card className="customer-tile" key={customer.id}>
        <div className="customer-card-head"><span>{customer.name.slice(0, 2).toUpperCase()}</span><div><strong>{customer.name}</strong><small>Customer since {new Date(customer.joinedAt).toLocaleDateString([], { month: 'short', year: 'numeric' })}</small></div><i><Star /></i></div>
        <div className="contact-line"><Phone /> {customer.phone}</div>
        <div className="contact-line"><Mail /> {customer.email || 'No email recorded'}</div>
        <div className="contact-line"><span className="customer-branch-dot" /> {branch?.shortName ?? 'No branch assigned'}</div>
        {recorded.length ? <div className="measurement-summary"><Ruler /> {recorded.map(([key, value]) => `${key} ${value}${customer.measurements?.unit}`).join(' · ')}</div> : null}
        <div className="customer-card-stats"><span><b>{orders.length}</b><small>Orders</small></span><span><b>{money(spend)}</b><small>Lifetime value</small></span><span><b>{customer.loyaltyPoints}</b><small>Points</small></span></div>
        <div className="record-actions customer-edit-action"><Button variant="secondary" onClick={() => beginEdit(customer)}><Pencil /> Edit customer</Button></div>
      </Card>;
    })}</div>
  </>;
}
