import test from 'node:test';
import assert from 'node:assert/strict';
import { STORAGE_KEY, WEDDING_CATEGORY_ID, contribution, entryFromFields, freshData, newPlanner, localDate, localTime, readState, setJointBalance, summarize,
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
  // Reading also applies today's format (private category copies), so compare like with like.
  assert.deepEqual(upgraded, readState({ getItem: () => JSON.stringify(state) }));
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
  state.entries = [entryFromFields(fields(), state), entryFromFields(fields({ type: 'income', date: '2026-12-04', time: '09:00' }), state)];
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

test('an older Wedding category keeps its rates and history, and becomes a private copy each in Joint saving', () => {
  const state = freshData();
  state.categories = state.categories.filter(category => category.id !== WEDDING_CATEGORY_ID);
  const category = { id: 'old-wedding', name: ' wedding ', limit: 50_000, savingsRates: { long: 3000, mei: 0 } };
  state.categories.push(category);
  state.entries.push(entryFromFields(fields({ categoryId: category.id, amount: '100' }), state));
  const restored = readState({ getItem: () => JSON.stringify(state) });
  const copies = restored.categories.filter(category => category.name === 'Wedding');
  assert.deepEqual(copies.map(c => [c.id, c.ownerId, c.limit, c.folderId, c.savingsRates]),
    [['wedding', 'long', 50_000, 'joint', { long: 3000 }], ['wedding-mei', 'mei', 50_000, 'joint', undefined]]);
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

test('income splits fund that month\'s budgets, and the folder decides where each share goes', () => {
  const state = newPlanner();
  const splits = JSON.stringify([{ categoryId: 'dining', rate: 2000 }, { categoryId: 'wedding', rate: 1000 }, { categoryId: 'essentials', rate: 7000 }, { categoryId: 'bills', rate: 0 }, { categoryId: 'rest', rate: 5000 }]);
  const entry = entryFromFields(fields({ type: 'income', amount: '100.05', source: '', splits }), state);
  assert.deepEqual(entry.splits, [{ categoryId: 'dining', rate: 2000, amount: 2001, folder: 'checking-long' }, { categoryId: 'wedding', rate: 1000, amount: 1001, to: 'joint', folder: 'joint', goalId: 'wedding' }, { categoryId: 'essentials', rate: 7000, amount: 7003, folder: 'checking-long' }]);
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
  // Under 100%, the rest goes to Personal checking; nothing ticked sends it all there.
  const partial = entryFromFields(fields({ type: 'income', amount: '100', splits: JSON.stringify([{ categoryId: 'dining', rate: 3000 }]) }), state);
  assert.deepEqual(partial.splits, [{ categoryId: 'dining', rate: 3000, amount: 3000, folder: 'checking-long' }, { categoryId: 'rest', to: 'checking', folder: 'checking-long', rate: 7000, amount: 7000 }]);
  assert.deepEqual(entryFromFields(fields({ type: 'income', amount: '10', splits: '[]' }), state).splits, [{ categoryId: 'rest', to: 'checking', folder: 'checking-long', rate: 10_000, amount: 1000 }]);
  // A category ticked inside Personal checking counts as checking money too.
  const ticked = entryFromFields(fields({ type: 'income', amount: '10', splits: JSON.stringify([{ categoryId: 'personal', rate: 10_000 }]) }), state);
  assert.equal(ticked.splits[0].to, 'checking');
  state.entries = [entry, partial, ticked];
  assert.equal(summarize(state, entry.date.slice(0, 7)).people.long.personal, 8000);
  const saved = readState({ getItem: () => JSON.stringify({ ...state, categories: state.categories.map(c => c.id === 'dining' ? { ...c, incomeShares: { long: 2000, mei: -5 } } : c) }) });
  assert.deepEqual(saved.categories.find(c => c.id === 'dining').incomeShares, { long: 2000 });
});

test('each person gets locked saving and checking folders and both share one Joint saving folder; Wedding, My savings and Personal can be deleted', () => {
  const state = newPlanner();
  assert.deepEqual(state.folders.map(f => [f.id, f.ownerId, f.kind, f.locked]),
    [['joint', 'shared', 'joint', true], ['saving-long', 'long', 'saving', true], ['checking-long', 'long', 'checking', true], ['saving-mei', 'mei', 'saving', true], ['checking-mei', 'mei', 'checking', true]]);
  assert.deepEqual(state.paycheck, { long: 'checking-long', mei: 'checking-mei' });
  assert.deepEqual(state.categories.filter(c => c.folderId).map(c => [c.id, c.folderId]),
    [['wedding', 'joint'], ['wedding-mei', 'joint'], ['my-savings', 'saving-long'], ['my-savings-mei', 'saving-mei'], ['personal', 'checking-long'], ['personal-mei', 'checking-mei']]);
  // Renaming or deleting a built-in folder doesn't stick; deleting a category does.
  const edited = { ...state, folders: state.folders.filter(f => f.id !== 'saving-mei').map(f => f.id === 'joint' ? { ...f, name: 'Fun', locked: false } : f),
    categories: state.categories.filter(c => !['personal', 'wedding-mei'].includes(c.id)) };
  const read = readState({ getItem: () => JSON.stringify(edited) });
  assert.equal(read.folders.find(f => f.id === 'joint').name, 'Joint saving');
  assert.ok(read.folders.some(f => f.id === 'saving-mei' && f.locked));
  assert.equal(read.categories.some(c => c.id === 'personal' || c.id === 'wedding-mei'), false);
  assert.deepEqual(readState({ getItem: () => JSON.stringify(read) }), read);
  // An older planner's own "personal" category merges into Personal before it's made private.
  const old = freshData();
  old.categories = old.categories.filter(category => category.id !== 'personal');
  old.categories.push({ id: 'mine', name: ' personal ', limit: 20_000 });
  old.entries = [entryFromFields(fields({ categoryId: 'mine' }), { ...old, categories: [...old.categories] })];
  const upgraded = readState({ getItem: () => JSON.stringify(old) });
  assert.deepEqual(upgraded.categories.filter(c => c.name === 'Personal').map(c => [c.id, c.limit, c.folderId]), [['personal', 20_000, 'checking-long'], ['personal-mei', 20_000, 'checking-mei']]);
  assert.equal(upgraded.entries[0].categoryId, 'personal');
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

test('personal savings add deposits, withdrawals and the Personal share of income, per person', async () => {
  const { personalSavings, savingsFromFields } = await import('../src/personal-savings.js');
  const state = newPlanner();
  const deposit = savingsFromFields({ personId: 'long', date: '2026-11-10', time: '09:00', amount: '250', direction: 'in', note: ' Bonus ' }, undefined, '2026-11-10T14:00:00Z');
  const withdrawal = savingsFromFields({ personId: 'long', date: '2026-11-12', time: '10:00', amount: '40.50', direction: 'out', note: '' });
  assert.equal(deposit.note, 'Bonus');
  assert.equal(withdrawal.amount, -4050);
  assert.throws(() => savingsFromFields({ personId: 'long', date: '2026-11-12', time: '10:00', amount: '0' }));
  const income = entryFromFields(fields({ type: 'income', personId: 'long', amount: '100', date: '2026-11-15', splits: JSON.stringify([{ categoryId: 'dining', rate: 2500 }, { categoryId: 'my-savings', rate: 7500 }]) }), state);
  // The Personal remainder stays a budget set-aside and does not count as savings.
  const rest = entryFromFields(fields({ type: 'income', personId: 'long', amount: '50', date: '2026-11-15', splits: '[]' }), state);
  state.entries = [income, rest];
  state.savings = [deposit, withdrawal, savingsFromFields({ personId: 'mei', date: '2026-11-11', time: '08:00', amount: '5', direction: 'in' })];
  const long = personalSavings(state, 'long');
  assert.deepEqual([long.added, long.fromIncome, long.takenOut, long.balance], [25_000, 7_500, 4_050, 28_450]);
  assert.deepEqual(long.rows.map(row => row.kind), ['income', 'out', 'in']);
  assert.equal(personalSavings(state, 'mei').balance, 500);
  // Savings don't touch joint savings, and bad records are dropped when read back.
  assert.equal(summarize(state).jointBalance, 0);
  const read = readState({ getItem: () => JSON.stringify({ ...state, savings: [...state.savings, { id: 'x', personId: 'long', amount: 'lots' }] }) });
  assert.equal(read.savings.length, 3);
  assert.deepEqual(readState({ getItem: () => JSON.stringify({ ...freshData(), savings: undefined }) }).savings, []);
  const items = calendarItems(state, ['2026-11-12']).get('2026-11-12');
  assert.deepEqual(items.map(item => [item.kind, item.title, item.amount]), [['saving', 'Taken from Long’s savings', -4050]]);
});

test('the changelog lists the package version first, newest release on top', async () => {
  const { CHANGELOG, VERSION } = await import('../src/changelog.js');
  const { readFileSync } = await import('node:fs');
  assert.equal(VERSION, JSON.parse(readFileSync(new URL('../package.json', import.meta.url))).version);
  const parts = version => version.split('.').map(Number);
  for (let i = 1; i < CHANGELOG.length; i++) {
    const [a, b] = [parts(CHANGELOG[i - 1].version), parts(CHANGELOG[i].version)];
    assert.ok(a[0] > b[0] || (a[0] === b[0] && (a[1] > b[1] || (a[1] === b[1] && a[2] > b[2]))), `${CHANGELOG[i - 1].version} should be newer than ${CHANGELOG[i].version}`);
    assert.ok(CHANGELOG[i].changes.length > 0);
  }
});

test('My savings is added once for older planners, merging a category named Savings, then lives in Personal saving', () => {
  const old = freshData();
  old.categories = old.categories.filter(category => category.id !== 'my-savings');
  const read = readState({ getItem: () => JSON.stringify(old) });
  assert.deepEqual(read.categories.filter(c => c.name === 'My savings').map(c => [c.id, c.folderId]), [['my-savings', 'saving-long'], ['my-savings-mei', 'saving-mei']]);
  const named = freshData();
  named.categories = named.categories.filter(category => category.id !== 'my-savings').concat({ id: 'mine', name: 'Savings', limit: 0 });
  const merged = readState({ getItem: () => JSON.stringify(named) }).categories.filter(category => category.name === 'My savings');
  assert.equal(merged.length, 2);
  // Once folders exist, a new category may use any name.
  const now = newPlanner();
  now.categories.push({ id: 'savings2', name: 'Savings', ownerId: 'long', limit: 0 });
  assert.ok(readState({ getItem: () => JSON.stringify(now) }).categories.some(c => c.id === 'savings2' && c.name === 'Savings'));
});

test('profile pictures accept only small image data URLs for known profiles', async () => {
  const { cleanAvatars, isAvatar, readLocalAvatars } = await import('../src/avatars.js');
  const jpeg = 'data:image/jpeg;base64,' + 'A'.repeat(400);
  assert.ok(isAvatar(jpeg));
  assert.equal(isAvatar('data:image/svg+xml;base64,AAAA'), false);
  assert.equal(isAvatar('https://example.com/me.jpg'), false);
  assert.equal(isAvatar('data:image/png;base64,' + 'A'.repeat(200_000)), false);
  assert.deepEqual(cleanAvatars({ long: jpeg, mei: 'javascript:alert(1)', stranger: jpeg }), { long: jpeg });
  assert.deepEqual(readLocalAvatars({ getItem: () => 'not json' }), {});
});

test('events keep a valid color and drop anything else', async () => {
  const { eventFromFields, normalizeEvent } = await import('../src/events.js');
  assert.equal(eventFromFields({ title: 'Dinner', date: '2026-12-01', color: '#E0718B' }).color, '#e0718b');
  assert.equal('color' in eventFromFields({ title: 'Dinner', date: '2026-12-01', color: 'red; background:url(x)' }), false);
  assert.equal('color' in eventFromFields({ title: 'Dinner', date: '2026-12-01', color: '' }), false);
  assert.equal('color' in normalizeEvent({ id: 'a', title: 'x', date: '2026-12-01', color: 'blue' }), false);
  const state = freshData();
  state.events = [{ id: 'a', title: 'Dinner', date: '2026-12-01', color: '#5a9ccc' }];
  assert.equal(calendarItems(state, ['2026-12-01']).get('2026-12-01')[0].color, '#5a9ccc');
});

test('event categories validate names, color their events, and deleting one keeps the events', async () => {
  const { deleteEventCategory, eventCategoryFromFields, eventFromFields } = await import('../src/events.js');
  const dates = eventCategoryFromFields({ name: ' Date nights ', color: '#E0718B' }, []);
  assert.deepEqual([dates.name, dates.color], ['Date nights', '#e0718b']);
  assert.throws(() => eventCategoryFromFields({ name: 'date NIGHTS', color: '#000000' }, [dates]), /already/);
  assert.throws(() => eventCategoryFromFields({ name: '', color: '#000000' }, []), /name/);
  assert.equal(eventCategoryFromFields({ name: 'Date nights', color: '#111111' }, [dates], dates).id, dates.id);
  const state = freshData();
  state.eventCategories = [dates];
  state.events = [eventFromFields({ title: 'Dinner', date: '2026-12-01', categoryId: dates.id }, 'a'), eventFromFields({ title: 'Movie', date: '2026-12-01', categoryId: dates.id, color: '#5a9ccc' }, 'b')];
  const items = calendarItems(state, ['2026-12-01']).get('2026-12-01');
  assert.deepEqual(items.map(item => [item.color, item.category]), [['#e0718b', 'Date nights'], ['#5a9ccc', 'Date nights']]);
  const after = deleteEventCategory(state, dates.id);
  assert.equal(after.eventCategories.length, 0);
  assert.deepEqual(after.events.map(event => 'categoryId' in event), [false, false]);
  const read = readState({ getItem: () => JSON.stringify({ ...state, eventCategories: [dates, { id: 'x', name: 'Bad', color: 'red' }] }) });
  assert.deepEqual(read.eventCategories.map(category => category.name), ['Date nights']);
  assert.deepEqual(readState({ getItem: () => JSON.stringify({ ...freshData(), eventCategories: undefined }) }).eventCategories, []);
});

test('insights summarize a period, compare it with the one before, and build a monthly trend', async () => {
  const { monthlyTrend, periodRange, periodSummary, shiftMonth } = await import('../src/insights.js');
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.deepEqual(periodRange('2026-02'), { from: '2026-02-01', to: '2026-02-28', label: 'February 2026', previous: '2026-01', kind: 'month' });
  assert.equal(periodRange('2026').previous, '2025');
  const state = newPlanner();
  state.entries = [
    entryFromFields(fields({ type: 'income', amount: '1000', date: '2026-11-03', splits: JSON.stringify([{ categoryId: 'my-savings', rate: 1000 }]) }), state),
    entryFromFields(fields({ categoryId: 'dining', amount: '60', date: '2026-11-04' }), state),
    entryFromFields(fields({ categoryId: 'dining', amount: '40', date: '2026-11-04' }), state),
    entryFromFields(fields({ categoryId: 'bills', amount: '150', date: '2026-11-20' }), state),
    entryFromFields(fields({ categoryId: 'bills', amount: '90', date: '2026-10-20' }), state),
    entryFromFields(fields({ categoryId: 'wedding', amount: '500', date: '2026-11-21' }), state),
  ];
  const nov = periodSummary(state, '2026-11');
  // The Wedding deposit is saved, not spent.
  assert.deepEqual([nov.income, nov.spent, nov.net, nov.toMySavings, nov.toGoals, nov.count], [100_000, 25_000, 75_000, 10_000, 50_000, 5]);
  assert.deepEqual(nov.categories.map(row => [row.name, row.spent]), [['Bills & subscriptions', 15_000], ['Dining out', 10_000]]);
  assert.equal(nov.biggest.amount, 15_000);
  assert.deepEqual(nov.busiestDay, { date: '2026-11-20', amount: 15_000 });
  assert.equal(periodSummary(state, '2026').spent, 34_000);
  assert.deepEqual(monthlyTrend(state, '2026-11', 3).map(row => [row.month, row.income, row.spent]), [['2026-09', 0, 0], ['2026-10', 0, 9_000], ['2026-11', 100_000, 25_000]]);
});

test('budget warnings flag categories at 80% or over with money left and days to go', async () => {
  const { budgetWarnings, warningLevel } = await import('../src/insights.js');
  const { personalBudget } = await import('../src/model.js');
  let state = freshData();
  state.categories = state.categories.map(category => ({ ...category, limit: { dining: 20_000, bills: 10_000, essentials: 50_000 }[category.id] ?? category.limit }));
  state.entries = [['dining', '160'], ['bills', '125'], ['essentials', '100']].map(([categoryId, amount]) => entryFromFields(fields({ categoryId, amount, date: '2026-11-05' }), state));
  state = readState({ getItem: () => JSON.stringify(state) });
  const warnings = budgetWarnings(personalBudget(state, '2026-11', 'long'), '2026-11-19');
  // Mei has the same limits on her own copies but no spending, so she gets no warnings.
  assert.deepEqual(budgetWarnings(personalBudget(state, '2026-11', 'mei'), '2026-11-19'), []);
  assert.deepEqual(warnings.map(row => [row.category.id, row.level, row.left, row.daysLeft]), [['bills', 'over', -2_500, 12], ['dining', 'warn', 4_000, 12]]);
  assert.deepEqual([warningLevel(7_999, 10_000), warningLevel(8_000, 10_000), warningLevel(10_001, 10_000), warningLevel(5, 0)], [null, 'warn', 'over', null]);
});

test('entry filters combine text, type, category, person, amount and date range', async () => {
  const { EMPTY_FILTERS, filterEntries } = await import('../src/insights.js');
  const state = freshData();
  state.entries = [
    entryFromFields(fields({ type: 'income', source: 'Paycheck', amount: '1200', date: '2026-11-03', personId: 'mei' }), state),
    entryFromFields(fields({ categoryId: 'dining', amount: '45.50', date: '2026-11-04' }), state),
    entryFromFields(fields({ categoryId: 'bills', amount: '150', date: '2026-10-20' }), state),
  ];
  const run = change => filterEntries(state, { ...EMPTY_FILTERS, ...change }, '2026-11').map(entry => entry.source);
  assert.deepEqual(run({}), ['Paycheck', 'Dining out']);
  assert.deepEqual(run({ range: 'all' }), ['Paycheck', 'Dining out', 'Bills & subscriptions']);
  assert.deepEqual(run({ range: 'all', text: 'MEI' }), ['Paycheck']);
  assert.deepEqual(run({ text: '45.50' }), ['Dining out']);
  assert.deepEqual(run({ range: 'all', type: 'expense', min: '100' }), ['Bills & subscriptions']);
  assert.deepEqual(run({ range: 'custom', from: '2026-10-01', to: '2026-10-31' }), ['Bills & subscriptions']);
  assert.deepEqual(run({ categoryId: 'dining', personId: 'long' }), ['Dining out']);
  assert.deepEqual(run({ max: 'abc' }), ['Paycheck', 'Dining out']);
});

test('a shared expense creates a debt that follows edits and deletes, but keeps a settled one', async () => {
  const { withSharedDebt, withoutEntry, sharedAmount, settleDebt } = await import('../src/model.js');
  let state = freshData();
  const entry = entryFromFields(fields({ categoryId: 'dining', amount: '80.01', personId: 'long', sharedRate: '5000' }), state);
  assert.deepEqual(entry.shared, { personId: 'mei', rate: 5000 });
  assert.equal(sharedAmount(entry), 4001);
  assert.throws(() => entryFromFields(fields({ categoryId: 'dining', sharedRate: '0' }), state), /share/);
  state = withSharedDebt({ ...state, entries: [entry] }, entry);
  assert.deepEqual(state.debts.map(debt => [debt.debtorId, debt.creditorId, debt.amount, debt.linkedEntryId]), [['mei', 'long', 4001, entry.id]]);
  const edited = entryFromFields(fields({ categoryId: 'dining', amount: '100', personId: 'long', sharedRate: '4000' }), state, entry);
  state = withSharedDebt({ ...state, entries: [edited] }, edited);
  assert.deepEqual(state.debts.map(debt => debt.amount), [4000]);
  const unshared = entryFromFields(fields({ categoryId: 'dining', amount: '100', personId: 'long' }), state, edited);
  assert.equal(withSharedDebt(state, unshared).debts.length, 0);
  assert.equal(withoutEntry(state, entry.id).debts.length, 0);
  const settled = settleDebt(state, state.debts[0].id);
  assert.equal(withSharedDebt(settled, edited).debts.filter(debt => !debt.settledAt).length, 0);
  assert.equal(withoutEntry(settled, entry.id).debts.length, 1);
  // The whole expense still counts as the payer's spending in its category.
  assert.equal(summarize({ ...state, entries: [edited] }).spentByCategory.get('dining'), 10_000);
});

test('goal target dates give the monthly amount needed and whether the pace is on time', async () => {
  const { goalPlan } = await import('../src/insights.js');
  const goal = { id: 'wedding', target: 3_000_000, targetDate: '2027-11-18' };
  const plan = goalPlan(goal, 600_000, { status: 'on-track', date: '2027-06-01' }, '2026-11-18');
  assert.deepEqual([plan.status, plan.months, plan.perMonth, plan.pace], ['open', 12, 200_200, 'ahead']);
  assert.deepEqual([goalPlan(goal, 600_000, { status: 'on-track', date: '2028-03-01' }, '2026-11-18').pace, goalPlan(goal, 600_000, { status: 'on-track', date: '2028-03-01' }, '2026-11-18').late], ['behind', 3]);
  assert.equal(goalPlan(goal, 3_000_000, { status: 'reached' }, '2026-11-18').status, 'reached');
  assert.equal(goalPlan(goal, 0, { status: 'no-data' }, '2027-12-01').status, 'passed');
  assert.equal(goalPlan({ ...goal, targetDate: undefined }, 0, {}, '2026-11-18'), null);
  const read = readState({ getItem: () => JSON.stringify({ ...freshData(), goals: [{ id: 'wedding', name: 'Wedding', target: 1, targetDate: 'soon' }] }) });
  assert.equal('targetDate' in read.goals[0], false);
});

test('planner storage reports the share of the 1 MB document used and the years left at the recent pace', async () => {
  const { storageUsage, STORAGE_LIMIT } = await import('../src/insights.js');
  const entries = Array.from({ length: 90 }, (_, i) => ({ date: `2026-${String(9 + Math.floor(i / 30)).padStart(2, '0')}-${String(1 + i % 28).padStart(2, '0')}` }));
  const json = 'é'.repeat(9_000); // two bytes each in UTF-8
  const usage = storageUsage(json, entries, '2026-11-30');
  assert.equal(usage.bytes, 18_000);
  assert.equal(usage.ratio, 18_000 / STORAGE_LIMIT);
  assert.equal(Math.round(usage.yearsLeft), 14); // 200 bytes per entry, 90 entries in 90 days
  assert.equal(storageUsage('{}', [], '2026-11-30').yearsLeft, null);
});

test('existing shared categories become one private copy per person, with entries and splits moved to their copy', async () => {
  const { limitFor, personalBudget, visibleCategories } = await import('../src/model.js');
  const old = freshData();
  old.categories = old.categories.map(category => category.id === 'dining' ? { ...category, limit: 30_000, savingsRates: { long: 1000, mei: 2000 }, incomeShares: { mei: 1500 } }
    : category.id === 'wedding' ? { ...category, limit: 5_000 } : category);
  old.entries = [
    entryFromFields(fields({ categoryId: 'dining', personId: 'long', amount: '40', date: '2026-11-02' }), old),
    entryFromFields(fields({ categoryId: 'dining', personId: 'mei', amount: '25', date: '2026-11-03' }), old),
    entryFromFields(fields({ type: 'income', personId: 'mei', amount: '100', date: '2026-11-01', splits: JSON.stringify([{ categoryId: 'dining', rate: 1500 }]) }), old),
  ];
  const state = readState({ getItem: () => JSON.stringify(old) });
  const dining = state.categories.filter(category => category.name === 'Dining out');
  assert.deepEqual(dining.map(category => [category.id, category.ownerId, category.limit, category.savingsRates, category.incomeShares]),
    [['dining', 'long', 30_000, { long: 1000 }, undefined], ['dining-mei', 'mei', 30_000, { mei: 2000 }, { mei: 1500 }]]);
  assert.deepEqual(state.entries.map(entry => entry.categoryId || entry.splits[0].categoryId), ['dining', 'dining-mei', 'dining-mei']);
  // Reading again changes nothing, so both phones agree.
  assert.deepEqual(readState({ getItem: () => JSON.stringify(state) }), state);
  // Each person sees only their own copies plus the shared permanent categories.
  const longSees = visibleCategories(state, 'long').map(category => category.id);
  assert.ok(longSees.includes('dining') && !longSees.includes('dining-mei') && longSees.includes('wedding'));
  const wedding = state.categories.find(category => category.id === 'wedding');
  assert.deepEqual([limitFor(wedding, 'long'), limitFor(wedding, 'mei')], [5_000, 5_000]);
  const mine = personalBudget(state, '2026-11', 'mei');
  // Wedding sits in Joint saving, so its limit isn't part of the spending budget, and the 20% of
  // Mei's dining that went to the goal counts as saved.
  assert.deepEqual([mine.spent, mine.spentByCategory.get('dining-mei'), mine.budgeted], [2_000, 2_500, 30_000]);
  assert.equal(mine.categories.some(category => category.id === 'dining'), false);
  // An expense can't be logged in the other person's category.
  assert.throws(() => entryFromFields(fields({ categoryId: 'dining', personId: 'mei' }), state), /other profile/);
});

test('household insights group both people\'s copies of a category, split by person, and trend by week, month or year', async () => {
  const { householdTotals, periodSummary, trend, weekStart } = await import('../src/insights.js');
  let state = freshData();
  state.entries = [
    entryFromFields(fields({ type: 'income', personId: 'long', amount: '1000', date: '2026-11-02' }), state),
    entryFromFields(fields({ type: 'income', personId: 'mei', amount: '800', date: '2026-11-10', splits: JSON.stringify([{ categoryId: 'my-savings', rate: 2500 }]) }), state),
    entryFromFields(fields({ categoryId: 'dining', personId: 'long', amount: '30', date: '2026-11-03' }), state),
    entryFromFields(fields({ categoryId: 'dining', personId: 'mei', amount: '20', date: '2026-11-11' }), state),
    entryFromFields(fields({ categoryId: 'wedding', personId: 'mei', amount: '100', date: '2026-11-12' }), state),
  ];
  state = readState({ getItem: () => JSON.stringify(state) });
  assert.deepEqual(periodSummary(state, '2026-11').categories.map(row => [row.name, row.spent]), [['Dining out', 5_000]]);
  assert.deepEqual(periodSummary(state, '2026-11', 'mei').categories.map(row => [row.name, row.spent]), [['Dining out', 2_000]]);
  const household = householdTotals(state, '2026-11');
  assert.deepEqual(household.people.mei, { income: 80_000, spent: 2_000, mySavings: 20_000, joint: 10_000 });
  assert.deepEqual(household.together, { income: 180_000, spent: 5_000, mySavings: 20_000, joint: 10_000 });
  assert.equal(weekStart('2026-11-15'), '2026-11-09'); // Sunday belongs to the week starting Monday
  const weeks = trend(state, 'week', '2026-11-15', 3);
  assert.deepEqual(weeks.map(row => [row.key, row.income, row.spent, row.people.long.spent]), [['2026-10-26', 0, 0, 0], ['2026-11-02', 100_000, 3_000, 3_000], ['2026-11-09', 80_000, 2_000, 0]]);
  assert.deepEqual(trend(state, 'week', '2026-11-15', 3, 'mei').map(row => row.income), [0, 0, 80_000]);
  assert.deepEqual(trend(state, 'year', '2026-11-15', 2).map(row => [row.key, row.spent]), [['2025', 0], ['2026', 5_000]]);
});

test('folders set where a category\'s money goes, and moving a category later keeps past entries as they were', async () => {
  const { periodSummary, budgetWarnings } = await import('../src/insights.js');
  const { personalSavings } = await import('../src/personal-savings.js');
  const { personalBudget } = await import('../src/model.js');
  let state = newPlanner();
  state.goals.push({ id: 'trip', name: 'Trip', target: 100_000 });
  const move = (id, folderId, extra = {}) => { state = { ...state, categories: state.categories.map(c => c.id === id ? { ...c, folderId, ...extra } : c) }; };
  // Dining in Joint saving: the whole expense is a deposit to its goal, and income shares go there too.
  move('dining', 'joint', { savingsGoalId: 'trip', limit: 10_000 });
  const deposit = entryFromFields(fields({ categoryId: 'dining', amount: '80', date: '2026-11-05' }), state);
  assert.deepEqual([deposit.rate, deposit.goalId, deposit.to], [10_000, 'trip', undefined]);
  const income = entryFromFields(fields({ type: 'income', amount: '200', date: '2026-11-01', splits: JSON.stringify([{ categoryId: 'dining', rate: 5000 }]) }), state);
  assert.deepEqual(income.splits[0], { categoryId: 'dining', rate: 5000, amount: 10_000, to: 'joint', folder: 'joint', goalId: 'trip' });
  // Bills in Personal saving: expenses there are savings, not spending.
  move('bills', 'saving-long', { limit: 1_000 });
  const saved = entryFromFields(fields({ categoryId: 'bills', amount: '25', date: '2026-11-06' }), state);
  assert.equal(saved.to, 'saving');
  state.entries = [deposit, income, saved];
  assert.equal(summarize(state).goals.trip.total, 18_000);
  assert.equal(personalSavings(state, 'long').fromIncome, 2_500);
  const nov = periodSummary(state, '2026-11', 'long');
  assert.deepEqual([nov.spent, nov.toMySavings, nov.toGoals], [0, 2_500, 18_000]);
  // Saving folders never warn about running over.
  assert.deepEqual(budgetWarnings(personalBudget(readState({ getItem: () => JSON.stringify(state) }), '2026-11', 'long'), '2026-11-10').map(w => w.category.id), []);
  // Moving both back out doesn't change what already happened.
  move('dining', undefined); move('bills', 'checking-long');
  const after = readState({ getItem: () => JSON.stringify(state) });
  assert.equal(summarize(after).goals.trip.total, 18_000);
  assert.equal(personalSavings(after, 'long').fromIncome, 2_500);
  // Editing an old entry in the same category keeps its destination; a new one follows the new folder.
  assert.equal(entryFromFields(fields({ categoryId: 'bills', amount: '30', date: '2026-11-06' }), after, saved).to, 'saving');
  assert.equal(entryFromFields(fields({ categoryId: 'bills', amount: '30', date: '2026-11-06' }), after).to, undefined);
});

test('custom folders are private, keep a valid color, and a category can only sit in its owner\'s folder', () => {
  const state = newPlanner();
  state.folders.push({ id: 'fun', ownerId: 'long', name: 'Fun', color: 'red;', kind: 'weird', locked: false, order: 5 },
    { id: 'ghost', ownerId: 'stranger', name: 'Ghost' }, { id: 'blank', ownerId: 'mei', name: '  ' });
  state.categories = state.categories.map(c => c.id === 'dining' ? { ...c, folderId: 'fun' } : c.id === 'bills' ? { ...c, folderId: 'checking-mei' } : c);
  const read = readState({ getItem: () => JSON.stringify(state) });
  const fun = read.folders.find(f => f.id === 'fun');
  // An unknown type (or a 2.14 group-only folder) becomes a checking folder.
  assert.deepEqual([fun.kind, fun.locked, fun.color], ['checking', false, '#8a94a3']);
  assert.equal(read.folders.some(f => f.id === 'ghost' || f.id === 'blank'), false);
  assert.equal(read.categories.find(c => c.id === 'dining').folderId, 'fun');
  assert.equal(read.categories.find(c => c.id === 'bills').folderId, undefined);
  // In a checking folder, dining's expenses are ordinary spending, paid from that folder.
  const paid = entryFromFields(fields({ categoryId: 'dining' }), read);
  assert.deepEqual([paid.rate, paid.from], [0, 'fun']);
});

test('categories move between folders and positions, and folders are created, renamed and deleted safely', async () => {
  const { budgetGroups, moveCategory, folderFromFields, deleteFolder, jointDepositCategory } = await import('../src/model.js');
  let state = newPlanner();
  const layout = personId => budgetGroups(state, personId).map(group => [group.folder?.id ?? null, group.categories.map(c => c.id)]);
  state = moveCategory(state, 'dining', 'joint', 0);
  state = moveCategory(state, 'bills', 'joint', 1);
  state = moveCategory(state, 'wedding', null, 0);
  assert.deepEqual(layout('long')[0], ['joint', ['dining', 'bills']]);
  assert.equal(layout('long').at(-1)[1][0], 'wedding');
  // Mei's layout is untouched, and a category can't go into the other person's folder.
  // Mei sees only her own categories in the shared Joint saving folder.
  assert.deepEqual(layout('mei')[0], ['joint', ['wedding-mei']]);
  assert.throws(() => moveCategory(state, 'dining', 'saving-mei', 0), /other profile/);
  // Order survives a reload.
  assert.deepEqual(budgetGroups(readState({ getItem: () => JSON.stringify(state) }), 'long').map(g => g.categories.map(c => c.id)), layout('long').map(([, ids]) => ids));
  // With Wedding out of Joint saving, quick deposits use the first Joint saving category.
  assert.equal(jointDepositCategory(state, 'long').id, 'dining');
  assert.throws(() => folderFromFields({ name: 'Fun' }, state, 'long'), /what kind/);
  const fun = folderFromFields({ name: '  Fun   money ', color: '#aa3366', kind: 'checking' }, state, 'long');
  assert.deepEqual([fun.name, fun.ownerId, fun.kind, fun.locked, fun.color], ['Fun money', 'long', 'checking', false, '#aa3366']);
  state = { ...state, folders: [...state.folders, fun] };
  assert.throws(() => folderFromFields({ name: 'fun MONEY', kind: 'saving' }, state, 'long'), /already have/);
  assert.equal(folderFromFields({ name: 'Fun money', kind: 'checking' }, state, 'mei').ownerId, 'mei');
  // A joint folder is shared and its type can't change later.
  const house = folderFromFields({ name: 'House fund', kind: 'joint' }, state, 'mei');
  assert.equal(house.ownerId, 'shared');
  assert.equal(folderFromFields({ name: 'Home fund', kind: 'saving' }, state, 'long', house).kind, 'joint');
  assert.throws(() => folderFromFields({ name: 'Mine' }, state, 'long', state.folders.find(f => f.id === 'joint')), /can’t be renamed/);
  assert.throws(() => deleteFolder(state, 'checking-long'), /can’t be deleted/);
  state = moveCategory(state, 'essentials', fun.id, 0);
  state = deleteFolder(state, fun.id);
  assert.equal(state.categories.find(c => c.id === 'essentials').folderId, undefined);
  assert.equal(state.folders.some(f => f.id === fun.id), false);
});

test('folders hold balances: income lands by folder, expenses come out of checking, and transfers and withdrawals move money', async () => {
  const { folderBalance, folderSummaries, transferFromFields, folderFromFields, deleteFolder } = await import('../src/model.js');
  const { savingsFromFields, personalSavings } = await import('../src/personal-savings.js');
  let state = newPlanner();
  const travel = folderFromFields({ name: 'Travel fund', kind: 'saving' }, state, 'long');
  const bills = folderFromFields({ name: 'Bills account', kind: 'checking' }, state, 'long');
  state = { ...state, folders: [...state.folders, travel, bills], paycheck: { ...state.paycheck, long: bills.id } };
  state.categories = state.categories.map(c => c.id === 'dining' ? { ...c, folderId: travel.id } : c);
  // $1,000 paycheck: 10% Wedding (joint), 20% dining (Travel fund), the rest to the paycheck folder.
  const pay = entryFromFields(fields({ type: 'income', amount: '1000', date: '2026-11-01', splits: JSON.stringify([{ categoryId: 'wedding', rate: 1000 }, { categoryId: 'dining', rate: 2000 }]) }), state);
  assert.deepEqual(pay.splits.map(s => [s.categoryId, s.folder, s.amount]), [['wedding', 'joint', 10_000], ['dining', travel.id, 20_000], ['rest', bills.id, 70_000]]);
  // An unfiled expense is paid from the paycheck folder; a Joint saving one moves money there.
  const gas = entryFromFields(fields({ categoryId: 'transport', amount: '50', date: '2026-11-03' }), state);
  const deposit = entryFromFields(fields({ categoryId: 'wedding', amount: '100', date: '2026-11-04' }), state);
  assert.deepEqual([gas.from, deposit.from, deposit.folder], [bills.id, bills.id, 'joint']);
  state.entries = [pay, gas, deposit];
  state.transfers = [transferFromFields({ from: bills.id, to: travel.id, amount: '200', date: '2026-11-05' }, state, 'long')];
  state.savings = [savingsFromFields({ personId: 'long', date: '2026-11-06', time: '09:00', amount: '30', direction: 'out' }), ];
  state.savings[0].folderId = travel.id;
  state = readState({ getItem: () => JSON.stringify(state) });
  assert.equal(folderBalance(state, bills.id), 70_000 - 5_000 - 10_000 - 20_000);
  assert.equal(folderBalance(state, travel.id), 20_000 + 20_000 - 3_000);
  assert.equal(folderBalance(state, 'joint'), 20_000);
  assert.equal(summarize(state).jointBalance, 20_000);
  // Personal Saving adds up every saving folder: the dining share, the transfer, minus the withdrawal.
  assert.equal(personalSavings(state, 'long').balance, 37_000);
  // Mei sees the shared joint folder and her own, never Long's.
  const mei = folderSummaries(state, 'mei', '2026-11').map(f => [f.folder.id, f.balance]);
  assert.deepEqual(mei, [['joint', 20_000], ['saving-mei', 0], ['checking-mei', 0]]);
  const longTravel = folderSummaries(state, 'long', '2026-11').find(f => f.folder.id === travel.id);
  assert.deepEqual([longTravel.in, longTravel.out, longTravel.categories.map(c => c.id)], [40_000, 3_000, ['dining']]);
  // Transfers into a joint folder count toward joint savings; a folder holding money can't be deleted.
  state.transfers.push(transferFromFields({ from: bills.id, to: 'joint', amount: '10', date: '2026-11-07' }, state, 'long'));
  assert.equal(summarize(state).jointBalance, 21_000);
  assert.throws(() => deleteFolder(state, travel.id), /still holds money/);
  assert.throws(() => transferFromFields({ from: 'checking-mei', to: 'joint', amount: '5', date: '2026-11-07' }, state, 'long'), /two of your folders/);
  assert.throws(() => transferFromFields({ from: 'joint', to: 'joint', amount: '5', date: '2026-11-07' }, state, 'long'), /two different/);
  // Deleting the paycheck folder (once empty) sends the rest back to Personal checking.
  const empty = { ...state, entries: [], transfers: [], savings: [] };
  assert.equal(readState({ getItem: () => JSON.stringify(deleteFolder(empty, bills.id)) }).paycheck.long, 'checking-long');
});

test('a 2.14 planner merges both Joint saving folders into one shared folder and keeps its custom folders as checking', () => {
  const old = newPlanner();
  old.folders = old.folders.filter(f => f.id !== 'joint').concat(
    { id: 'joint-long', ownerId: 'long', kind: 'joint', name: 'Joint saving', locked: true, order: 0 },
    { id: 'joint-mei', ownerId: 'mei', kind: 'joint', name: 'Joint saving', locked: true, order: 0 },
    { id: 'folder-x', ownerId: 'mei', name: 'Fun', color: '#aa3366', locked: false, order: 4 });
  old.categories = old.categories.map(c => c.id === 'wedding' ? { ...c, folderId: 'joint-long' } : c.id === 'wedding-mei' ? { ...c, folderId: 'joint-mei' } : c.id === 'dining-mei' ? { ...c, folderId: 'folder-x' } : c);
  delete old.paycheck;
  const read = readState({ getItem: () => JSON.stringify(old) });
  assert.equal(read.folders.some(f => f.id.startsWith('joint-')), false);
  assert.deepEqual(read.categories.filter(c => c.folderId === 'joint').map(c => c.id), ['wedding', 'wedding-mei']);
  assert.deepEqual(read.folders.find(f => f.id === 'folder-x').kind, 'checking');
  assert.deepEqual(read.paycheck, { long: 'checking-long', mei: 'checking-mei' });
});

test('choosing another paycheck folder later doesn\'t move money that already landed', async () => {
  const { folderBalance, folderFromFields } = await import('../src/model.js');
  let state = newPlanner();
  const old = { ...entryFromFields(fields({ type: 'income', amount: '100', date: '2026-10-01' }), state) };
  delete old.folder; // saved before 2.15
  const fresh = entryFromFields(fields({ type: 'income', amount: '50', date: '2026-11-01', splits: '[]' }), state);
  const second = folderFromFields({ name: 'Second', kind: 'checking' }, state, 'long');
  state = readState({ getItem: () => JSON.stringify({ ...state, entries: [old, fresh], folders: [...state.folders, second], paycheck: { long: second.id } }) });
  assert.deepEqual([folderBalance(state, 'checking-long'), folderBalance(state, second.id)], [15_000, 0]);
  assert.equal(entryFromFields(fields({ type: 'income', amount: '10', date: '2026-11-02', splits: '[]' }), state).splits[0].folder, second.id);
});
