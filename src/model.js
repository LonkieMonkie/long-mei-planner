import { DEFAULT_ACCENT, LEGACY_ACCENT, parseAccent } from './appearance.js';
import { DEFAULT_TREE, normalizeTree } from './tree-model.js';
import { normalizeEvent, occursOn } from './events.js';

export const STORAGE_KEY = 'our-little-life.dashboard.v2';
export const PEOPLE = [
  { id: 'long', name: 'Long', initials: 'L', tone: 'indigo' },
  { id: 'mei', name: 'Mei', initials: 'M', tone: 'rose' },
];
export const WEDDING_CATEGORY_ID = 'wedding';
const WEDDING_GOAL_ID = 'wedding';

const weddingCategory = {
  id: WEDDING_CATEGORY_ID, name: 'Wedding', limit: 0, icon: 'heart', tone: 'rose',
  savingsRates: { long: 10_000, mei: 10_000 }, savingsGoalId: WEDDING_GOAL_ID,
};
const weddingGoal = { id: WEDDING_GOAL_ID, name: 'Wedding', target: 3_000_000 };

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
export const localTime = (date = new Date()) =>
  [date.getHours(), date.getMinutes()].map(part => String(part).padStart(2, '0')).join(':');
export const displayTime = time => new Date('2000-01-01T' + time).toLocaleTimeString('en-US', {
  hour: 'numeric', minute: '2-digit',
});
export const entryTime = entry => entry.time ?? localTime(new Date(entry.createdAt));

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
// The joint-goal deposits an entry makes: an expense's savings rate, an older income entry's
// recorded rate, or the Wedding share of a split income.
export function goalShares(entry) {
  if (entry.splits) return entry.splits.filter(split => split.goalId).map(({ goalId, amount, rate }) => ({ goalId, amount, rate }));
  return entry.goalId ? [{ goalId: entry.goalId, amount: contribution(entry.amount, entry.rate ?? 0), rate: entry.rate ?? 0 }] : [];
}
export const entryContribution = entry => goalShares(entry).reduce((sum, share) => sum + share.amount, 0);
export const categoryColors = { indigo: '#7964da', blue: '#5283c7', rose: '#bc5f88', mint: '#3c9676' };
export const categoryColor = category => parseAccent(category.color) ?? categoryColors[category.tone] ?? DEFAULT_ACCENT;
export const isWeddingName = name => name.trim().toLowerCase() === 'wedding';

export function freshData() {
  return {
    version: 2,
    categories: [
      { ...weddingCategory, savingsRates: { ...weddingCategory.savingsRates } },
      { id: 'essentials', name: 'Essentials', limit: 0, icon: 'basket', tone: 'indigo' },
      { id: 'transport', name: 'Transportation', limit: 0, icon: 'car', tone: 'blue' },
      { id: 'dining', name: 'Dining out', limit: 0, icon: 'utensils', tone: 'rose' },
      { id: 'bills', name: 'Bills & subscriptions', limit: 0, icon: 'receipt', tone: 'mint' },
    ],
    goals: [{ ...weddingGoal }],
    entries: [], events: [], debts: [],
    savingsAdjustment: 0, accentColor: DEFAULT_ACCENT, theme: 'garden', tree: { ...DEFAULT_TREE },
  };
}

export function savingsRule(category, personId, goals, previous) {
  if (!category) return { rate: 0, goalId: '' };
  if (previous?.type === 'expense' && previous.categoryId === category.id && previous.personId === personId) {
    return { rate: previous.rate ?? 0, goalId: previous.goalId ?? '' };
  }
  const rate = category.savingsRates?.[personId] ?? 0;
  const goalId = category.id === WEDDING_CATEGORY_ID ? WEDDING_GOAL_ID : category.savingsGoalId || goals[0]?.id;
  return rate > 0 && goals.some(goal => goal.id === goalId) ? { rate, goalId } : { rate: 0, goalId: '' };
}

