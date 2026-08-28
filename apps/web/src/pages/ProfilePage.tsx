import { getActiveUser, type ProfileUpdate } from '@gatsi/domain';
import { Check, KeyRound, ShieldCheck, UserRound } from 'lucide-react';
import { useState } from 'react';
import { Button, Card, FormField, PageTitle } from '../components/ui';
import { useAppStore } from '../store/AppStore';
import { apiAction, apiChangePassword } from '../store/api';

type PasswordDraft = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

const emptyPasswordDraft: PasswordDraft = { currentPassword: '', newPassword: '', confirmPassword: '' };

export function ProfilePage() {
  const { state, dispatch } = useAppStore();
  const user = getActiveUser(state)!;
  const [draft, setDraft] = useState<ProfileUpdate>({
    name: user.name,
    email: user.email,
    phone: user.phone,
    jobTitle: user.jobTitle ?? '',
    username: user.username ?? '',
  });
  const [passwordDraft, setPasswordDraft] = useState<PasswordDraft>(emptyPasswordDraft);
  const [saving, setSaving] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const update = (key: keyof ProfileUpdate, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setMessage('');
    setError('');
  };

  const updatePassword = (key: keyof PasswordDraft, value: string) => {
    setPasswordDraft((current) => ({ ...current, [key]: value }));
    setPasswordMessage('');
    setPasswordError('');
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (!draft.name.trim() || !draft.phone.trim()) {
      setError('Name and phone are required.');
      return;
    }
    if (user.role === 'admin' && !/^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/.test(draft.username?.trim() ?? '')) {
      setError('Use 3 to 64 letters, numbers, dots, underscores or hyphens for the username.');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');
    try {
      const updates: ProfileUpdate = {
        name: draft.name.trim(),
        email: draft.email.trim(),
        phone: draft.phone.trim(),
        jobTitle: draft.jobTitle?.trim() ?? '',
        ...(user.role === 'admin' ? { username: draft.username?.trim() } : {}),
      };
      const remoteState = await apiAction({ type: 'UPDATE_PROFILE', updates });
      dispatch({ type: 'HYDRATE', state: remoteState });
      setDraft(updates);
      setMessage(user.role === 'admin' ? 'Profile and login details saved.' : 'Profile details saved.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Your profile could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (changingPassword) return;
    if (!passwordDraft.currentPassword) {
      setPasswordError('Enter your current password.');
      return;
    }
    if (passwordDraft.newPassword.length < 10 || !/[a-z]/.test(passwordDraft.newPassword) || !/[A-Z]/.test(passwordDraft.newPassword) || !/\d/.test(passwordDraft.newPassword)) {
      setPasswordError('Use at least 10 characters with an uppercase letter, lowercase letter and number.');
      return;
    }
    if (passwordDraft.newPassword !== passwordDraft.confirmPassword) {
      setPasswordError('The new passwords do not match.');
      return;
    }
    if (passwordDraft.newPassword === passwordDraft.currentPassword) {
      setPasswordError('Choose a password different from your current password.');
      return;
    }

    setChangingPassword(true);
    setPasswordError('');
    setPasswordMessage('');
    try {
      await apiChangePassword(passwordDraft.currentPassword, passwordDraft.newPassword);
      setPasswordDraft(emptyPasswordDraft);
      setPasswordMessage('Password changed successfully. Use it the next time you sign in.');
    } catch (reason) {
      setPasswordError(reason instanceof Error ? reason.message : 'Your password could not be changed.');
    } finally {
      setChangingPassword(false);
    }
  };

  return <>
    <PageTitle eyebrow="Account" title="Profile & security" description="Manage your personal details and secure your account." />
    <div className="profile-settings-grid">
      <Card className="profile-form-card">
        <div className="profile-form-intro"><span><UserRound /></span><div><strong>{user.role === 'customer' ? 'Your details' : 'Personal details'}</strong><p>These details are used for account communication and branch records.</p></div></div>
        <form className="form-grid two" onSubmit={save}>
          <FormField label="Full name"><input required maxLength={200} disabled={saving} value={draft.name} onChange={(event) => update('name', event.target.value)} autoComplete="name" /></FormField>
          <FormField label="Phone number"><input required type="tel" maxLength={64} disabled={saving} value={draft.phone} onChange={(event) => update('phone', event.target.value)} autoComplete="tel" /></FormField>
          <FormField label="Email address"><input type="email" maxLength={254} disabled={saving} value={draft.email} onChange={(event) => update('email', event.target.value)} autoComplete="email" /></FormField>
          {user.role !== 'customer' ? <FormField label="Job title"><input maxLength={120} disabled={saving} value={draft.jobTitle ?? ''} onChange={(event) => update('jobTitle', event.target.value)} /></FormField> : null}
          {user.role === 'admin' ? <div className="profile-admin-field"><FormField label="Login username" hint="Only administrators can change their own username."><input required minLength={3} maxLength={64} pattern="[A-Za-z0-9][A-Za-z0-9._-]{2,63}" disabled={saving} value={draft.username ?? ''} onChange={(event) => update('username', event.target.value)} autoComplete="username" spellCheck={false} /></FormField><span><ShieldCheck /> Administrator only</span></div> : null}
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          {message ? <p className="form-success"><Check /> {message}</p> : null}
          <div className="form-actions"><Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save changes'} <Check /></Button></div>
        </form>
      </Card>

      <Card className="profile-form-card profile-password-card">
        <div className="profile-form-intro"><span><KeyRound /></span><div><strong>Change password</strong><p>Confirm your current password before choosing a new one.</p></div></div>
        <form className="form-grid" onSubmit={changePassword}>
          <FormField label="Current password"><input required type="password" disabled={changingPassword} value={passwordDraft.currentPassword} onChange={(event) => updatePassword('currentPassword', event.target.value)} autoComplete="current-password" /></FormField>
          <FormField label="New password" hint="At least 10 characters with uppercase, lowercase and a number."><input required type="password" minLength={10} disabled={changingPassword} value={passwordDraft.newPassword} onChange={(event) => updatePassword('newPassword', event.target.value)} autoComplete="new-password" /></FormField>
          <FormField label="Confirm new password"><input required type="password" minLength={10} disabled={changingPassword} value={passwordDraft.confirmPassword} onChange={(event) => updatePassword('confirmPassword', event.target.value)} autoComplete="new-password" /></FormField>
          {passwordError ? <p className="form-error" role="alert">{passwordError}</p> : null}
          {passwordMessage ? <p className="form-success"><Check /> {passwordMessage}</p> : null}
          <div className="form-actions"><Button type="submit" variant="secondary" disabled={changingPassword}>{changingPassword ? 'Changing...' : 'Change password'} <KeyRound /></Button></div>
        </form>
      </Card>
    </div>
  </>;
}
