import { getActiveUser } from '@gatsi/domain';
import { CheckCircle2, Clock3, Mail, MapPin, Phone, UserCheck, UsersRound } from 'lucide-react';
import { Button, Card, Metric, PageTitle } from '../components/ui';
import { useAppStore } from '../store/AppStore';

export function TeamPage() {
  const { state, dispatch } = useAppStore();
  const current = getActiveUser(state)!;
  const staff = state.users.filter((user) => user.role === 'staff' && (current.role === 'admin' ? state.activeBranchId === 'all' || user.branchIds.includes(state.activeBranchId) : user.branchIds.some((id) => current.branchIds.includes(id))));
  const onShift = staff.filter((item) => item.clockedIn);
  return <><PageTitle eyebrow="People & attendance" title="Branch team" description="See responsibilities and today’s live shift status." /><div className="metric-grid three"><Metric icon={<UsersRound />} value={staff.length} label="Team members" detail="In selected branches" /><Metric icon={<UserCheck />} tone="blue" value={onShift.length} label="On shift" detail="Currently clocked in" /><Metric icon={<Clock3 />} tone="amber" value={staff.length - onShift.length} label="Off shift" detail="Not currently active" /></div><div className="team-grid">{staff.map((member) => { const branch = state.branches.find((item) => member.branchIds.includes(item.id)); const assigned = state.orders.filter((order) => order.assignedStaffId === member.id && !['collected', 'cancelled'].includes(order.status)).length; return <Card className="team-card" key={member.id}><div className="team-head"><span style={{ background: member.avatarColor }}>{member.name.split(' ').map((part) => part[0]).join('').slice(0, 2)}</span><div><strong>{member.name}</strong><small>{member.jobTitle}</small></div><i className={member.clockedIn ? 'online' : ''}>{member.clockedIn ? 'On shift' : 'Off shift'}</i></div><div className="team-detail"><span><MapPin /> {branch?.shortName}</span><span><Phone /> {member.phone}</span><span><Mail /> {member.email}</span></div><div className="team-footer"><span><b>{assigned}</b><small>Active orders</small></span>{current.role === 'admin' || member.id === current.id ? <Button variant="secondary" onClick={() => dispatch({ type: 'CLOCK_TOGGLE', userId: member.id })}>{member.clockedIn ? 'Clock out' : 'Clock in'}</Button> : null}</div></Card>; })}</div></>;
}
