import { getActiveBranch, getActiveUser, type Role } from '@gatsi/domain';
import { BarChart3, Bell, Boxes, Building2, ClipboardCheck, FileText, Home, LogOut, MapPin, Menu, Package2, ReceiptText, Scissors, Shirt, Truck, UserRound, UsersRound, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useAppStore } from '../store/AppStore';

type NavItem = { label: string; path: string; icon: ReactNode };

const navigation = (role: Role): NavItem[] => role === 'admin' ? [
  { label: 'Overview', path: '/', icon: <Home /> }, { label: 'Orders', path: '/orders', icon: <Package2 /> }, { label: 'Customers', path: '/customers', icon: <UsersRound /> }, { label: 'Inventory', path: '/inventory', icon: <Boxes /> }, { label: 'Team', path: '/team', icon: <ClipboardCheck /> }, { label: 'Branches', path: '/branches', icon: <Building2 /> }, { label: 'Services', path: '/services', icon: <Scissors /> },
] : role === 'staff' ? [
  { label: 'Workspace', path: '/', icon: <Home /> }, { label: 'Orders', path: '/orders', icon: <Package2 /> }, { label: 'Inventory', path: '/inventory', icon: <Boxes /> }, { label: 'Team', path: '/team', icon: <ClipboardCheck /> }, { label: 'Services', path: '/services', icon: <Scissors /> },
] : [
  { label: 'Home', path: '/', icon: <Home /> }, { label: 'Track orders', path: '/orders', icon: <MapPin /> }, { label: 'Book pickup', path: '/pickup', icon: <Truck /> }, { label: 'Services', path: '/services', icon: <Shirt /> }, { label: 'Receipts', path: '/receipts', icon: <ReceiptText /> },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { state, dispatch } = useAppStore();
  const user = getActiveUser(state)!;
  const branch = getActiveBranch(state);
  const [open, setOpen] = useState(false);
  return <div className="app-shell">
    <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
      <div className="brand"><span className="brand-mark">G</span><div><strong>Gatsi Comms</strong><small>Textile & Dry Cleaning</small></div><button className="mobile-close" onClick={() => setOpen(false)}><X /></button></div>
      <nav>{navigation(user.role).map((item) => <NavLink onClick={() => setOpen(false)} key={item.path} to={item.path} end={item.path === '/'} className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>{item.icon}<span>{item.label}</span></NavLink>)}</nav>
      <div className="sidebar-support"><Scissors /><strong>Care command centre</strong><span>Tag, clean, finish and deliver every order on time.</span></div>
      <button className="nav-link logout" onClick={() => dispatch({ type: 'LOGOUT' })}><LogOut /><span>Switch demo role</span></button>
    </aside>
    {open ? <button aria-label="Close menu" className="sidebar-scrim" onClick={() => setOpen(false)} /> : null}
    <div className="app-main">
      <header className="topbar">
        <button className="menu-button" onClick={() => setOpen(true)}><Menu /></button>
        <div className="branch-control"><MapPin size={16} /><select value={state.activeBranchId} onChange={(event) => dispatch({ type: 'SET_BRANCH', branchId: event.target.value })} disabled={user.role !== 'admin'}>{user.role === 'admin' ? <option value="all">All branches</option> : null}{state.branches.filter((item) => user.role === 'admin' || user.branchIds.includes(item.id)).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
        <div className="topbar-spacer" /><button className="icon-button"><Bell /><i /></button><div className="user-chip"><span style={{ background: user.avatarColor }}>{user.name.split(' ').map((part) => part[0]).join('').slice(0, 2)}</span><div><strong>{user.name}</strong><small>{user.role}</small></div></div>
      </header>
      <main className="content">{children}</main>
    </div>
  </div>;
}
