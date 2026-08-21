import { getActiveUser, makeId, type PickupRequest } from '@gatsi/domain';
import { CheckCircle2, Clock3, MapPin, PackageCheck, Truck } from 'lucide-react';
import { useState } from 'react';
import { Button, Card, FormField, PageTitle } from '../components/ui';
import { useAppStore } from '../store/AppStore';

export function PickupPage() {
  const { state, dispatch } = useAppStore();
  const user = getActiveUser(state)!;
  const customer = state.customers.find((item) => item.id === user.customerId)!;
  const [branchId, setBranchId] = useState(user.branchIds[0] ?? state.branches[0].id);
  const [address, setAddress] = useState(customer.address);
  const [date, setDate] = useState(new Date(Date.now() + 86400000).toISOString().slice(0, 10));
  const [time, setTime] = useState('09:00');
  const [instructions, setInstructions] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const submit = (event: React.FormEvent) => { event.preventDefault(); const request: PickupRequest = { id: makeId('pickup'), customerId: customer.id, branchId, address, preferredAt: new Date(`${date}T${time}:00`).toISOString(), instructions, status: 'requested', createdAt: new Date().toISOString() }; dispatch({ type: 'CREATE_PICKUP', request }); setSubmitted(true); };
  const requests = state.pickupRequests.filter((item) => item.customerId === customer.id);
  return <><PageTitle eyebrow="Door-to-door service" title="Book a pickup" description="Choose your nearest branch and a convenient collection time." /><div className="pickup-layout"><div><section className="pickup-hero"><span><Truck /></span><div><h2>We collect. We care. We return.</h2><p>Your branch will confirm the collection window after the request is submitted.</p></div></section>{submitted ? <Card className="success-card"><span><CheckCircle2 /></span><div><h2>Pickup requested</h2><p>We have saved your request. The selected branch will contact you to confirm the time.</p><Button onClick={() => setSubmitted(false)}>Book another pickup</Button></div></Card> : <Card className="pickup-form-card"><form onSubmit={submit}><FormField label="Nearest branch"><select value={branchId} onChange={(event) => setBranchId(event.target.value)}>{state.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name} · {branch.address}</option>)}</select></FormField><FormField label="Pickup address"><textarea required value={address} onChange={(event) => setAddress(event.target.value)} /></FormField><div className="form-grid two"><FormField label="Preferred date"><input required type="date" min={new Date().toISOString().slice(0, 10)} value={date} onChange={(event) => setDate(event.target.value)} /></FormField><FormField label="Preferred time"><input required type="time" value={time} onChange={(event) => setTime(event.target.value)} /></FormField></div><FormField label="Collection instructions" hint="Optional"><textarea value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder="Gate access, garment estimate or contact preference..." /></FormField><div className="pickup-note"><PackageCheck /> A standard collection fee may be added after branch confirmation.</div><Button type="submit" className="full-width"><Truck /> Request pickup</Button></form></Card>}</div><aside><Card className="request-list"><span className="eyebrow">History</span><h2>Your pickup requests</h2>{requests.length ? requests.map((request) => { const branch = state.branches.find((item) => item.id === request.branchId); return <div className="request-row" key={request.id}><span className={`request-status ${request.status}`}><Truck /></span><div><strong>{request.status.replaceAll('_', ' ')}</strong><small><MapPin /> {branch?.shortName}</small><small><Clock3 /> {new Date(request.preferredAt).toLocaleString()}</small></div></div>; }) : <p className="muted">No previous pickup requests.</p>}</Card></aside></div></>;
}