// Turns the ticked categories of an income form into stored splits. Each share is rounded
// to the cent on its own; Wedding's share also counts toward the Wedding goal.
export function incomeSplits(raw, amount, state) {
  if (!raw) return [];
  const chosen = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const seen = new Set();
  const splits = [];
  for (const { categoryId, rate } of chosen) {
    const category = state.categories.find(item => item.id === categoryId);
    if (!category || seen.has(categoryId)) continue;
    if (!Number.isInteger(rate) || rate < 0 || rate > 10_000) throw new Error(`Enter a share from 0% to 100% for ${category.name}.`);
    seen.add(categoryId);
    if (!rate) continue;
    const split = { categoryId, rate, amount: contribution(amount, rate) };
    if (categoryId === WEDDING_CATEGORY_ID && state.goals.some(goal => goal.id === WEDDING_GOAL_ID)) split.goalId = WEDDING_GOAL_ID;
    splits.push(split);
  }
  if (splits.reduce((sum, split) => sum + split.rate, 0) > 10_000) throw new Error('The ticked shares add up to more than 100%. Lower one before saving.');
  return splits;
}

export function entryFromFields(fields, state, previous, now = new Date().toISOString()) {
  const person = PEOPLE.find(p => p.id === fields.personId);
  const type = fields.type;
  const category = state.categories.find(c => c.id === fields.categoryId);
  // An income source is optional; unnamed income is labelled "Income".
  const source = type === 'expense' ? category?.name : String(fields.source ?? '').trim().slice(0, 100) || 'Income';
  if (!person || !['income', 'expense'].includes(type)) throw new Error('Choose who is adding this.');
  if (!source) throw new Error('Choose a budget category.');
  const amount = decimalUnits(fields.amount);
  if (amount <= 0) throw new Error('Enter an amount greater than zero.');
  if (!isDateKey(fields.date)) throw new Error('Choose a valid transaction date.');
  const time = fields.time || (previous ? entryTime(previous) : localTime(new Date(now)));
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('Choose a valid transaction time.');
  const allocation = type === 'expense' ? savingsRule(category, person.id, state.goals, previous) : {};
  const splits = type === 'income' ? incomeSplits(fields.splits, amount, state) : [];
  return {
    id: previous?.id ?? crypto.randomUUID(),
    personId: person.id, type, categoryId: type === 'expense' ? category.id : '',
    source, date: fields.date, time, amount, ...allocation, ...(splits.length ? { splits } : {}),
    createdAt: previous?.createdAt ?? now, editedAt: previous ? now : null,
  };
}

export function summarize(state, month) {
  const people = Object.fromEntries(PEOPLE.map(p => [p.id, { income: 0, spent: 0, allocated: 0 }]));
  const goals = Object.fromEntries(state.goals.map(g => [g.id, { total: 0, long: 0, mei: 0 }]));
  const spentByCategory = new Map();
  const fundedByCategory = new Map();
  let income = 0, spent = 0, allocated = 0, totalContributions = 0;
  for (const entry of state.entries) {
    let amount = 0;
    for (const share of goalShares(entry)) {
      const goal = goals[share.goalId];
      if (!goal) continue;
      goal.total += share.amount;
      goal[entry.personId] += share.amount;
      amount += share.amount;
    }
    totalContributions += amount;
    if (month && !entry.date.startsWith(month + '-')) continue;
    for (const split of entry.splits ?? []) fundedByCategory.set(split.categoryId, (fundedByCategory.get(split.categoryId) ?? 0) + split.amount);
    const person = people[entry.personId];
    if (entry.type === 'income') {
      income += entry.amount;
      person.income += entry.amount;
    } else {
      spent += entry.amount;
      person.spent += entry.amount;
      spentByCategory.set(entry.categoryId, (spentByCategory.get(entry.categoryId) ?? 0) + entry.amount);
    }
    allocated += amount;
    person.allocated += amount;
  }
  const budgeted = state.categories.reduce((sum, c) => sum + c.limit, 0);
  return {
    people, goals, spentByCategory, fundedByCategory, income, spent, allocated, budgeted, totalContributions,
    jointBalance: state.savingsAdjustment + totalContributions,
  };
}

