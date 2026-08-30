import { getActiveUser, visibleNotifications, type AppNotification, type Role } from '@gatsi/domain';
import { Bell, Boxes, Building2, ChartNoAxesCombined, CircleAlert, ClipboardCheck, CloudOff, CreditCard, Home, LogOut, MapPin, Menu, Package2, ReceiptText, RefreshCw, Scissors, Shirt, Store, Truck, UserRound, UsersRound, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useAppStore } from '../store/AppStore';

type NavItem = { label: string; path: string; icon: ReactNode };

const navigation = (role: Role): NavItem[] => role === 'admin' ? [
  { label: 'Overview', path: '/', icon: <Home /> },
  { label: 'Orders', path: '/orders', icon: <Package2 /> },
  { label: 'Customers', path: '/customers', icon: <UsersRound /> },
  { label: 'Inventory', path: '/inventory', icon: <Boxes /> },
  { label: 'Store', path: '/shop', icon: <Store /> },
  { label: 'Team', path: '/team', icon: <ClipboardCheck /> },
  { label: 'Branches', path: '/branches', icon: <Building2 /> },
  { label: 'Services', path: '/services', icon: <Scissors /> },
  { label: 'Operations summaries', path: '/operations-summary', icon: <ChartNoAxesCombined /> },
] : role === 'staff' ? [
  { label: 'Workspace', path: '/', icon: <Home /> },
  { label: 'Orders', path: '/orders', icon: <Package2 /> },
  { label: 'Inventory', path: '/inventory', icon: <Boxes /> },
  { label: 'Store', path: '/shop', icon: <Store /> },
  { label: 'Team', path: '/team', icon: <ClipboardCheck /> },
  { label: 'Services', path: '/services', icon: <Scissors /> },
] : [
  { label: 'Home', path: '/', icon: <Home /> },
  { label: 'Track orders', path: '/orders', icon: <MapPin /> },
  { label: 'Book pickup', path: '/pickup', icon: <Truck /> },
  { label: 'Services', path: '/services', icon: <Shirt /> },
  { label: 'Receipts', path: '/receipts', icon: <ReceiptText /> },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { state, dispatch, sync, syncNow } = useAppStore();
  const user = getActiveUser(state)!;
  const notifications = visibleNotifications(state);
  const unread = notifications.filter((notification) => !notification.readByUserIds?.includes(user.id));
  const [open, setOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationMenu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!notificationsOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!notificationMenu.current?.contains(event.target as Node)) setNotificationsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setNotificationsOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [notificationsOpen]);

  const selectBranch = (branchId: string) => {
    dispatch({ type: 'SET_BRANCH', branchId });
    setNotificationsOpen(false);
  };
  const syncLabel = sync.phase === 'offline'
    ? `Offline${sync.pendingCount ? ` · ${sync.pendingCount} saved` : ''}`
    : sync.phase === 'syncing'
      ? `Syncing${sync.pendingCount ? ` ${sync.pendingCount}` : ''}`
      : sync.phase === 'error'
        ? 'Sync issue'
        : sync.pendingCount ? `${sync.pendingCount} pending` : '';

  return <div className="app-shell">
    <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
      <div className="brand"><span className="brand-mark">G</span><div><strong>Gatsi Comms</strong><small>Textile & Dry Cleaning</small></div><button type="button" aria-label="Close menu" className="mobile-close" onClick={() => setOpen(false)}><X /></button></div>
      <nav>{navigation(user.role).map((item) => <NavLink onClick={() => setOpen(false)} key={item.path} to={item.path} end={item.path === '/'} className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>{item.icon}<span>{item.label}</span></NavLink>)}</nav>
      <div className="sidebar-support"><Scissors /><strong>Care command centre</strong><span>Tag, clean, finish and deliver every order on time.</span></div>
      <button type="button" className="nav-link logout" onClick={() => dispatch({ type: 'LOGOUT' })}><LogOut /><span>Sign out</span></button>
    </aside>
    {open ? <button type="button" aria-label="Close menu" className="sidebar-scrim" onClick={() => setOpen(false)} /> : null}
    <div className="app-main">
      <header className="topbar">
        <button type="button" aria-label="Open menu" className="menu-button" onClick={() => setOpen(true)}><Menu /></button>
        <div className="branch-control"><MapPin size={16} /><select aria-label="Active branch" value={state.activeBranchId} onChange={(event) => selectBranch(event.target.value)} disabled={user.role !== 'admin'}>{user.role === 'admin' ? <option value="all">All branches</option> : null}{state.branches.filter((item) => item.active && (user.role === 'admin' || user.branchIds.includes(item.id))).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
        <div className="topbar-spacer" />
        {syncLabel ? <button type="button" className={`sync-indicator sync-${sync.phase}`} title={sync.lastError ?? syncLabel} disabled={sync.phase === 'syncing'} onClick={() => void syncNow()}>
          {sync.phase === 'offline' ? <CloudOff /> : sync.phase === 'error' ? <CircleAlert /> : <RefreshCw className={sync.phase === 'syncing' ? 'sync-spin' : ''} />}
          <span>{syncLabel}</span>
        </button> : null}
        <div className="notification-menu" ref={notificationMenu}>
          <button
            type="button"
            className={`icon-button ${notificationsOpen ? 'active' : ''}`}
            aria-label={unread.length ? `Notifications, ${unread.length} unread` : 'Notifications'}
            aria-haspopup="dialog"
            aria-expanded={notificationsOpen}
            onClick={() => setNotificationsOpen((current) => !current)}
          >
            <Bell />
            {unread.length ? <span className="notification-count">{unread.length > 9 ? '9+' : unread.length}</span> : null}
          </button>
          {notificationsOpen ? <section className="notification-panel" role="dialog" aria-label="Notifications">
            <header><div><strong>Notifications</strong><span>{unread.length ? `${unread.length} unread` : 'You are up to date'}</span></div>{unread.length ? <button type="button" onClick={() => dispatch({ type: 'MARK_ALL_NOTIFICATIONS_READ' })}>Mark all read</button> : null}</header>
            <div className="notification-list">
              {notifications.slice(0, 12).map((notification) => <NotificationRow key={notification.id} notification={notification} unread={!notification.readByUserIds?.includes(user.id)} branchName={notification.branchId ? state.branches.find((item) => item.id === notification.branchId)?.shortName : undefined} onOpen={() => setNotificationsOpen(false)} />)}
              {!notifications.length ? <div className="notification-empty"><Bell /><strong>No notifications</strong><span>Updates related to your account will appear here.</span></div> : null}
            </div>
          </section> : null}
        </div>
        <Link className="user-chip" to="/profile" aria-label="Edit profile"><span style={{ background: user.avatarColor }}>{user.name.split(' ').map((part) => part[0]).join('').slice(0, 2)}</span><div><strong>{user.name}</strong><small>{user.role}</small></div></Link>
      </header>
      <main className="content">{children}</main>
    </div>
  </div>;
}

function NotificationRow({ notification, unread, branchName, onOpen }: { notification: AppNotification; unread: boolean; branchName?: string; onOpen: () => void }) {
  const content = <>
    <span className={`notification-kind notification-kind-${notification.kind}`}><NotificationIcon kind={notification.kind} /></span>
    <span className="notification-copy"><strong>{notification.title}</strong><span>{notification.message}</span><small>{[branchName, new Date(notification.at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })].filter(Boolean).join(' - ')}</small></span>
    {unread ? <i aria-label="Unread" /> : null}
  </>;
  const className = `notification-item ${unread ? 'unread' : ''}`;
  return notification.orderId
    ? <Link className={className} to={`/orders/${notification.orderId}`} onClick={onOpen}>{content}</Link>
    : <div className={className}>{content}</div>;
}

function NotificationIcon({ kind }: { kind: AppNotification['kind'] }) {
  if (kind === 'payment') return <CreditCard />;
  if (kind === 'inventory') return <Boxes />;
  if (kind === 'staff') return <UserRound />;
  if (kind === 'pickup') return <Truck />;
  return <Package2 />;
}
