import { getActiveUser, makeId, money, type AppAction, type Service } from '@gatsi/domain';
import { ArrowRight, CheckCircle2, CircleOff, Clock3, Droplets, Pencil, Plus, RotateCcw, Scissors, Shirt, Sparkles, Trash2, Truck } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, Empty, FormField, PageTitle } from '../components/ui';
import { useAppStore } from '../store/AppStore';
import { apiAction } from '../store/api';

type ServiceDraft = Pick<Service, 'name' | 'category' | 'unit' | 'price' | 'turnaroundHours' | 'description' | 'active'>;

const icons = { laundry: <Droplets />, dry_cleaning: <Shirt />, textile: <Scissors />, speciality: <Sparkles /> };

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function toDraft(service: Service): ServiceDraft {
  return {
    name: service.name,
    category: service.category,
    unit: service.unit,
    price: service.price,
    turnaroundHours: service.turnaroundHours,
    description: service.description,
    active: service.active,
  };
}

function newServiceDraft(): ServiceDraft {
  return {
    name: '',
    category: 'laundry',
    unit: 'item',
    price: 0,
    turnaroundHours: 24,
    description: '',
    active: true,
  };
}

export function ServicesPage() {
  const { state, dispatch } = useAppStore();
  const user = getActiveUser(state)!;
  const isAdmin = user.role === 'admin';
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ServiceDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [busyServiceId, setBusyServiceId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const isCreating = draft !== null && editingServiceId === null;
  const services = isAdmin ? state.services : state.services.filter((service) => service.active);

  const beginCreate = () => {
    if (!isAdmin) return;
    setEditingServiceId(null);
    setDraft(newServiceDraft());
    setFormError('');
    setActionError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const beginEdit = (service: Service) => {
    if (!isAdmin) return;
    setEditingServiceId(service.id);
    setDraft(toDraft(service));
    setFormError('');
    setActionError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEdit = () => {
    if (saving) return;
    setEditingServiceId(null);
    setDraft(null);
    setFormError('');
  };

  const updateDraft = <Key extends keyof ServiceDraft>(key: Key, value: ServiceDraft[Key]) => {
    setDraft((current) => current ? { ...current, [key]: value } : current);
    setFormError('');
  };

  const saveService = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isAdmin || !draft || saving) return;

    const updates: ServiceDraft = {
      ...draft,
      name: draft.name.trim(),
      description: draft.description.trim(),
      price: Number(draft.price),
      turnaroundHours: Number(draft.turnaroundHours),
    };
    if (!updates.name || !updates.description) {
      setFormError('Service name and description are required.');
      return;
    }
    if (!Number.isFinite(updates.price) || updates.price < 0 || updates.price > 1_000_000) {
      setFormError('Price must be a valid amount between zero and 1,000,000.');
      return;
    }
    if (!Number.isInteger(updates.turnaroundHours) || updates.turnaroundHours < 1 || updates.turnaroundHours > 8_760) {
      setFormError('Turnaround must be between 1 and 8,760 whole hours.');
      return;
    }

    const selectedAdminBranchId = state.activeBranchId;
    const action: AppAction = editingServiceId
      ? { type: 'UPDATE_SERVICE', serviceId: editingServiceId, updates }
      : { type: 'CREATE_SERVICE', service: { id: makeId('service'), ...updates } };
    setSaving(true);
    setFormError('');
    try {
      const remoteState = await apiAction(action);
      dispatch({ type: 'HYDRATE', state: { ...remoteState, activeBranchId: selectedAdminBranchId } });
      setEditingServiceId(null);
      setDraft(null);
    } catch (error) {
      setFormError(errorMessage(error, 'The service could not be updated.'));
    } finally {
      setSaving(false);
    }
  };

  const setServiceActive = async (service: Service, active: boolean) => {
    if (!isAdmin || busyServiceId || saving || service.active === active) return;
    if (!active && !window.confirm(`Remove ${service.name}? Existing orders will keep their service details and it can be restored later.`)) return;

    const selectedAdminBranchId = state.activeBranchId;
    setBusyServiceId(service.id);
    setActionError('');
    try {
      const action: AppAction = { type: 'UPDATE_SERVICE', serviceId: service.id, updates: { ...toDraft(service), active } };
      const remoteState = await apiAction(action);
      dispatch({ type: 'HYDRATE', state: { ...remoteState, activeBranchId: selectedAdminBranchId } });
      if (editingServiceId === service.id) {
        setEditingServiceId(null);
        setDraft(null);
        setFormError('');
      }
    } catch (error) {
      setActionError(errorMessage(error, `The service could not be ${active ? 'restored' : 'removed'}.`));
    } finally {
      setBusyServiceId(null);
    }
  };

  return <>
    <PageTitle
      eyebrow="Service catalogue"
      title="Garment care menu"
      description={isAdmin ? 'Manage service availability, pricing and expected turnaround times.' : 'Clear service pricing and expected turnaround times.'}
      actions={user.role === 'customer' ? <Link to="/pickup"><Button><Truck /> Book pickup</Button></Link> : <>{isAdmin ? <Button disabled={saving || Boolean(busyServiceId)} onClick={beginCreate}><Plus /> Add service</Button> : null}<Link to="/orders/new"><Button variant={isAdmin ? 'secondary' : 'primary'}>New order <ArrowRight /></Button></Link></>}
    />
    <section className="service-banner"><div><span>Professional textile care</span><h2>Cleaned with precision.<br />Finished with care.</h2><p>Every order is tagged, assigned and visible from intake to collection.</p></div><span className="service-banner-icon"><Shirt /></span></section>

    {isAdmin && draft ? <Card className="inline-form admin-edit-form">
      <div className="card-heading"><div><span className="eyebrow">Catalogue settings</span><h2>{isCreating ? 'Add a service' : `Edit ${draft.name}`}</h2></div></div>
      <form className="form-grid two" onSubmit={(event) => void saveService(event)} aria-busy={saving}>
        <FormField label="Service name"><input required maxLength={160} disabled={saving} value={draft.name} onChange={(event) => updateDraft('name', event.target.value)} /></FormField>
        <FormField label="Category"><select required disabled={saving} value={draft.category} onChange={(event) => updateDraft('category', event.target.value as Service['category'])}><option value="laundry">Laundry</option><option value="dry_cleaning">Dry cleaning</option><option value="textile">Textile</option><option value="speciality">Speciality</option></select></FormField>
        <FormField label="Charging unit"><select required disabled={saving} value={draft.unit} onChange={(event) => updateDraft('unit', event.target.value as Service['unit'])}><option value="item">Item</option><option value="kg">Kilogram</option><option value="pair">Pair</option><option value="set">Set</option><option value="metre">Metre</option></select></FormField>
        <FormField label="Price (USD)"><input required type="number" min="0" max="1000000" step="0.01" disabled={saving} value={draft.price} onChange={(event) => updateDraft('price', Number(event.target.value))} /></FormField>
        <FormField label="Turnaround (hours)"><input required type="number" min="1" max="8760" step="1" disabled={saving} value={draft.turnaroundHours} onChange={(event) => updateDraft('turnaroundHours', Number(event.target.value))} /></FormField>
        <div className={`admin-active-toggle admin-created-active ${draft.active ? 'selected' : ''}`}><span>{draft.active ? <CheckCircle2 /> : <CircleOff />}</span><div><strong>{isCreating ? 'Available immediately' : draft.active ? 'Currently available' : 'Currently removed'}</strong><small>{isCreating ? 'New services can be selected as soon as they are added.' : 'Use the Remove or Restore action on the service card to change availability.'}</small></div></div>
        <div className="admin-form-wide"><FormField label="Description"><textarea required maxLength={1000} disabled={saving} value={draft.description} onChange={(event) => updateDraft('description', event.target.value)} /></FormField></div>
        {formError ? <span className="login-error admin-form-error" role="alert">{formError}</span> : null}
        <div className="form-actions"><Button type="button" variant="secondary" disabled={saving} onClick={cancelEdit}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? 'Saving…' : isCreating ? 'Add service' : 'Save service'}</Button></div>
      </form>
    </Card> : null}

    {actionError ? <div className="management-error" role="alert">{actionError}</div> : null}

    {!services.length && !draft ? <Card><Empty title="No services yet" body={isAdmin ? 'Add the first service to build the catalogue used for order intake.' : 'No active services are currently available.'} /></Card> : null}

    <div className="services-grid">{services.map((service) => <Card className={`service-tile ${service.active ? '' : 'record-inactive'}`} key={service.id}>
      <span>{icons[service.category]}</span><small>{service.category.replaceAll('_', ' ')}</small><h3>{service.name}</h3><p>{service.description}</p>
      <div className="service-price"><strong>{money(service.price)} <small>/ {service.unit}</small></strong><em><Clock3 /> {service.turnaroundHours}h</em></div>
      {isAdmin ? <div className="record-actions service-actions"><span className={`availability-label ${service.active ? '' : 'inactive'}`}>{service.active ? 'Available' : 'Unavailable'}</span><Button variant="secondary" disabled={Boolean(busyServiceId) || saving} onClick={() => beginEdit(service)}><Pencil /> Edit</Button>{service.active ? <Button variant="danger" disabled={Boolean(busyServiceId) || saving} onClick={() => void setServiceActive(service, false)}><Trash2 /> {busyServiceId === service.id ? 'Removing…' : 'Remove'}</Button> : <Button variant="ghost" disabled={Boolean(busyServiceId) || saving} onClick={() => void setServiceActive(service, true)}><RotateCcw /> {busyServiceId === service.id ? 'Restoring…' : 'Restore'}</Button>}</div> : null}
    </Card>)}</div>
  </>;
}
