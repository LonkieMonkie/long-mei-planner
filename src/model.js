import { DEFAULT_ACCENT, parseAccent } from './appearance.js';

export const STORAGE_KEY = 'our-little-life.dashboard.v2';
export const LEGACY_KEY = 'our-little-life.v1';
export const PEOPLE = [
  { id: 'long', name: 'Long', initials: 'L', tone: 'indigo' },
  { id: 'mei', name: 'Mei', initials: 'M', tone: 'rose' },
];
export const FIRST_PAYDAYS = { long: '2026-11-27', mei: '2026-12-04' };

export const money = (cents, compact = false) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: compact ? 0 : 2, maximumFractionDigits: 2,
  }).format(cents / 100);

export function localDate(date = new Date()) {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part, index) => index ? String(part).padStart(2, '0') : String(part)).join('-');
}

export const dateFromKey = key => new Date(key + 'T12:00:00');
export const isDateKey = key => typeof key === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(key)
  && localDate(dateFromKey(key)) === key;
export const shortDate = key => dateFromKey(key).toLocaleDateString('en-US', {
  month: 'short', day: 'numeric', year: 'numeric',
});
export const timestamp = iso => new Date(iso).toLocaleString('en-US', {
  month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
});

export function decimalUnits(value, max = 100_000_000_000, signed = false) {
  const string = String(value).trim();
  if (!(signed ? /^-?\d+(\.\d{1,2})?$/ : /^\d+(\.\d{1,2})?$/).test(string)) {
    throw new Error('Enter a number with up to two decimal places.');
  }
  const units = Math.round(Number(string) * 100);
  if (!Number.isSafeInteger(units) || Math.abs(units) > max) throw new Error('That number is out of range.');
  return units;
}

export const contribution = (amount, rate) => Math.floor((amount * rate + 5_000) / 10_000);
export const entryContribution = entry => entry.goalId ? contribution(entry.amount, entry.rate ?? 0) : 0;
export const categoryColors = { indigo: '#7964da', blue: '#5283c7', rose: '#bc5f88', mint: '#3c9676' };
export const categoryColor = category => parseAccent(category.color) ?? categoryColors[category.tone] ?? DEFAULT_ACCENT;

export function freshData() {
  return {
    version: 2,
    categories: [
      { id: 'essentials', name: 'Essentials', limit: 0, icon: 'basket', tone: 'indigo' },
      { id: 'transport', name: 'Transportation', limit: 0, icon: 'car', tone: 'blue' },
      { id: 'dining', name: 'Dining out', limit: 0, icon: 'utensils', tone: 'rose' },
      { id: 'bills', name: 'Bills & subscriptions', limit: 0, icon: 'receipt', tone: 'mint' },
    ],
    goals: [{ id: 'wedding', name: 'Wedding', target: 3_000_000 }],
    entries: [], events: [], debts: [], firstPaydays: { ...FIRST_PAYDAYS },
    savingsAdjustment: 0, accentColor: DEFAULT_ACCENT,
  };
}

export function savingsRule(category, personId, goals, previous) {
  if (!category) return { rate: 0, goalId: '' };
  if (previous?.type === 'expense' && previous.categoryId === category.id && previous.personId === personId) {
    return { rate: previous.rate ?? 0, goalId: previous.goalId ?? '' };
  }
  const rate = category.savingsRates?.[personId] ?? 0;
  const goalId = category.savingsGoalId || goals[0]?.id;
  return rate > 0 && goals.some(goal => goal.id === goalId) ? { rate, goalId } : { rate: 0, goalId: '' };
}

export function entryFromFields(fields, state, previous, now = new Date().toISOString()) {
  const person = PEOPLE.find(p => p.id === fields.personId);
  const type = fields.type;
  const category = state.categories.find(c => c.id === fields.categoryId);
  const source = type === 'expense' ? category?.name : String(fields.source ?? '').trim().slice(0, 100);
  if (!person || !['income', 'expense'].includes(type) || !source) throw new Error('Choose a person and enter a source.');
  const amount = decimalUnits(fields.amount);
  if (amount <= 0) throw new Error('Enter an amount greater than zero.');
  if (!isDateKey(fields.date)) throw new Error('Choose a valid transaction date.');
  const allocation = type === 'expense' ? savingsRule(category, person.id, state.goals, previous) : {};
  return {
    id: previous?.id ?? crypto.randomUUID(),
    personId: person.id, type, categoryId: type === 'expense' ? category.id : '',
    source, date: fields.date, amount, ...allocation,
    createdAt: previous?.createdAt ?? now, editedAt: previous ? now : null,
  };
}

