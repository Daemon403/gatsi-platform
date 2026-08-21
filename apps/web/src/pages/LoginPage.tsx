import { BarChart3, CheckCircle2, PackageCheck, Shirt, ShoppingBag, Sparkles, UsersRound } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../components/ui';
import { useAppStore } from '../store/AppStore';

const accounts = [
  { id: 'user-admin', role: 'Admin', name: 'Promise Gatsi', detail: 'All branches, revenue, staff and reports', icon: <BarChart3 />, tone: 'green' },
  { id: 'user-rudo-staff', role: 'Staff', name: 'Rudo Nyathi', detail: 'Harare CBD garment operations', icon: <UsersRound />, tone: 'blue' },
  { id: 'user-customer', role: 'Customer', name: 'Rudo Chikowore', detail: 'Order tracking, pickups and receipts', icon: <ShoppingBag />, tone: 'purple' },
];

export function LoginPage() {
  const { state, dispatch } = useAppStore();
  const [selected, setSelected] = useState(accounts[0].id);
  const [username, setUsername] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState('');
  const account = accounts.find((item) => item.id === selected)!;
  const login = (event: React.FormEvent) => { event.preventDefault(); const user = state.users.find((item) => item.username?.toLowerCase() === username.trim().toLowerCase() && item.password === password); if (!user) { setError('Username or password is incorrect.'); return; } dispatch({ type: 'LOGIN', userId: user.id }); };
  return <div className="login-page"><section className="login-story"><div className="login-brand"><span>G</span><div><strong>Gatsi Comms</strong><small>Textile & Dry Cleaning Services</small></div></div><div className="login-copy"><span className="story-pill"><Sparkles /> Operations, beautifully organised</span><h1>Every garment.<br /><em>Every stage.</em><br />Always visible.</h1><p>A single workspace for counter intake, cleaning workflows, branch teams, inventory, payments, pickups and customers.</p><div className="story-points"><span><PackageCheck /> Traceable order care</span><span><Shirt /> Service-based pricing</span><span><CheckCircle2 /> Customer-ready updates</span></div></div><div className="login-orbit"><i /><i /><i /><Shirt /></div></section><section className="login-panel"><div className="login-form"><span className="eyebrow">Customer access</span><h2>Sign in to your account</h2><p>Use the first and last name credentials supplied during onboarding.</p><form className="customer-login" onSubmit={login}><label>Username<input required value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" /></label><label>Password<input required type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></label>{error ? <span className="login-error">{error}</span> : null}<Button className="login-button" type="submit">Sign in <span>→</span></Button></form><div className="login-divider"><span>Demo workspaces</span></div><div className="account-list compact">{accounts.map((item) => <button key={item.id} className={`account-option ${selected === item.id ? 'selected' : ''}`} onClick={() => setSelected(item.id)}><span className={`tone-${item.tone}`}>{item.icon}</span><div><small>{item.role}</small><strong>{item.name}</strong><p>{item.detail}</p></div><i>{selected === item.id ? <CheckCircle2 /> : null}</i></button>)}</div><Button variant="secondary" className="login-button" onClick={() => dispatch({ type: 'LOGIN', userId: selected })}>Continue as demo {account.role}<span>→</span></Button></div></section></div>;
}
