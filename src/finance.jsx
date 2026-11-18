import { useEffect, useState } from 'react';
import { ArrowDownLeft, ArrowDownRight, ArrowRight, CalendarDays, ChevronLeft, ChevronRight, CircleDollarSign, Clock3, Landmark, LockKeyhole, Pencil, PiggyBank, Plus, SlidersHorizontal, Target, TrendingUp, Wallet } from 'lucide-react';
import { upcomingEvents } from './events.js';
import { goalForecast } from './forecast.js';
import { PEOPLE, categoryColor, dateFromKey, displayTime, isPermanentCategory, localDate, reservedNameError, money, shiftMonth, shortDate } from './model.js';
import { PlantPair } from './plants.jsx';
import { SavingsTree } from './tree.jsx';
import { CATEGORY_ICONS, Empty, EntryHistory, InlineName, PanelHeading, Person, Progress } from './ui.jsx';

export function MonthSelector({ month, setMonth }) {
  return <div className="month-switch">
    <button className="icon-btn" aria-label="Previous budget month" onClick={() => setMonth(shiftMonth(month, -1))}><ChevronLeft size={16}/></button>
    <span><CalendarDays size={15}/>{dateFromKey(month + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>
    <button className="icon-btn" aria-label="Next budget month" onClick={() => setMonth(shiftMonth(month, 1))}><ChevronRight size={16}/></button>
  </div>;
}

function Stat({ icon: Icon, tone, label, value, caption }) {
  return <article className="card stat"><span className={`icon-tile ${tone}`}><Icon size={19}/></span><p>{label}</p><strong>{money(value)}</strong><small>{caption}</small></article>;
}

function CategoryIcon({ category, size }) {
  const Icon = CATEGORY_ICONS[category.icon] ?? CATEGORY_ICONS.tag;
  return <span className="icon-tile category-icon" style={{ '--category-color': categoryColor(category) }}><Icon size={size}/></span>;
}

function CategorySummary({ state, totals, navigate }) {
  return <section className="card budget-summary">
    <PanelHeading title="Budget overview" subtitle="Spending by category this month" action={<button className="text-link" onClick={() => navigate('budget')}>View budget <ArrowRight size={14}/></button>}/>
    <div className="budget-summary-list">{state.categories.slice(0, 4).map(category => {
      const spent = totals.spentByCategory.get(category.id) ?? 0;
      return <div className="summary-category" key={category.id}>
        <CategoryIcon category={category} size={16}/>
        <div><div className="summary-category-label"><strong>{category.name}</strong><span>{money(spent, true)} <small>/ {money(category.limit, true)}</small></span></div>
          <Progress value={spent} max={category.limit} color={categoryColor(category)} label={category.name + ' spent'}/></div>
      </div>;
    })}</div>
  </section>;
}

const basisNote = forecast => 'Based on your deposits ' + (forecast.since ? 'since ' + shortDate(forecast.since) : 'in the last 90 days') + '.';

function GoalForecast({ goal, entries, total }) {
  const forecast = goalForecast(entries, goal, total, localDate());
  const target = money(goal.target, true);
  let line, note;
  switch (forecast.status) {
    case 'reached': line = `You’ve reached your ${target} goal.`; break;
    case 'no-data': line = `Add a deposit to see when you’ll reach ${target}.`; break;
    case 'stalled': line = 'No deposits in the last 90 days, so there’s no current pace to forecast from.'; note = 'Last deposit ' + shortDate(forecast.last) + '.'; break;
    case 'far': line = `At about ${money(forecast.perMonth, true)} a month, reaching ${target} would take more than 50 years.`; note = basisNote(forecast); break;
    default: {
      const when = forecast.days > 60
        ? dateFromKey(forecast.date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
        : shortDate(forecast.date);
      line = <>At about {money(forecast.perMonth, true)} a month, you’ll reach {target} around <strong>{when}</strong>.</>;
      note = basisNote(forecast);
    }
  }
  return <div className={`goal-forecast ${forecast.status}`}><TrendingUp size={16} aria-hidden="true"/><p>{line}{note && <small>{note}</small>}</p></div>;
}

function GoalProgress({ goal, totals, entries }) {
  const pct = goal.target ? Math.round(totals.total / goal.target * 100) : 0;
  return <>
    <div className="goal-numbers"><strong>{money(totals.total)}</strong><span>{money(goal.target, true)} goal</span></div>
    <Progress value={totals.total} max={goal.target} label={goal.name + ' progress'}/>
    <div className="goal-caption"><span>{pct}% funded</span><span>{money(Math.max(0, goal.target - totals.total), true)} to go</span></div>
    <GoalForecast goal={goal} entries={entries} total={totals.total}/>
  </>;
}

function LiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    // Tick on the second boundary so the display never lags behind the device clock.
    let timer = setTimeout(function tick() { setNow(new Date()); timer = setTimeout(tick, 1000 - Date.now() % 1000); }, 1000 - Date.now() % 1000);
    return () => clearTimeout(timer);
  }, []);
  const [time, period] = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' }).split(' ');
  return <time className="live-clock" dateTime={now.toISOString()}><Clock3 size={15} aria-hidden="true"/><b>{time}</b>{period}</time>;
}

