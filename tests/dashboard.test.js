import test from 'node:test';
import assert from 'node:assert/strict';
import { STORAGE_KEY, WEDDING_CATEGORY_ID, contribution, entryFromFields, freshData, localDate, localTime, readState, setJointBalance, summarize,
  calendarDays, calendarItems, isPayday, debtFromFields, debtBalances, settleDebt } from '../src/model.js';

const fields = (overrides = {}) => ({
  personId: 'long', type: 'expense', categoryId: 'transport', source: 'Paycheck', amount: '300',
  date: '2026-11-27', ...overrides,
});

test('edits and deletes recalculate only the affected contribution, including after a manual override', () => {
  let state = freshData();
  state.goals.push({ id: 'travel', name: 'Travel', target: 100_000 });
  state.categories.find(category => category.id === 'transport').savingsRates = { long: 2000, mei: 1000 };
  Object.assign(state.categories.find(category => category.id === 'dining'), { savingsRates: { long: 1500 }, savingsGoalId: 'travel' });
  const long = entryFromFields(fields(), state);
  const mei = entryFromFields(fields({ personId: 'mei', amount: '500' }), state);
  state.entries = [long, mei];
  assert.deepEqual(summarize(state, '2026-11').goals.wedding, { total: 11_000, long: 6_000, mei: 5_000 });
  state = setJointBalance(state, 30_000);
  assert.equal(summarize(state).jointBalance, 30_000);
  const moved = entryFromFields(fields({ categoryId: 'dining' }), state, long);
  assert.equal(moved.createdAt, long.createdAt);
  assert.ok(moved.editedAt);
  state.entries = [moved, mei];
  assert.equal(summarize(state).jointBalance, 28_500);
  assert.deepEqual(summarize(state).goals.wedding, { total: 5_000, long: 0, mei: 5_000 });
  state.entries = state.entries.filter(entry => entry.id !== moved.id);
  assert.equal(summarize(state).jointBalance, 24_000);
  assert.equal(summarize(state).goals.travel.total, 0);
});

test('expense edit and deletion move spending with a stable category ID', () => {
  const state = freshData();
  const expense = entryFromFields(fields({ type: 'expense', categoryId: 'transport', amount: '15.99' }), state);
  state.categories.find(category => category.id === 'transport').name = 'Gas';
  state.entries = [expense];
  assert.equal(expense.source, 'Transportation');
  assert.equal(summarize(state, '2026-11').spentByCategory.get('transport'), 1599);
  const moved = entryFromFields(fields({ type: 'expense', categoryId: 'dining', amount: '20.01' }), state, expense);
  state.entries = [moved];
  assert.equal(summarize(state, '2026-11').spentByCategory.has('transport'), false);
  assert.equal(summarize(state, '2026-11').spentByCategory.get('dining'), 2001);
  assert.equal(summarize(state, '2026-10').spent, 0);
  state.entries = [];
  assert.equal(summarize(state, '2026-11').spent, 0);
});

test('percentage math rounds once at the cent boundary and rejects invalid entry dates and amounts', () => {
  assert.equal(contribution(5, 1000), 1);
  assert.equal(contribution(10_001, 3333), 3333);
  for (const invalid of [{ personId: 'unknown' }, { categoryId: 'unknown' }, { date: '2026-02-30' }, { amount: '0' }]) {
    assert.throws(() => entryFromFields(fields(invalid), freshData()));
  }
});

test('restores records and upgrades older saved dashboards without changing their contributions', () => {
  const state = freshData();
  state.entries = [{ ...entryFromFields(fields({ type: 'income' }), state), rate: 2000, goalId: 'wedding' }];
  state.events = [{ id: 'event', title: 'Check-in', date: '2026-11-16', time: '18:00', description: '' }];
  const { firstPaydays, debts, ...old } = state;
  const storage = new Map([[STORAGE_KEY, JSON.stringify({ ...old, googleUrl: 'https://calendar.google.com/calendar/embed' })]]);
  const upgraded = readState({ getItem: key => storage.get(key) });
  assert.deepEqual(upgraded, state);
  assert.equal(summarize(upgraded).totalContributions, 6000);
  upgraded.entries = [entryFromFields(fields({ type: 'income', rate: '20', goalId: 'wedding' }), upgraded, upgraded.entries[0])];
  assert.equal('rate' in upgraded.entries[0], false);
  assert.equal(summarize(upgraded).totalContributions, 0);
});

test('saved expense rates survive category rule changes and edits to the amount', () => {
  const state = freshData();
  const category = state.categories.find(category => category.id === 'transport');
  category.savingsRates = { long: 5000, mei: 1000 };
  const expense = entryFromFields(fields(), state);
  category.savingsRates.long = 2500;
  state.entries = [entryFromFields(fields({ amount: '100' }), state, expense)];
  assert.equal(summarize(state).totalContributions, 5000);
  state.entries.push(entryFromFields(fields({ amount: '100' }), state));
  assert.equal(summarize(state).totalContributions, 7500);
  state.entries = [entryFromFields(fields({ amount: '100', personId: 'mei' }), state, expense)];
  assert.equal(summarize(state).totalContributions, 1000);
});

