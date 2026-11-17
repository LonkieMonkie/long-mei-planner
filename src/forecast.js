// Projects when a savings goal will be reached from the pace of its recent deposits.
import { addDays } from './events.js';
import { goalShares } from './model.js';

const DAY = 86_400_000;
const WINDOW = 90; // Pace is measured over the last 90 days.
const MIN_SPAN = 30; // A single recent deposit is spread over at least 30 days.
const MAX_YEARS = 50;
const daysBetween = (from, to) => Math.round((Date.parse(to) - Date.parse(from)) / DAY);

export function goalForecast(entries, goal, total, today) {
  const remaining = goal.target - total;
  if (remaining <= 0) return { status: 'reached' };
  const deposits = entries.filter(entry => entry.date <= today)
    .map(entry => ({ date: entry.date, amount: goalShares(entry).filter(share => share.goalId === goal.id).reduce((sum, share) => sum + share.amount, 0) }))
    .filter(entry => entry.amount > 0);
  if (!deposits.length) return { status: 'no-data', remaining };
  const first = deposits.reduce((min, entry) => entry.date < min ? entry.date : min, today);
  const last = deposits.reduce((max, entry) => entry.date > max ? entry.date : max, first);
  const sinceFirst = daysBetween(first, today) + 1;
  const span = Math.min(WINDOW, Math.max(MIN_SPAN, sinceFirst));
  const from = addDays(today, 1 - span);
  const recent = deposits.filter(entry => entry.date >= from).reduce((sum, entry) => sum + entry.amount, 0);
  if (recent <= 0) return { status: 'stalled', remaining, last };
  const perDay = recent / span;
  const perMonth = Math.round(perDay * 30.44 / 100) * 100; // Whole dollars: it's an estimate.
  const days = Math.ceil(remaining / perDay);
  const since = sinceFirst < WINDOW ? first : null; // Otherwise the last 90 days.
  if (days > MAX_YEARS * 365) return { status: 'far', remaining, perMonth, since };
  return { status: 'on-track', remaining, perMonth, days, date: addDays(today, days), since };
}
