import test from 'node:test';
import assert from 'node:assert/strict';
import { STORAGE_KEY, contribution, entryFromFields, freshData, googleEmbed, readState, setJointBalance, summarize, calendarDays } from '../src/model.js';

const fields = (overrides = {}) => ({
  personId: 'long', type: 'income', source: 'Paycheck', amount: '300', rate: '20',
  date: '2026-11-16', goalId: 'wedding', ...overrides,
});

test('edits and deletes recalculate only the affected contribution, including after a manual override', () => {
  let state = freshData();
  state.goals.push({ id: 'travel', name: 'Travel', target: 100_000 });
  const long = entryFromFields(fields(), state);
  const mei = entryFromFields(fields({ personId: 'mei', amount: '500', rate: '10' }), state);
  state.entries = [long, mei];
  assert.deepEqual(summarize(state, '2026-11').goals.wedding, { total: 11_000, long: 6_000, mei: 5_000 });
  state = setJointBalance(state, 30_000);
  assert.equal(summarize(state).jointBalance, 30_000);
  const moved = entryFromFields(fields({ rate: '15', goalId: 'travel' }), state, long);
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

test('percentage math rounds once at the cent boundary and rejects bad dates and rates', () => {
  assert.equal(contribution(5, 1000), 1);
  assert.equal(contribution(10_001, 3333), 3333);
  for (const invalid of [{ rate: '101' }, { rate: '-1' }, { rate: '20', goalId: '' }, { date: '2026-02-30' }, { amount: '0' }]) {
    assert.throws(() => entryFromFields(fields(invalid), freshData()));
  }
});

test('restores events, entries and preferences from the dashboard storage key', () => {
  const state = freshData();
  state.entries = [entryFromFields(fields(), state)];
  state.events = [{ id: 'event', title: 'Check-in', date: '2026-11-16', time: '18:00', description: '' }];
  state.googleUrl = googleEmbed('https://calendar.google.com/calendar/embed?src=our-calendar%40example.com');
  const storage = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  assert.deepEqual(readState({ getItem: key => storage.get(key) }), state);
  assert.ok(calendarDays('2026-11').includes(state.events[0].date));
});

test('accepts Google embed and calendar sharing links and rejects lookalike hosts', () => {
  const src = 'our-calendar@example.com';
  const share = 'https://calendar.google.com/calendar/u/0/r?cid=' + btoa(src).replace(/=+$/, '');
  assert.equal(new URL(googleEmbed(share)).searchParams.get('src'), src);
  assert.equal(new URL(googleEmbed('https://calendar.google.com/calendar/embed?src=our-calendar%40example.com&mode=AGENDA')).searchParams.get('mode'), 'AGENDA');
  assert.throws(() => googleEmbed('https://calendar.google.com.example.net/calendar/embed?src=x@example.com'));
  assert.throws(() => googleEmbed('https://calendar.google.com/calendar/event?eid=123'));
});
