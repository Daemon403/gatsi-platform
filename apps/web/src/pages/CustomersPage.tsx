import { makeId, money, orderTotal, type AppAction, type CustomerMeasurements } from '@gatsi/domain';
import { CheckCircle2, KeyRound, Mail, Phone, Plus, Ruler, Search, Star, UserPlus } from 'lucide-react';
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

const measurementFields = ['height', 'neck', 'chest', 'waist', 'hips', 'shoulder', 'sleeve', 'inseam'];

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function CustomersPage() {
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

  const branchId = state.activeBranchId === 'all' ? state.branches[0].id : state.activeBranchId;
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

    const customerId = makeId('customer');
    const userId = makeId('user');
    const username = firstName.trim();
    const password = lastName.trim().toUpperCase();
    const values = Object.fromEntries(
      Object.entries(measurements)
        .filter(([, value]) => value !== '')
        .map(([key, value]) => [key, Number(value)]),
    );
    const action: AppAction = {
      type: 'CREATE_CUSTOMER',
      customer: {
        id: customerId,
        name: `${firstName.trim()} ${lastName.trim()}`,
        phone,
        email,
        address,
        joinedAt: new Date().toISOString(),
        branchId,
        loyaltyPoints: 0,
        measurements: { unit, ...values },
      },
      user: {
        id: userId,
        role: 'customer',
        name: `${firstName.trim()} ${lastName.trim()}`,
        email,
        phone,
        branchIds: [branchId],
        customerId,
        avatarColor: '#0EA5A4',
        username,
        password,
        verified: false,
        active: true,
      },
    };

    setSaving(true);
    setFormError('');
    try {
      const remoteState = await apiAction(action);
      dispatch({ type: 'HYDRATE', state: remoteState });
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

    setVerifying(true);
    setVerificationError('');
    try {
      const remoteState = await apiVerifyCustomer(credentials.userId);
      dispatch({ type: 'HYDRATE', state: remoteState });
      setCredentials((current) => current ? { ...current, verified: true } : current);
    } catch (error) {
      setVerificationError(errorMessage(error, 'The customer account could not be verified.'));
    } finally {
      setVerifying(false);
    }
  };

  return <>
    <PageTitle
      eyebrow="CRM"
      title="Customers"
      description="Order history, measurements, loyalty and lifetime value across every branch."
      actions={<Button onClick={() => {
        setAdding(!adding);
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
        <FormField label="First name"><input required disabled={saving} value={firstName} onChange={(event) => setFirstName(event.target.value)} /></FormField>
        <FormField label="Last name"><input required disabled={saving} value={lastName} onChange={(event) => setLastName(event.target.value)} /></FormField>
        <FormField label="Phone"><input required disabled={saving} value={phone} onChange={(event) => setPhone(event.target.value)} /></FormField>
        <FormField label="Email"><input type="email" disabled={saving} value={email} onChange={(event) => setEmail(event.target.value)} /></FormField>
        <FormField label="Address"><input disabled={saving} value={address} onChange={(event) => setAddress(event.target.value)} /></FormField>
        <FormField label="Measurement unit"><select disabled={saving} value={unit} onChange={(event) => setUnit(event.target.value as CustomerMeasurements['unit'])}><option value="cm">Centimetres (cm)</option><option value="in">Inches (in)</option></select></FormField>
        <div className="measurement-section">
          <div className="measurement-heading"><Ruler /><div><strong>Measurements</strong><small>Optional — add what is available</small></div></div>
          <div className="measurement-grid">{measurementFields.map((field) => <FormField key={field} label={`${field[0].toUpperCase()}${field.slice(1)} (${unit})`}><input type="number" min="0" step="0.1" disabled={saving} value={measurements[field] ?? ''} onChange={(event) => setMeasurement(field, event.target.value)} /></FormField>)}</div>
        </div>
        {formError ? <span className="login-error" role="alert">{formError}</span> : null}
        <div className="form-actions">
          <Button type="button" variant="secondary" disabled={saving} onClick={() => { setAdding(false); setFormError(''); }}>Cancel</Button>
          <Button type="submit" disabled={saving}><UserPlus /> {saving ? 'Saving…' : 'Save customer'}</Button>
        </div>
      </form>
    </Card> : null}

    <div className="toolbar"><label className="search-box"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, phone or email..." /></label></div>
    <div className="customer-grid">{customers.map((customer) => {
      const orders = state.orders.filter((order) => order.customerId === customer.id);
      const spend = orders.reduce((sum, order) => sum + orderTotal(order), 0);
      const recorded = customer.measurements ? Object.entries(customer.measurements).filter(([key, value]) => key !== 'unit' && value != null) : [];
      return <Card className="customer-tile" key={customer.id}>
        <div className="customer-card-head"><span>{customer.name.slice(0, 2).toUpperCase()}</span><div><strong>{customer.name}</strong><small>Customer since {new Date(customer.joinedAt).toLocaleDateString([], { month: 'short', year: 'numeric' })}</small></div><i><Star /></i></div>
        <div className="contact-line"><Phone /> {customer.phone}</div>
        <div className="contact-line"><Mail /> {customer.email || 'No email recorded'}</div>
        {recorded.length ? <div className="measurement-summary"><Ruler /> {recorded.map(([key, value]) => `${key} ${value}${customer.measurements?.unit}`).join(' · ')}</div> : null}
        <div className="customer-card-stats"><span><b>{orders.length}</b><small>Orders</small></span><span><b>{money(spend)}</b><small>Lifetime value</small></span><span><b>{customer.loyaltyPoints}</b><small>Points</small></span></div>
      </Card>;
    })}</div>
  </>;
}
