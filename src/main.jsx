import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BarChart3, CalendarDays, ChevronLeft, ChevronRight, CircleAlert, CircleCheck, HandCoins, LayoutGrid, PiggyBank, Plus, Scale, Settings as SettingsIcon, Sprout, Wallet } from 'lucide-react';
import { Budget, Dashboard, MonthSelector, Savings } from './finance.jsx';
import { CalendarView } from './calendar.jsx';
import { MySavings } from './my-savings.jsx';
import { Insights } from './insights-page.jsx';
import { personalSavings } from './personal-savings.js';
import { DebtTracker } from './debts.jsx';
import { Dialogs } from './dialogs.jsx';
import { ExportCard, Settings, StorageCard, TreeSettings, VersionCard } from './settings.jsx';
import { accentStyles } from './appearance.js';
import { PlantPair } from './plants.jsx';
import { PEOPLE, STORAGE_KEY, categoryColor, entryContribution, entryTime, goalShares, newPlanner, limitFor, visibleCategories, localDate, readState, summarize } from './model.js';
import { workbook } from './excel.js';
import { repeatSummary } from './events.js';
import { AccountCard, AccountGate, ProfilePictureCard } from './account.jsx';
import { AVATAR_KEY, cleanAvatars, readLocalAvatars } from './avatars.js';
import { Avatar, AvatarContext, ErrorBoundary } from './ui.jsx';
import { connect } from './cloud.js';
import { firebaseConfig } from './firebase-config.js';
import './style.css';

const views = [
  { id: 'dashboard', name: 'Dashboard', icon: LayoutGrid, subtitle: 'Your finances and plans, together in one place.' },
  { id: 'budget', name: 'Budget', icon: Wallet, subtitle: 'Track income, spending and savings for each of you.' },
  { id: 'insights', name: 'Insights', icon: BarChart3, subtitle: 'Where your money went, how it compares, and a recap to look back on.' },
  { id: 'calendar', name: 'Calendar', icon: CalendarDays, subtitle: 'See your events, budget entries, deposits and debt payments.' },
  { id: 'savings', name: 'Joint Savings', icon: PiggyBank, subtitle: 'See what each of you has put toward your shared goals.' },
  { id: 'my-savings', name: 'My Savings', icon: HandCoins, subtitle: 'Your own savings: money you add or take out, plus what you save from income.' },
  { id: 'debts', name: 'Debt Tracker', icon: Scale, subtitle: 'Track what you owe each other and record payments.' },
  { id: 'settings', name: 'Settings', icon: SettingsIcon, subtitle: 'Personalize your dashboard and export your records.' },
];

const SIDEBAR_KEY = 'our-little-life.sidebar';

function getView() {
  return views.some(view => '#' + view.id === window.location.hash) ? window.location.hash.slice(1) : 'dashboard';
}

function loadDashboard() {
  try {
    return { state: readState(localStorage), error: '' };
  } catch (error) {
    return { state: newPlanner(), error: error.message };
  }
}

