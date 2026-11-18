import { useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Pencil, PiggyBank, Plus, Trash2 } from 'lucide-react';
import { isDateKey, withSharedDebt, withoutEntry, PEOPLE, PERSONAL_CATEGORY_ID, SAVINGS_CATEGORY_ID, WEDDING_CATEGORY_ID, categoryColor, dateFromKey, contribution, debtFromFields, decimalUnits, entryContribution, entryFromFields, incomeSplits, entryTime, localDate, localTime, money, shortDate, savingsRule, setJointBalance, settleDebt } from './model.js';
import { ActionForm, ErrorBoundary, Modal } from './ui.jsx';
import { CategoryForm } from './category-form.jsx';
import { EVENT_COLORS, REPEATS, deleteEvent, deleteEventCategory, editEvent, eventCategoryFromFields, eventFromFields, occurrenceIndex } from './events.js';
import { savingsFromFields } from './personal-savings.js';

function EntryForm({ state, item, date, person, me, weddingDeposit = false, close, save }) {
  const [type, setType] = useState(weddingDeposit ? 'expense' : item?.type ?? 'income');
  const [amount, setAmount] = useState(item ? String(item.amount / 100) : '');
  const [categoryId, setCategoryId] = useState(weddingDeposit ? WEDDING_CATEGORY_ID : item?.categoryId ?? '');
  const [personId, setPersonId] = useState(item?.personId ?? person ?? me ?? 'long');
  const category = state.categories.find(item => item.id === categoryId);
  const { rate, goalId } = savingsRule(category, personId, state.goals, item);
  const [initialTime] = useState(() => item ? entryTime(item) : localTime());
  const [shares, setShares] = useState(() => initialShares(state, personId, item));
  const [shared, setShared] = useState(Boolean(item?.shared));
  const [sharePct, setSharePct] = useState(item?.shared ? String(item.shared.rate / 100) : '50');
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
      fields = { ...fields, splits: JSON.stringify(state.categories.filter(c => shares[c.id]?.on && c.id !== PERSONAL_CATEGORY_ID).map(c => ({ categoryId: c.id, rate: rates[c.id] }))) };
    }
    if (type === 'expense' && shared && !weddingDeposit) {
      let rate;
      try { rate = decimalUnits(sharePct || '0', 10_000); } catch { throw new Error('Enter their share as a percentage from 1 to 100, with up to two decimals.'); }
      if (rate < 1) throw new Error('Enter their share as a percentage from 1 to 100.');
      fields = { ...fields, sharedRate: String(rate) };
    }
    save(current => {
      if (item && !current.entries.some(entry => entry.id === item.id && entry.editedAt === item.editedAt)) {
        throw new Error('This entry was changed or deleted on another device. Close the form and open it again.');
      }
      const entry = entryFromFields(fields, current, item);
      // The percentages shown become this person's saved shares, ticked or not.
      if (type === 'income') current = { ...current, categories: current.categories.map(c => c.id in rates && rates[c.id] !== (c.incomeShares?.[entry.personId] ?? 0)
        ? { ...c, incomeShares: { ...c.incomeShares, [entry.personId]: rates[c.id] } } : c) };
      const next = { ...current, entries: item ? current.entries.map(row => row.id === entry.id ? entry : row) : [entry, ...current.entries] };
      return entry.shared || item?.shared ? withSharedDebt(next, entry) : next;
    }, item ? 'Entry updated' : 'Entry saved');
    close();
  }
  const splitTotal = type === 'income' ? tickedTotal(state, shares) : 0;
  return <ActionForm onSave={submit} cancel={close} disabled={!(splitTotal <= 10_000)} label={item ? 'Save changes' : weddingDeposit ? 'Save deposit' : 'Save entry'}>
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
    {type === 'expense' && !weddingDeposit && <SharedExpense {...{ shared, setShared, sharePct, setSharePct, units, item, debts: state.debts }}
      payer={PEOPLE.find(p => p.id === personId)} other={PEOPLE.find(p => p.id !== personId)}/>}
    {type === 'income' && <IncomeSplit state={state} shares={shares} setShares={setShares} units={units} person={PEOPLE.find(p => p.id === personId)}/>}
    {type === 'income' && item?.type === 'income' && !item.splits && entryContribution(item) > 0 && <p className="field-help">Saving this as income will reverse its previous {money(entryContribution(item))} savings contribution.</p>}
  </ActionForm>;
}