test('calendar combines alternating paydays, entries and events through month and DST boundaries', () => {
  const state = freshData();
  state.entries = [entryFromFields(fields(), state), entryFromFields(fields({ type: 'income', date: '2026-12-04' }), state)];
  state.events = [{ id: 'event', title: 'Check-in', date: '2026-12-04', time: '18:00' }];
  const agenda = calendarItems(state, calendarDays('2026-12'));
  assert.deepEqual(agenda.get('2026-12-04').map(item => item.kind), ['payday', 'income', 'event']);
  assert.equal(agenda.get('2026-12-11')[0].personId, 'long');
  assert.equal(agenda.get('2026-12-18')[0].personId, 'mei');
  assert.equal(agenda.get('2026-12-25')[0].personId, 'long');
  assert.equal(calendarItems(state, ['2026-11-27']).get('2026-11-27')[1].title, 'Transportation');
  assert.equal(isPayday('2026-11-13', state.firstPaydays.long), false);
  assert.equal(isPayday('2027-03-19', state.firstPaydays.long), true);
});

test('settling one debt preserves both ledger records and updates the net in cents', () => {
  const state = freshData();
  const debt = debtFromFields({ debtorId: 'long', creditorId: 'mei', addedBy: 'long', amount: '45.01', description: 'Dinner' });
  const other = debtFromFields({ debtorId: 'mei', creditorId: 'long', addedBy: 'mei', amount: '10', description: 'Coffee' });
  state.debts = [debt, other];
  assert.deepEqual(debtBalances(state.debts), { count: 2, debtorId: 'long', net: 3501, long: 4501, mei: 1000 });
  const when = '2026-12-05T18:03:00Z';
  const settled = settleDebt(state, debt.id, when);
  assert.equal(settled.debts.length, 2);
  assert.equal(settled.debts[0].settledAt, when);
  assert.deepEqual(debtBalances(settled.debts), { count: 1, debtorId: 'mei', net: 1000, long: 0, mei: 1000 });
  assert.throws(() => settleDebt(settled, debt.id));
  assert.throws(() => debtFromFields({ debtorId: 'long', creditorId: 'long', addedBy: 'long', amount: '10', description: 'Dinner' }));
  assert.deepEqual(readState({ getItem: () => JSON.stringify(settled) }).debts, settled.debts);
});

test('Wedding applies each person’s rate to the joint balance and places one timed deposit on the calendar', () => {
  const state = freshData();
  const wedding = state.categories.find(category => category.id === WEDDING_CATEGORY_ID);
  const input = fields({ categoryId: wedding.id, amount: '50', time: '14:35' });
  const full = entryFromFields(input, state);
  assert.equal(full.rate, 10_000);
  wedding.savingsRates.mei = 6000;
  const partial = entryFromFields({ ...input, personId: 'mei', time: '15:30' }, state);
  state.entries = [full, partial];
  assert.equal(summarize(state, '2026-11').spentByCategory.get(wedding.id), 10_000);
  assert.equal(summarize(state).jointBalance, 8000);
  const events = calendarItems(state, [input.date]).get(input.date);
  assert.deepEqual(events.filter(item => item.kind !== 'payday').map(item => [item.title, item.amount, item.time]),
    [['Wedding deposit', 5000, '14:35'], ['Wedding deposit', 3000, '15:30']]);
});

test('an existing Wedding category keeps its rates and linked entry history when made permanent', () => {
  const state = freshData();
  state.categories = state.categories.filter(category => category.id !== WEDDING_CATEGORY_ID);
  const category = { id: 'old-wedding', name: ' wedding ', limit: 50_000, savingsRates: { long: 3000, mei: 0 } };
  state.categories.push(category);
  state.entries.push(entryFromFields(fields({ categoryId: category.id, amount: '100' }), state));
  const restored = readState({ getItem: () => JSON.stringify(state) });
  const wedding = restored.categories.find(category => category.id === WEDDING_CATEGORY_ID);
  assert.equal(wedding.name, 'Wedding');
  assert.equal(wedding.limit, 50_000);
  assert.deepEqual(wedding.savingsRates, { long: 3000, mei: 0 });
  assert.equal(restored.entries[0].categoryId, WEDDING_CATEGORY_ID);
  assert.equal(summarize(restored).jointBalance, summarize(state).jointBalance);
});

test('a calendar debt payment uses the settlement date and time, including across UTC midnight', () => {
  const state = freshData();
  state.debts.push(debtFromFields({ debtorId: 'long', creditorId: 'mei', addedBy: 'long', amount: '45', description: 'Dinner' },
    '2026-11-24T04:30:00Z'));
  const paidAt = '2026-11-25T04:35:00Z';
  const date = localDate(new Date(paidAt));
  assert.equal(calendarItems(state, [date]).get(date).length, 0);
  const updated = settleDebt(state, state.debts[0].id, paidAt);
  const [payment] = calendarItems(updated, [date]).get(date);
  assert.equal(payment.kind, 'payment');
  assert.equal(payment.time, localTime(new Date(paidAt)));
  assert.equal(payment.debt.amount, 4500);
});

test('savings tree grows one meter per configured amount and reads saved settings safely', async () => {
  const { normalizeTree, skyAt, treeMeters } = await import('../src/tree-model.js');
  assert.equal(treeMeters(250_000, 100_000), 2.5);
  assert.equal(treeMeters(-5_000, 100_000), 0);
  assert.deepEqual(normalizeTree({ kind: 'palm', perMeter: 0 }), { kind: 'cherry', perMeter: 100_000 });
  assert.deepEqual(normalizeTree({ kind: 'maple', perMeter: 50_000 }), { kind: 'maple', perMeter: 50_000 });
  assert.equal(skyAt(new Date(2026, 5, 21, 12)).night, 0);
  assert.equal(skyAt(new Date(2026, 5, 21, 1)).night, 1);
  assert.ok(skyAt(new Date(2026, 5, 21, 12)).sun && !skyAt(new Date(2026, 5, 21, 1)).sun);
});
