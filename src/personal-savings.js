// Each person's own savings: money they add or take out by hand, plus the Personal share of
// their split income. Records live in state.savings; income shares are read from entries.
import { PERSONAL_CATEGORY_ID, PEOPLE, decimalUnits, entryTime, isDateKey, localTime } from './model.js';

const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function savingsFromFields(fields, previous, now = new Date().toISOString()) {
  if (!PEOPLE.some(person => person.id === fields.personId)) throw new Error('Choose whose savings this is.');
  const amount = decimalUnits(fields.amount);
  if (amount <= 0) throw new Error('Enter an amount greater than zero.');
  if (!isDateKey(fields.date)) throw new Error('Choose a valid date.');
  const time = fields.time || previous?.time || localTime(new Date(now));
  if (!TIME.test(time)) throw new Error('Choose a valid time.');
  const out = fields.direction === 'out';
  return {
    id: previous?.id ?? crypto.randomUUID(), personId: fields.personId, date: fields.date, time,
    amount: out ? -amount : amount, note: String(fields.note ?? '').trim().slice(0, 100),
    createdAt: previous?.createdAt ?? now, ...(previous ? { editedAt: now } : {}),
  };
}

export const isSavingsRecord = record => record && typeof record.id === 'string' && PEOPLE.some(person => person.id === record.personId)
  && isDateKey(record.date) && TIME.test(record.time) && Number.isSafeInteger(record.amount) && record.amount !== 0 && typeof record.note === 'string';

export function personalSavings(state, personId) {
  const rows = state.savings.filter(record => record.personId === personId).map(record => ({ ...record, kind: record.amount < 0 ? 'out' : 'in' }));
  for (const entry of state.entries) {
    if (entry.personId !== personId) continue;
    const share = entry.splits?.find(split => split.categoryId === PERSONAL_CATEGORY_ID);
    if (share?.amount) rows.push({ id: 'income:' + entry.id, kind: 'income', date: entry.date, time: entryTime(entry), amount: share.amount, note: entry.source, entry });
  }
  rows.sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  const sum = kind => rows.filter(row => row.kind === kind).reduce((total, row) => total + row.amount, 0);
  return { rows, added: sum('in'), fromIncome: sum('income'), takenOut: -sum('out'), balance: rows.reduce((total, row) => total + row.amount, 0) };
}
