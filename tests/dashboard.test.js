import test from 'node:test';
import assert from 'node:assert/strict';
import { STORAGE_KEY, contribution, entryFromFields, freshData, readState, setJointBalance, summarize,
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
  state.categories[1].name = 'Gas';
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
