import test from 'node:test';
import assert from 'node:assert/strict';
import { STORAGE_KEY, WEDDING_CATEGORY_ID, contribution, entryFromFields, freshData, localDate, localTime, readState, setJointBalance, summarize,
  calendarDays, calendarItems, debtFromFields, debtBalances, settleDebt } from '../src/model.js';

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

test('calendar combines entries and events through month boundaries, with no automatic paydays', () => {
  const state = freshData();
  state.entries = [entryFromFields(fields(), state), entryFromFields(fields({ type: 'income', date: '2026-12-04' }), state)];
  state.events = [{ id: 'event', title: 'Check-in', date: '2026-12-04', time: '18:00' }];
  const agenda = calendarItems(state, calendarDays('2026-12'));
  assert.deepEqual(agenda.get('2026-12-04').map(item => item.kind), ['income', 'event']);
  assert.deepEqual(agenda.get('2026-12-11'), []);
  assert.equal(calendarItems(state, ['2026-11-27']).get('2026-11-27')[0].title, 'Transportation');
  const old = { ...state, firstPaydays: { long: '2026-11-27', mei: '2026-12-04' } };
  assert.equal('firstPaydays' in readState({ getItem: () => JSON.stringify(old) }), false);
});

test('repeating events end on a date or after a count, skip deleted dates, and survive DST', async () => {
  const { deleteEvent, eventFromFields, occursOn, upcomingEvents } = await import('../src/events.js');
  const base = { title: 'Rent', date: '2027-01-31', time: '', description: '' };
  const monthly = eventFromFields({ ...base, freq: 'monthly', ends: 'after', count: '3' }, 'rent');
  assert.deepEqual(['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30'].map(day => occursOn(monthly, day)), [true, true, true, false]);
  const weekly = eventFromFields({ ...base, date: '2026-11-06', freq: 'weekly', ends: 'on', until: '2026-11-27' }, 'gym');
  assert.deepEqual(['2026-11-06', '2026-11-13', '2026-11-27', '2026-12-04', '2026-11-10'].map(day => occursOn(weekly, day)), [true, true, true, false, false]);
  const biweekly = eventFromFields({ ...base, date: '2026-10-30', freq: 'biweekly', ends: 'never' }, 'pay');
  assert.equal(occursOn(biweekly, '2027-03-19'), true); // across the November daylight-saving change
  assert.equal(occursOn(biweekly, '2027-03-26'), false);
  assert.throws(() => eventFromFields({ ...base, freq: 'weekly', ends: 'on', until: '2027-01-01' }));
  assert.throws(() => eventFromFields({ ...base, freq: 'weekly', ends: 'after', count: '0' }));

  let events = deleteEvent([weekly], 'gym', '2026-11-13', 'one');
  assert.deepEqual(['2026-11-06', '2026-11-13', '2026-11-20'].map(day => occursOn(events[0], day)), [true, false, true]);
  events = deleteEvent(events, 'gym', '2026-11-20', 'following');
  assert.deepEqual(events[0].repeat, { freq: 'weekly', ends: 'on', until: '2026-11-19' });
  assert.equal(occursOn(events[0], '2026-11-06'), true);
  assert.equal(deleteEvent([monthly], 'rent', '2027-02-28', 'following')[0].repeat.until, '2027-01-31');
  assert.deepEqual(deleteEvent(events, 'gym', '2026-11-06', 'all'), []);

  assert.deepEqual(upcomingEvents([biweekly, weekly], '2026-11-07', 3).map(({ event, date }) => [event.id, date]),
    [['pay', '2026-11-13'], ['gym', '2026-11-13'], ['gym', '2026-11-20']]);
  const saved = { ...freshData(), events: [{ ...weekly, repeat: { freq: 'hourly' } }, { ...monthly, skip: ['bad', '2027-02-28'] }] };
  const read = readState({ getItem: () => JSON.stringify(saved) });
  assert.equal('repeat' in read.events[0], false);
  assert.deepEqual(read.events[1].skip, ['2027-02-28']);
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

test('goal forecast projects the reach date from the last 90 days of deposits', async () => {
  const { goalForecast } = await import('../src/forecast.js');
  const goal = { id: 'wedding', target: 3_000_000 };
  const deposit = (date, cents) => ({ goalId: 'wedding', date, amount: cents, rate: 10_000, type: 'expense' });
  const today = '2026-11-17';
  assert.deepEqual(goalForecast([], goal, 0, today), { status: 'no-data', remaining: 3_000_000 });
  assert.equal(goalForecast([], goal, 3_000_000, today).status, 'reached');
  // $3,000 over the last 90 days: $1,000 a month pace on $27,000 left → 810 days.
  const steady = [deposit('2026-03-01', 100_000), deposit('2026-08-20', 100_000), deposit('2026-09-20', 100_000), deposit('2026-10-20', 100_000)];
  const forecast = goalForecast(steady, goal, 300_000, today);
  assert.equal(forecast.status, 'on-track');
  assert.equal(forecast.days, 810);
  assert.equal(forecast.date, '2029-02-04');
  assert.equal(forecast.perMonth, 101_500);
  assert.equal(forecast.since, null);
  // One deposit yesterday is spread over 30 days, not 2.
  const fresh = goalForecast([deposit('2026-11-16', 100_000)], goal, 100_000, today);
  assert.equal(fresh.days, 870);
  assert.equal(fresh.since, '2026-11-16');
  assert.deepEqual(goalForecast([deposit('2026-01-05', 100_000)], goal, 100_000, today), { status: 'stalled', remaining: 2_900_000, last: '2026-01-05' });
  assert.equal(goalForecast([deposit('2026-11-16', 1)], goal, 1, today).status, 'far');
  assert.equal(goalForecast([deposit('2026-12-01', 100_000)], goal, 100_000, today).status, 'no-data');
});

test('income can be saved without a source and is labelled Income', () => {
  const state = freshData();
  const entry = entryFromFields(fields({ type: 'income', source: '   ' }), state);
  assert.equal(entry.source, 'Income');
  assert.equal(entryFromFields(fields({ type: 'income', source: 'Paycheck' }), state).source, 'Paycheck');
  assert.throws(() => entryFromFields(fields({ categoryId: '' }), state), /budget category/);
});

test('income splits fund that month\'s budgets and send only Wedding\'s share to joint savings', () => {
  const state = freshData();
  const splits = JSON.stringify([{ categoryId: 'dining', rate: 2000 }, { categoryId: 'wedding', rate: 1000 }, { categoryId: 'essentials', rate: 7000 }, { categoryId: 'bills', rate: 0 }, { categoryId: 'personal', rate: 5000 }]);
  const entry = entryFromFields(fields({ type: 'income', amount: '100.05', source: '', splits }), state);
  assert.deepEqual(entry.splits, [{ categoryId: 'dining', rate: 2000, amount: 2001 }, { categoryId: 'wedding', rate: 1000, amount: 1001, goalId: 'wedding' }, { categoryId: 'essentials', rate: 7000, amount: 7003 }]);
  assert.equal(entry.splits.reduce((sum, split) => sum + split.amount, 0), 10_005);
  state.entries = [entry];
  const totals = summarize(state, entry.date.slice(0, 7));
  assert.equal(totals.fundedByCategory.get('dining'), 2001);
  assert.equal(totals.fundedByCategory.get('wedding'), 1001);
  assert.equal(totals.goals.wedding.total, 1001);
  assert.equal(totals.jointBalance, 1001);
  assert.equal(totals.spent, 0);
  assert.equal(summarize(state, '2020-01').fundedByCategory.size, 0);
  assert.throws(() => entryFromFields(fields({ type: 'income', splits: JSON.stringify([{ categoryId: 'dining', rate: 6000 }, { categoryId: 'bills', rate: 5000 }]) }), state), /add up to 110%/);
  // Under 100%, the rest goes to Personal; nothing ticked sends it all there.
  const partial = entryFromFields(fields({ type: 'income', amount: '100', splits: JSON.stringify([{ categoryId: 'dining', rate: 3000 }]) }), state);
  assert.deepEqual(partial.splits, [{ categoryId: 'dining', rate: 3000, amount: 3000 }, { categoryId: 'personal', rate: 7000, amount: 7000 }]);
  assert.deepEqual(entryFromFields(fields({ type: 'income', amount: '10', splits: '[]' }), state).splits, [{ categoryId: 'personal', rate: 10_000, amount: 1000 }]);
  state.entries = [entry, partial];
  assert.equal(summarize(state, entry.date.slice(0, 7)).people.long.personal, 7000);
  const saved = readState({ getItem: () => JSON.stringify({ ...state, categories: state.categories.map(c => c.id === 'dining' ? { ...c, incomeShares: { long: 2000, mei: -5 } } : c) }) });
  assert.deepEqual(saved.categories.find(c => c.id === 'dining').incomeShares, { long: 2000 });
});

test('Personal is a permanent category, and an existing Personal category becomes it', () => {
  assert.ok(freshData().categories.some(category => category.id === 'personal'));
  const state = freshData();
  state.categories = state.categories.filter(category => category.id !== 'personal');
  state.categories.push({ id: 'mine', name: ' personal ', limit: 20_000 });
  state.entries = [{ ...entryFromFields(fields({ categoryId: 'mine' }), { ...state, categories: [...state.categories] }) }];
  const read = readState({ getItem: () => JSON.stringify(state) });
  const personal = read.categories.filter(category => category.id === 'personal');
  assert.equal(personal.length, 1);
  assert.equal(personal[0].name, 'Personal');
  assert.equal(personal[0].limit, 20_000);
  assert.equal(read.entries[0].categoryId, 'personal');
  assert.equal(readState({ getItem: () => JSON.stringify(freshData()) }).categories.filter(category => category.id === 'personal').length, 1);
});

test('editing an event changes every date, one date, or one date and later', async () => {
  const { editEvent, eventFromFields, occursOn } = await import('../src/events.js');
  const base = { title: 'Gym', date: '2026-11-02', time: '07:00', description: '', freq: 'weekly', ends: 'after', count: '6' };
  const series = { ...eventFromFields(base, 'gym'), skip: ['2026-11-09'] };
  const moved = eventFromFields({ ...base, title: 'Gym class', time: '18:00' });

  const all = editEvent([series], series, '2026-11-16', 'all', moved);
  assert.deepEqual(all.map(event => [event.id, event.title, event.time, event.skip]), [['gym', 'Gym class', '18:00', ['2026-11-09']]]);

  const one = editEvent([series], series, '2026-11-16', 'one', { ...moved, date: '2026-11-17' });
  assert.equal(one.length, 2);
  assert.equal(occursOn(one[0], '2026-11-16'), false);
  assert.equal(occursOn(one[0], '2026-11-23'), true);
  assert.deepEqual([one[1].title, one[1].date, 'repeat' in one[1]], ['Gym class', '2026-11-17', false]);

  const later = editEvent([series], series, '2026-11-16', 'following', eventFromFields({ ...base, date: '2026-11-16', count: '3', time: '18:00' }, 'new'));
  assert.deepEqual(later[0].repeat, { freq: 'weekly', ends: 'on', until: '2026-11-09' });
  assert.equal(occursOn(later[0], '2026-11-02'), true);
  assert.deepEqual(['2026-11-16', '2026-11-30', '2026-12-07'].map(day => occursOn(later[1], day)), [true, true, false]);

  // Editing from the first date is the same as editing every date.
  assert.equal(editEvent([series], series, '2026-11-02', 'following', moved)[0].id, 'gym');
  const single = eventFromFields({ title: 'Dentist', date: '2026-12-01' }, 'dentist');
  assert.deepEqual(editEvent([single], single, '2026-12-01', 'one', { ...single, id: 'x', title: 'Dentist (moved)' }).map(event => [event.id, event.title]), [['dentist', 'Dentist (moved)']]);
});