// Splitting an expense: the payer keeps the whole expense in the budget, and the other
// person's share is logged as a debt they owe the payer.
function SharedExpense({ shared, setShared, sharePct, setSharePct, units, payer, other, item, debts }) {
  let rate = null;
  try { rate = decimalUnits(sharePct || '0', 10_000); } catch { /* Shown as invalid below. */ }
  const owed = rate ? Math.round(units * rate / 10_000) : 0;
  const settled = item && debts.some(debt => debt.linkedEntryId === item.id && debt.settledAt);
  return <fieldset className="shared-expense">
    <label className="check-row"><input type="checkbox" checked={shared} onChange={e => setShared(e.target.checked)}/>Shared with {other.name}</label>
    {shared && <>
      <div className="share-presets" role="group" aria-label={`${other.name}’s share`}>
        {['50', '40', '60', '100'].map(value => <button type="button" key={value} className="filter-chip share-chip" aria-pressed={sharePct === value} onClick={() => setSharePct(value)}>
          {value === '50' ? 'Even split' : value === '100' ? `All ${other.name}’s` : `${payer.name} ${100 - Number(value)} · ${other.name} ${value}`}</button>)}
        <label className="split-pct">{other.name}’s share<input type="number" min="1" max="100" step="0.01" inputMode="decimal" value={sharePct} aria-invalid={rate === null || rate < 1} onChange={e => setSharePct(e.target.value)}/>%</label>
      </div>
      <p className={rate === null || rate < 1 ? 'split-total over' : 'split-total done'}>{rate === null || rate < 1 ? 'Enter a share from 1 to 100.'
        : <><strong>{other.name}</strong> owes <strong>{payer.name}</strong> <strong>{money(owed)}</strong>. It’s added to the Debt Tracker.</>}</p>
      {settled && <p className="field-help">This share was already settled, so changing it here won’t create a new debt.</p>}
    </>}
  </fieldset>;
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
    if (!shares[category.id]?.on || category.id === PERSONAL_CATEGORY_ID) return sum;
    try { return sum + decimalUnits(shares[category.id].pct || '0', 10_000); } catch { return NaN; }
  }, 0);
}

function shareRates(state, shares) {
  return Object.fromEntries(state.categories.filter(category => category.id !== PERSONAL_CATEGORY_ID).map(category => {
    try { return [category.id, decimalUnits(shares[category.id]?.pct || '0', 10_000)]; }
    catch { throw new Error(`Enter a share from 0% to 100% for ${category.name}, with up to two decimals.`); }
  }));
}

const SPLIT_TAGS = { [WEDDING_CATEGORY_ID]: 'to Joint Savings', [SAVINGS_CATEGORY_ID]: 'to My Savings' };