export function Dashboard({ state, totals, me, open, navigate }) {
  const goal = state.goals[0];
  const upcoming = upcomingEvents(state.events, localDate());
  const name = PEOPLE.find(person => person.id === me)?.name;
  return <>
    <section className="welcome-banner">
      <div className="banner-copy"><LiveClock/><h2>{name ? `Welcome back, ${name}.` : 'Welcome back, you two.'}</h2><p>See where your money goes and how close you are to your shared goals.</p><button className="btn primary" onClick={() => open({ kind: 'entry' })}><Plus size={17}/> Add an entry</button></div>
      <div className="banner-plants"><PlantPair/></div>
    </section>
    <div className="stats-grid">
      {/* Signed in, income is the signed-in person's own; otherwise both profiles combined. */}
      {name ? <Stat icon={ArrowDownLeft} tone="mint" label="Your income" value={totals.people[me].income} caption={`This month · ${name} only`}/>
        : <Stat icon={ArrowDownLeft} tone="mint" label="Total income" value={totals.income} caption="This month · both profiles"/>}
      <Stat icon={Wallet} tone="rose" label="Total spending" value={totals.spent} caption={`Of ${money(totals.budgeted, true)} budgeted this month`}/>
      <Stat icon={PiggyBank} tone="indigo" label="Joint savings" value={totals.jointBalance} caption="Across all saved contributions"/>
    </div>
    <div className="dashboard-columns">
      <CategorySummary state={state} totals={totals} navigate={navigate}/>
      <section className="card goal-preview">
        <PanelHeading title="Joint goals" subtitle="Track the goals you share" action={<button className="text-link" onClick={() => navigate('savings')}>View goals <ArrowRight size={14}/></button>}/>
        {goal && <div className="goal-preview-inner"><div className="goal-title"><span className="icon-tile indigo"><Target size={20}/></span><h3>{goal.name}</h3></div><GoalProgress goal={goal} totals={totals.goals[goal.id]} entries={state.entries}/></div>}
        <div className="couple-note"><PlantPair mini/><span>Two separate budgets, one shared goal.</span></div>
      </section>
    </div>
    <div className="dashboard-columns lower-columns">
      <section className="card">
        <PanelHeading title="Recent activity" action={<button className="text-link" onClick={() => navigate('budget')}>View history <ArrowRight size={14}/></button>}/>
        <EntryHistory state={state} entries={state.entries.slice(0, 4)} compact/>
      </section>
      <section className="card">
        <PanelHeading title="Upcoming events" action={<button className="text-link" onClick={() => navigate('calendar')}>Calendar <ArrowRight size={14}/></button>}/>
        {!upcoming.length ? <Empty icon={CalendarDays}>No upcoming events.</Empty> : upcoming.map(({ event, date }) => <div className="upcoming" key={event.id + date}><span className="icon-tile blue"><CalendarDays size={17}/></span><span><strong>{event.title}</strong><small>{shortDate(date)}{event.time && ' · ' + displayTime(event.time)}{event.repeat && ' · repeats'}</small></span></div>)}
      </section>
    </div>
  </>;
}