export function summarize(state, month) {
  const people = Object.fromEntries(PEOPLE.map(p => [p.id, { income: 0, spent: 0, allocated: 0 }]));
  const goals = Object.fromEntries(state.goals.map(g => [g.id, { total: 0, long: 0, mei: 0 }]));
  const spentByCategory = new Map();
  let income = 0, spent = 0, allocated = 0, totalContributions = 0;
  for (const entry of state.entries) {
    const amount = entryContribution(entry);
    const goal = goals[entry.goalId];
    if (goal) {
      goal.total += amount;
      goal[entry.personId] += amount;
      totalContributions += amount;
    }
    if (month && !entry.date.startsWith(month + '-')) continue;
    const person = people[entry.personId];
    if (entry.type === 'income') {
      income += entry.amount;
      person.income += entry.amount;
    } else {
      spent += entry.amount;
      person.spent += entry.amount;
      spentByCategory.set(entry.categoryId, (spentByCategory.get(entry.categoryId) ?? 0) + entry.amount);
    }
    if (goal) {
      allocated += amount;
      person.allocated += amount;
    }
  }
  const budgeted = state.categories.reduce((sum, c) => sum + c.limit, 0);
  return {
    people, goals, spentByCategory, income, spent, allocated, budgeted, totalContributions,
    jointBalance: state.savingsAdjustment + totalContributions,
  };
}

export function setJointBalance(state, desired) {
  return { ...state, savingsAdjustment: desired - summarize(state).totalContributions };
}

export function isPayday(date, firstPayday) {
  if (date < firstPayday) return false;
  // Date-only strings parse at UTC midnight, so daylight saving never shifts the cycle.
  return (Date.parse(date) - Date.parse(firstPayday)) % (14 * 86_400_000) === 0;
}

export function calendarItems(state, dates) {
  const byDate = new Map(dates.map(date => [date, []]));
  for (const [date, items] of byDate) {
    for (const person of PEOPLE) {
      if (isPayday(date, state.firstPaydays[person.id])) {
        items.push({ id: 'payday:' + person.id, kind: 'payday', title: person.name + ' payday', personId: person.id });
      }
    }
  }
  const categories = new Map(state.categories.map(category => [category.id, category]));
  for (const entry of state.entries) {
    const items = byDate.get(entry.date);
    if (!items) continue;
    const category = categories.get(entry.categoryId);
    items.push({ id: 'entry:' + entry.id, kind: entry.type, title: category?.name ?? entry.source,
      color: category && categoryColor(category), entry });
  }
  const events = [...state.events].sort((a, b) => a.time.localeCompare(b.time));
  for (const event of events) {
    byDate.get(event.date)?.push({ id: 'event:' + event.id, kind: 'event', title: event.title, event });
  }
  return byDate;
}

export function debtFromFields(fields, now = new Date().toISOString()) {
  const { debtorId, creditorId, addedBy } = fields;
  if (debtorId === creditorId || ![debtorId, creditorId, addedBy].every(id => PEOPLE.some(person => person.id === id))) {
    throw new Error('Choose two different people for who owes and who is owed.');
  }
  const amount = decimalUnits(fields.amount);
  if (!amount) throw new Error('Enter an amount greater than zero.');
  const description = String(fields.description ?? '').trim().slice(0, 160);
  if (!description) throw new Error('Enter a description.');
  return { id: crypto.randomUUID(), debtorId, creditorId, addedBy, amount, description, createdAt: now, settledAt: null };
}

export function settleDebt(state, id, now = new Date().toISOString()) {
  const debt = state.debts.find(item => item.id === id);
  if (!debt || debt.settledAt) throw new Error('This debt is already settled or no longer available.');
  return { ...state, debts: state.debts.map(item => item.id === id ? { ...item, settledAt: now } : item) };
}

export function debtBalances(debts) {
  let long = 0, mei = 0, count = 0;
  for (const debt of debts) {
    if (debt.settledAt) continue;
    if (debt.debtorId === 'long') long += debt.amount;
    else mei += debt.amount;
    count += 1;
  }
  return { long, mei, count, net: Math.abs(long - mei), debtorId: long === mei ? null : long > mei ? 'long' : 'mei' };
}

export function calendarDays(month) {
  const [year, number] = month.split('-').map(Number);
  const first = new Date(year, number - 1, 1, 12);
  const start = 1 - first.getDay();
  return Array.from({ length: 42 }, (_, i) => localDate(new Date(year, number - 1, start + i, 12)));
}

export function shiftMonth(month, step) {
  const date = dateFromKey(month + '-01');
  date.setMonth(date.getMonth() + step);
  return localDate(date).slice(0, 7);
}

export function readState(storage) {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return freshData();
  const state = JSON.parse(raw);
  if (state?.version !== 2 || !['categories', 'goals', 'entries', 'events'].every(key => Array.isArray(state[key]))
      || !Number.isSafeInteger(state.savingsAdjustment)
      || (state.debts !== undefined && !Array.isArray(state.debts))) {
    throw new Error('The saved dashboard could not be read.');
  }
  delete state.googleUrl;
  state.debts ??= [];
  state.firstPaydays = Object.fromEntries(PEOPLE.map(({ id }) => {
    const date = state.firstPaydays?.[id];
    return [id, isDateKey(date) && dateFromKey(date).getDay() === 5 ? date : FIRST_PAYDAYS[id]];
  }));
  state.accentColor = parseAccent(state.accentColor) ?? DEFAULT_ACCENT;
  return state;
}