function IncomeSplit({ state, shares, setShares, units, person }) {
  const set = (id, change) => setShares(current => ({ ...current, [id]: { ...current[id], ...change } }));
  let total = 0, totalRate = 0;
  const personal = state.categories.find(category => category.id === PERSONAL_CATEGORY_ID);
  const rows = state.categories.filter(category => category !== personal).map(category => {
    let rate = null;
    try { rate = decimalUnits(shares[category.id]?.pct || '0', 10_000); } catch { /* Shown as invalid; reported on save. */ }
    const on = shares[category.id]?.on;
    const amount = rate === null ? 0 : Math.floor(units * rate / 10_000);
    if (on && rate !== null) { total += amount; totalRate += rate; }
    return { category, rate, on, amount };
  });
  // A ticked share that isn't a number from 0 to 100 (with up to two decimals) blocks the split.
  const invalid = rows.filter(row => row.on && row.rate === null);
  const valid = !invalid.length && totalRate <= 10_000;
  let rest = valid ? units - total : 0;
  if (valid) {
    // Show the same cent-exact amounts that will be saved, Personal included.
    const exact = new Map(incomeSplits(rows.filter(row => row.on).map(row => ({ categoryId: row.category.id, rate: row.rate })), units, state).map(split => [split.categoryId, split.amount]));
    for (const row of rows) if (row.on) row.amount = exact.get(row.category.id) ?? 0;
    rest = exact.get(PERSONAL_CATEGORY_ID) ?? 0;
  }
  return <fieldset className="income-split">
    <legend>Split into budgets</legend>
    <p className="field-help">Tick budgets to set their share aside for this month. Whatever isn’t ticked goes to Personal. Percentages are saved for {person.name}.</p>
    <div className="split-rows">{rows.map(({ category, rate, on, amount }) => <div className={on ? 'split-row on' : 'split-row'} key={category.id}>
      <label className="split-check"><input type="checkbox" checked={Boolean(on)} onChange={e => set(category.id, { on: e.target.checked })}/>
        <span className="color-dot" style={{ backgroundColor: categoryColor(category) }}/>{category.name}{SPLIT_TAGS[category.id] && <small className="split-tag">{SPLIT_TAGS[category.id]}</small>}</label>
      <label className="split-pct"><input type="number" min="0" max="100" step="0.01" inputMode="decimal" aria-label={`${category.name} share of income (%)`} aria-invalid={rate === null}
        value={shares[category.id]?.pct ?? '0'} onChange={e => set(category.id, { pct: e.target.value, on: e.target.value !== '' && Number(e.target.value) > 0 ? true : on })}/>%</label>
      <strong className="split-amount">{on ? money(amount) : '—'}</strong>
    </div>)}
      {personal && <div className="split-row on personal">
        <span className="split-check"><span className="split-lock" aria-hidden="true"/><span className="color-dot" style={{ backgroundColor: categoryColor(personal) }}/>{personal.name}<small>the rest</small></span>
        <span className="split-pct"><span className="split-rest">{valid ? (10_000 - totalRate) / 100 : '—'}</span>%</span>
        <strong className="split-amount">{valid ? money(rest) : '—'}</strong>
      </div>}
    </div>
    {!valid ? <p className="split-total over" role="alert">{invalid.length ? `Enter a share from 0 to 100 for ${invalid.map(row => row.category.name).join(', ')}, with up to two decimals.` : `The ticked shares add up to ${totalRate / 100}%. Remove ${(totalRate - 10_000) / 100}% to save.`}</p>
      : <p className="split-total done">{totalRate === 10_000 ? 'All 100% goes to the ticked budgets.' : !totalRate ? <>Nothing ticked, so all <strong>{money(rest)}</strong> goes to Personal.</> : <>Ticked budgets get <strong>{money(units - rest)}</strong> ({totalRate / 100}%). The other <strong>{money(rest)}</strong> goes to Personal.</>}</p>}
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
    'wedding-deposit': 'Add a deposit', saving: item ? 'Edit savings record' : modal.direction === 'out' ? 'Take money out' : 'Add a deposit', 'delete-saving': 'Delete savings record?',
    category: item ? item.name + ' settings' : 'Add a budget category', limit: 'Edit budget limit',
    balance: 'Edit joint balance', goal: item ? 'Edit savings goal' : 'Add a savings goal',
    event: item ? 'Edit event' : 'Add event', 'event-categories': 'Event categories', 'delete-event': item?.repeat ? 'Delete repeating event?' : 'Delete event?', 'delete-entry': 'Delete entry?',
    debt: 'Log a debt', 'settle-debt': 'Confirm payment?',
  };
  const done = (update, message) => { save(update, message); close(); };
  let content;
  switch (kind) {
    case 'entry':
      content = <EntryForm {...{ state, item, me, close, save }} date={modal.date} person={modal.person}/>;
      break;
    case 'wedding-deposit':
    case 'saving':
      content = <SavingsForm {...{ state, item, me, close, save }} destination={kind === 'wedding-deposit' ? 'wedding' : 'personal'} direction={modal.direction} person={modal.person}/>;
      break;
    case 'delete-saving':
      content = <ActionForm cancel={close} label="Delete" onSave={() => {
        done(current => ({ ...current, savings: current.savings.filter(record => record.id !== item.id) }), 'Savings record deleted');
      }}><p className="field-help">Delete this {item.amount < 0 ? 'withdrawal of' : 'deposit of'} {money(Math.abs(item.amount))} from {PEOPLE.find(p => p.id === item.personId)?.name}’s savings? The balance updates right away.</p></ActionForm>;
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
        if (fields.targetDate && !isDateKey(fields.targetDate)) throw new Error('Choose a valid target date.');
        if (fields.targetDate && fields.targetDate <= localDate() && fields.targetDate !== item?.targetDate) throw new Error('Choose a target date after today.');
        const goal = { id: item?.id ?? crypto.randomUUID(), name, target, ...(fields.targetDate ? { targetDate: fields.targetDate } : {}) };
        done(current => ({ ...current, goals: item ? current.goals.map(g => g.id === goal.id ? goal : g) : [...current.goals, goal] }), 'Savings goal saved');
      }}><label>Goal name<input name="name" defaultValue={item?.name} placeholder="e.g. Wedding" maxLength={70} required autoFocus/></label><label>Target ($)<input name="target" type="number" min="0.01" max="1000000000" step="0.01" defaultValue={item ? item.target / 100 : ''} required/></label>
        <label>Target date (optional)<input name="targetDate" type="date" defaultValue={item?.targetDate} min={localDate()}/></label>
        <p className="field-help">With a date, the goal shows how much to save each month to get there in time.</p></ActionForm>;
      break;
    case 'event':
      content = <EventForm date={modal.date} item={item} categories={state.eventCategories} close={close} done={done} onEventSaved={onEventSaved}/>;
      break;
    case 'event-categories':
      content = <EventCategories categories={state.eventCategories} events={state.events} save={save} close={close}/>;
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
        done(current => withoutEntry(current, item.id), 'Entry deleted. Totals updated.');
      }}><p className="field-help">{`Delete the ${item.source} entry for ${money(item.amount)}?${entryContribution(item) ? ' Its ' + money(entryContribution(item)) + ' joint contribution will be reversed.' : ''}${item.shared && state.debts.some(debt => debt.linkedEntryId === item.id && !debt.settledAt) ? ' The open debt for the shared part will be removed too.' : ''}`}</p></ActionForm>;
      break;
  }
  return <Modal title={titles[kind]} close={close}><ErrorBoundary onClose={close}>{content}</ErrorBoundary></Modal>;
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

