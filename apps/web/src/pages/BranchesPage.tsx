import { branchRevenue, getActiveUser, money, orderBalance, type AppAction, type Branch } from '@gatsi/domain';
import { Building2, CheckCircle2, CircleOff, DollarSign, MapPin, Package2, Pencil, Phone, UsersRound } from 'lucide-react';
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

export function BranchesPage() {
  const { state } = useAppStore();
  const currentUser = getActiveUser(state);

  if (currentUser?.role !== 'admin') return null;
  return <AdminBranchesPage />;
}

function AdminBranchesPage() {
  const { state, dispatch } = useAppStore();
  const [editingBranchId, setEditingBranchId] = useState<string | null>(null);
  const [draft, setDraft] = useState<BranchDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const managers = state.users.filter((user) => user.active !== false && (
    user.role === 'admin' || (user.role === 'staff' && user.verified === true && Boolean(editingBranchId && user.branchIds.includes(editingBranchId)))
  ));

  const beginEdit = (branch: Branch) => {
    setEditingBranchId(branch.id);
    setDraft(toDraft(branch));
    setFormError('');
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
    if (!draft || !editingBranchId || saving) return;

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
    const action: AppAction = { type: 'UPDATE_BRANCH', branchId: editingBranchId, updates };
    setSaving(true);
    setFormError('');
    try {
      const remoteState = await apiAction(action);
      const activeBranchId = !updates.active && selectedAdminBranchId === editingBranchId ? 'all' : selectedAdminBranchId;
      dispatch({ type: 'HYDRATE', state: { ...remoteState, activeBranchId } });
      setEditingBranchId(null);
      setDraft(null);
    } catch (error) {
      setFormError(errorMessage(error, 'The branch could not be updated.'));
    } finally {
      setSaving(false);
    }
  };

  return <>
    <PageTitle eyebrow="Network" title="Branches" description="Edit branch details and compare order volume, teams, revenue and collection risk." />

    {draft && editingBranchId ? <Card className="inline-form admin-edit-form">
      <div className="card-heading"><div><span className="eyebrow">Branch settings</span><h2>Edit {draft.name}</h2></div></div>
      <form className="form-grid two" onSubmit={(event) => void saveBranch(event)} aria-busy={saving}>
        <FormField label="Branch name"><input required maxLength={160} disabled={saving} value={draft.name} onChange={(event) => updateDraft('name', event.target.value)} /></FormField>
        <FormField label="Short name"><input required maxLength={80} disabled={saving} value={draft.shortName} onChange={(event) => updateDraft('shortName', event.target.value)} /></FormField>
        <FormField label="Phone"><input required type="tel" maxLength={64} disabled={saving} value={draft.phone} onChange={(event) => updateDraft('phone', event.target.value)} /></FormField>
        <FormField label="Branch manager"><select required disabled={saving} value={draft.managerId} onChange={(event) => updateDraft('managerId', event.target.value)}><option value="">Choose a manager</option>{managers.map((manager) => <option key={manager.id} value={manager.id}>{manager.name} · {manager.jobTitle ?? manager.role}</option>)}</select></FormField>
        <FormField label="Address"><textarea required maxLength={300} disabled={saving} value={draft.address} onChange={(event) => updateDraft('address', event.target.value)} /></FormField>
        <label className={`admin-active-toggle ${draft.active ? 'selected' : ''}`}><input type="checkbox" disabled={saving} checked={draft.active} onChange={(event) => updateDraft('active', event.target.checked)} /><span>{draft.active ? <CheckCircle2 /> : <CircleOff />}</span><div><strong>{draft.active ? 'Open branch' : 'Closed branch'}</strong><small>Closed branches remain in historical records but cannot receive new work.</small></div></label>
        {formError ? <span className="login-error admin-form-error" role="alert">{formError}</span> : null}
        <div className="form-actions"><Button type="button" variant="secondary" disabled={saving} onClick={cancelEdit}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save branch'}</Button></div>
      </form>
    </Card> : null}

    <div className="branch-grid">{state.branches.map((branch) => {
      const orders = state.orders.filter((item) => item.branchId === branch.id);
      const active = orders.filter((item) => !['collected', 'cancelled'].includes(item.status));
      const staff = state.users.filter((item) => item.role === 'staff' && item.active !== false && item.branchIds.includes(branch.id));
      const outstanding = orders.reduce((sum, item) => sum + orderBalance(state, item), 0);
      const manager = state.users.find((item) => item.id === branch.managerId);
      return <Card className={`branch-tile ${branch.active ? '' : 'record-inactive'}`} key={branch.id}>
        <div className="branch-tile-head"><span><Building2 /></span><div><strong>{branch.name}</strong><small><MapPin /> {branch.address}</small><small><Phone /> {branch.phone}</small><small><UsersRound /> Managed by {manager?.name ?? 'Unassigned'}</small></div><i className={branch.active ? '' : 'inactive'}>{branch.active ? <CheckCircle2 /> : <CircleOff />} {branch.active ? 'Open' : 'Closed'}</i></div>
        <div className="branch-kpis"><div><Package2 /><strong>{active.length}</strong><span>Active orders</span></div><div><UsersRound /><strong>{staff.length}</strong><span>Staff members</span></div><div><DollarSign /><strong>{money(branchRevenue(state, branch.id))}</strong><span>Revenue</span></div><div><DollarSign /><strong>{money(outstanding)}</strong><span>Outstanding</span></div></div>
        <div className="record-actions"><Button variant="secondary" onClick={() => beginEdit(branch)}><Pencil /> Edit branch</Button><Button variant="ghost" onClick={() => dispatch({ type: 'SET_BRANCH', branchId: branch.id })}>Open dashboard →</Button></div>
      </Card>;
    })}</div>
  </>;
}