export function Budget({ state, totals, month, save, open, edit, remove }) {
  const [profile, setProfile] = useState('all');
  const entries = state.entries.filter(entry => entry.date.startsWith(month + '-') && (profile === 'all' || entry.personId === profile));
  return <>
    <div className="stats-grid">
      <Stat icon={Landmark} tone="indigo" label="Monthly budget" value={totals.budgeted} caption="Across all spending categories"/>
      <Stat icon={ArrowDownRight} tone="rose" label="Spent this month" value={totals.spent} caption={`${state.entries.filter(e => e.type === 'expense' && e.date.startsWith(month + '-')).length} expense entries`}/>
      <Stat icon={CircleDollarSign} tone={totals.spent > totals.budgeted ? 'rose' : 'mint'} label="Budget remaining" value={totals.budgeted - totals.spent} caption="Budget limits minus recorded expenses"/>
    </div>
    <section className="card">
      <PanelHeading title="Budget categories" subtitle="Click a name to rename it. Use category settings to change its color and savings rates."
        action={<button className="btn secondary" onClick={() => open({ kind: 'category' })}><Plus size={17}/> Add Category</button>}/>
      <div className="category-table">
        {state.categories.map(category => {
          const spent = totals.spentByCategory.get(category.id) ?? 0;
          const permanent = isPermanentCategory(category.id);
          return <div className="category-row" key={category.id}>
            <CategoryIcon category={category} size={18}/>
            <div className="category-name">
              {permanent ? <span className="rename"><strong>{category.name}</strong><LockKeyhole size={13} aria-label="Permanent category"/></span>
                : <InlineName name={category.name} save={name => {
                  if (reservedNameError(name)) throw new Error(reservedNameError(name));
                  save(current => ({ ...current, categories: current.categories.map(item => item.id === category.id ? { ...item, name } : item) }), 'Category renamed');
                }}/>}
              <div className="category-rates"><span>Savings: {PEOPLE.map(person => `${person.name} ${(category.savingsRates?.[person.id] ?? 0) / 100}%`).join(' · ')}</span>
                {category.incomeShares && <span>Income share: {PEOPLE.map(person => `${person.name} ${(category.incomeShares[person.id] ?? 0) / 100}%`).join(' · ')}</span>}</div>
            </div>
            <div className="category-meter"><Progress value={spent} max={category.limit} color={spent <= category.limit ? categoryColor(category) : undefined} tone="rose" label={category.name + ' spent'}/></div>
            <div className="category-figures"><strong className={spent > category.limit ? 'negative' : ''}>{money(spent)}</strong><span> / {money(category.limit)}</span>{totals.fundedByCategory.has(category.id) && <small className="set-aside">{money(totals.fundedByCategory.get(category.id))} set aside</small>}</div>
            <div className="category-actions">
              <button className="icon-btn bordered" aria-label={`Edit ${category.name} budget limit`} title="Edit budget limit" onClick={() => open({ kind: 'limit', item: category })}><Pencil size={14}/></button>
              <button className="icon-btn bordered" aria-label={`${category.name} category settings`} title="Category color and savings rates" onClick={() => open({ kind: 'category', item: category })}><SlidersHorizontal size={15}/></button>
            </div>
          </div>;
        })}
      </div>
    </section>
    <div className="profile-grid">
      {PEOPLE.map(person => {
        const amounts = totals.people[person.id];
        return <section className="card profile-card" key={person.id}>
          <PanelHeading title={person.name + '’s monthly activity'} action={<Person id={person.id} onlyAvatar/>}/>
          <dl><div><dt>Income</dt><dd>{money(amounts.income)}</dd></div><div><dt>Spent</dt><dd>{money(amounts.spent)}</dd></div><div><dt>To joint goals</dt><dd>{money(amounts.allocated)}</dd></div><div><dt>Personal</dt><dd>{money(amounts.personal)}</dd></div></dl>
        </section>;
      })}
    </div>
    <section className="card">
      <PanelHeading title="Entry history" subtitle="Income and expenses logged for this month"
        action={<select aria-label="Filter budget history by profile" value={profile} onChange={e => setProfile(e.target.value)}><option value="all">Both profiles</option>{PEOPLE.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select>}/>
      <EntryHistory state={state} entries={entries} onEdit={edit} onDelete={remove}/>
    </section>
  </>;
}

export function Savings({ state, totals, open, edit, remove }) {
  const [profile, setProfile] = useState('all');
  return <>
    <div className="savings-layout">
      <section className="balance-card">
        <span className="balance-icon"><PiggyBank size={23}/></span><p>Total joint savings</p><strong>{money(totals.jointBalance)}</strong>
        <button className="btn balance-button" onClick={() => open({ kind: 'balance' })}><Pencil size={15}/> Edit balance</button>
        <div className="balance-breakdown"><span>Logged contributions <b>{money(totals.totalContributions)}</b></span><span>Manual adjustment <b>{money(state.savingsAdjustment)}</b></span></div>
      </section>
      <section className="card contribution-card">
        <PanelHeading title="Contributions by person" subtitle="Total allocated across all joint goals"/>
        {PEOPLE.map(person => <div className="contribution-person" key={person.id}><Person id={person.id}/><strong>{money(Object.values(totals.goals).reduce((sum, goal) => sum + goal[person.id], 0))}</strong></div>)}
      </section>
    </div>
    <SavingsTree balance={totals.jointBalance} tree={state.tree}/>
    <section className="card">
      <PanelHeading title="Savings goals" subtitle="Each goal adds up the contributions assigned to it." action={<div className="flex flex-wrap gap-2">
        <button className="btn secondary" onClick={() => open({ kind: 'goal' })}><Plus size={17}/> Add goal</button>
        <button className="btn primary" onClick={() => open({ kind: 'wedding-deposit' })}><Plus size={17}/> Add deposit</button>
      </div>}/>
      <div className="goals-grid">{state.goals.map(goal => <article className="goal-item" key={goal.id}>
        <div className="goal-title"><span className="icon-tile indigo"><Target size={19}/></span><h3>{goal.name}</h3><button className="icon-btn" aria-label={`Edit goal ${goal.name}`} onClick={() => open({ kind: 'goal', item: goal })}><Pencil size={14}/></button></div>
        <GoalProgress goal={goal} totals={totals.goals[goal.id]} entries={state.entries}/>
        <div className="goal-people">{PEOPLE.map(person => <span key={person.id}><Person id={person.id}/><b>{money(totals.goals[goal.id][person.id])}</b></span>)}</div>
      </article>)}</div>
    </section>
    <section className="card">
      <PanelHeading title="Audit history" subtitle="All saved entries, including their exact goal contributions."
        action={<select aria-label="Filter audit history by profile" value={profile} onChange={e => setProfile(e.target.value)}><option value="all">Both profiles</option>{PEOPLE.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select>}/>
      <EntryHistory state={state} entries={state.entries.filter(entry => profile === 'all' || entry.personId === profile)} onEdit={edit} onDelete={remove}/>
    </section>
  </>;
}