function EventForm({ date, item, categories, close, done, onEventSaved }) {
  // When editing a repeating event, `date` is the occurrence that was clicked.
  const occurrence = date ?? item?.date ?? localDate();
  const series = Boolean(item?.repeat);
  const [scope, setScope] = useState('all');
  const startFor = which => item && which === 'all' ? item.date : occurrence;
  const [start, setStart] = useState(startFor('all'));
  const [freq, setFreq] = useState(item?.repeat?.freq ?? 'none');
  const [ends, setEnds] = useState(item?.repeat?.ends ?? 'never');
  const remaining = item?.repeat?.ends === 'after' ? Math.max(1, item.repeat.count - Math.max(0, occurrenceIndex(item, occurrence))) : 10;
  const [count, setCount] = useState(String(item?.repeat?.count ?? 10));
  const [color, setColor] = useState(item?.color ?? '');
  const [categoryId, setCategoryId] = useState(categories.some(category => category.id === item?.categoryId) ? item.categoryId : '');
  const category = categories.find(row => row.id === categoryId);
  const repeating = scope !== 'one';
  const unit = REPEATS.find(rule => rule.id === freq).unit;
  const day = dateFromKey(occurrence).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  function chooseScope(which) {
    setScope(which);
    setStart(startFor(which));
    if (item?.repeat?.ends === 'after') setCount(String(which === 'following' ? remaining : item.repeat.count));
  }
  return <ActionForm cancel={close} label={item ? 'Save changes' : 'Save event'} onSave={fields => {
    const edited = eventFromFields({ ...fields, color, categoryId, ...(repeating ? {} : { freq: 'none' }) });
    done(current => {
      if (edited.categoryId && !current.eventCategories.some(row => row.id === edited.categoryId)) throw new Error('That category was deleted on another device. Choose another.');
      if (!item) return { ...current, events: [...current.events, edited] };
      const original = current.events.find(event => event.id === item.id);
      if (!original) throw new Error('This event was deleted on another device. Close the form to see the latest calendar.');
      return { ...current, events: editEvent(current.events, original, occurrence, scope, edited) };
    }, item ? 'Event updated' : edited.repeat ? 'Repeating event saved' : 'Event saved');
    onEventSaved(edited.date);
  }}>
    {series && <fieldset className="edit-scope">
      <legend>Which dates should change?</legend>
      {[
        ['all', 'Every date', 'The whole repeating series'],
        ['one', `Only ${day}`, 'Just this one; the rest stay the same'],
        ...(occurrence > item.date ? [['following', `${day} and later`, 'Earlier dates stay the same']] : []),
      ].map(([value, label, hint]) => <label key={value} className="scope-option">
        <input type="radio" name="scope" value={value} checked={scope === value} onChange={() => chooseScope(value)}/>
        <span><strong>{label}</strong><small>{hint}</small></span>
      </label>)}
    </fieldset>}
    <label>Title<input name="title" maxLength={100} defaultValue={item?.title} placeholder="e.g. Rent due" required autoFocus/></label>
    <div className="form-row">
      <label>{series && scope === 'all' ? 'First date' : 'Date'}<input name="date" type="date" value={start} onChange={e => setStart(e.target.value)} required/></label>
      <label>Time<input name="time" type="time" defaultValue={item?.time}/></label>
    </div>
    {repeating && <>
      <label>Repeat<select name="freq" value={freq} onChange={e => setFreq(e.target.value)}>{REPEATS.map(rule => <option key={rule.id} value={rule.id}>{rule.name}</option>)}</select></label>
      {freq !== 'none' && <div className="form-row">
        <label>Ends<select name="ends" value={ends} onChange={e => setEnds(e.target.value)}>
          <option value="never">Never</option><option value="on">On a date</option><option value="after">After a number of times</option>
        </select></label>
        {ends === 'on' && <label>Last date<input name="until" type="date" min={start} defaultValue={item?.repeat?.until} required/></label>}
        {ends === 'after' && <label>Number of times<input name="count" type="number" min="1" max="999" step="1" value={count} onChange={e => setCount(e.target.value)} required/></label>}
      </div>}
      {freq !== 'none' && <p className="field-help">Repeats every {unit} from {start ? shortDate(start) : 'the date above'}{ends === 'never' ? ', with no end date' : ''}.{freq === 'monthly' || freq === 'yearly' ? ' Dates past the end of a shorter month move to its last day.' : ''}</p>}
    </>}
    {categories.length > 0 && <label>Category<select value={categoryId} onChange={e => setCategoryId(e.target.value)}>
      <option value="">No category</option>{categories.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
    </select></label>}
    <fieldset className="event-colors">
      <legend>Color{category && !color ? ` (using ${category.name})` : ''}</legend>
      <div className="event-swatches">
        <button type="button" className="event-swatch default" aria-pressed={!color} aria-label={category ? `${category.name} color` : 'Default color'} title={category ? `${category.name} color` : 'Default'}
          style={category ? { '--swatch-color': category.color } : undefined} onClick={() => setColor('')}/>
        {EVENT_COLORS.map(([name, value]) => <button type="button" key={value} className="event-swatch" style={{ background: value }}
          aria-pressed={color === value} aria-label={name} title={name} onClick={() => setColor(value)}/>)}
        <label className="event-swatch custom" title="Pick any color" style={color && !EVENT_COLORS.some(([, value]) => value === color) ? { background: color } : undefined}>
          <input type="color" aria-label="Pick any color" value={color || '#4c8363'} onChange={e => setColor(e.target.value)}/>
        </label>
      </div>
    </fieldset>
    <label>Description<textarea name="description" rows={3} maxLength={1000} defaultValue={item?.description} placeholder="Optional details"/></label>
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

// One form for putting money aside: into the Wedding goal (a Wedding budget entry, as before)
// or into the person's own savings, where money can also be taken out.
function SavingsForm({ state, item, me, destination, direction, person, close, save }) {
  const [where, setWhere] = useState(item ? 'personal' : destination);
  const [way, setWay] = useState(item ? (item.amount < 0 ? 'out' : 'in') : direction ?? 'in');
  const [personId, setPersonId] = useState(item?.personId ?? person ?? me ?? 'long');
  const [initialTime] = useState(() => item?.time ?? localTime());
  const name = PEOPLE.find(p => p.id === personId).name;
  return <ActionForm cancel={close} label={item ? 'Save changes' : way === 'out' && where === 'personal' ? 'Take out' : 'Save deposit'} onSave={fields => {
    if (where === 'wedding') {
      save(current => ({ ...current, entries: [entryFromFields({ ...fields, personId, type: 'expense', categoryId: WEDDING_CATEGORY_ID }, current), ...current.entries] }), 'Wedding deposit saved');
    } else {
      save(current => {
        if (item && !current.savings.some(record => record.id === item.id)) throw new Error('This record was deleted on another device. Close the form to see the latest.');
        const record = savingsFromFields({ ...fields, personId, direction: way }, item);
        return { ...current, savings: item ? current.savings.map(row => row.id === record.id ? record : row) : [record, ...current.savings] };
      }, item ? 'Savings record updated' : way === 'out' ? `Taken out of ${name}’s savings` : `Added to ${name}’s savings`);
    }
    close();
  }}>
    {!item && <fieldset className="edit-scope">
      <legend>Where should this money go?</legend>
      {[['wedding', 'Wedding', 'Joint savings, counted toward your Wedding goal'], ['personal', `${name}’s savings`, 'Your own savings, shown on My Savings']].map(([value, label, hint]) =>
        <label key={value} className="scope-option"><input type="radio" name="where" checked={where === value} onChange={() => setWhere(value)}/><span><strong>{label}</strong><small>{hint}</small></span></label>)}
    </fieldset>}
    {where === 'personal' && <div className="segmented" aria-label="Add or take out">
      <button type="button" aria-pressed={way === 'in'} onClick={() => setWay('in')}><ArrowDownLeft size={16}/> Add money</button>
      <button type="button" aria-pressed={way === 'out'} onClick={() => setWay('out')}><ArrowUpRight size={16}/> Take out</button>
    </div>}
    {!me && <label>Whose money?<select value={personId} onChange={e => setPersonId(e.target.value)}>{PEOPLE.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
    <div className="form-row">
      <label>Date<input name="date" type="date" defaultValue={item?.date ?? localDate()} required/></label>
      <label>Time<input name="time" type="time" defaultValue={initialTime} required/></label>
    </div>
    <label>Amount ($)<input name="amount" type="number" min="0.01" max="1000000000" step="0.01" defaultValue={item ? Math.abs(item.amount) / 100 : ''} required autoFocus/></label>
    {where === 'personal' && <label>Note (optional)<input name="note" maxLength={100} defaultValue={item?.note} placeholder={way === 'out' ? 'e.g. New laptop' : 'e.g. Birthday money'}/></label>}
    {where === 'wedding' && <p className="field-help">This logs a Wedding budget entry and adds the amount to Joint Savings.</p>}
  </ActionForm>;
}

const randomColor = () => EVENT_COLORS[Math.floor(Math.random() * EVENT_COLORS.length)][1];

function EventCategories({ categories, events, save, close }) {
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [error, setError] = useState('');
  const [newColor, setNewColor] = useState(randomColor);
  const attempt = task => { setError(''); try { task(); } catch (e) { setError(e.message); } };
  const counts = new Map(categories.map(category => [category.id, events.filter(event => event.categoryId === category.id).length]));
  return <div className="form-stack">
    <p className="field-help">Group events so you can show or hide them with one click on the calendar.</p>
    {categories.length > 0 && <div className="event-category-list">{categories.map(category => editing === category.id
      ? <form key={category.id} className="event-category-row editing" onSubmit={event => {
          event.preventDefault();
          const fields = Object.fromEntries(new FormData(event.currentTarget));
          attempt(() => { save(current => ({ ...current, eventCategories: current.eventCategories.map(row => row.id === category.id ? eventCategoryFromFields(fields, current.eventCategories, row) : row) }), 'Category updated'); setEditing(null); });
        }}>
          <input type="color" name="color" defaultValue={category.color} aria-label={`${category.name} color`} className="category-color-input"/>
          <input name="name" defaultValue={category.name} maxLength={40} aria-label="Category name" required autoFocus/>
          <button className="btn primary small">Save</button>
          <button type="button" className="btn secondary small" onClick={() => setEditing(null)}>Cancel</button>
        </form>
      : deleting === category.id
        ? <div key={category.id} className="event-category-row confirm" role="alert">
          <span>Delete <b>{category.name}</b>?{counts.get(category.id) ? ` Its ${counts.get(category.id)} ${counts.get(category.id) === 1 ? 'event stays' : 'events stay'} on the calendar without a category.` : ''}</span>
          <button className="btn secondary small danger-text" onClick={() => { save(current => deleteEventCategory(current, category.id), 'Category deleted'); setDeleting(null); }}>Delete</button>
          <button className="btn secondary small" onClick={() => setDeleting(null)}>Cancel</button>
        </div>
        : <div key={category.id} className="event-category-row">
          <i className="category-dot" style={{ background: category.color }} aria-hidden="true"/>
          <span className="event-category-name">{category.name}<small>{counts.get(category.id) || 'No'} {counts.get(category.id) === 1 ? 'event' : 'events'}</small></span>
          <button className="icon-btn" aria-label={`Edit ${category.name}`} onClick={() => { setError(''); setEditing(category.id); setDeleting(null); }}><Pencil size={15}/></button>
          <button className="icon-btn danger" aria-label={`Delete ${category.name}`} onClick={() => { setError(''); setDeleting(category.id); setEditing(null); }}><Trash2 size={15}/></button>
        </div>)}</div>}
    <form className="event-category-row add" onSubmit={event => {
      event.preventDefault();
      const form = event.currentTarget;
      const fields = Object.fromEntries(new FormData(form));
      attempt(() => { save(current => ({ ...current, eventCategories: [...current.eventCategories, eventCategoryFromFields(fields, current.eventCategories)] }), 'Category added'); form.reset(); setNewColor(randomColor()); });
    }}>
      <input type="color" name="color" value={newColor} onChange={e => setNewColor(e.target.value)} aria-label="New category color" className="category-color-input"/>
      <input name="name" maxLength={40} placeholder="New category, e.g. Date nights" aria-label="New category name" required/>
      <button className="btn primary small"><Plus size={15}/> Add</button>
    </form>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="form-actions"><button type="button" className="btn secondary" onClick={close}>Done</button></div>
  </div>;
}
