import { branchRevenue, getActiveUser, makeId, money, orderBalance, type AppAction, type Branch } from '@gatsi/domain';
import { Building2, CheckCircle2, CircleOff, DollarSign, MapPin, Package2, Pencil, Phone, Plus, RotateCcw, Trash2, UsersRound } from 'lucide-react';
import { useState } from 'react';
import { Button, Card, FormField, PageTitle } from '../components/ui';
import { useAppStore } from '../store/AppStore';
import { apiAction } from '../store/api';

type BranchDraft = Pick<Branch, 'name' | 'shortName' | 'address' | 'phone' | 'managerId' | 'active'>;

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function toDraft(branch: Branch): BranchDraft {
  return {
    name: branch.name,
    shortName: branch.shortName,
    address: branch.address,
    phone: branch.phone,
    managerId: branch.managerId,
    active: branch.active,
  };
}

function newBranchDraft(managerId: string): BranchDraft {
  return {
    name: '',
    shortName: '',
    address: '',
    phone: '',
    managerId,
    active: true,
  };
}

export function BranchesPage() {
  const { state } = useAppStore();
  const currentUser = getActiveUser(state);

  if (currentUser?.role !== 'admin') return null;
  return <AdminBranchesPage />;
}

function AdminBranchesPage() {
  const { state, dispatch } = useAppStore();
  const currentUser = getActiveUser(state)!;
  const [editingBranchId, setEditingBranchId] = useState<string | null>(null);
  const [draft, setDraft] = useState<BranchDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [busyBranchId, setBusyBranchId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const isCreating = draft !== null && editingBranchId === null;
  const managers = state.users.filter((user) => user.active !== false && (
    (user.role === 'admin' && user.verified === true)
    || (user.role === 'staff' && user.verified === true && Boolean(editingBranchId && user.branchIds.includes(editingBranchId)))
  ));

  const beginCreate = () => {
    const initialManagerId = managers.find((manager) => manager.id === currentUser.id)?.id ?? managers[0]?.id ?? '';
    setEditingBranchId(null);
    setDraft(newBranchDraft(initialManagerId));
    setFormError('');
    setActionError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const beginEdit = (branch: Branch) => {
    setEditingBranchId(branch.id);
    setDraft(toDraft(branch));
    setFormError('');
    setActionError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEdit = () => {
    if (saving) return;
    setEditingBranchId(null);
    setDraft(null);
    setFormError('');
  };

  const updateDraft = <Key extends keyof BranchDraft>(key: Key, value: BranchDraft[Key]) => {
    setDraft((current) => current ? { ...current, [key]: value } : current);
    setFormError('');
  };

  const saveBranch = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft || saving) return;

    const updates: BranchDraft = {
      ...draft,
      name: draft.name.trim(),
      shortName: draft.shortName.trim(),
      address: draft.address.trim(),
      phone: draft.phone.trim(),
    };
    if (![updates.name, updates.shortName, updates.address, updates.phone].every(Boolean)) {
      setFormError('Name, short name, address and phone are required.');
      return;
    }
    if (!managers.some((manager) => manager.id === updates.managerId)) {
      setFormError('Choose an active administrator or staff member as branch manager.');
      return;
    }

    const selectedAdminBranchId = state.activeBranchId;
    const action: AppAction = editingBranchId
      ? { type: 'UPDATE_BRANCH', branchId: editingBranchId, updates }
      : { type: 'CREATE_BRANCH', branch: { id: makeId('branch'), ...updates } };
    setSaving(true);
    setFormError('');
    try {
      const remoteState = await apiAction(action);
      const activeBranchId = editingBranchId && !updates.active && selectedAdminBranchId === editingBranchId ? 'all' : selectedAdminBranchId;
      dispatch({ type: 'HYDRATE', state: { ...remoteState, activeBranchId } });
      setEditingBranchId(null);
      setDraft(null);
    } catch (error) {
      setFormError(errorMessage(error, 'The branch could not be updated.'));
    } finally {
      setSaving(false);
    }
  };

  const setBranchActive = async (branch: Branch, active: boolean) => {
    if (busyBranchId || saving || branch.active === active) return;
    if (!active && !window.confirm(`Remove ${branch.name}? Its history will be retained and it can be restored later.`)) return;

    const selectedAdminBranchId = state.activeBranchId;
    setBusyBranchId(branch.id);
    setActionError('');
    try {
      const action: AppAction = { type: 'UPDATE_BRANCH', branchId: branch.id, updates: { ...toDraft(branch), active } };
      const remoteState = await apiAction(action);
      const activeBranchId = !active && selectedAdminBranchId === branch.id ? 'all' : selectedAdminBranchId;
      dispatch({ type: 'HYDRATE', state: { ...remoteState, activeBranchId } });
      if (editingBranchId === branch.id) {
        setEditingBranchId(null);
        setDraft(null);
        setFormError('');
      }
    } catch (error) {
      setActionError(errorMessage(error, `The branch could not be ${active ? 'restored' : 'removed'}.`));
    } finally {
      setBusyBranchId(null);
    }
  };

  return <>
    <PageTitle eyebrow="Network" title="Branches" description="Add, edit, remove or restore branches and compare operational performance." actions={<Button disabled={saving || Boolean(busyBranchId)} onClick={beginCreate}><Plus /> Add branch</Button>} />

    {draft ? <Card className="inline-form admin-edit-form">
      <div className="card-heading"><div><span className="eyebrow">Branch settings</span><h2>{isCreating ? 'Add a branch' : `Edit ${draft.name}`}</h2></div></div>
      <form className="form-grid two" onSubmit={(event) => void saveBranch(event)} aria-busy={saving}>
        <FormField label="Branch name"><input required maxLength={160} disabled={saving} value={draft.name} onChange={(event) => updateDraft('name', event.target.value)} /></FormField>
        <FormField label="Short name"><input required maxLength={80} disabled={saving} value={draft.shortName} onChange={(event) => updateDraft('shortName', event.target.value)} /></FormField>
        <FormField label="Phone"><input required type="tel" maxLength={64} disabled={saving} value={draft.phone} onChange={(event) => updateDraft('phone', event.target.value)} /></FormField>
        <FormField label="Branch manager"><select required disabled={saving} value={draft.managerId} onChange={(event) => updateDraft('managerId', event.target.value)}><option value="">Choose a manager</option>{managers.map((manager) => <option key={manager.id} value={manager.id}>{manager.name} · {manager.jobTitle ?? manager.role}</option>)}</select></FormField>
        <FormField label="Address"><textarea required maxLength={300} disabled={saving} value={draft.address} onChange={(event) => updateDraft('address', event.target.value)} /></FormField>
        <div className={`admin-active-toggle admin-created-active ${draft.active ? 'selected' : ''}`}><span>{draft.active ? <CheckCircle2 /> : <CircleOff />}</span><div><strong>{isCreating ? 'Opens immediately' : draft.active ? 'Currently open' : 'Currently removed'}</strong><small>{isCreating ? 'New branches are available for staff assignments, customers and incoming work.' : 'Use the Remove or Restore action on the branch card to change availability.'}</small></div></div>
        {formError ? <span className="login-error admin-form-error" role="alert">{formError}</span> : null}
        <div className="form-actions"><Button type="button" variant="secondary" disabled={saving} onClick={cancelEdit}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? 'Saving…' : isCreating ? 'Add branch' : 'Save branch'}</Button></div>
      </form>
    </Card> : null}

    {actionError ? <div className="management-error" role="alert">{actionError}</div> : null}

    <div className="branch-grid">{state.branches.map((branch) => {
      const orders = state.orders.filter((item) => item.branchId === branch.id);
      const active = orders.filter((item) => !['collected', 'cancelled'].includes(item.status));
      const staff = state.users.filter((item) => item.role === 'staff' && item.active !== false && item.branchIds.includes(branch.id));
      const outstanding = orders.reduce((sum, item) => sum + orderBalance(state, item), 0);
      const manager = state.users.find((item) => item.id === branch.managerId);
      return <Card className={`branch-tile ${branch.active ? '' : 'record-inactive'}`} key={branch.id}>
        <div className="branch-tile-head"><span><Building2 /></span><div><strong>{branch.name}</strong><small><MapPin /> {branch.address}</small><small><Phone /> {branch.phone}</small><small><UsersRound /> Managed by {manager?.name ?? 'Unassigned'}</small></div><i className={branch.active ? '' : 'inactive'}>{branch.active ? <CheckCircle2 /> : <CircleOff />} {branch.active ? 'Open' : 'Closed'}</i></div>
        <div className="branch-kpis"><div><Package2 /><strong>{active.length}</strong><span>Active orders</span></div><div><UsersRound /><strong>{staff.length}</strong><span>Staff members</span></div><div><DollarSign /><strong>{money(branchRevenue(state, branch.id))}</strong><span>Revenue</span></div><div><DollarSign /><strong>{money(outstanding)}</strong><span>Outstanding</span></div></div>
        <div className="record-actions"><Button variant="secondary" disabled={Boolean(busyBranchId) || saving} onClick={() => beginEdit(branch)}><Pencil /> Edit</Button>{branch.active ? <Button variant="danger" disabled={Boolean(busyBranchId) || saving} onClick={() => void setBranchActive(branch, false)}><Trash2 /> {busyBranchId === branch.id ? 'Removing…' : 'Remove'}</Button> : <Button variant="ghost" disabled={Boolean(busyBranchId) || saving} onClick={() => void setBranchActive(branch, true)}><RotateCcw /> {busyBranchId === branch.id ? 'Restoring…' : 'Restore'}</Button>}<Button variant="ghost" disabled={!branch.active || Boolean(busyBranchId) || saving} onClick={() => dispatch({ type: 'SET_BRANCH', branchId: branch.id })}>Dashboard →</Button></div>
      </Card>;
    })}</div>
  </>;
}
