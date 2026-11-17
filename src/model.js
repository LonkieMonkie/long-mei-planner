export const STORAGE_KEY = 'our-little-life.dashboard.v2';
export const LEGACY_KEY = 'our-little-life.v1';
export const PEOPLE = [
  { id: 'long', name: 'Long', initials: 'L', tone: 'indigo' },
  { id: 'mei', name: 'Mei', initials: 'M', tone: 'rose' },
];

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
    entries: [], events: [], googleUrl: '', savingsAdjustment: 0,
  };
}

export function entryFromFields(fields, state, previous, now = new Date().toISOString()) {
  const person = PEOPLE.find(p => p.id === fields.personId);
  const type = fields.type;
  const category = state.categories.find(c => c.id === fields.categoryId);
  const source = type === 'expense' ? category?.name : String(fields.source ?? '').trim().slice(0, 100);
  if (!person || !['income', 'expense'].includes(type) || !source) throw new Error('Choose a person and enter a source.');
  const amount = decimalUnits(fields.amount);
  if (amount <= 0) throw new Error('Enter an amount greater than zero.');
  const rate = decimalUnits(fields.rate || '0', 10_000);
  const goal = state.goals.find(g => g.id === fields.goalId);
  if ((rate > 0 || fields.goalId) && !goal) throw new Error('Choose a joint goal for this contribution.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fields.date) || localDate(dateFromKey(fields.date)) !== fields.date) {
    throw new Error('Choose a valid transaction date.');
  }
  return {
    id: previous?.id ?? crypto.randomUUID(),
    personId: person.id, type, categoryId: type === 'expense' ? category.id : '',
    source, date: fields.date, amount, rate, goalId: goal?.id ?? '',
    createdAt: previous?.createdAt ?? now, editedAt: previous ? now : null,
  };
}

export function summarize(state, month) {
  const people = Object.fromEntries(PEOPLE.map(p => [p.id, { income: 0, spent: 0, allocated: 0 }]));
  const goals = Object.fromEntries(state.goals.map(g => [g.id, { total: 0, long: 0, mei: 0 }]));
  const spentByCategory = new Map();
  let income = 0, spent = 0, allocated = 0, totalContributions = 0;
  for (const entry of state.entries) {
    const amount = contribution(entry.amount, entry.rate);
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

export function googleEmbed(value) {
  if (!value.trim()) return '';
  let url;
  try { url = new URL(value.trim()); } catch { throw new Error('Paste a valid Google Calendar URL.'); }
  if (url.origin !== 'https://calendar.google.com' || url.username || url.password) {
    throw new Error('Use an HTTPS link from calendar.google.com.');
  }
  const path = url.pathname.replace(/\/$/, '');
  const embedded = /^\/calendar\/(?:u\/\d+\/)?embed$/.test(path);
  const shared = /^\/calendar\/(?:u\/\d+\/)?r$/.test(path);
  let sources = embedded ? url.searchParams.getAll('src').filter(Boolean) : [];
  if (shared && url.searchParams.get('cid')) {
    const cid = url.searchParams.get('cid').trim();
    if (cid.includes('@')) sources = [cid];
    else {
      try { sources = [atob(cid.replaceAll('-', '+').replaceAll('_', '/'))]; }
      catch { sources = []; }
    }
  }
  if (!sources.length || sources.some(source => !/^[^\s<>@]+@[^\s<>@]+$/.test(source))) {
    throw new Error('Copy the public URL under Google Calendar Settings → Integrate calendar.');
  }
  const output = new URL('https://calendar.google.com/calendar/embed');
  sources.forEach(source => output.searchParams.append('src', source));
  for (const param of ['ctz', 'mode', 'wkst', 'hl', 'bgcolor', 'showTitle', 'showNav', 'showDate', 'showPrint', 'showTabs', 'showCalendars', 'showTz']) {
    if (embedded && url.searchParams.has(param)) output.searchParams.set(param, url.searchParams.get(param));
  }
  if (embedded) url.searchParams.getAll('color').forEach(color => output.searchParams.append('color', color));
  return output.toString();
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
      || !Number.isSafeInteger(state.savingsAdjustment) || typeof state.googleUrl !== 'string') {
    throw new Error('The saved dashboard could not be read.');
  }
  if (state.googleUrl) state.googleUrl = googleEmbed(state.googleUrl);
  return state;
}
