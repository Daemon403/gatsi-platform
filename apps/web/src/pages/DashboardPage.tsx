import { branchRevenue, getActiveUser, money, orderBalance, visibleOrders } from '@gatsi/domain';
import { AlertTriangle, ArrowRight, Award, CheckCircle2, ClipboardCheck, Clock3, CreditCard, DollarSign, Package2, Plus, Shirt, Truck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button, Card, Empty, Metric, OrderRow, PageTitle } from '../components/ui';
import { useAppStore } from '../store/AppStore';

export function DashboardPage() {
  const { state, dispatch } = useAppStore();
  const user = getActiveUser(state)!;
  const orders = visibleOrders(state);
  const active = orders.filter((item) => !['collected', 'cancelled'].includes(item.status));
  const ready = orders.filter((item) => item.status === 'ready');
  const outstanding = orders.reduce((sum, item) => sum + orderBalance(state, item), 0);
  const lowStock = state.inventory.filter((item) => (state.activeBranchId === 'all' || item.branchId === state.activeBranchId) && item.quantity <= item.reorderLevel);
  const revenue = branchRevenue(state, user.role === 'customer' ? 'all' : state.activeBranchId);
  const setupIncomplete = user.role === 'admin' && (!state.branches.length || !state.services.length);
  const activity = state.activities.filter((item) => state.activeBranchId === 'all' || item.branchId === state.activeBranchId).slice(0, 4);

  if (user.role === 'customer') return <CustomerDashboard />;

  return <>
    <PageTitle
      eyebrow={user.role === 'admin' ? 'Command centre' : 'Branch workspace'}
      title={user.role === 'admin' ? 'Business overview' : 'Good morning, ' + user.name.split(' ')[0]}
      description={user.role === 'admin' ? 'Live operational health from the shared database.' : active.length + ' active orders are moving through your care workflow.'}
      actions={setupIncomplete
        ? <Link to={!state.branches.length ? '/branches' : '/services'}><Button><Plus /> Continue setup</Button></Link>
        : <Link to="/orders/new"><Button><Plus /> New order</Button></Link>}
    />

    {setupIncomplete ? <Card className="fresh-workspace">
      <span className="fresh-workspace-icon"><CheckCircle2 /></span>
      <div>
        <span className="eyebrow">Fresh database</span>
        <h2>Your workspace is ready to configure</h2>
        <p>No sample business records are installed. Add your first branch and service catalogue; customers, staff, stock and orders will appear only after an administrator creates them.</p>
        <div className="fresh-workspace-actions">
          <Link to="/branches"><Button variant={state.branches.length ? 'secondary' : 'primary'}>{state.branches.length ? <CheckCircle2 /> : <Plus />} {state.branches.length ? 'Branches added' : 'Add first branch'}</Button></Link>
          <Link to="/services"><Button variant={state.services.length ? 'secondary' : 'primary'}>{state.services.length ? <CheckCircle2 /> : <Plus />} {state.services.length ? 'Services added' : 'Add services'}</Button></Link>
          <Link to="/profile"><Button variant="ghost">Review admin profile <ArrowRight /></Button></Link>
        </div>
      </div>
    </Card> : null}

    {user.role === 'admin'
      ? <Card className="balance-hero"><div><span>Revenue collected</span><strong>{money(revenue)}</strong><p><CheckCircle2 /> Calculated from database payments</p></div><div className="balance-symbol"><DollarSign /></div><div className="hero-actions"><Link to="/orders">View transactions <ArrowRight /></Link><Link to="/branches">Branch performance <ArrowRight /></Link></div></Card>
      : <Card className="shift-hero"><div className="shift-state"><span className={user.clockedIn ? 'shift-live' : 'shift-off'}><Clock3 /> {user.clockedIn ? 'Shift active' : 'Not clocked in'}</span><h2>{user.clockedIn ? 'Ready for today’s care queue' : 'Start your workspace'}</h2><p>{user.clockedIn ? 'You have ' + active.length + ' active orders and ' + ready.length + ' ready for collection.' : 'Clock in to start processing branch orders.'}</p></div><Button variant={user.clockedIn ? 'secondary' : 'primary'} onClick={() => dispatch({ type: 'CLOCK_TOGGLE', userId: user.id, clockedIn: !Boolean(user.clockedIn) })}>{user.clockedIn ? 'Clock out' : 'Clock in'}</Button></Card>}

    <div className="metric-grid"><Metric icon={<Package2 />} tone="green" value={active.length} label="Active orders" detail="In the care workflow" /><Metric icon={<CheckCircle2 />} tone="blue" value={ready.length} label="Ready for collection" detail="Customer notification due" /><Metric icon={<CreditCard />} tone="amber" value={money(outstanding)} label="Outstanding" detail="Across visible orders" /><Metric icon={<AlertTriangle />} tone="red" value={lowStock.length} label="Low stock" detail="At or below reorder level" /></div>

    <div className="dashboard-columns">
      <section><div className="section-heading"><div><span className="eyebrow">Live queue</span><h2>Today’s workflow</h2></div><Link to="/orders">View all <ArrowRight /></Link></div><Card className="order-list">{orders.slice(0, 5).map((order) => <OrderRow key={order.id} state={state} order={order} />)}{!orders.length ? <Empty title="No orders yet" body="Orders created by an administrator or staff member will appear here." /> : null}</Card></section>
      <section>
        <div className="section-heading"><div><span className="eyebrow">Performance</span><h2>Branch pulse</h2></div></div>
        <Card className="branch-pulse">{state.branches.map((branch) => { const total = branchRevenue(state, branch.id); const max = Math.max(...state.branches.map((item) => branchRevenue(state, item.id)), 1); return <div className="pulse-row" key={branch.id}><div><strong>{branch.shortName}</strong><span>{state.orders.filter((item) => item.branchId === branch.id && !['collected', 'cancelled'].includes(item.status)).length} active orders</span></div><b>{money(total)}</b><div><i style={{ width: String((total / max) * 100) + '%' }} /></div></div>; })}{!state.branches.length ? <Empty title="No branches yet" body="Add the first operating location to begin configuring the business." /> : null}</Card>
        <div className="section-heading compact"><div><span className="eyebrow">Recent</span><h2>Team activity</h2></div></div>
        <Card className="activity-list">{activity.map((item) => { const actor = state.users.find((member) => member.id === item.userId); return <div className="activity-row" key={item.id}><span style={{ background: actor?.avatarColor }}>{actor?.name.split(' ').map((part) => part[0]).join('').slice(0, 2)}</span><p><strong>{actor?.name}</strong> {item.message}<small>{new Date(item.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small></p></div>; })}{!activity.length ? <Empty title="No activity yet" body="Database-backed changes will be listed here as work begins." /> : null}</Card>
      </section>
    </div>
  </>;
}

function CustomerDashboard() {
  const { state } = useAppStore();
  const user = getActiveUser(state)!;
  const customer = state.customers.find((item) => item.id === user.customerId);
  const orders = visibleOrders(state);
  const active = orders.filter((item) => !['collected', 'cancelled'].includes(item.status));
  const outstanding = orders.reduce((sum, item) => sum + orderBalance(state, item), 0);
  const current = active[0];
  return <><PageTitle eyebrow="My Gatsi" title={'Welcome back, ' + user.name.split(' ')[0]} description="Track your garments, request a pickup and keep every receipt in one place." actions={<Link to="/pickup"><Button><Truck /> Book a pickup</Button></Link>} />{current ? <Link to={'/orders/' + current.id} className="customer-hero"><div><span>Latest care update</span><strong>{current.number}</strong><h2>{current.status.replaceAll('_', ' ')}</h2><p>Due {new Date(current.dueAt).toLocaleDateString()}</p></div><div className="customer-hero-icon"><Shirt /></div><b>Follow order <ArrowRight /></b></Link> : null}<div className="metric-grid customer-metrics"><Metric icon={<Package2 />} value={active.length} label="Active orders" detail="Currently in care" /><Metric icon={<Award />} tone="amber" value={customer?.loyaltyPoints ?? 0} label="Loyalty points" detail="Earned across purchases" /><Metric icon={<ClipboardCheck />} tone="blue" value={orders.filter((item) => item.status === 'collected').length} label="Completed" detail="Ready in your history" /><Metric icon={<CreditCard />} tone={outstanding ? 'red' : 'green'} value={money(outstanding)} label="Balance due" detail="Across your orders" /></div><div className="customer-actions"><Link to="/pickup"><Truck /><span><strong>Book pickup</strong><small>Collection at your address</small></span><ArrowRight /></Link><Link to="/services"><Shirt /><span><strong>Browse services</strong><small>Prices and turnaround times</small></span><ArrowRight /></Link><Link to="/receipts"><CreditCard /><span><strong>Payments & receipts</strong><small>View your transaction history</small></span><ArrowRight /></Link></div><div className="section-heading"><div><span className="eyebrow">Recent</span><h2>Your orders</h2></div><Link to="/orders">View all <ArrowRight /></Link></div><Card className="order-list">{orders.slice(0, 4).map((order) => <OrderRow key={order.id} state={state} order={order} />)}{!orders.length ? <Empty title="No orders yet" body="Your orders will appear here after intake." /> : null}</Card></>;
}
