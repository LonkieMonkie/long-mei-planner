import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CalendarDays, CircleCheck, Download, Heart, LayoutGrid, PiggyBank, Plus, Settings as SettingsIcon, Wallet } from 'lucide-react';
import { Budget, Dashboard, MonthSelector, Savings } from './finance.jsx';
import { CalendarView } from './calendar.jsx';
import { Dialogs } from './dialogs.jsx';
import { Settings } from './settings.jsx';
import { accentStyles } from './appearance.js';
import { Person } from './ui.jsx';
import { LEGACY_KEY, PEOPLE, STORAGE_KEY, contribution, freshData, localDate, readState, summarize } from './model.js';
import { workbook } from './excel.js';
import './style.css';

const views = [
  { id: 'dashboard', name: 'Dashboard', icon: LayoutGrid, subtitle: 'Your finances and plans, together in one place.' },
  { id: 'budget', name: 'Budget', icon: Wallet, subtitle: 'Track income, spending and savings for each of you.' },
  { id: 'calendar', name: 'Calendar', icon: CalendarDays, subtitle: 'See your local events and Google Calendar in one view.' },
  { id: 'savings', name: 'Joint Savings', icon: PiggyBank, subtitle: 'See what each of you has put toward your shared goals.' },
  { id: 'settings', name: 'Settings', icon: SettingsIcon, subtitle: 'Personalize your dashboard.' },
];

function getView() {
  return views.some(view => '#' + view.id === window.location.hash) ? window.location.hash.slice(1) : 'dashboard';
}

function loadDashboard() {
  try {
    return { state: readState(localStorage), error: '', legacy: Boolean(localStorage.getItem(LEGACY_KEY)) };
  } catch (error) {
    return { state: freshData(), error: error.message, legacy: false };
  }
}

function exportExcel(state, totals) {
  const names = new Map(PEOPLE.map(p => [p.id, p.name]));
  const goals = new Map(state.goals.map(g => [g.id, g.name]));
  const blob = workbook([
    { name: 'Entry history', rows: [
      ['Profile', 'Transaction date', 'Type', 'Source', 'Amount (USD)', 'Joint goal', 'Savings %', 'Contribution (USD)', 'Logged at', 'Last edited at'],
      ...state.entries.map(entry => [names.get(entry.personId), entry.date, entry.type, entry.source, entry.amount / 100, goals.get(entry.goalId) ?? '', entry.rate / 100, contribution(entry.amount, entry.rate) / 100, entry.createdAt, entry.editedAt ?? '']),
    ] },
    { name: 'Budget categories', rows: [
      ['Category', 'Monthly limit (USD)'], ...state.categories.map(category => [category.name, category.limit / 100]),
    ] },
    { name: 'Joint savings', rows: [
      ['Goal', 'Target (USD)', 'Long (USD)', 'Mei (USD)', 'Total (USD)'],
      ...state.goals.map(goal => [goal.name, goal.target / 100, totals.goals[goal.id].long / 100, totals.goals[goal.id].mei / 100, totals.goals[goal.id].total / 100]),
      ['Manual adjustment', '', '', '', state.savingsAdjustment / 100], ['Joint balance', '', '', '', totals.jointBalance / 100],
    ] },
    { name: 'Local events', rows: [
      ['Title', 'Date', 'Time', 'Description'], ...state.events.map(event => [event.title, event.date, event.time, event.description]),
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
  const { state, error, legacy } = loaded;
  const [active, setActive] = useState(getView);
  const [month, setMonth] = useState(() => localDate().slice(0, 7));
  const [calendarMonth, setCalendarMonth] = useState(() => localDate().slice(0, 7));
  const [selectedDay, setSelectedDay] = useState(localDate);
  const [modal, setModal] = useState(null);
  const [notice, setNotice] = useState(null);
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

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(timer);
  }, [notice]);

  function save(update, message) {
    const next = update(readState(localStorage));
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); }
    catch { throw new Error('The browser couldn’t save this change. Check site storage and try again.'); }
    setLoaded(current => ({ ...current, state: next, error: '' }));
    setNotice({ message });
  }
  const navigate = id => { window.location.hash = id; };
  const addEntry = () => setModal({ kind: 'entry', date: active === 'budget' && month !== localDate().slice(0, 7) ? month + '-01' : localDate() });
  const edit = item => setModal({ kind: 'entry', item });
  const remove = item => setModal({ kind: 'delete-entry', item });
  return <div className="app-shell" style={accentStyles(state.accentColor)}>
    <aside className="sidebar">
      <a href="#dashboard" className="brand"><span className="brand-mark"><Heart size={21} strokeWidth={2.3}/></span><span>Our Little Life<small>Long &amp; Mei</small></span></a>
      <nav aria-label="Main navigation">{views.map(({ id, name, icon: Icon }) => <a key={id} href={`#${id}`} aria-current={active === id ? 'page' : undefined} className={active === id ? 'active' : ''}><Icon size={19}/><span>{name}</span></a>)}</nav>
      <div className="side-bottom">
        <div className="side-profiles"><div className="avatar-pair"><Person id="long" onlyAvatar/><Person id="mei" onlyAvatar/></div><span>Long &amp; Mei<small>Two profiles</small></span></div>
        <div className="local-status"><span/> Saved on this device</div>
      </div>
    </aside>
    <main className="main-content" id="main">
      <header className="page-header">
        <div><div className="date-kicker"><CalendarDays size={14}/>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</div><h1>{view.name}</h1><p>{view.subtitle}</p></div>
        {active !== 'settings' && <div className="header-actions">
          {active === 'budget' && <MonthSelector {...{ month, setMonth }}/>}
          <button className="btn secondary export-btn" onClick={() => exportExcel(state, totals)}><Download size={16}/> Export Excel</button>
          {active === 'calendar'
            ? <button className="btn primary" onClick={() => setModal({ kind: 'event', date: selectedDay })}><Plus size={17}/> Add event</button>
            : <button className="btn primary" onClick={addEntry}><Plus size={17}/> Add entry</button>}
        </div>}
      </header>
      {error && <p className="inline-alert" role="alert">Saved data could not be loaded. {error}</p>}
      {legacy && <p className="inline-alert">An earlier encrypted planner was found in this browser. Its data is separate from this dashboard.</p>}
      <div className="page-body">
        {active === 'dashboard' && <Dashboard state={state} totals={totals} open={setModal} navigate={navigate}/>}
        {active === 'budget' && <Budget {...{ state, totals, month, save, edit, remove }} open={setModal}/>}
        {active === 'calendar' && <CalendarView {...{ state, save }} open={setModal} month={calendarMonth} setMonth={setCalendarMonth} selected={selectedDay} setSelected={setSelectedDay}/>}
        {active === 'savings' && <Savings {...{ state, totals, edit, remove }} open={setModal}/>}
        {active === 'settings' && <Settings key={state.accentColor} accent={state.accentColor} save={save}/>}
      </div>
    </main>
    {modal && <Dialogs key={modal.kind + (modal.item?.id ?? '')} {...{ modal, state, totals, save }} close={() => setModal(null)} onEventSaved={date => { setSelectedDay(date); setCalendarMonth(date.slice(0, 7)); }}/>}
    {notice && <div className="toast" role="status"><CircleCheck size={18}/>{notice.message}</div>}
  </div>;
}

createRoot(document.getElementById('root')).render(<App/>);
