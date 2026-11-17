import { useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, PiggyBank } from 'lucide-react';
import { PEOPLE, WEDDING_CATEGORY_ID, categoryColor, contribution, debtFromFields, decimalUnits, entryContribution, entryFromFields, incomeSplits, entryTime, localDate, localTime, money, shortDate, savingsRule, setJointBalance, settleDebt } from './model.js';
import { ActionForm, Modal } from './ui.jsx';
import { CategoryForm } from './category-form.jsx';
import { REPEATS, deleteEvent, eventFromFields } from './events.js';

function EntryForm({ state, item, date, person, me, weddingDeposit = false, close, save }) {
  const [type, setType] = useState(weddingDeposit ? 'expense' : item?.type ?? 'income');
  const [amount, setAmount] = useState(item ? String(item.amount / 100) : '');
  const [categoryId, setCategoryId] = useState(weddingDeposit ? WEDDING_CATEGORY_ID : item?.categoryId ?? '');
  const [personId, setPersonId] = useState(item?.personId ?? person ?? me ?? 'long');
  const category = state.categories.find(item => item.id === categoryId);
  const { rate, goalId } = savingsRule(category, personId, state.goals, item);
  const [initialTime] = useState(() => item ? entryTime(item) : localTime());
  const [shares, setShares] = useState(() => initialShares(state, personId, item));
  let units = 0, projected = 0;
  try { units = decimalUnits(amount || '0'); projected = contribution(units, rate); } catch { /* Invalid amounts are reported on submit. */ }
  function choosePerson(id) {
    setPersonId(id);
    setShares(initialShares(state, id, item));
  }
  function submit(fields) {
    let rates = {};
    if (type === 'income') {
      rates = shareRates(state, shares);
      fields = { ...fields, splits: JSON.stringify(state.categories.filter(c => shares[c.id]?.on).map(c => ({ categoryId: c.id, rate: rates[c.id] }))) };
    }
    save(current => {
      if (item && !current.entries.some(entry => entry.id === item.id && entry.editedAt === item.editedAt)) {
        throw new Error('This entry changed in another tab. Close the form and open it again.');
      }
      const entry = entryFromFields(fields, current, item);
      // The percentages shown become this person's saved shares, ticked or not.
      if (type === 'income') current = { ...current, categories: current.categories.map(c => c.id in rates && rates[c.id] !== (c.incomeShares?.[entry.personId] ?? 0)
        ? { ...c, incomeShares: { ...c.incomeShares, [entry.personId]: rates[c.id] } } : c) };
      return { ...current, entries: item ? current.entries.map(row => row.id === entry.id ? entry : row) : [entry, ...current.entries] };
    }, item ? 'Entry updated' : 'Entry saved');
    close();
  }
  const splitTotal = type === 'income' ? tickedTotal(state, shares) : 0;
  return <ActionForm onSave={submit} cancel={close} disabled={splitTotal !== 0 && splitTotal !== 10_000} label={item ? 'Save changes' : weddingDeposit ? 'Save deposit' : 'Save entry'}>
    {!weddingDeposit && <div className="segmented" aria-label="Entry type">
      <button type="button" aria-pressed={type === 'income'} onClick={() => setType('income')}><ArrowDownLeft size={16}/> Income</button>
      <button type="button" aria-pressed={type === 'expense'} onClick={() => setType('expense')}><ArrowUpRight size={16}/> Expense</button>
    </div>}
    <input type="hidden" name="type" value={type}/>
    {weddingDeposit && <p className="field-help">This will log a Wedding budget entry and add the amount shown below to Joint Savings.</p>}
    {me && !item && !person
      ? <input type="hidden" name="personId" value={me}/>
      : <label>Who is adding this?<select name="personId" value={personId} onChange={e => choosePerson(e.target.value)}>{PEOPLE.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>}
    <div className="form-row">
      <label>Transaction date<input name="date" type="date" defaultValue={item?.date ?? date ?? localDate()} required/></label>
      <label>Transaction time<input name="time" type="time" defaultValue={initialTime} required/></label>
    </div>
    {weddingDeposit ? <input type="hidden" name="categoryId" value={WEDDING_CATEGORY_ID}/> : type === 'income'
      ? <label key="income">Income source (optional)<input name="source" defaultValue={item?.type === 'income' && item.source !== 'Income' ? item.source : ''} placeholder="e.g. Paycheck" maxLength={100}/></label>
      : <label key="expense">Budget category<select name="categoryId" value={categoryId} onChange={e => setCategoryId(e.target.value)} required><option value="" disabled>Select category</option>{state.categories.map(category => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>}
    <label>Amount ($)<input name="amount" type="number" step="0.01" min="0.01" max="1000000000" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} required/></label>
    {type === 'expense' && category && <div className="contribution-preview"><PiggyBank size={19}/><span>
      {PEOPLE.find(p => p.id === personId).name}’s category rate · {rate / 100}%{goalId && ' to ' + state.goals.find(g => g.id === goalId)?.name}
    </span><strong>{money(projected)}</strong></div>}
    {type === 'income' && <IncomeSplit state={state} shares={shares} setShares={setShares} units={units} person={PEOPLE.find(p => p.id === personId)}/>}
    {type === 'income' && item?.type === 'income' && !item.splits && entryContribution(item) > 0 && <p className="field-help">Saving this as income will reverse its previous {money(entryContribution(item))} savings contribution.</p>}
  </ActionForm>;
}

// What the income form shows for each category: ticked and the percentage. An entry being
// edited keeps its recorded split; otherwise the person's saved shares are used.
function initialShares(state, personId, item) {
  const saved = item?.type === 'income' && item.personId === personId ? item.splits ?? [] : null;
  return Object.fromEntries(state.categories.map(category => {
    const split = saved?.find(row => row.categoryId === category.id);
    const rate = split?.rate ?? category.incomeShares?.[personId] ?? 0;
    return [category.id, { on: saved ? Boolean(split) : rate > 0, pct: String(rate / 100) }];
  }));
}

// The sum of the ticked percentages in basis points, or NaN while one is invalid.
function tickedTotal(state, shares) {
  return state.categories.reduce((sum, category) => {
    if (!shares[category.id]?.on) return sum;
    try { return sum + decimalUnits(shares[category.id].pct || '0', 10_000); } catch { return NaN; }
  }, 0);
}

function shareRates(state, shares) {
  return Object.fromEntries(state.categories.map(category => {
    try { return [category.id, decimalUnits(shares[category.id]?.pct || '0', 10_000)]; }
    catch { throw new Error(`Enter a share from 0% to 100% for ${category.name}, with up to two decimals.`); }
  }));
}

function IncomeSplit({ state, shares, setShares, units, person }) {
  const set = (id, change) => setShares(current => ({ ...current, [id]: { ...current[id], ...change } }));
  let total = 0, totalRate = 0;
  const rows = state.categories.map(category => {
    let rate = null;
    try { rate = decimalUnits(shares[category.id]?.pct || '0', 10_000); } catch { /* Shown as invalid; reported on save. */ }
    const on = shares[category.id]?.on;
    const amount = rate === null ? 0 : Math.floor(units * rate / 10_000);
    if (on && rate !== null) { total += amount; totalRate += rate; }
    return { category, rate, on, amount };
  });
  if (totalRate === 10_000) {
    // Show the same cent-exact amounts that will be saved.
    const exact = new Map(incomeSplits(rows.filter(row => row.on).map(row => ({ categoryId: row.category.id, rate: row.rate })), units, state).map(split => [split.categoryId, split.amount]));
    for (const row of rows) if (row.on) row.amount = exact.get(row.category.id) ?? 0;
  }
  return <fieldset className="income-split">
    <legend>Split into budgets</legend>
    <p className="field-help">Tick budgets whose shares add up to 100% to set the money aside for this month. Wedding’s share also adds to joint savings. Percentages are saved for {person.name}.</p>
    <div className="split-rows">{rows.map(({ category, rate, on, amount }) => <div className={on ? 'split-row on' : 'split-row'} key={category.id}>
      <label className="split-check"><input type="checkbox" checked={Boolean(on)} onChange={e => set(category.id, { on: e.target.checked })}/>
        <span className="color-dot" style={{ backgroundColor: categoryColor(category) }}/>{category.name}</label>
      <label className="split-pct"><input type="number" min="0" max="100" step="0.01" inputMode="decimal" aria-label={`${category.name} share of income (%)`} aria-invalid={rate === null}
        value={shares[category.id]?.pct ?? '0'} onChange={e => set(category.id, { pct: e.target.value, on: e.target.value !== '' && Number(e.target.value) > 0 ? true : on })}/>%</label>
      <strong className="split-amount">{on ? money(amount) : '—'}</strong>
    </div>)}</div>
    {!totalRate ? <p className="split-total">Nothing ticked, so this is saved as income without a split.</p>
      : totalRate === 10_000 ? <p className="split-total done">All 100% is split: <strong>{money(units)}</strong> across {rows.filter(row => row.on && row.rate).length} budgets.</p>
      : <p className="split-total over" role="alert">The ticked shares add up to {totalRate / 100}%. {totalRate < 10_000 ? `Add ${(10_000 - totalRate) / 100}% more` : `Remove ${(totalRate - 10_000) / 100}%`} to reach exactly 100%, or untick everything to skip the split.</p>}
  </fieldset>;
}

function titleValue(value, label) {
  const name = value.trim();
  if (!name) throw new Error('Enter a ' + label + '.');
  return name;
}

export function Dialogs({ modal, state, totals, me, close, save, onEventSaved }) {
  if (!modal) return null;
  const { kind, item } = modal;
  const titles = {
    entry: item ? 'Edit entry' : 'Add an entry',
    'wedding-deposit': 'Add Wedding deposit',
    category: item ? item.name + ' settings' : 'Add a budget category', limit: 'Edit budget limit',
    balance: 'Edit joint balance', goal: item ? 'Edit savings goal' : 'Add a savings goal',
    event: 'Add event', 'delete-event': item?.repeat ? 'Delete repeating event?' : 'Delete event?', 'delete-entry': 'Delete entry?',
    debt: 'Log a debt', 'settle-debt': 'Confirm payment?',
  };
  const done = (update, message) => { save(update, message); close(); };
  let content;
  switch (kind) {
    case 'entry':
    case 'wedding-deposit':
      content = <EntryForm {...{ state, item, me, close, save }} date={modal.date} person={modal.person} weddingDeposit={kind === 'wedding-deposit'}/>;
      break;
    case 'category':
      content = <CategoryForm {...{ item, state, done, close }}/>;
      break;
    case 'limit':
      content = <ActionForm cancel={close} label="Save limit" onSave={fields => {
        const limit = decimalUnits(fields.limit);
        done(current => ({ ...current, categories: current.categories.map(category => category.id === item.id ? { ...category, limit } : category) }), 'Budget limit updated');
      }}><label>{item.name} monthly limit ($)<input name="limit" type="number" min="0" max="1000000000" step="0.01" defaultValue={item.limit / 100} required autoFocus/></label></ActionForm>;
      break;
    case 'balance':
      content = <ActionForm cancel={close} label="Save balance" onSave={fields => {
        const desired = decimalUnits(fields.balance, 100_000_000_000, true);
        done(current => setJointBalance(current, desired), 'Joint balance updated');
      }}><label>Current joint balance ($)<input name="balance" type="number" step="0.01" defaultValue={totals.jointBalance / 100} required autoFocus/></label><p className="field-help">This sets the overall balance. Future entry changes still add or subtract their exact contributions.</p></ActionForm>;
      break;
    case 'goal':
      content = <ActionForm cancel={close} label="Save goal" onSave={fields => {
        const name = titleValue(fields.name, 'goal name');
        const target = decimalUnits(fields.target);
        if (!target) throw new Error('Enter a target greater than $0.');
        const goal = { id: item?.id ?? crypto.randomUUID(), name, target };
        done(current => ({ ...current, goals: item ? current.goals.map(g => g.id === goal.id ? goal : g) : [...current.goals, goal] }), 'Savings goal saved');
      }}><label>Goal name<input name="name" defaultValue={item?.name} placeholder="e.g. Wedding" maxLength={70} required autoFocus/></label><label>Target ($)<input name="target" type="number" min="0.01" max="1000000000" step="0.01" defaultValue={item ? item.target / 100 : ''} required/></label></ActionForm>;
      break;
    case 'event':
      content = <EventForm date={modal.date} close={close} done={done} onEventSaved={onEventSaved}/>;
      break;
    case 'debt':
      content = <DebtForm close={close} done={done} me={me}/>;
      break;
    case 'settle-debt':
      content = <ActionForm cancel={close} label="Confirm payment" onSave={() => {
        done(current => settleDebt(current, item.id), 'Payment recorded');
      }}><p className="field-help">Mark {money(item.amount)} for “{item.description}” as paid in full? The calendar records the date and time you confirm.</p></ActionForm>;
      break;
    case 'delete-event':
      content = <DeleteEvent event={item} date={modal.date ?? item.date} close={close} done={done}/>;
      break;
    case 'delete-entry':
      content = <ActionForm cancel={close} label="Delete entry" onSave={() => {
        done(current => ({ ...current, entries: current.entries.filter(entry => entry.id !== item.id) }), 'Entry deleted. Totals updated.');
      }}><p className="field-help">{`Delete the ${item.source} entry for ${money(item.amount)}?${entryContribution(item) ? ' Its ' + money(entryContribution(item)) + ' joint contribution will be reversed.' : ''}`}</p></ActionForm>;
      break;
  }
  return <Modal title={titles[kind]} close={close}>{content}</Modal>;
}

function DebtForm({ close, done, me }) {
  const [debtorId, setDebtorId] = useState(PEOPLE[0].id);
  const creditor = PEOPLE.find(person => person.id !== debtorId);
  return <ActionForm cancel={close} label="Save debt" onSave={fields => {
    const debt = debtFromFields(fields);
    done(current => ({ ...current, debts: [debt, ...current.debts] }), 'Debt logged');
  }}>
    <div className="form-row">
      <label>Who owes?<select name="debtorId" value={debtorId} onChange={e => setDebtorId(e.target.value)}>
        {PEOPLE.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
      </select></label>
      <label>Who is owed?<input value={creditor.name} readOnly/><input name="creditorId" type="hidden" value={creditor.id}/></label>
    </div>
    <label>Amount owed ($)<input name="amount" type="number" min="0.01" max="1000000000" step="0.01" required/></label>
    <label>Description<input name="description" placeholder="e.g. Dinner" maxLength={160} required/></label>
    {me ? <input type="hidden" name="addedBy" value={me}/>
      : <label>Logged by<select name="addedBy">{PEOPLE.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>}
  </ActionForm>;
}

function EventForm({ date, close, done, onEventSaved }) {
  const [freq, setFreq] = useState('none');
  const [ends, setEnds] = useState('never');
  const [start, setStart] = useState(date ?? localDate());
  const unit = REPEATS.find(item => item.id === freq).unit;
  return <ActionForm cancel={close} label="Save event" onSave={fields => {
    const event = eventFromFields(fields);
    done(current => ({ ...current, events: [...current.events, event] }), event.repeat ? 'Repeating event saved' : 'Event saved');
    onEventSaved(event.date);
  }}>
    <label>Title<input name="title" maxLength={100} placeholder="e.g. Rent due" required autoFocus/></label>
    <div className="form-row">
      <label>Date<input name="date" type="date" value={start} onChange={e => setStart(e.target.value)} required/></label>
      <label>Time<input name="time" type="time"/></label>
    </div>
    <label>Repeat<select name="freq" value={freq} onChange={e => setFreq(e.target.value)}>{REPEATS.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    {freq !== 'none' && <div className="form-row">
      <label>Ends<select name="ends" value={ends} onChange={e => setEnds(e.target.value)}>
        <option value="never">Never</option><option value="on">On a date</option><option value="after">After a number of times</option>
      </select></label>
      {ends === 'on' && <label>Last date<input name="until" type="date" min={start} required/></label>}
      {ends === 'after' && <label>Number of times<input name="count" type="number" min="1" max="999" step="1" defaultValue="10" required/></label>}
    </div>}
    {freq !== 'none' && <p className="field-help">Repeats every {unit} from {start ? shortDate(start) : 'the date above'}{ends === 'never' ? ', with no end date' : ''}.{freq === 'monthly' || freq === 'yearly' ? ' Dates past the end of a shorter month move to its last day.' : ''}</p>}
    <label>Description<textarea name="description" rows={3} maxLength={1000} placeholder="Optional details"/></label>
  </ActionForm>;
}

function DeleteEvent({ event, date, close, done }) {
  const remove = scope => done(current => ({ ...current, events: deleteEvent(current.events, event.id, date, scope) }),
    scope === 'one' ? 'Event removed from ' + shortDate(date) : 'Event deleted');
  if (!event.repeat) return <ActionForm cancel={close} label="Delete event" onSave={() => remove('all')}>
    <p className="field-help">Remove “{event.title}” on {shortDate(date)} from your calendar?</p>
  </ActionForm>;
  return <div className="form-stack">
    <p className="field-help">“{event.title}” repeats. What do you want to delete?</p>
    <div className="delete-choices">
      <button type="button" className="btn secondary" onClick={() => remove('one')}>Only {shortDate(date)}</button>
      {date > event.date && <button type="button" className="btn secondary" onClick={() => remove('following')}>{shortDate(date)} and later</button>}
      <button type="button" className="btn secondary danger-text" onClick={() => remove('all')}>Every date</button>
    </div>
    <div className="form-actions"><button type="button" className="btn secondary" onClick={close}>Cancel</button></div>
  </div>;
}
