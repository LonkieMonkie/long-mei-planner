import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { PEOPLE } from './model.js';
import { Plant, PlantPair } from './plants.jsx';
import { PanelHeading } from './ui.jsx';

const signInErrors = {
  'auth/invalid-credential': 'That email and password don’t match.',
  'auth/wrong-password': 'That email and password don’t match.',
  'auth/user-not-found': 'That email and password don’t match.',
  'auth/invalid-email': 'Enter a valid email address.',
  'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
  'auth/network-request-failed': 'You’re offline. Reconnect and try again.',
};

function Gate({ title, children }) {
  return <main className="gate"><section className="card gate-card"><PlantPair/><h1>{title}</h1>{children}</section></main>;
}

export function AccountGate({ session, signIn, signOut, chooseProfile }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (session.status === 'loading') return <Gate title="Opening your planner"><p className="field-help">Getting the latest from your shared planner.</p></Gate>;
  if (session.status === 'error') return <Gate title="The planner couldn’t open">
    <p className="form-error" role="alert">{session.error}</p>
    <div className="form-actions"><button className="btn secondary" onClick={() => window.location.reload()}>Try again</button>{session.user && <button className="btn secondary" onClick={signOut}>Sign out</button>}</div>
  </Gate>;
  if (session.status === 'choose-profile') return <Gate title="Which plant is yours?">
    <p className="field-help">Signed in as {session.user.email}. Choose once and this account stays linked to that profile on every device.</p>
    <div className="profile-choice">{PEOPLE.map(person => <button key={person.id} className="tree-option" disabled={busy || session.taken.includes(person.id)}
      onClick={() => { setBusy(true); chooseProfile(person.id).catch(e => setError(e.message)).finally(() => setBusy(false)); }}>
      <Plant who={person.id}/>{person.name}{session.taken.includes(person.id) && <small>Already linked</small>}
    </button>)}</div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="form-actions"><button className="btn secondary" onClick={signOut}>Sign out</button></div>
  </Gate>;
  return <Gate title="Welcome back, you two">
    <form className="form-stack" onSubmit={event => {
      event.preventDefault();
      const fields = Object.fromEntries(new FormData(event.currentTarget));
      setBusy(true); setError('');
      signIn(fields.email.trim(), fields.password, fields.remember === 'on').catch(e => setError(signInErrors[e.code] ?? 'Sign-in failed. Try again.')).finally(() => setBusy(false));
    }}>
      <label>Email<input name="email" type="email" autoComplete="username" required autoFocus/></label>
      <label>Password<input name="password" type="password" autoComplete="current-password" required/></label>
      <label className="check-row"><input name="remember" type="checkbox" defaultChecked/>Remember me on this device</label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions"><button className="btn primary" disabled={busy}>{busy ? 'Signing in' : 'Sign in'}</button></div>
    </form>
  </Gate>;
}

export function AccountCard({ session, signOut }) {
  const person = PEOPLE.find(item => item.id === session.me);
  return <section className="card settings-card">
    <PanelHeading title="Account" subtitle={`Signed in as ${person.name} (${session.user.email}). Entries you add are logged under ${person.name}.`}
      action={<button className="btn secondary" onClick={signOut}><LogOut size={15}/> Sign out</button>}/>
    <p className="field-help">{session.synced ? 'Your planner is synced. Changes appear on your other devices within a few seconds.' : 'You’re offline. The planner shows the last synced copy, and changes can’t be saved until you reconnect.'}</p>
  </section>;
}
