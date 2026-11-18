// Calculations behind Insights, budget warnings, transaction filters and goal deadlines.
// Everything here is pure: it reads the planner state and returns numbers.
import { PEOPLE, PERSONAL_CATEGORY_ID, SAVINGS_CATEGORY_ID, dateFromKey, goalShares } from './model.js';

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

export function periodSummary(state, key) {
  const { from, to } = periodRange(key);
  const inside = date => date >= from && date <= to;
  const byCategory = new Map();
  const byDay = new Map();
  let income = 0, spent = 0, toGoals = 0, toMySavings = 0, count = 0, biggest = null;
  for (const entry of state.entries) {
    if (!inside(entry.date)) continue;
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
      byCategory.set(entry.categoryId, (byCategory.get(entry.categoryId) ?? 0) + amount);
      byDay.set(entry.date, (byDay.get(entry.date) ?? 0) + amount);
      if (!biggest || amount > biggest.amount) biggest = { ...entry, amount };
    }
  }
  for (const record of state.savings ?? []) if (inside(record.date)) toMySavings += record.amount;
  const categories = state.categories
    .map(category => ({ category, spent: byCategory.get(category.id) ?? 0 }))
    .filter(row => row.spent > 0)
    .sort((a, b) => b.spent - a.spent);
  const busiest = [...byDay].sort((a, b) => b[1] - a[1])[0];
  return { income, spent, net: income - spent, toGoals, toMySavings, count, biggest, categories, byCategory,
    busiestDay: busiest ? { date: busiest[0], amount: busiest[1] } : null };
}

// The part of an expense that was really spent: money that went into a joint goal (a Wedding
// deposit, or an expense's savings rate) counts as saved, not spent.
const spentPart = (entry, saved = goalShares(entry).reduce((sum, share) => sum + share.amount, 0)) => Math.max(0, entry.amount - saved);

// Income and spending for the `count` months ending with `endMonth`.
export function monthlyTrend(state, endMonth, count) {
  const months = Array.from({ length: count }, (_, i) => shiftMonth(endMonth, i - count + 1));
  const rows = new Map(months.map(month => [month, { month, income: 0, spent: 0 }]));
  for (const entry of state.entries) {
    const row = rows.get(entry.date.slice(0, 7));
    if (!row) continue;
    if (entry.type === 'income') row.income += entry.amount;
    else row.spent += spentPart(entry);
  }
  return months.map(month => rows.get(month));
}

// Categories with a limit that are at 80% or more of it this month.
export function budgetWarnings(state, spentByCategory, today) {
  const [y, m, d] = today.split('-').map(Number);
  const daysLeft = daysInMonth(y, m) - d + 1; // Today counts as a day to go.
  return state.categories
    .filter(category => category.limit > 0 && ![PERSONAL_CATEGORY_ID, SAVINGS_CATEGORY_ID].includes(category.id))
    .map(category => {
      const spent = spentByCategory.get(category.id) ?? 0;
      return { category, spent, limit: category.limit, left: category.limit - spent, ratio: spent / category.limit, daysLeft };
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