export function setJointBalance(state, desired) {
  return { ...state, savingsAdjustment: desired - summarize(state).totalContributions };
}

export function calendarItems(state, dates) {
  const byDate = new Map(dates.map(date => [date, []]));
  const categories = new Map(state.categories.map(category => [category.id, category]));
  for (const entry of state.entries) {
    const items = byDate.get(entry.date);
    if (!items) continue;
    const category = categories.get(entry.categoryId);
    const deposited = entryContribution(entry);
    const goalNames = goalShares(entry).map(share => state.goals.find(goal => goal.id === share.goalId)?.name).filter(Boolean).join(', ');
    const time = entryTime(entry);
    const weddingDeposit = entry.categoryId === WEDDING_CATEGORY_ID && deposited > 0;
    if (!weddingDeposit) {
      items.push({ id: 'entry:' + entry.id, kind: entry.type, title: category?.name ?? entry.source,
        color: category && categoryColor(category), entry, time });
    }
    if (deposited > 0) {
      items.push({ id: 'deposit:' + entry.id, kind: 'deposit', title: weddingDeposit ? 'Wedding deposit' : 'Joint deposit',
        color: weddingDeposit ? categoryColor(category ?? weddingCategory) : undefined,
        entry, time, amount: deposited, goal: goalNames });
    }
  }
  for (const debt of state.debts) {
    if (!debt.settledAt) continue;
    const paidAt = new Date(debt.settledAt);
    byDate.get(localDate(paidAt))?.push({ id: 'payment:' + debt.id, kind: 'payment',
      title: 'Debt paid: ' + debt.description, debt, time: localTime(paidAt) });
  }
  for (const [date, items] of byDate) {
    for (const event of state.events) {
      if (occursOn(event, date)) items.push({ id: 'event:' + event.id + ':' + date, kind: 'event', title: event.title, time: event.time, event, date });
    }
  }
  for (const items of byDate.values()) items.sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''));
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
  const category = state.categories.find(item => item.id === WEDDING_CATEGORY_ID)
    ?? state.categories.find(item => isWeddingName(item.name));
  const wedding = {
    ...weddingCategory, ...category, id: WEDDING_CATEGORY_ID, name: weddingCategory.name, savingsGoalId: WEDDING_GOAL_ID,
    savingsRates: { ...weddingCategory.savingsRates, ...category?.savingsRates },
  };
  state.categories = [wedding, ...state.categories.filter(item => item !== category)];
  if (category && category.id !== WEDDING_CATEGORY_ID) {
    state.entries = state.entries.map(entry => entry.categoryId === category.id ? { ...entry, categoryId: WEDDING_CATEGORY_ID } : entry);
  }
  if (!state.goals.some(goal => goal.id === WEDDING_GOAL_ID)) state.goals.unshift({ ...weddingGoal });
  // Automatic biweekly paydays were removed; repeating events replace them.
  delete state.firstPaydays;
  state.events = state.events.map(normalizeEvent);
  for (const category of state.categories) {
    const shares = Object.fromEntries(PEOPLE.map(({ id }) => [id, category.incomeShares?.[id]]).filter(([, rate]) => Number.isInteger(rate) && rate > 0 && rate <= 10_000));
    if (Object.keys(shares).length) category.incomeShares = shares; else delete category.incomeShares;
  }
  for (const entry of state.entries) {
    if (entry.splits !== undefined && !(Array.isArray(entry.splits) && entry.splits.every(split =>
      typeof split?.categoryId === 'string' && Number.isInteger(split.rate) && Number.isSafeInteger(split.amount)))) delete entry.splits;
  }
  state.accentColor = parseAccent(state.accentColor) ?? DEFAULT_ACCENT;
  // The garden redesign made sage the default. Move the old default over once; later choices are kept.
  if (state.theme !== 'garden' && state.accentColor === LEGACY_ACCENT) state.accentColor = DEFAULT_ACCENT;
  state.theme = 'garden';
  state.tree = normalizeTree(state.tree);
  return state;
}
