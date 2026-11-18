// Calculations behind Insights, budget warnings, transaction filters and goal deadlines.
// Everything here is pure: it reads the planner state and returns numbers.
import { PEOPLE, PERSONAL_CATEGORY_ID, SAVINGS_CATEGORY_ID, categoryColor, dateFromKey, goalShares } from './model.js';

const DAY = 86_400_000;
const pad = n => String(n).padStart(2, '0');
const daysInMonth = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();
export const shiftMonth = (key, by) => {
  const [y, m] = key.split('-').map(Number);
  const index = y * 12 + (m - 1) + by;
  return `${Math.floor(index / 12)}-${pad(index % 12 + 1)}`;
};
export const monthLabel = (key, style = 'long') => dateFromKey(key + '-01').toLocaleDateString('en-US', { month: style, year: 'numeric' });

// A month ('2026-11') or a year ('2026'), with the period before it.
export function periodRange(key) {
  if (key.length === 4) {
    const year = Number(key);
    return { from: `${year}-01-01`, to: `${year}-12-31`, label: String(year), previous: String(year - 1), kind: 'year' };
  }
  const [y, m] = key.split('-').map(Number);
  return { from: `${key}-01`, to: `${key}-${pad(daysInMonth(y, m))}`, label: monthLabel(key), previous: shiftMonth(key, -1), kind: 'month' };
}

// `personId` limits the summary to one person; categories are grouped by name, so both people's
// private copies of a category (e.g. two "Dining out") add up. Budget limits are never used here.
export function periodSummary(state, key, personId = null) {
  const { from, to } = periodRange(key);
  const inside = date => date >= from && date <= to;
  const categoryOf = new Map(state.categories.map(category => [category.id, category]));
  const byCategory = new Map();
  const byDay = new Map();
  let income = 0, spent = 0, toGoals = 0, toMySavings = 0, count = 0, biggest = null;
  for (const entry of state.entries) {
    if (!inside(entry.date) || (personId && entry.personId !== personId)) continue;
    count++;
    const saved = goalShares(entry).reduce((sum, share) => sum + share.amount, 0);
    toGoals += saved;
    if (entry.type === 'income') {
      income += entry.amount;
      toMySavings += entry.splits?.find(split => split.categoryId === SAVINGS_CATEGORY_ID)?.amount ?? 0;
    } else {
      const amount = spentPart(entry, saved);
      if (!amount) continue;
      spent += amount;
      const category = categoryOf.get(entry.categoryId);
      const name = category?.name ?? entry.source;
      const row = byCategory.get(name) ?? { name, color: category ? categoryColor(category) : '#8a94a3', spent: 0 };
      row.spent += amount;
      byCategory.set(name, row);
      byDay.set(entry.date, (byDay.get(entry.date) ?? 0) + amount);
      if (!biggest || amount > biggest.amount) biggest = { ...entry, amount };
    }
  }
  for (const record of state.savings ?? []) if (inside(record.date) && (!personId || record.personId === personId)) toMySavings += record.amount;
  const categories = [...byCategory.values()].sort((a, b) => b.spent - a.spent);
  const busiest = [...byDay].sort((a, b) => b[1] - a[1])[0];
  return { income, spent, net: income - spent, toGoals, toMySavings, count, biggest, categories, byCategory,
    busiestDay: busiest ? { date: busiest[0], amount: busiest[1] } : null };
}

// The part of an expense that was really spent: money that went into a joint goal (a Wedding
// deposit, or an expense's savings rate) counts as saved, not spent.
const spentPart = (entry, saved = goalShares(entry).reduce((sum, share) => sum + share.amount, 0)) => Math.max(0, entry.amount - saved);

// Income and spending for the `count` months ending with `endMonth`.
export const monthlyTrend = (state, endMonth, count, personId = null) => trend(state, 'month', endMonth + '-01', count, personId).map(row => ({ ...row, month: row.key }));

// Monday of the week containing `date`, as a date key.
export function weekStart(date) {
  const day = new Date(Date.parse(date));
  const back = (day.getUTCDay() + 6) % 7;
  return new Date(Date.parse(date) - back * DAY).toISOString().slice(0, 10);
}
const bucketOf = (unit, date) => unit === 'week' ? weekStart(date) : unit === 'month' ? date.slice(0, 7) : date.slice(0, 4);

// Income and spending per week, month or year: `count` buckets ending with the one that
// contains `endDate`. Each person's figures are kept too, for side-by-side charts.
export function trend(state, unit, endDate, count, personId = null) {
  const end = bucketOf(unit, endDate);
  const keys = Array.from({ length: count }, (_, i) => {
    const back = count - 1 - i;
    if (unit === 'week') return new Date(Date.parse(end) - back * 7 * DAY).toISOString().slice(0, 10);
    if (unit === 'month') return shiftMonth(end, -back);
    return String(Number(end) - back);
  });
  const blank = () => Object.fromEntries(PEOPLE.map(person => [person.id, { income: 0, spent: 0 }]));
  const rows = new Map(keys.map(key => [key, { key, income: 0, spent: 0, people: blank() }]));
  for (const entry of state.entries) {
    const row = rows.get(bucketOf(unit, entry.date));
    if (!row) continue;
    const field = entry.type === 'income' ? 'income' : 'spent';
    const amount = entry.type === 'income' ? entry.amount : spentPart(entry);
    if (row.people[entry.personId]) row.people[entry.personId][field] += amount;
    if (!personId || entry.personId === personId) row[field] += amount;
  }
  return keys.map(key => rows.get(key));
}

