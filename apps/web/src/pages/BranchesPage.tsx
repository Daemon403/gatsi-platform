import { branchRevenue, money, orderBalance } from '@gatsi/domain';
import { Building2, CheckCircle2, DollarSign, MapPin, Package2, Phone, UsersRound } from 'lucide-react';
import { Card, PageTitle } from '../components/ui';
import { useAppStore } from '../store/AppStore';

export function BranchesPage() {
  const { state, dispatch } = useAppStore();
  return <><PageTitle eyebrow="Network" title="Branches" description="Compare order volume, teams, revenue and collection risk." /><div className="branch-grid">{state.branches.map((branch) => { const orders = state.orders.filter((item) => item.branchId === branch.id); const active = orders.filter((item) => !['collected', 'cancelled'].includes(item.status)); const staff = state.users.filter((item) => item.role === 'staff' && item.branchIds.includes(branch.id)); const outstanding = orders.reduce((sum, item) => sum + orderBalance(state, item), 0); return <Card className="branch-tile" key={branch.id}><div className="branch-tile-head"><span><Building2 /></span><div><strong>{branch.name}</strong><small><MapPin /> {branch.address}</small><small><Phone /> {branch.phone}</small></div><i><CheckCircle2 /> Active</i></div><div className="branch-kpis"><div><Package2 /><strong>{active.length}</strong><span>Active orders</span></div><div><UsersRound /><strong>{staff.length}</strong><span>Staff members</span></div><div><DollarSign /><strong>{money(branchRevenue(state, branch.id))}</strong><span>Revenue</span></div><div><DollarSign /><strong>{money(outstanding)}</strong><span>Outstanding</span></div></div><button onClick={() => dispatch({ type: 'SET_BRANCH', branchId: branch.id })}>Open branch dashboard →</button></Card>; })}</div></>;
}
