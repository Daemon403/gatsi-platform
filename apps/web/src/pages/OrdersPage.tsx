import { getActiveUser, statusLabels, visibleOrders, type OrderStatus } from '@gatsi/domain';
import { Filter, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Empty, OrderRow, PageTitle } from '../components/ui';
import { useAppStore } from '../store/AppStore';

const filters: Array<'all' | OrderStatus> = ['all', 'received', 'sorting', 'washing', 'ironing', 'quality_check', 'ready', 'collected'];

export function OrdersPage() {
  const { state } = useAppStore();
  const user = getActiveUser(state)!;
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | OrderStatus>('all');
  const orders = visibleOrders(state);
  const results = useMemo(() => orders.filter((order) => {
    const customer = state.customers.find((item) => item.id === order.customerId);
    return (filter === 'all' || order.status === filter) && `${order.number} ${customer?.name ?? ''} ${order.items.map((item) => item.description).join(' ')}`.toLowerCase().includes(query.toLowerCase());
  }), [orders, filter, query, state.customers]);
  return <><PageTitle eyebrow={user.role === 'customer' ? 'My garments' : 'Operations'} title={user.role === 'customer' ? 'Track orders' : 'Orders'} description={user.role === 'customer' ? 'Every care stage, payment and expected completion date.' : 'Search, filter and advance every branch order.'} actions={user.role !== 'customer' ? <Link to="/orders/new"><Button><Plus /> New order</Button></Link> : undefined} /><div className="toolbar"><label className="search-box"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search order, customer or garment..." /></label><div className="filter-label"><Filter /> Status</div></div><div className="filter-tabs">{filters.map((item) => <button key={item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}><span>{item === 'all' ? 'All orders' : statusLabels[item]}</span><b>{item === 'all' ? orders.length : orders.filter((order) => order.status === item).length}</b></button>)}</div><div className="results-heading"><span>{results.length} matching {results.length === 1 ? 'order' : 'orders'}</span><small>Updated from local demo data</small></div><section className="card order-list order-list-page">{results.map((order) => <OrderRow key={order.id} state={state} order={order} />)}{!results.length ? <Empty title="No matching orders" body="Try another search term or choose a different status." /> : null}</section></>;
}