// Earnings and savings for each person and together over a period. Savings are what went to
// each person's own savings and what they put toward joint goals.
export function householdTotals(state, key) {
  const people = Object.fromEntries(PEOPLE.map(person => {
    const summary = periodSummary(state, key, person.id);
    return [person.id, { income: summary.income, spent: summary.spent, mySavings: summary.toMySavings, joint: summary.toGoals }];
  }));
  const together = Object.fromEntries(['income', 'spent', 'mySavings', 'joint'].map(field => [field, Object.values(people).reduce((sum, row) => sum + row[field], 0)]));
  return { people, together };
}

// The signed-in person's categories with a limit that are at 80% or more of it this month.
// `budget` comes from personalBudget, so only that person's limits are used.
export function budgetWarnings(budget, today) {
  const [y, m, d] = today.split('-').map(Number);
  const daysLeft = daysInMonth(y, m) - d + 1; // Today counts as a day to go.
  return budget.categories
    .filter(category => budget.limit(category) > 0 && ![PERSONAL_CATEGORY_ID, SAVINGS_CATEGORY_ID].includes(category.id))
    .map(category => {
      const spent = budget.spentByCategory.get(category.id) ?? 0, limit = budget.limit(category);
      return { category, spent, limit, left: limit - spent, ratio: spent / limit, daysLeft };
    })
    .filter(row => row.ratio >= 0.8)
    .map(row => ({ ...row, level: row.spent > row.limit ? 'over' : 'warn' }))
    .sort((a, b) => b.ratio - a.ratio);
}

export const warningLevel = (spent, limit) => !limit ? null : spent > limit ? 'over' : spent / limit >= 0.8 ? 'warn' : null;

export const EMPTY_FILTERS = { text: '', type: 'all', categoryId: 'all', personId: 'all', min: '', max: '', range: 'month', from: '', to: '' };

// `month` is the month shown on the Budget page, used when the range is "This month".
export function filterEntries(state, filters, month) {
  const text = filters.text.trim().toLowerCase();
  const cents = value => value === '' || !Number.isFinite(Number(value)) ? null : Math.round(Number(value) * 100);
  const min = cents(filters.min), max = cents(filters.max);
  const range = filters.range === 'month' ? periodRange(month)
    : filters.range === 'custom' ? { from: filters.from || '0000-01-01', to: filters.to || '9999-12-31' } : null;
  const names = new Map(state.categories.map(category => [category.id, category.name.toLowerCase()]));
  return state.entries.filter(entry => {
    if (range && (entry.date < range.from || entry.date > range.to)) return false;
    if (filters.type !== 'all' && entry.type !== filters.type) return false;
    if (filters.personId !== 'all' && entry.personId !== filters.personId) return false;
    if (filters.categoryId !== 'all' && entry.categoryId !== filters.categoryId && !entry.splits?.some(split => split.categoryId === filters.categoryId)) return false;
    if (min !== null && entry.amount < min) return false;
    if (max !== null && entry.amount > max) return false;
    if (text) {
      const person = PEOPLE.find(p => p.id === entry.personId)?.name.toLowerCase() ?? '';
      const haystack = [entry.source, names.get(entry.categoryId) ?? '', person, (entry.amount / 100).toFixed(2)].join(' ').toLowerCase();
      if (!haystack.includes(text)) return false;
    }
    return true;
  });
}

// What a goal with a deadline needs: the monthly amount from today, and whether the
// forecast pace gets there in time.
export function goalPlan(goal, total, forecast, today) {
  if (!goal.targetDate) return null;
  const remaining = goal.target - total;
  if (remaining <= 0) return { status: 'reached' };
  const days = Math.round((Date.parse(goal.targetDate) - Date.parse(today)) / DAY);
  if (days < 0) return { status: 'passed', remaining };
  const months = Math.max(1, days / 30.44);
  const perMonth = Math.ceil(remaining / months / 100) * 100; // Rounded up to whole dollars.
  let pace = 'unknown', late = 0;
  if (forecast.status === 'on-track') {
    pace = forecast.date <= goal.targetDate ? 'ahead' : 'behind';
    if (pace === 'behind') late = Math.max(1, Math.round((Date.parse(forecast.date) - Date.parse(goal.targetDate)) / DAY / 30.44));
  } else if (forecast.status === 'far' || forecast.status === 'stalled') pace = 'behind';
  return { status: 'open', remaining, months: Math.round(months), perMonth, pace, late };
}

// How full the synced planner document is. Firestore allows 1 MiB per document; the planner
// is one JSON string, so its UTF-8 size is a close estimate. Growth is estimated from the
// entries logged in the last 90 days.
export const STORAGE_LIMIT = 1_048_576;
export function storageUsage(json, entries, today) {
  const bytes = new TextEncoder().encode(json ?? '').length;
  const perEntry = entries.length ? bytes / entries.length : 250;
  const since = new Date(Date.parse(today) - 90 * DAY).toISOString().slice(0, 10);
  const recent = entries.filter(entry => entry.date >= since && entry.date <= today).length;
  const perYear = recent * perEntry * 365 / 90;
  return { bytes, ratio: bytes / STORAGE_LIMIT, yearsLeft: perYear > 0 ? Math.max(0, (STORAGE_LIMIT - bytes) / perYear) : null };
}
