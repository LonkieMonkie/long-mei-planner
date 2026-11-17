import { useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, PiggyBank } from 'lucide-react';
import { PEOPLE, contribution, debtFromFields, decimalUnits, entryContribution, entryFromFields, isDateKey, localDate, money, savingsRule, setJointBalance, settleDebt } from './model.js';
import { ActionForm, Modal } from './ui.jsx';
import { CategoryForm } from './category-form.jsx';

function EntryForm({ state, item, date, person, close, save }) {
  const [type, setType] = useState(item?.type ?? 'income');
  const [amount, setAmount] = useState(item ? String(item.amount / 100) : '');
  const [categoryId, setCategoryId] = useState(item?.categoryId ?? '');
  const [personId, setPersonId] = useState(item?.personId ?? person ?? 'long');
  const category = state.categories.find(item => item.id === categoryId);
  const { rate, goalId } = savingsRule(category, personId, state.goals, item);
  let projected = 0;
  try { projected = contribution(decimalUnits(amount || '0'), rate); } catch { /* Invalid amounts are reported on submit. */ }
  function submit(fields) {
    save(current => {
      if (item && !current.entries.some(entry => entry.id === item.id && entry.editedAt === item.editedAt)) {
        throw new Error('This entry changed in another tab. Close the form and open it again.');
      }
      const entry = entryFromFields(fields, current, item);
      return { ...current, entries: item ? current.entries.map(row => row.id === entry.id ? entry : row) : [entry, ...current.entries] };
    }, item ? 'Entry updated' : 'Entry saved');
    close();
  }
  return <ActionForm onSave={submit} cancel={close} label={item ? 'Save changes' : 'Save entry'}>
    <div className="segmented" aria-label="Entry type">
      <button type="button" aria-pressed={type === 'income'} onClick={() => setType('income')}><ArrowDownLeft size={16}/> Income</button>
      <button type="button" aria-pressed={type === 'expense'} onClick={() => setType('expense')}><ArrowUpRight size={16}/> Expense</button>
    </div>
    <input type="hidden" name="type" value={type}/>
    <div className="form-row">
      <label>Who is adding this?<select name="personId" value={personId} onChange={e => setPersonId(e.target.value)}>{PEOPLE.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
      <label>Transaction date<input name="date" type="date" defaultValue={item?.date ?? date ?? localDate()} required/></label>
    </div>
    {type === 'income'
      ? <label key="income">Income source<input name="source" defaultValue={item?.type === 'income' ? item.source : ''} placeholder="e.g. Paycheck" maxLength={100} required/></label>
      : <label key="expense">Budget category<select name="categoryId" value={categoryId} onChange={e => setCategoryId(e.target.value)} required><option value="" disabled>Select category</option>{state.categories.map(category => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>}
    <label>Amount ($)<input name="amount" type="number" step="0.01" min="0.01" max="1000000000" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} required/></label>
    {type === 'expense' && category && <div className="contribution-preview"><PiggyBank size={19}/><span>
      {PEOPLE.find(p => p.id === personId).name}’s category rate · {rate / 100}%{goalId && ' to ' + state.goals.find(g => g.id === goalId)?.name}
    </span><strong>{money(projected)}</strong></div>}
    {type === 'income' && item?.type === 'income' && entryContribution(item) > 0 && <p className="field-help">Saving this as raw income will reverse its previous {money(entryContribution(item))} savings contribution.</p>}
  </ActionForm>;
}

function titleValue(value, label) {
  const name = value.trim();
  if (!name) throw new Error('Enter a ' + label + '.');
  return name;
}

export function Dialogs({ modal, state, totals, close, save, onEventSaved }) {
  if (!modal) return null;
  const { kind, item } = modal;
  const titles = {
    entry: item ? 'Edit entry' : 'Add an entry',
    category: item ? item.name + ' settings' : 'Add a budget category', limit: 'Edit budget limit',
    balance: 'Edit joint balance', goal: item ? 'Edit savings goal' : 'Add a savings goal',
    event: 'Add local event', 'delete-event': 'Delete event?', 'delete-entry': 'Delete entry?',
    debt: 'Log a debt', 'settle-debt': 'Confirm payment?',
  };
  const done = (update, message) => { save(update, message); close(); };
  let content;
  switch (kind) {
    case 'entry':
      content = <EntryForm {...{ state, item, close, save }} date={modal.date} person={modal.person}/>;
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
      content = <ActionForm cancel={close} label="Save event" onSave={fields => {
        const title = titleValue(fields.title, 'title');
        if (!isDateKey(fields.date)) throw new Error('Choose a valid event date.');
        const event = { id: crypto.randomUUID(), title, date: fields.date, time: fields.time, description: fields.description.trim() };
        done(current => ({ ...current, events: [...current.events, event] }), 'Local event saved');
        onEventSaved(fields.date);
      }}><label>Title<input name="title" maxLength={100} placeholder="e.g. Budget check-in" required autoFocus/></label>
      <div className="form-row"><label>Date<input name="date" type="date" defaultValue={modal.date ?? localDate()} required/></label><label>Time<input name="time" type="time"/></label></div>
      <label>Description<textarea name="description" rows={3} maxLength={1000} placeholder="Optional details"/></label></ActionForm>;
      break;
    case 'debt':
      content = <DebtForm close={close} done={done}/>;
      break;
    case 'settle-debt':
      content = <ActionForm cancel={close} label="Confirm payment" onSave={() => {
        done(current => settleDebt(current, item.id), 'Payment recorded');
      }}><p className="field-help">Mark {money(item.amount)} for “{item.description}” as paid in full? This records the payment and removes the debt from the active balance.</p></ActionForm>;
      break;
    case 'delete-entry':
    case 'delete-event': {
      const isEntry = kind === 'delete-entry';
      const collection = isEntry ? 'entries' : 'events';
      content = <ActionForm cancel={close} label={isEntry ? 'Delete entry' : 'Delete event'} onSave={() => {
        done(current => ({ ...current, [collection]: current[collection].filter(entry => entry.id !== item.id) }), isEntry ? 'Entry deleted. Totals updated.' : 'Event deleted');
      }}><p className="field-help">{isEntry ? `Delete the ${item.source} entry for ${money(item.amount)}?${entryContribution(item) ? ' Its ' + money(entryContribution(item)) + ' joint contribution will be reversed.' : ''}` : `Remove “${item.title}” from your local calendar?`}</p></ActionForm>;
      break;
    }
  }
  return <Modal title={titles[kind]} close={close}>{content}</Modal>;
}

function DebtForm({ close, done }) {
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
    <label>Logged by<select name="addedBy">{PEOPLE.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
  </ActionForm>;
}
