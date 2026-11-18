import { useEffect, useState } from 'react';
import { ArrowDownLeft, ArrowDownRight, ArrowRight, CalendarDays, ChevronLeft, ChevronRight, CircleDollarSign, Clock3, Landmark, Pencil, PiggyBank, Plus, Target, Trash2, TrendingUp, TriangleAlert, Wallet, CalendarClock, Search } from 'lucide-react';
import { upcomingEvents } from './events.js';
import { goalForecast } from './forecast.js';
import { EMPTY_FILTERS, budgetWarnings, filterEntries, goalPlan, monthLabel, warningLevel } from './insights.js';
import { PEOPLE, personalBudget, visibleCategories, categoryColor, dateFromKey, displayTime, localDate, money, shiftMonth, shortDate } from './model.js';
import { BudgetBoard } from './budget-board.jsx';
import { PlantPair } from './plants.jsx';
import { SavingsTree } from './tree.jsx';
import { CategoryIcon, Empty, EntryHistory, PanelHeading, Person, Progress, WARN_COLOR, WarningBadge } from './ui.jsx';

export function MonthSelector({ month, setMonth }) {
  return <div className="month-switch">
    <button className="icon-btn" aria-label="Previous budget month" onClick={() => setMonth(shiftMonth(month, -1))}><ChevronLeft size={16}/></button>
    <span><CalendarDays size={15}/>{dateFromKey(month + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>
    <button className="icon-btn" aria-label="Next budget month" onClick={() => setMonth(shiftMonth(month, 1))}><ChevronRight size={16}/></button>
  </div>;
}


function BudgetHeadsUp({ warnings, navigate }) {
  if (!warnings.length) return null;
  return <section className="card heads-up" aria-label="Budget heads-up">
    <PanelHeading title="Budget heads-up" subtitle={`${warnings.length} ${warnings.length === 1 ? 'category is' : 'categories are'} close to or over the monthly limit`}
      action={<button className="text-link" onClick={() => navigate('budget')}>Budget <ArrowRight size={14}/></button>}/>
    <ul className="heads-up-list">{warnings.map(row => <li key={row.category.id} className={row.level}>
      <TriangleAlert size={16} aria-hidden="true"/>
      <span><strong>{row.category.name}</strong>{row.level === 'over'
        ? <> is <b>{money(row.spent - row.limit)} over</b> its {money(row.limit, true)} limit</>
        : <>: <b>{money(row.left)} left</b> with {row.daysLeft} {row.daysLeft === 1 ? 'day' : 'days'} to go</>}</span>
    </li>)}</ul>
  </section>;
}

function TransactionFilters({ state, filters, setFilters, month, entries, me }) {
  const set = change => setFilters(current => ({ ...current, ...change }));
  const active = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS);
  const income = entries.filter(entry => entry.type === 'income').reduce((sum, entry) => sum + entry.amount, 0);
  const spent = entries.filter(entry => entry.type === 'expense').reduce((sum, entry) => sum + entry.amount, 0);
  return <div className="transaction-filters">
    <label className="filter-search"><Search size={16} aria-hidden="true"/><input type="search" value={filters.text} onChange={e => set({ text: e.target.value })} placeholder="Search source, category, person or amount" aria-label="Search entries"/></label>
    <div className="filter-fields">
      <label>When<select value={filters.range} onChange={e => set({ range: e.target.value })}>
        <option value="month">{monthLabel(month)}</option><option value="all">All time</option><option value="custom">Date range</option>
      </select></label>
      {filters.range === 'custom' && <>
        <label>From<input type="date" value={filters.from} max={filters.to || undefined} onChange={e => set({ from: e.target.value })}/></label>
        <label>To<input type="date" value={filters.to} min={filters.from || undefined} onChange={e => set({ to: e.target.value })}/></label>
      </>}
      <label>Type<select value={filters.type} onChange={e => set({ type: e.target.value })}><option value="all">All types</option><option value="income">Income</option><option value="expense">Expenses</option></select></label>
      <label>Category<select value={filters.categoryId} onChange={e => set({ categoryId: e.target.value })}><option value="all">All categories</option>{visibleCategories(state, me).map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
      <label>Who<select value={filters.personId} onChange={e => set({ personId: e.target.value })}><option value="all">Both of you</option>{PEOPLE.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
      <label>Min $<input type="number" min="0" step="0.01" inputMode="decimal" value={filters.min} onChange={e => set({ min: e.target.value })}/></label>
      <label>Max $<input type="number" min="0" step="0.01" inputMode="decimal" value={filters.max} onChange={e => set({ max: e.target.value })}/></label>
    </div>
    <div className="filter-summary" role="status">
      <span><b>{entries.length}</b> {entries.length === 1 ? 'entry' : 'entries'}{income > 0 && <> · <b className="positive">+{money(income)}</b> income</>}{spent > 0 && <> · <b className="negative">−{money(spent)}</b> spent</>}</span>
      {active && <button type="button" className="text-link" onClick={() => setFilters(EMPTY_FILTERS)}>Clear filters</button>}
    </div>
  </div>;
}

function Stat({ icon: Icon, tone, label, value, caption }) {
  return <article className="card stat"><span className={`icon-tile ${tone}`}><Icon size={19}/></span><p>{label}</p><strong>{money(value)}</strong><small>{caption}</small></article>;
}


function CategorySummary({ budget, navigate, mine }) {
  // Your categories with the most spending this month come first.
  const rows = [...budget.categories].sort((a, b) => (budget.spentByCategory.get(b.id) ?? 0) - (budget.spentByCategory.get(a.id) ?? 0)).slice(0, 4);
  return <section className="card budget-summary">
    <PanelHeading title={mine ? 'Your budget' : 'Budget overview'} subtitle="Spending by category this month" action={<button className="text-link" onClick={() => navigate('budget')}>View budget <ArrowRight size={14}/></button>}/>
    <div className="budget-summary-list">{rows.map(category => {
      const spent = budget.spentByCategory.get(category.id) ?? 0;
      const limit = budget.limit(category);
      return <div className="summary-category" key={category.id}>
        <CategoryIcon category={category} size={16}/>
        <div><div className="summary-category-label"><strong>{category.name}</strong><span>{money(spent, true)} <small>{limit ? '/ ' + money(limit, true) : 'no budget'}</small></span></div>
          <Progress value={spent} max={limit} color={warningLevel(spent, limit) === 'warn' ? WARN_COLOR : categoryColor(category)} tone="rose" label={category.name + ' spent'}/></div>
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
  const plan = goalPlan(goal, total, forecast, localDate());
  return <>
    <div className={`goal-forecast ${forecast.status}`}><TrendingUp size={16} aria-hidden="true"/><p>{line}{note && <small>{note}</small>}</p></div>
    {plan && plan.status !== 'reached' && <GoalDeadline goal={goal} plan={plan}/>}
  </>;
}

function GoalDeadline({ goal, plan }) {
  const by = shortDate(goal.targetDate);
  if (plan.status === 'passed') return <div className="goal-deadline behind"><CalendarClock size={16} aria-hidden="true"/><p>The target date, {by}, has passed with {money(plan.remaining, true)} to go. Edit the goal to set a new date.</p></div>;
  const pace = { ahead: 'You’re on track at your current pace.', behind: plan.late ? `At your current pace you’d be about ${plan.late} ${plan.late === 1 ? 'month' : 'months'} late.` : 'Your current pace won’t get there in time.', unknown: '' }[plan.pace];
  return <div className={`goal-deadline ${plan.pace}`}><CalendarClock size={16} aria-hidden="true"/>
    <p>To reach it by <strong>{by}</strong>, save <strong>{money(plan.perMonth, true)} a month</strong> for the next {plan.months} {plan.months === 1 ? 'month' : 'months'}.{pace && <small>{pace}</small>}</p></div>;
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
  const budget = personalBudget(state, localDate().slice(0, 7), me);
  return <>
    <section className="welcome-banner">
      <div className="banner-copy"><LiveClock/><h2>{name ? `Welcome back, ${name}.` : 'Welcome back, you two.'}</h2><p>See where your money goes and how close you are to your shared goals.</p><button className="btn primary" onClick={() => open({ kind: 'entry' })}><Plus size={17}/> Add an entry</button></div>
      <div className="banner-plants"><PlantPair/></div>
    </section>
    <BudgetHeadsUp warnings={budgetWarnings(budget, localDate())} navigate={navigate}/>
    <div className="stats-grid">
      {/* Signed in, income is the signed-in person's own; otherwise both profiles combined. */}
      {name ? <Stat icon={ArrowDownLeft} tone="income" label="Your income" value={totals.people[me].income} caption={`This month · ${name} only`}/>
        : <Stat icon={ArrowDownLeft} tone="income" label="Total income" value={totals.income} caption="This month · both profiles"/>}
      <Stat icon={Wallet} tone="expense" label={name ? 'Your spending' : 'Total spending'} value={budget.spent} caption={`Of ${money(budget.budgeted, true)} budgeted this month`}/>
      <Stat icon={PiggyBank} tone="indigo" label="Joint savings" value={totals.jointBalance} caption="Across all saved contributions"/>
    </div>
    <div className="dashboard-columns">
      <CategorySummary budget={budget} navigate={navigate} mine={Boolean(name)}/>
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

export function Budget({ state, totals, month, me, save, open, edit, remove }) {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const entries = filterEntries(state, filters, month);
  const budget = personalBudget(state, month, me);
  const name = PEOPLE.find(person => person.id === me)?.name;
  return <>
    <div className="stats-grid">
      <Stat icon={Landmark} tone="indigo" label={name ? 'Your monthly budget' : 'Monthly budget'} value={budget.budgeted} caption={name ? 'Only you see it · saving folders not included' : 'Saving folders not included'}/>
      <Stat icon={ArrowDownRight} tone="expense" label={name ? 'You spent this month' : 'Spent this month'} value={budget.spent} caption="Money put into savings isn’t counted"/>
      <Stat icon={CircleDollarSign} tone={budget.spent > budget.budgeted ? 'expense' : 'income'} label="Budget remaining" value={budget.budgeted - budget.spent} caption="Budget minus what you spent"/>
    </div>
    <section className="card">
      <PanelHeading title={name ? 'Your budget categories' : 'Budget categories'} subtitle={name ? 'Private to you: your folders, order and limits. Drag a category by its handle to reorder it or move it into a folder.' : 'Drag a category by its handle to reorder it or move it into a folder.'}
        action={<button className="btn secondary" onClick={() => open({ kind: 'category' })}><Plus size={17}/> Add Category</button>}/>
      <BudgetBoard state={state} budget={budget} me={me} save={save} open={open}/>
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
      <PanelHeading title="Entry history" subtitle="Search and filter your income and expenses."/>
      <TransactionFilters state={state} filters={filters} setFilters={setFilters} month={month} entries={entries} me={me}/>
      <EntryHistory state={state} entries={entries} onEdit={edit} onDelete={remove} me={me}/>
    </section>
  </>;
}

export function Savings({ state, totals, me, open, edit, remove }) {
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
      <EntryHistory state={state} entries={state.entries.filter(entry => profile === 'all' || entry.personId === profile)} onEdit={edit} onDelete={remove} me={me}/>
    </section>
  </>;
}