function exportExcel(state, totals, me) {
  const names = new Map(PEOPLE.map(p => [p.id, p.name]));
  const goals = new Map(state.goals.map(g => [g.id, g.name]));
  const categories = new Map(state.categories.map(c => [c.id, c.name]));
  const blob = workbook([
    { name: 'Entry history', rows: [
      ['Profile', 'Transaction date', 'Transaction time', 'Type', 'Source', 'Amount (USD)', 'Budget split', 'Joint goal', 'Savings %', 'Contribution (USD)', 'Logged at', 'Last edited at'],
      ...state.entries.map(entry => [names.get(entry.personId), entry.date, entryTime(entry), entry.type, entry.source, entry.amount / 100, (entry.splits ?? []).map(split => `${categories.get(split.categoryId) ?? 'Deleted category'} ${split.rate / 100}% ($${(split.amount / 100).toFixed(2)})`).join('; '), goalShares(entry).map(share => goals.get(share.goalId)).join(', '), entry.rate === undefined ? '' : entry.rate / 100, entryContribution(entry) / 100, entry.createdAt, entry.editedAt ?? '']),
    ] },
    { name: 'Budget categories', rows: [
      ['Category', 'Monthly limit (USD)', 'Color', 'Long savings %', 'Mei savings %', 'Long income share %', 'Mei income share %', 'Joint goal'],
      // Only the exporting person's own categories and limits: the other profile's stay private.
      ...visibleCategories(state, me).map(category => [category.name, limitFor(category, me) / 100, categoryColor(category), (category.savingsRates?.long ?? 0) / 100, (category.savingsRates?.mei ?? 0) / 100, (category.incomeShares?.long ?? 0) / 100, (category.incomeShares?.mei ?? 0) / 100, goals.get(category.savingsGoalId) ?? '']),
    ] },
    { name: 'Joint savings', rows: [
      ['Goal', 'Target (USD)', 'Long (USD)', 'Mei (USD)', 'Total (USD)'],
      ...state.goals.map(goal => [goal.name, goal.target / 100, totals.goals[goal.id].long / 100, totals.goals[goal.id].mei / 100, totals.goals[goal.id].total / 100]),
      ['Manual adjustment', '', '', '', state.savingsAdjustment / 100], ['Joint balance', '', '', '', totals.jointBalance / 100],
    ] },
    { name: 'Personal savings', rows: [
      ['Profile', 'Date', 'Time', 'Type', 'Note', 'Amount (USD)'],
      ...PEOPLE.flatMap(person => personalSavings(state, person.id).rows.map(row => [person.name, row.date, row.time,
        row.kind === 'income' ? 'Saved from income' : row.kind === 'budget' ? 'Logged in Personal saving' : row.amount < 0 ? 'Taken out' : 'Added', row.note, row.amount / 100])),
    ] },
    { name: 'Events', rows: [
      ['Title', 'Category', 'Date', 'Time', 'Repeats', 'Description'], ...state.events.map(event => [event.title, state.eventCategories.find(category => category.id === event.categoryId)?.name ?? '', event.date, event.time, repeatSummary(event), event.description]),
    ] },
    { name: 'Debts', rows: [
      ['Description', 'Owed by', 'Owed to', 'Amount (USD)', 'Logged by', 'Logged at', 'Settled at'],
      ...state.debts.map(debt => [debt.description, names.get(debt.debtorId), names.get(debt.creditorId), debt.amount / 100,
        names.get(debt.addedBy), debt.createdAt, debt.settledAt ?? '']),
    ] },
  ]);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `long-mei-dashboard-${localDate()}.xlsx`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function App() {
  const [loaded, setLoaded] = useState(loadDashboard);
  const { state, error } = loaded;
  const [active, setActive] = useState(getView);
  const [month, setMonth] = useState(() => localDate().slice(0, 7));
  const [calendarMonth, setCalendarMonth] = useState(() => localDate().slice(0, 7));
  const [selectedDay, setSelectedDay] = useState(localDate);
  const [modal, setModal] = useState(null);
  const [notice, setNotice] = useState(null);
  // The sidebar starts retracted; the choice is remembered on this device only.
  const [expanded, setExpanded] = useState(() => { try { return localStorage.getItem(SIDEBAR_KEY) === 'open'; } catch { return false; } });
  function toggleSidebar() {
    setExpanded(open => {
      try { localStorage.setItem(SIDEBAR_KEY, open ? 'closed' : 'open'); } catch { /* Not remembered; it still toggles. */ }
      return !open;
    });
  }
  const totals = summarize(state, active === 'dashboard' ? localDate().slice(0, 7) : month);
  const view = views.find(item => item.id === active);

  useEffect(() => {
    const hash = () => { setActive(getView()); setModal(null); window.scrollTo(0, 0); };
    const storage = event => { if (event.key === STORAGE_KEY || event.key === null) setLoaded(loadDashboard()); };
    window.addEventListener('hashchange', hash);
    window.addEventListener('storage', storage);
    return () => {
      window.removeEventListener('hashchange', hash);
      window.removeEventListener('storage', storage);
    };
  }, []);

  // Login and syncing, active only when a Firebase project is configured.
  const cloudOn = Boolean(firebaseConfig);
  const [avatars, setAvatars] = useState(() => cloudOn ? {} : readLocalAvatars(localStorage));
  const [session, setSession] = useState({ status: cloudOn ? 'loading' : 'local', user: null, me: null, taken: [], synced: false, error: '' });
  const backend = useRef(null);
  const remote = useRef(null);
  useEffect(() => {
    if (!cloudOn) return;
    let stopUser = () => {}, stopData = () => {}, stopAvatars = () => {}, cancelled = false;
    const fail = error => setSession(current => ({ ...current, status: 'error', error: error.code === 'permission-denied'
      ? 'This account isn’t allowed to open the planner. Check the two emails in your Firebase rules.'
      : 'The shared planner couldn’t be reached. Check your connection and try again.' }));
    connect(firebaseConfig).then(api => {
      if (cancelled) return;
      backend.current = api;
      stopUser = api.onUser(user => {
        stopData(); stopData = () => {}; stopAvatars(); stopAvatars = () => {}; remote.current = null;
        if (!user) { setSession(current => ({ ...current, status: 'signed-out', user: null, me: null })); return; }
        setSession(current => ({ ...current, status: 'loading', user }));
        // Pictures are optional: if they can't load, the initials stay.
        stopAvatars = api.subscribeAvatars(data => setAvatars(cleanAvatars(data)), () => {});
        stopData = api.subscribe((data, fromCache) => {
          if (!data && fromCache) return; // Offline with nothing cached: wait for the server's answer.
          if (!data) {
            // Very first sign-in: this browser's planner becomes the shared one.
            let local;
            try { local = readState(localStorage); } catch { local = newPlanner(); }
            api.transact(current => current ? null : { json: JSON.stringify(local), rev: 1, profiles: {}, updatedAt: new Date().toISOString(), updatedBy: user.uid }).catch(fail);
            return;
          }
          remote.current = data;
          try { localStorage.setItem(STORAGE_KEY, data.json); } catch { /* The page still shows the synced copy from memory. */ }
          let state;
          try { state = readState({ getItem: () => data.json }); } catch (error) { fail(error); return; }
          setLoaded(current => ({ ...current, state, error: '' }));
          const profiles = data.profiles ?? {};
          const me = profiles[user.uid] ?? null;
          setSession({ status: me ? 'ready' : 'choose-profile', user, me, taken: Object.values(profiles), synced: !fromCache, error: '' });
        }, fail);
      });
    }).catch(fail);
    return () => { cancelled = true; stopUser(); stopData(); stopAvatars(); };
  }, []);
  const signOut = () => backend.current.signOut();
  async function setAvatar(personId, url) {
    if (cloudOn) {
      if (!navigator.onLine) throw new Error('You’re offline. Reconnect to change your picture.');
      await backend.current.setAvatar(personId, url);
      return;
    }
    const next = { ...avatars, [personId]: url };
    if (!url) delete next[personId];
    try { localStorage.setItem(AVATAR_KEY, JSON.stringify(next)); } catch { throw new Error('This browser is out of storage space for pictures.'); }
    setAvatars(next);
  }
  const chooseProfile = personId => backend.current.transact(current => {
    if (Object.values(current.profiles ?? {}).includes(personId)) throw new Error('That profile is already linked to the other account.');
    return { ...current, profiles: { ...current.profiles, [session.user.uid]: personId } };
  });

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(timer);
  }, [notice]);

  function save(update, message) {
    if (cloudOn && !navigator.onLine) throw new Error('You’re offline. Reconnect to save changes.');
    const next = update(readState(localStorage));
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); }
    catch { throw new Error('The browser couldn’t save this change. Check site storage and try again.'); }
    setLoaded(current => ({ ...current, state: next, error: '' }));
    setNotice({ message });
    if (!cloudOn) return;
    // Re-apply the same change to the newest shared copy, so edits from both devices are kept.
    const uid = session.user.uid;
    backend.current.transact(current => ({
      ...current, json: JSON.stringify(update(readState({ getItem: () => current.json }))),
      rev: (current.rev ?? 0) + 1, updatedAt: new Date().toISOString(), updatedBy: uid,
    })).catch(error => {
      if (remote.current) {
        try { localStorage.setItem(STORAGE_KEY, remote.current.json); } catch { /* Ignored: the next sync replaces it. */ }
        setLoaded(loadDashboard());
      }
      // Firebase errors carry a code; anything else means the change no longer fits the latest
      // shared copy (for example, the other phone deleted what was being edited).
      setNotice({ message: error?.code ? 'That change wasn’t saved to your shared planner. Check your connection and try again.'
        : `That change wasn’t saved: ${error?.message ?? 'the planner changed on another device.'}`, warn: true });
    });
  }
  const navigate = id => { window.location.hash = id; };
  const addEntry = () => setModal({ kind: 'entry', date: active === 'budget' && month !== localDate().slice(0, 7) ? month + '-01' : localDate() });
  const edit = item => setModal({ kind: 'entry', item });
  const remove = item => setModal({ kind: 'delete-entry', item });
  const me = PEOPLE.find(person => person.id === session.me);
  if (cloudOn && session.status !== 'ready') {
    return <div className="app-shell" style={accentStyles(state.accentColor)}>
      <AccountGate session={session} signIn={(email, password, remember) => backend.current.signIn(email, password, remember)} resetPassword={email => backend.current.resetPassword(email)} signOut={signOut} chooseProfile={chooseProfile}/>
    </div>;
  }
  return <AvatarContext.Provider value={avatars}><div className={expanded ? 'app-shell' : 'app-shell sidebar-collapsed'} style={accentStyles(state.accentColor)}>
    <aside className="sidebar">
      <button className="sidebar-toggle" onClick={toggleSidebar} aria-expanded={expanded} aria-label={expanded ? 'Collapse sidebar' : 'Expand sidebar'} title={expanded ? 'Collapse sidebar' : 'Expand sidebar'}>
        {expanded ? <ChevronLeft size={16}/> : <ChevronRight size={16}/>}
      </button>
      <a href="#dashboard" className="brand"><span className="brand-mark"><Sprout size={21} strokeWidth={2.3}/></span><span>Our Little Life<small>Long &amp; Mei</small></span></a>
      <nav aria-label="Main navigation">{views.map(({ id, name, icon: Icon }) => <a key={id} href={`#${id}`} title={expanded ? undefined : name} aria-current={active === id ? 'page' : undefined} className={active === id ? 'active' : ''}><Icon size={19}/><span>{name}</span></a>)}</nav>
      <div className="side-bottom">
        <div className="side-profiles">{me && avatars[me.id] ? <Avatar id={me.id} className="side-avatar"/> : <PlantPair mini/>}<span>{me ? me.name : <>Long &amp; Mei</>}<small>{me ? 'Signed in' : 'Two profiles'}</small></span></div>
        <div className={cloudOn && !session.synced ? 'local-status offline' : 'local-status'}><span/> {!cloudOn ? 'Saved on this device' : session.synced ? 'Synced across your devices' : 'Offline'}</div>
      </div>
    </aside>
    <main className="main-content" id="main">
      <header className="page-header">
        <div><div className="date-kicker"><CalendarDays size={14}/>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</div><h1>{view.name}</h1><p>{view.subtitle}</p></div>
        {active !== 'settings' && <div className="header-actions">
          {active === 'budget' && <MonthSelector {...{ month, setMonth }}/>}
          {active === 'calendar' && <button className="btn primary" onClick={() => setModal({ kind: 'event', date: selectedDay })}><Plus size={17}/> Add event</button>}
          {active === 'debts' && <button className="btn primary" onClick={() => setModal({ kind: 'debt' })}><Plus size={17}/> Log debt</button>}
          {active !== 'calendar' && active !== 'debts' && <button className="btn primary" onClick={addEntry}><Plus size={17}/> Add entry</button>}
        </div>}
      </header>
      {error && <p className="inline-alert" role="alert">Saved data could not be loaded. {error}</p>}
      <div className="page-body">
        <ErrorBoundary resetKey={active}>
        {active === 'dashboard' && <Dashboard state={state} totals={totals} me={session.me} open={setModal} navigate={navigate}/>}
        {active === 'budget' && <Budget me={session.me} {...{ state, totals, month, save, edit, remove }} open={setModal}/>}
        {active === 'calendar' && <CalendarView me={session.me} state={state} open={setModal} month={calendarMonth} setMonth={setCalendarMonth} selected={selectedDay} setSelected={setSelectedDay}/>}
        {active === 'savings' && <Savings me={session.me} {...{ state, totals, edit, remove }} open={setModal}/>}
        {active === 'insights' && <Insights state={state}/>}
        {active === 'my-savings' && <MySavings state={state} me={session.me} open={setModal} editEntry={edit}/>}
        {active === 'debts' && <DebtTracker debts={state.debts} open={setModal}/>}
        {active === 'settings' && <>{cloudOn && <AccountCard session={session} signOut={signOut}/>}<ProfilePictureCard me={session.me} avatars={avatars} setAvatar={setAvatar} notify={message => setNotice({ message })}/><Settings key={state.accentColor} accent={state.accentColor} save={save}/><TreeSettings key={state.tree.kind + state.tree.perMeter} tree={state.tree} save={save}/><ExportCard onExport={() => exportExcel(state, totals, session.me)}/><StorageCard json={cloudOn ? remote.current?.json : (() => { try { return localStorage.getItem(STORAGE_KEY); } catch { return ''; } })()} entries={state.entries} synced={cloudOn}/><VersionCard/></>}
        </ErrorBoundary>
      </div>
    </main>
    {modal && <Dialogs key={modal.kind + (modal.item?.id ?? '')} {...{ modal, state, totals, save }} me={session.me} close={() => setModal(null)} onEventSaved={date => { setSelectedDay(date); setCalendarMonth(date.slice(0, 7)); }}/>}
    {notice && <div className={notice.warn ? 'toast warn' : 'toast'} role="status">{notice.warn ? <CircleAlert size={18}/> : <CircleCheck size={18}/>}{notice.message}</div>}
  </div></AvatarContext.Provider>;
}

createRoot(document.getElementById('root')).render(<App/>);
