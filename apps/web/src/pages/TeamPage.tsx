import { getActiveUser, makeId, type AppAction, type User } from '@gatsi/domain';
import { Archive, Building2, CheckCircle2, Clock3, KeyRound, Mail, MapPin, Phone, RotateCcw, UserCheck, UserPlus, UsersRound } from 'lucide-react';
import { useState } from 'react';
import { Button, Card, FormField, Metric, PageTitle } from '../components/ui';
import { useAppStore } from '../store/AppStore';
import { apiAction } from '../store/api';

type CreatedCredentials = {
  name: string;
  username: string;
  password: string;
};

const strongPassword = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{10,}$/;

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function TeamPage() {
  const { state, dispatch } = useAppStore();
  const current = getActiveUser(state)!;
  const isAdmin = current.role === 'admin';
  const activeBranches = state.branches.filter((branch) => branch.active);
  const defaultBranchId = state.activeBranchId !== 'all' && activeBranches.some((branch) => branch.id === state.activeBranchId)
    ? state.activeBranchId
    : activeBranches[0]?.id ?? '';
  const visibleAtBranch = (user: User) => isAdmin
    ? state.activeBranchId === 'all' || user.branchIds.includes(state.activeBranchId)
    : user.branchIds.some((id) => current.branchIds.includes(id));
  const staff = state.users.filter((user) => user.role === 'staff' && user.active !== false && visibleAtBranch(user));
  const archivedStaff = state.users.filter((user) => user.role === 'staff' && user.active === false && visibleAtBranch(user));
  const onShift = staff.filter((item) => item.clockedIn);

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [branchId, setBranchId] = useState(defaultBranchId);
  const [credentials, setCredentials] = useState<CreatedCredentials | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [formError, setFormError] = useState('');
  const [memberErrors, setMemberErrors] = useState<Record<string, string>>({});
  const [restoreBranches, setRestoreBranches] = useState<Record<string, string>>({});
  const [restorePasswords, setRestorePasswords] = useState<Record<string, string>>({});

  const hydrateFromAction = async (action: AppAction) => {
    const remoteState = await apiAction(action);
    dispatch({ type: 'HYDRATE', state: remoteState });
  };

  const resetForm = () => {
    setName('');
    setPhone('');
    setEmail('');
    setJobTitle('');
    setUsername('');
    setPassword('');
    setBranchId(defaultBranchId);
    setFormError('');
  };

  const addStaff = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (![name, phone, email, jobTitle, username].every((value) => value.trim()) || !branchId) {
      setFormError('Complete every field and choose an active branch.');
      return;
    }
    if (!strongPassword.test(password)) {
      setFormError('Use at least 10 characters with an uppercase letter, lowercase letter and number.');
      return;
    }

    const user: User = {
      id: makeId('user'),
      role: 'staff',
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      jobTitle: jobTitle.trim(),
      branchIds: [branchId],
      avatarColor: '#1677ff',
      clockedIn: false,
      username: username.trim(),
      password,
      verified: true,
      active: true,
    };

    setSaving(true);
    setFormError('');
    try {
      await hydrateFromAction({ type: 'CREATE_STAFF', user });
      setCredentials({ name: user.name, username: user.username!, password });
      setAdding(false);
      resetForm();
    } catch (error) {
      setFormError(errorMessage(error, 'The team member could not be created.'));
    } finally {
      setSaving(false);
    }
  };

  const runMemberAction = async (userId: string, action: AppAction, fallback: string) => {
    if (busyUserId) return false;
    setBusyUserId(userId);
    setMemberErrors((currentErrors) => ({ ...currentErrors, [userId]: '' }));
    try {
      await hydrateFromAction(action);
      return true;
    } catch (error) {
      setMemberErrors((currentErrors) => ({ ...currentErrors, [userId]: errorMessage(error, fallback) }));
      return false;
    } finally {
      setBusyUserId(null);
    }
  };

  const archiveStaff = async (member: User) => {
    if (!window.confirm(`Archive ${member.name}? Their account will be disabled, but their history will be kept.`)) return;
    await runMemberAction(member.id, { type: 'ARCHIVE_STAFF', userId: member.id }, 'The team member could not be archived.');
  };

  const updateBranch = async (member: User, nextBranchId: string) => {
    await runMemberAction(member.id, { type: 'UPDATE_STAFF_BRANCHES', userId: member.id, branchIds: [nextBranchId] }, 'The branch assignment could not be changed.');
  };

  const restorationBranchId = (member: User) => restoreBranches[member.id]
    ?? member.branchIds.find((id) => activeBranches.some((branch) => branch.id === id))
    ?? defaultBranchId;

  const restoreStaff = async (member: User) => {
    const nextBranchId = restorationBranchId(member);
    const nextPassword = restorePasswords[member.id]?.trim() ?? '';
    if (!nextBranchId) {
      setMemberErrors((currentErrors) => ({ ...currentErrors, [member.id]: 'Choose a branch before restoring this account.' }));
      return;
    }
    if (nextPassword && !strongPassword.test(nextPassword)) {
      setMemberErrors((currentErrors) => ({ ...currentErrors, [member.id]: 'A new password must have at least 10 characters with uppercase, lowercase and a number.' }));
      return;
    }
    const restored = await runMemberAction(
      member.id,
      { type: 'RESTORE_STAFF', userId: member.id, branchIds: [nextBranchId], ...(nextPassword ? { password: nextPassword } : {}) },
      'The team member could not be restored.',
    );
    if (restored) {
      setRestorePasswords((currentPasswords) => ({ ...currentPasswords, [member.id]: '' }));
      if (nextPassword && member.username) setCredentials({ name: member.name, username: member.username, password: nextPassword });
    }
  };

  const clockToggle = async (member: User) => {
    await runMemberAction(member.id, { type: 'CLOCK_TOGGLE', userId: member.id }, 'Attendance could not be updated.');
  };

  return <>
    <PageTitle
      eyebrow="People & attendance"
      title="Branch team"
      description="Manage team access, branch assignments and today’s live shift status."
      actions={isAdmin ? <Button onClick={() => {
        const nextAdding = !adding;
        setAdding(nextAdding);
        setCredentials(null);
        setFormError('');
        if (nextAdding) setBranchId(defaultBranchId);
      }}><UserPlus /> Add team member</Button> : undefined}
    />

    {credentials ? <Card className="credential-notice">
      <KeyRound />
      <div>
        <strong>Login details for {credentials.name}</strong>
        <span>Username: <b>{credentials.username}</b> · Temporary password: <b>{credentials.password}</b></span>
        <span>Share these details securely. The password is only displayed here.</span>
      </div>
      <button type="button" onClick={() => setCredentials(null)} aria-label="Dismiss">×</button>
    </Card> : null}

    {isAdmin && adding ? <Card className="inline-form team-member-form">
      <div className="card-heading"><div><span className="eyebrow">New account</span><h2>Add a team member</h2></div></div>
      <form className="form-grid two" onSubmit={(event) => void addStaff(event)} aria-busy={saving}>
        <FormField label="Full name"><input required disabled={saving} value={name} onChange={(event) => { setName(event.target.value); setFormError(''); }} autoComplete="name" /></FormField>
        <FormField label="Job title"><input required disabled={saving} value={jobTitle} onChange={(event) => { setJobTitle(event.target.value); setFormError(''); }} placeholder="e.g. Laundry attendant" /></FormField>
        <FormField label="Phone"><input required disabled={saving} value={phone} onChange={(event) => { setPhone(event.target.value); setFormError(''); }} autoComplete="tel" /></FormField>
        <FormField label="Email"><input required type="email" disabled={saving} value={email} onChange={(event) => { setEmail(event.target.value); setFormError(''); }} autoComplete="email" /></FormField>
        <FormField label="Login username"><input required disabled={saving} value={username} onChange={(event) => { setUsername(event.target.value); setFormError(''); }} autoComplete="off" /></FormField>
        <FormField label="Temporary password" hint="At least 10 characters with uppercase, lowercase and a number."><input required type="password" minLength={10} disabled={saving} value={password} onChange={(event) => { setPassword(event.target.value); setFormError(''); }} autoComplete="new-password" /></FormField>
        <FormField label="Assigned branch"><select required disabled={saving} value={branchId} onChange={(event) => setBranchId(event.target.value)}><option value="">Choose a branch</option>{activeBranches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></FormField>
        {formError ? <span className="login-error team-form-error" role="alert">{formError}</span> : null}
        <div className="form-actions">
          <Button type="button" variant="secondary" disabled={saving} onClick={() => { setAdding(false); resetForm(); }}>Cancel</Button>
          <Button type="submit" disabled={saving || !branchId}><UserPlus /> {saving ? 'Creating…' : 'Create team account'}</Button>
        </div>
      </form>
    </Card> : null}

    <div className={`metric-grid ${isAdmin ? '' : 'three'}`}>
      <Metric icon={<UsersRound />} value={staff.length} label="Active team members" detail="In selected branches" />
      <Metric icon={<UserCheck />} tone="blue" value={onShift.length} label="On shift" detail="Currently clocked in" />
      <Metric icon={<Clock3 />} tone="amber" value={staff.length - onShift.length} label="Off shift" detail="Not currently active" />
      {isAdmin ? <Metric icon={<Archive />} tone="purple" value={archivedStaff.length} label="Archived" detail="Accounts retained safely" /> : null}
    </div>

    {staff.length ? <div className="team-grid">{staff.map((member) => {
      const assigned = state.orders.filter((order) => order.assignedStaffId === member.id && !['collected', 'cancelled'].includes(order.status)).length;
      const memberBranchId = member.branchIds[0] ?? '';
      const branches = member.branchIds.map((id) => state.branches.find((branch) => branch.id === id)?.shortName).filter(Boolean).join(', ');
      return <Card className="team-card" key={member.id}>
        <div className="team-head"><span style={{ background: member.avatarColor }}>{member.name.split(' ').map((part) => part[0]).join('').slice(0, 2)}</span><div><strong>{member.name}</strong><small>{member.jobTitle}</small></div><i className={member.clockedIn ? 'online' : ''}>{member.clockedIn ? 'On shift' : 'Off shift'}</i></div>
        <div className="team-detail"><span><MapPin /> {branches || 'No branch assigned'}</span><span><Phone /> {member.phone}</span><span><Mail /> {member.email}</span>{isAdmin && member.username ? <span><KeyRound /> {member.username}</span> : null}</div>
        {isAdmin ? <div className="team-branch-control"><Building2 /><label><span>Assigned branch</span><select aria-label={`Assigned branch for ${member.name}`} disabled={busyUserId === member.id} value={memberBranchId} onChange={(event) => void updateBranch(member, event.target.value)}>{state.branches.filter((branch) => branch.active || branch.id === memberBranchId).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label></div> : null}
        {memberErrors[member.id] ? <span className="login-error team-action-error" role="alert">{memberErrors[member.id]}</span> : null}
        <div className="team-footer"><span><b>{assigned}</b><small>Active orders</small></span><div className="team-card-actions">{isAdmin ? <Button variant="danger" disabled={busyUserId === member.id} onClick={() => void archiveStaff(member)}><Archive /> Archive</Button> : null}{isAdmin || member.id === current.id ? <Button variant="secondary" disabled={busyUserId === member.id} onClick={() => void clockToggle(member)}>{member.clockedIn ? 'Clock out' : 'Clock in'}</Button> : null}</div></div>
      </Card>;
    })}</div> : <Card className="team-empty"><UsersRound /><strong>No active team members</strong><span>{isAdmin ? 'Add a team member or change the selected branch.' : 'There are no team members assigned to your branch.'}</span></Card>}

    {isAdmin ? <section className="archived-team-section">
      <div className="section-heading"><div><span className="eyebrow">Retained accounts</span><h2>Archived team members</h2></div><small>{archivedStaff.length} archived</small></div>
      {archivedStaff.length ? <div className="team-grid">{archivedStaff.map((member) => {
        const selectedBranch = restorationBranchId(member);
        return <Card className="team-card archived-team-card" key={member.id}>
          <div className="team-head"><span style={{ background: member.avatarColor }}>{member.name.split(' ').map((part) => part[0]).join('').slice(0, 2)}</span><div><strong>{member.name}</strong><small>{member.jobTitle}</small></div><i>Archived</i></div>
          <div className="team-detail"><span><Phone /> {member.phone}</span><span><Mail /> {member.email}</span>{member.username ? <span><KeyRound /> {member.username}</span> : null}</div>
          <div className="restore-controls">
            <FormField label="Branch when restored"><select disabled={busyUserId === member.id} value={selectedBranch} onChange={(event) => setRestoreBranches((currentBranches) => ({ ...currentBranches, [member.id]: event.target.value }))}><option value="">Choose a branch</option>{activeBranches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></FormField>
            <FormField label="New password (optional)" hint="Leave blank to keep the existing password."><input type="password" minLength={10} disabled={busyUserId === member.id} value={restorePasswords[member.id] ?? ''} onChange={(event) => { setRestorePasswords((currentPasswords) => ({ ...currentPasswords, [member.id]: event.target.value })); setMemberErrors((currentErrors) => ({ ...currentErrors, [member.id]: '' })); }} autoComplete="new-password" /></FormField>
          </div>
          {memberErrors[member.id] ? <span className="login-error team-action-error" role="alert">{memberErrors[member.id]}</span> : null}
          <div className="team-footer archived-team-footer"><span><CheckCircle2 /><small>History retained</small></span><Button disabled={busyUserId === member.id || !selectedBranch} onClick={() => void restoreStaff(member)}><RotateCcw /> {busyUserId === member.id ? 'Restoring…' : 'Restore account'}</Button></div>
        </Card>;
      })}</div> : <Card className="team-empty compact"><Archive /><strong>No archived team members</strong><span>Archived accounts will appear here and can be restored later.</span></Card>}
    </section> : null}
  </>;
}
