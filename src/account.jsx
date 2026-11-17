import { useRef, useState } from 'react';
import { Camera, LogOut, Trash2 } from 'lucide-react';
import { imageToAvatar } from './avatars.js';
import { PEOPLE } from './model.js';
import { Plant, PlantPair } from './plants.jsx';
import { Avatar, PanelHeading } from './ui.jsx';

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

export function AccountGate({ session, signIn, signOut, chooseProfile, resetPassword }) {
  const [error, setError] = useState('');
  const [sent, setSent] = useState('');
  const form = useRef(null);
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
    <form className="form-stack" ref={form} onSubmit={event => {
      event.preventDefault();
      const fields = Object.fromEntries(new FormData(event.currentTarget));
      setBusy(true); setError(''); setSent('');
      signIn(fields.email.trim(), fields.password, fields.remember === 'on').catch(e => setError(signInErrors[e.code] ?? 'Sign-in failed. Try again.')).finally(() => setBusy(false));
    }}>
      <label>Email<input name="email" type="email" autoComplete="username" required autoFocus/></label>
      <label>Password<input name="password" type="password" autoComplete="current-password" required/></label>
      <button type="button" className="text-link forgot" disabled={busy} onClick={() => {
        const email = form.current.elements.email.value.trim();
        setError(''); setSent('');
        if (!email) { setError('Enter your email above, then choose Forgot password.'); return; }
        setBusy(true);
        resetPassword(email).then(() => setSent(`If ${email} has an account, a reset link is on its way. Check your inbox and spam folder.`))
          .catch(e => setError(signInErrors[e.code] ?? 'The reset email couldn’t be sent. Try again.')).finally(() => setBusy(false));
      }}>Forgot password?</button>
      <label className="check-row"><input name="remember" type="checkbox" defaultChecked/>Remember me on this device</label>
      {error && <p className="form-error" role="alert">{error}</p>}
      {sent && <p className="form-note" role="status">{sent}</p>}
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

// Signed in, each of you sets your own picture; without sign-in, both can be set here.
export function ProfilePictureCard({ me, avatars, setAvatar, notify }) {
  const people = me ? PEOPLE.filter(person => person.id === me) : PEOPLE;
  return <section className="card settings-card">
    <PanelHeading title={me ? 'Profile picture' : 'Profile pictures'} subtitle="Shown wherever your initials appear, on every device. Square photos work best."/>
    <div className="picture-list">{people.map(person => <PictureRow key={person.id} person={person} has={Boolean(avatars[person.id])} setAvatar={setAvatar} notify={notify}/>)}</div>
  </section>;
}

function PictureRow({ person, has, setAvatar, notify }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function run(task, message) {
    setBusy(true); setError('');
    try { await task(); notify(message); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <div className="picture-row">
    <Avatar id={person.id} className="avatar-large"/>
    <div className="picture-copy"><strong>{person.name}</strong><small>{has ? 'Photo set' : 'Showing initials'}</small>
      {error && <p className="form-error" role="alert">{error}</p>}</div>
    <div className="picture-actions">
      <input ref={input} type="file" accept="image/*" hidden onChange={e => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (file) run(async () => setAvatar(person.id, await imageToAvatar(file)), 'Profile picture updated');
      }}/>
      <button className="btn secondary" disabled={busy} onClick={() => input.current.click()}><Camera size={15}/> {busy ? 'Saving' : has ? 'Change photo' : 'Upload photo'}</button>
      {has && <button className="btn secondary danger-text" disabled={busy} onClick={() => run(() => setAvatar(person.id, null), 'Profile picture removed')}><Trash2 size={15}/> Remove</button>}
    </div>
  </div>;
}
