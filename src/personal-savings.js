// Each person's own savings: money they add or take out by hand, plus income shares and expenses
// in categories of their Personal saving folder (recorded as `to: 'saving'` when saved). Records live in state.savings; income shares are read from entries.
import { PEOPLE, folderLedger, decimalUnits, entryTime, isDateKey, localTime } from './model.js';

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
    ...(fields.folderId ? { folderId: fields.folderId } : previous?.folderId ? { folderId: previous.folderId } : {}),
    createdAt: previous?.createdAt ?? now, ...(previous ? { editedAt: now } : {}),
  };
}

export const isSavingsRecord = record => record && typeof record.id === 'string' && PEOPLE.some(person => person.id === record.personId)
  && isDateKey(record.date) && TIME.test(record.time) && Number.isSafeInteger(record.amount) && record.amount !== 0 && typeof record.note === 'string';

export function personalSavings(state, personId) {
  // Everything in this person's Personal saving folders, newest first.
  const mine = new Set((state.folders ?? []).filter(folder => folder.kind === 'saving' && folder.ownerId === personId).map(folder => folder.id));
  if (!state.folders) mine.add('saving-' + personId);
  const kindOf = row => row.record ? (row.amount < 0 ? 'out' : 'in') : row.transfer ? 'transfer' : row.kind === 'income' ? 'income' : 'budget';
  const rows = folderLedger(state).filter(row => mine.has(row.folder)).map(row => row.record ? { ...row.record, kind: kindOf(row), folder: row.folder }
    : { id: (row.transfer ? 'transfer:' + row.transfer.id : row.kind + ':' + row.entry.id) + ':' + row.folder, kind: kindOf(row), date: row.date, time: row.time, amount: row.amount, note: row.label, folder: row.folder, entry: row.entry, transfer: row.transfer });
  const sum = test => rows.filter(test).reduce((total, row) => total + row.amount, 0);
  return { rows, added: sum(row => row.kind === 'in' || (row.kind === 'transfer' && row.amount > 0)), fromIncome: sum(row => row.kind === 'income' || row.kind === 'budget'),
    takenOut: -sum(row => row.kind === 'out' || (row.kind === 'transfer' && row.amount < 0)) || 0, balance: sum(() => true) };
}
