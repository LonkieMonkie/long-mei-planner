import { DEFAULT_ACCENT, LEGACY_ACCENT, parseAccent } from './appearance.js';
import { DEFAULT_TREE, normalizeTree } from './tree-model.js';
import { normalizeEvent, normalizeEventCategories, occursOn } from './events.js';
import { isSavingsRecord } from './personal-savings.js';

export const STORAGE_KEY = 'our-little-life.dashboard.v2';
export const PEOPLE = [
  { id: 'long', name: 'Long', initials: 'L', tone: 'indigo' },
  { id: 'mei', name: 'Mei', initials: 'M', tone: 'rose' },
];
export const WEDDING_CATEGORY_ID = 'wedding';
// Income that isn't split into other budgets goes here.
export const PERSONAL_CATEGORY_ID = 'personal';
const personalCategory = { id: PERSONAL_CATEGORY_ID, name: 'Personal', limit: 0, icon: 'heart', tone: 'blue' };
// The income share ticked for this category goes into that person's own savings (My Savings).
export const SAVINGS_CATEGORY_ID = 'my-savings';
const savingsCategory = { id: SAVINGS_CATEGORY_ID, name: 'My savings', limit: 0, icon: 'piggy', tone: 'mint' };
const WEDDING_GOAL_ID = 'wedding';

const weddingCategory = {
  id: WEDDING_CATEGORY_ID, name: 'Wedding', limit: 0, icon: 'heart', tone: 'rose',
  savingsRates: { long: 10_000, mei: 10_000 }, savingsGoalId: WEDDING_GOAL_ID,
};
const weddingGoal = { id: WEDDING_GOAL_ID, name: 'Wedding', target: 3_000_000 };

export const money = (cents, compact = false) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: compact ? 0 : 2, maximumFractionDigits: 2,
  }).format(cents / 100);

export function localDate(date = new Date()) {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part, index) => index ? String(part).padStart(2, '0') : String(part)).join('-');
}

export const dateFromKey = key => new Date(key + 'T12:00:00');
export const isDateKey = key => typeof key === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(key)
  && localDate(dateFromKey(key)) === key;
export const shortDate = key => dateFromKey(key).toLocaleDateString('en-US', {
  month: 'short', day: 'numeric', year: 'numeric',
});
export const timestamp = iso => new Date(iso).toLocaleString('en-US', {
  month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
});
export const localTime = (date = new Date()) =>
  [date.getHours(), date.getMinutes()].map(part => String(part).padStart(2, '0')).join(':');
export const displayTime = time => new Date('2000-01-01T' + time).toLocaleTimeString('en-US', {
  hour: 'numeric', minute: '2-digit',
});
export const entryTime = entry => entry.time ?? localTime(new Date(entry.createdAt));

export function decimalUnits(value, max = 100_000_000_000, signed = false) {
  const string = String(value).trim();
  if (!(signed ? /^-?\d+(\.\d{1,2})?$/ : /^\d+(\.\d{1,2})?$/).test(string)) {
    throw new Error('Enter a number with up to two decimal places.');
  }
  const units = Math.round(Number(string) * 100);
  if (!Number.isSafeInteger(units) || Math.abs(units) > max) throw new Error('That number is out of range.');
  return units;
}

export const contribution = (amount, rate) => Math.floor((amount * rate + 5_000) / 10_000);
// The joint-goal deposits an entry makes: an expense's savings rate, an older income entry's
// recorded rate, or the Wedding share of a split income.
export function goalShares(entry) {
  if (entry.splits) return entry.splits.filter(split => split.goalId).map(({ goalId, amount, rate }) => ({ goalId, amount, rate }));
  return entry.goalId ? [{ goalId: entry.goalId, amount: contribution(entry.amount, entry.rate ?? 0), rate: entry.rate ?? 0 }] : [];
}
export const entryContribution = entry => goalShares(entry).reduce((sum, share) => sum + share.amount, 0);
export const categoryColors = { indigo: '#7964da', blue: '#5283c7', rose: '#bc5f88', mint: '#3c9676' };
export const categoryColor = category => parseAccent(category.color) ?? categoryColors[category.tone] ?? DEFAULT_ACCENT;
export const isWeddingName = name => name.trim().toLowerCase() === 'wedding';
export const isPersonalName = name => name.trim().toLowerCase() === 'personal';
export const isSavingsName = name => ['my savings', 'savings'].includes(name.trim().toLowerCase());
export const isPermanentCategory = id => [WEDDING_CATEGORY_ID, PERSONAL_CATEGORY_ID, SAVINGS_CATEGORY_ID].includes(id);

// Folders organize each person's categories. Three are built in and can't be renamed or deleted,
// and they decide where a category's money goes:
//   joint    – income shares and expenses are deposits to Joint Savings (the category's goal)
//   saving   – income shares and expenses go to that person's own savings (My Savings)
//   checking – everyday money; the unticked rest of a split income lands here
// Custom folders only group. Where money went is recorded on each entry when it's saved
// (`to` on splits and expenses), so moving a category later doesn't rewrite the past.
export const FOLDER_KINDS = {
  joint: { name: 'Joint saving', color: '#4c8363' },
  saving: { name: 'Personal saving', color: '#5a9ccc' },
  checking: { name: 'Personal checking', color: '#d9a520' },
};
export const REST = 'rest'; // Split id for the unticked rest of an income, which goes to checking.
export const systemFolderId = (kind, personId) => `${kind}-${personId}`;
export const visibleFolders = (state, personId) => (state.folders ?? [])
  .filter(folder => !personId || folder.ownerId === personId)
  .sort((a, b) => Number(b.locked ?? false) - Number(a.locked ?? false) || (a.order ?? 0) - (b.order ?? 0));
export function categoryKind(state, category) {
  if (!category) return null;
  const folder = category.folderId && (state.folders ?? []).find(item => item.id === category.folderId);
  return folder?.kind ?? null;
}
const sortCategories = list => [...list].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

// One person's categories as the Budget page and entry form show them: each folder with its
// categories in order, then the categories that aren't in a folder.
export function budgetGroups(state, personId) {
  const categories = visibleCategories(state, personId);
  const folders = visibleFolders(state, personId);
  const known = new Set(folders.map(folder => folder.id));
  return [
    ...folders.map(folder => ({ folder, categories: categories.filter(category => category.folderId === folder.id) })),
    { folder: null, categories: categories.filter(category => !known.has(category.folderId)) },
  ];
}

// The category a quick Joint Savings deposit is logged in: the person's first Joint saving
// category for that goal, or else their first Joint saving category.
export function jointDepositCategory(state, personId, goalId = WEDDING_GOAL_ID) {
  const joint = visibleCategories(state, personId).filter(category => categoryKind(state, category) === 'joint');
  return joint.find(category => jointGoalFor(category, state.goals) === goalId) ?? joint[0] ?? null;
}

// Moves a category to a folder (or out of folders, with null) at a position among that
// group's categories, renumbering the person's categories so the order is saved as shown.
export function moveCategory(state, categoryId, folderId, index) {
  const moving = state.categories.find(category => category.id === categoryId);
  if (!moving) return state;
  const personId = moving.ownerId;
  if (folderId && !(state.folders ?? []).some(folder => folder.id === folderId && folder.ownerId === personId)) throw new Error('That folder belongs to the other profile.');
  const groups = budgetGroups(state, personId).map(group => ({ id: group.folder?.id ?? null, ids: group.categories.map(category => category.id).filter(id => id !== categoryId) }));
  const target = groups.find(group => group.id === (folderId ?? null)) ?? groups[groups.length - 1];
  target.ids.splice(Math.max(0, Math.min(index, target.ids.length)), 0, categoryId);
  const placement = new Map();
  let order = 0;
  for (const group of groups) for (const id of group.ids) placement.set(id, { folderId: group.id, order: order++ });
  return { ...state, categories: state.categories.map(category => {
    const place = placement.get(category.id);
    if (!place) return category;
    const next = { ...category, order: place.order };
    if (place.folderId) next.folderId = place.folderId; else delete next.folderId;
    return next;
  }) };
}

export function folderFromFields(fields, state, personId, previous) {
  const name = String(fields.name ?? '').trim().replace(/\s+/g, ' ');
  if (!name) throw new Error('Enter a folder name.');
  if (name.length > 40) throw new Error('Keep the folder name to 40 characters or fewer.');
  if (previous?.locked) throw new Error('Built-in folders can’t be renamed.');
  if ((state.folders ?? []).some(folder => folder.ownerId === personId && folder.id !== previous?.id && folder.name.toLowerCase() === name.toLowerCase())) throw new Error('You already have a folder with that name.');
  const color = parseAccent(fields.color) ?? previous?.color ?? '#8a94a3';
  if (previous) return { ...previous, name, color };
  const order = Math.max(2, ...(state.folders ?? []).filter(folder => folder.ownerId === personId).map(folder => folder.order ?? 0)) + 1;
  return { id: 'folder-' + crypto.randomUUID().slice(0, 8), ownerId: personId, name, color, locked: false, order };
}

// Deleting a custom folder keeps its categories; they move out to the ungrouped list.
export function deleteFolder(state, folderId) {
  const folder = (state.folders ?? []).find(item => item.id === folderId);
  if (!folder) return state;
  if (folder.locked) throw new Error('Built-in folders can’t be deleted.');
  return { ...state, folders: state.folders.filter(item => item.id !== folderId),
    categories: state.categories.map(category => { if (category.folderId !== folderId) return category; const next = { ...category }; delete next.folderId; return next; }) };
}

// Budget categories are private: a custom category belongs to one person (ownerId) and only
// that person sees it, its limit and its settings. The permanent categories (Wedding, My savings,
// Personal) are shared, but each person keeps their own limit for them in `limits`.
// This privacy is enforced by the app, not by the database.
export const limitFor = (category, personId) => category.ownerId ? category.limit ?? 0
  : personId ? category.limits?.[personId] ?? category.limit ?? 0
  : Object.values(category.limits ?? {}).reduce((sum, value) => sum + value, 0) || (category.limit ?? 0);
export const visibleCategories = (state, personId) => sortCategories(personId
  ? state.categories.filter(category => !category.ownerId || category.ownerId === personId)
  : state.categories);
export const canUseCategory = (category, personId) => !category.ownerId || category.ownerId === personId;

// One person's budget for a month: their categories, what they spent in each, and their limits.
// Older planners had one shared list of custom categories. Each becomes one copy per person
// (the first person keeps the original id, the other gets `<id>-<person>`), entries and income
// splits move to their person's copy, and permanent categories get a limit per person. The
// result is the same on every device, so both phones agree before anything is saved.
function privatizeCategories(state) {
  const ids = PEOPLE.map(person => person.id);
  const copyId = (id, personId) => personId === ids[0] ? id : `${id}-${personId}`;
  const remap = new Map();
  state.categories = state.categories.flatMap(category => {
    if (ids.includes(category.ownerId)) return [category];
    if (isPermanentCategory(category.id)) {
      if (!category.limits) category.limits = Object.fromEntries(ids.map(id => [id, category.limit ?? 0]));
      delete category.limit;
      return [category];
    }
    if (ids.includes(category.ownerId)) return [category];
    return ids.map(personId => {
      const id = copyId(category.id, personId);
      remap.set(category.id + '|' + personId, id);
      const copy = { ...category, id, ownerId: personId, limit: category.limit ?? 0 };
      for (const key of ['savingsRates', 'incomeShares']) {
        if (category[key]?.[personId]) copy[key] = { [personId]: category[key][personId] }; else delete copy[key];
      }
      return copy;
    });
  });
  if (!remap.size) return;
  state.entries = state.entries.map(entry => {
    const moved = remap.get(entry.categoryId + '|' + entry.personId);
    const splits = entry.splits?.map(split => ({ ...split, categoryId: remap.get(split.categoryId + '|' + entry.personId) ?? split.categoryId }));
    return { ...entry, ...(moved ? { categoryId: moved } : {}), ...(splits ? { splits } : {}) };
  });
}

export function personalBudget(state, month, personId) {
  const categories = visibleCategories(state, personId);
  const spentByCategory = new Map();
  const fundedByCategory = new Map();
  let spent = 0;
  for (const entry of state.entries) {
    if (!entry.date.startsWith(month + '-') || (personId && entry.personId !== personId)) continue;
    if (entry.type === 'expense') {
      spentByCategory.set(entry.categoryId, (spentByCategory.get(entry.categoryId) ?? 0) + entry.amount);
      // Money logged in a saving category, or deposited to a joint goal, is saved rather than spent.
      const saved = entry.to === 'saving' ? entry.amount : goalShares(entry).reduce((sum, share) => sum + share.amount, 0);
      if (categories.some(category => category.id === entry.categoryId)) spent += Math.max(0, entry.amount - saved);
    }
    for (const split of entry.splits ?? []) fundedByCategory.set(split.categoryId, (fundedByCategory.get(split.categoryId) ?? 0) + split.amount);
  }
  const limit = category => limitFor(category, personId);
  const kindOf = category => categoryKind(state, category);
  const spending = categories.filter(category => !['joint', 'saving'].includes(kindOf(category)));
  return { categories, kindOf, folders: visibleFolders(state, personId), spentByCategory, fundedByCategory, spent, budgeted: spending.reduce((sum, category) => sum + limit(category), 0), limit };
}
export function reservedNameError(name) {
  if (isWeddingName(name)) return 'Wedding is already a permanent category.';
  if (isPersonalName(name)) return 'Personal is already a permanent category.';
  if (isSavingsName(name)) return 'My savings is already a permanent category.';
  return '';
}

export function freshData() {
  return {
    version: 2,
    categories: [
      { ...weddingCategory, savingsRates: { ...weddingCategory.savingsRates } },
      { id: 'essentials', name: 'Essentials', limit: 0, icon: 'basket', tone: 'indigo' },
      { id: 'transport', name: 'Transportation', limit: 0, icon: 'car', tone: 'blue' },
      { id: 'dining', name: 'Dining out', limit: 0, icon: 'utensils', tone: 'rose' },
      { id: 'bills', name: 'Bills & subscriptions', limit: 0, icon: 'receipt', tone: 'mint' },
      { ...savingsCategory },
      { ...personalCategory },
    ],
    goals: [{ ...weddingGoal }],
    entries: [], events: [], eventCategories: [], debts: [], savings: [],
    savingsAdjustment: 0, accentColor: DEFAULT_ACCENT, theme: 'garden', tree: { ...DEFAULT_TREE },
  };
}

// A new planner in today's shape: private categories for each person, sorted into folders.
// (freshData is the older shared seed; readState turns it into this.)
export function newPlanner() {
  const state = freshData();
  privatizeCategories(state);
  organizeFolders(state);
  return finishState(state);
}

export const jointGoalFor = (category, goals) => [category?.savingsGoalId, WEDDING_GOAL_ID, goals[0]?.id].find(id => id && goals.some(goal => goal.id === id)) ?? '';

// How much of an expense goes to a joint goal. In the Joint saving folder it's all of it; in the
// Personal saving folder none (it goes to My Savings instead); elsewhere the category's rate.
export function savingsRule(category, personId, goals, previous, kind = null) {
  if (!category) return { rate: 0, goalId: '' };
  if (previous?.type === 'expense' && previous.categoryId === category.id && previous.personId === personId) {
    return { rate: previous.rate ?? 0, goalId: previous.goalId ?? '' };
  }
  if (kind === 'joint') { const goalId = jointGoalFor(category, goals); return goalId ? { rate: 10_000, goalId } : { rate: 0, goalId: '' }; }
  if (kind === 'saving') return { rate: 0, goalId: '' };
  const rate = category.savingsRates?.[personId] ?? 0;
  const goalId = category.id === WEDDING_CATEGORY_ID ? WEDDING_GOAL_ID : category.savingsGoalId || goals[0]?.id;
  return rate > 0 && goals.some(goal => goal.id === goalId) ? { rate, goalId } : { rate: 0, goalId: '' };
}

// Turns the ticked categories of an income form into stored splits. Each share is rounded
// to the cent on its own; Wedding's share also counts toward the Wedding goal.
export function incomeSplits(raw, amount, state, personId) {
  if (!raw) return [];
  const chosen = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const seen = new Set();
  const splits = [];
  for (const { categoryId, rate } of chosen) {
    const category = state.categories.find(item => item.id === categoryId);
    if (!category || categoryId === REST || seen.has(categoryId) || (personId && !canUseCategory(category, personId))) continue;
    if (!Number.isInteger(rate) || rate < 0 || rate > 10_000) throw new Error(`Enter a share from 0% to 100% for ${category.name}.`);
    seen.add(categoryId);
    if (!rate) continue;
    const split = { categoryId, rate, amount: Math.floor(amount * rate / 10_000) };
    const kind = categoryKind(state, category);
    if (kind) split.to = kind;
    if (kind === 'joint' && jointGoalFor(category, state.goals)) split.goalId = jointGoalFor(category, state.goals);
    splits.push(split);
  }
  // Ticked shares can't pass 100%; whatever they leave goes to Personal.
  const total = splits.reduce((sum, split) => sum + split.rate, 0);
  if (total > 10_000) throw new Error(`The ticked shares add up to ${total / 100}%. Lower them to 100% or less.`);
  if (total < 10_000) splits.push({ categoryId: REST, to: 'checking', rate: 10_000 - total, amount: Math.floor(amount * (10_000 - total) / 10_000) });
  // Hand out the leftover cents from rounding down, largest fraction first, so the shares sum to the amount.
  let left = amount - splits.reduce((sum, split) => sum + split.amount, 0);
  const byFraction = [...splits].sort((a, b) => (amount * b.rate % 10_000) - (amount * a.rate % 10_000));
  for (let i = 0; left > 0 && splits.length; i = (i + 1) % splits.length, left--) byFraction[i].amount++;
  return splits;
}

export function entryFromFields(fields, state, previous, now = new Date().toISOString()) {
  const person = PEOPLE.find(p => p.id === fields.personId);
  const type = fields.type;
  const category = state.categories.find(c => c.id === fields.categoryId);
  // An income source is optional; unnamed income is labelled "Income".
  const source = type === 'expense' ? category?.name : String(fields.source ?? '').trim().slice(0, 100) || 'Income';
  if (!person || !['income', 'expense'].includes(type)) throw new Error('Choose who is adding this.');
  if (!source) throw new Error('Choose a budget category.');
  if (type === 'expense' && !canUseCategory(category, person.id)) throw new Error('That category belongs to the other profile. Choose one of yours.');
  const amount = decimalUnits(fields.amount);
  if (amount <= 0) throw new Error('Enter an amount greater than zero.');
  if (!isDateKey(fields.date)) throw new Error('Choose a valid transaction date.');
  const time = fields.time || (previous ? entryTime(previous) : localTime(new Date(now)));
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('Choose a valid transaction time.');
  const kind = type === 'expense' ? categoryKind(state, category) : null;
  const sameCategory = previous?.type === 'expense' && previous.categoryId === category?.id && previous.personId === person.id;
  const to = sameCategory ? previous.to : kind === 'saving' ? 'saving' : undefined;
  const allocation = type === 'expense' ? savingsRule(category, person.id, state.goals, previous, kind) : {};
  const splits = type === 'income' ? incomeSplits(fields.splits, amount, state, person.id) : [];
  // A shared expense records the other person's share; withSharedDebt turns it into a debt.
  let shared = null;
  if (type === 'expense' && fields.sharedRate !== undefined && fields.sharedRate !== '') {
    const rate = Number(fields.sharedRate);
    if (!Number.isInteger(rate) || rate < 1 || rate > 10_000) throw new Error('Enter the other person’s share as a percentage from 1 to 100.');
    shared = { personId: PEOPLE.find(p => p.id !== person.id).id, rate };
  }
  return {
    id: previous?.id ?? crypto.randomUUID(),
    personId: person.id, type, categoryId: type === 'expense' ? category.id : '',
    source, date: fields.date, time, amount, ...allocation, ...(to ? { to } : {}), ...(splits.length ? { splits } : {}), ...(shared ? { shared } : {}),
    createdAt: previous?.createdAt ?? now, editedAt: previous ? now : null,
  };
}

export function summarize(state, month) {
  const people = Object.fromEntries(PEOPLE.map(p => [p.id, { income: 0, spent: 0, allocated: 0, personal: 0 }]));
  const goals = Object.fromEntries(state.goals.map(g => [g.id, { total: 0, long: 0, mei: 0 }]));
  const spentByCategory = new Map();
  const fundedByCategory = new Map();
  let income = 0, spent = 0, allocated = 0, totalContributions = 0;
  for (const entry of state.entries) {
    let amount = 0;
    for (const share of goalShares(entry)) {
      const goal = goals[share.goalId];
      if (!goal) continue;
      goal.total += share.amount;
      goal[entry.personId] += share.amount;
      amount += share.amount;
    }
    totalContributions += amount;
    if (month && !entry.date.startsWith(month + '-')) continue;
    for (const split of entry.splits ?? []) {
      fundedByCategory.set(split.categoryId, (fundedByCategory.get(split.categoryId) ?? 0) + split.amount);
      if (split.to === 'checking') people[entry.personId].personal += split.amount;
    }
    const person = people[entry.personId];
    if (entry.type === 'income') {
      income += entry.amount;
      person.income += entry.amount;
    } else {
      spent += entry.amount;
      person.spent += entry.amount;
      spentByCategory.set(entry.categoryId, (spentByCategory.get(entry.categoryId) ?? 0) + entry.amount);
    }
    allocated += amount;
    person.allocated += amount;
  }
  const budgeted = state.categories.reduce((sum, c) => sum + limitFor(c), 0);
  return {
    people, goals, spentByCategory, fundedByCategory, income, spent, allocated, budgeted, totalContributions,
    jointBalance: state.savingsAdjustment + totalContributions,
  };
}

export function setJointBalance(state, desired) {
  return { ...state, savingsAdjustment: desired - summarize(state).totalContributions };
}

export function calendarItems(state, dates) {
  const byDate = new Map(dates.map(date => [date, []]));
  const categories = new Map(state.categories.map(category => [category.id, category]));
  for (const entry of state.entries) {
    const items = byDate.get(entry.date);
    if (!items) continue;
    const category = categories.get(entry.categoryId);
    const deposited = entryContribution(entry);
    const goalNames = goalShares(entry).map(share => state.goals.find(goal => goal.id === share.goalId)?.name).filter(Boolean).join(', ');
    const time = entryTime(entry);
    const weddingDeposit = /wedding/i.test(entry.source) && deposited > 0;
    if (!weddingDeposit) {
      items.push({ id: 'entry:' + entry.id, kind: entry.type, title: category?.name ?? entry.source,
        color: category && categoryColor(category), entry, time });
    }
    if (deposited > 0) {
      items.push({ id: 'deposit:' + entry.id, kind: 'deposit', title: weddingDeposit ? 'Wedding deposit' : 'Joint deposit',
        color: weddingDeposit ? categoryColor(category ?? weddingCategory) : undefined,
        entry, time, amount: deposited, goal: goalNames });
    }
  }
  for (const record of state.savings ?? []) {
    const name = PEOPLE.find(person => person.id === record.personId)?.name;
    byDate.get(record.date)?.push({ id: 'saving:' + record.id, kind: 'saving', title: record.amount < 0 ? `Taken from ${name}’s savings` : `Added to ${name}’s savings`,
      record, time: record.time, amount: record.amount });
  }
  for (const debt of state.debts) {
    if (!debt.settledAt) continue;
    const paidAt = new Date(debt.settledAt);
    byDate.get(localDate(paidAt))?.push({ id: 'payment:' + debt.id, kind: 'payment',
      title: 'Debt paid: ' + debt.description, debt, time: localTime(paidAt) });
  }
  const eventCategories = new Map((state.eventCategories ?? []).map(category => [category.id, category]));
  for (const [date, items] of byDate) {
    for (const event of state.events) {
      // An event's own color wins over its category's.
      const category = eventCategories.get(event.categoryId);
      if (occursOn(event, date)) items.push({ id: 'event:' + event.id + ':' + date, kind: 'event', title: event.title, time: event.time, event, date,
        color: event.color ?? category?.color, category: category?.name });
    }
  }
  for (const items of byDate.values()) items.sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''));
  return byDate;
}

export const sharedAmount = entry => entry.shared ? Math.round(entry.amount * entry.shared.rate / 10_000) : 0;

// Keeps the debt that a shared expense creates in step with the expense. An open debt is
// replaced or removed; one that was already settled is left as the record of that payment.
export function withSharedDebt(state, entry, now = new Date().toISOString()) {
  const settled = state.debts.some(debt => debt.linkedEntryId === entry.id && debt.settledAt);
  const debts = state.debts.filter(debt => debt.linkedEntryId !== entry.id || debt.settledAt);
  if (entry.shared && !settled && sharedAmount(entry) > 0) {
    const existing = state.debts.find(debt => debt.linkedEntryId === entry.id);
    debts.unshift({ id: existing?.id ?? 'split-' + entry.id, debtorId: entry.shared.personId, creditorId: entry.personId, addedBy: entry.personId,
      amount: sharedAmount(entry), description: `${entry.source}: ${entry.shared.rate / 100}% share`, createdAt: existing?.createdAt ?? now, settledAt: null, linkedEntryId: entry.id });
  }
  return { ...state, debts };
}

export const withoutEntry = (state, id) => ({
  ...state,
  entries: state.entries.filter(entry => entry.id !== id),
  debts: state.debts.filter(debt => debt.linkedEntryId !== id || debt.settledAt),
});

export function debtFromFields(fields, now = new Date().toISOString()) {
  const { debtorId, creditorId, addedBy } = fields;
  if (debtorId === creditorId || ![debtorId, creditorId, addedBy].every(id => PEOPLE.some(person => person.id === id))) {
    throw new Error('Choose two different people for who owes and who is owed.');
  }
  const amount = decimalUnits(fields.amount);
  if (!amount) throw new Error('Enter an amount greater than zero.');
  const description = String(fields.description ?? '').trim().slice(0, 160);
  if (!description) throw new Error('Enter a description.');
  return { id: crypto.randomUUID(), debtorId, creditorId, addedBy, amount, description, createdAt: now, settledAt: null };
}

export function settleDebt(state, id, now = new Date().toISOString()) {
  const debt = state.debts.find(item => item.id === id);
  if (!debt || debt.settledAt) throw new Error('This debt is already settled or no longer available.');
  return { ...state, debts: state.debts.map(item => item.id === id ? { ...item, settledAt: now } : item) };
}

export function debtBalances(debts) {
  let long = 0, mei = 0, count = 0;
  for (const debt of debts) {
    if (debt.settledAt) continue;
    if (debt.debtorId === 'long') long += debt.amount;
    else mei += debt.amount;
    count += 1;
  }
  return { long, mei, count, net: Math.abs(long - mei), debtorId: long === mei ? null : long > mei ? 'long' : 'mei' };
}

export function calendarDays(month) {
  const [year, number] = month.split('-').map(Number);
  const first = new Date(year, number - 1, 1, 12);
  const start = 1 - first.getDay();
  return Array.from({ length: 42 }, (_, i) => localDate(new Date(year, number - 1, start + i, 12)));
}

export function shiftMonth(month, step) {
  const date = dateFromKey(month + '-01');
  date.setMonth(date.getMonth() + step);
  return localDate(date).slice(0, 7);
}

export function readState(storage) {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return newPlanner();
  const state = JSON.parse(raw);
  if (state?.version !== 2 || !['categories', 'goals', 'entries', 'events'].every(key => Array.isArray(state[key]))
      || !Number.isSafeInteger(state.savingsAdjustment)
      || (state.debts !== undefined && !Array.isArray(state.debts))) {
    throw new Error('The saved dashboard could not be read.');
  }
  delete state.googleUrl;
  state.debts ??= [];
  if (state.savings !== undefined && !Array.isArray(state.savings)) throw new Error('The saved dashboard could not be read.');
  state.savings = (state.savings ?? []).filter(isSavingsRecord);
  // Planners from before folders get the old permanent categories first, so they can be
  // turned into ordinary categories below. After that, deleting one is allowed and sticks.
  if (!Array.isArray(state.folders)) ensureLegacyCategories(state);
  if (!state.goals.some(goal => goal.id === WEDDING_GOAL_ID)) state.goals.unshift({ ...weddingGoal });
  state.events = state.events.map(normalizeEvent);
  state.eventCategories = normalizeEventCategories(state.eventCategories);
  for (const goal of state.goals) if (goal.targetDate !== undefined && !isDateKey(goal.targetDate)) delete goal.targetDate;
  delete state.firstPaydays;
  privatizeCategories(state);
  organizeFolders(state);
  return finishState(state);
}

function ensureLegacyCategories(state) {
  const category = state.categories.find(item => item.id === WEDDING_CATEGORY_ID)
    ?? state.categories.find(item => isWeddingName(item.name));
  const wedding = {
    ...weddingCategory, ...category, id: WEDDING_CATEGORY_ID, name: weddingCategory.name, savingsGoalId: WEDDING_GOAL_ID,
    savingsRates: { ...weddingCategory.savingsRates, ...category?.savingsRates },
  };
  state.categories = [wedding, ...state.categories.filter(item => item !== category)];
  if (category && category.id !== WEDDING_CATEGORY_ID) {
    state.entries = state.entries.map(entry => entry.categoryId === category.id ? { ...entry, categoryId: WEDDING_CATEGORY_ID } : entry);
  }
  // My savings and Personal are permanent too. A category the couple already gave one of
  // those names becomes it, keeping its entries. A missing one is added before Personal.
  for (const [fixed, matches] of [[savingsCategory, isSavingsName], [personalCategory, isPersonalName]]) {
    const named = state.categories.find(item => item.id === fixed.id) ?? state.categories.find(item => matches(item.name));
    if (!named) {
      const personalAt = state.categories.findIndex(item => item.id === PERSONAL_CATEGORY_ID);
      state.categories.splice(personalAt < 0 ? state.categories.length : personalAt, 0, { ...fixed });
    } else if (named.id !== fixed.id) {
      const oldId = named.id;
      state.categories = state.categories.map(item => item === named ? { ...item, id: fixed.id, name: fixed.name } : item);
      state.entries = state.entries.map(entry => ({ ...entry, ...(entry.categoryId === oldId ? { categoryId: fixed.id } : {}),
        ...(entry.splits ? { splits: entry.splits.map(split => split.categoryId === oldId ? { ...split, categoryId: fixed.id } : split) } : {}) }));
    } else named.name = fixed.name;
  }
}

// Gives each person the three built-in folders and turns the old shared Wedding, My savings and
// Personal categories into one private copy each, placed in the folder that now gives them
// their behavior. Older splits and expenses get the destination they had at the time. The
// result is the same on every device and running it again changes nothing.
function organizeFolders(state) {
  const ids = PEOPLE.map(person => person.id);
  state.folders = (Array.isArray(state.folders) ? state.folders : []).filter(folder =>
    typeof folder?.id === 'string' && ids.includes(folder.ownerId) && typeof folder.name === 'string' && folder.name.trim());
  for (const personId of ids) {
    Object.entries(FOLDER_KINDS).forEach(([kind, { name, color }], index) => {
      const id = systemFolderId(kind, personId);
      const existing = state.folders.find(folder => folder.id === id);
      const fixed = { id, ownerId: personId, kind, name, locked: true };
      if (existing) Object.assign(existing, fixed);
      else state.folders.push({ ...fixed, color, order: index });
    });
  }
  for (const folder of state.folders) if (!folder.locked) { delete folder.kind; folder.color = parseAccent(folder.color) ?? '#8a94a3'; }

  const homes = { [WEDDING_CATEGORY_ID]: 'joint', [SAVINGS_CATEGORY_ID]: 'saving', [PERSONAL_CATEGORY_ID]: 'checking' };
  const remap = new Map();
  state.categories = state.categories.flatMap(category => {
    const home = homes[category.id];
    if (!home || category.ownerId) return [category];
    return ids.map((personId, index) => {
      const id = index === 0 ? category.id : `${category.id}-${personId}`;
      remap.set(category.id + '|' + personId, id);
      const copy = { ...category, id, ownerId: personId, limit: category.limits?.[personId] ?? category.limit ?? 0, folderId: systemFolderId(home, personId) };
      delete copy.limits;
      for (const key of ['savingsRates', 'incomeShares']) {
        if (category[key]?.[personId]) copy[key] = { [personId]: category[key][personId] }; else delete copy[key];
      }
      return copy;
    });
  });
  const legacyTo = split => split.goalId ? 'joint' : split.categoryId === SAVINGS_CATEGORY_ID ? 'saving' : split.categoryId === PERSONAL_CATEGORY_ID ? 'checking' : null;
  state.entries = state.entries.map(entry => {
    const next = { ...entry };
    if (entry.splits) next.splits = entry.splits.map(split => {
      const to = split.to ?? legacyTo(split);
      return { ...split, ...(to ? { to } : {}), categoryId: remap.get(split.categoryId + '|' + entry.personId) ?? split.categoryId };
    });
    if (entry.type === 'expense' && !entry.to && entry.categoryId === SAVINGS_CATEGORY_ID && remap.size) next.to = 'saving';
    const moved = remap.get(entry.categoryId + '|' + entry.personId);
    if (moved) next.categoryId = moved;
    return next;
  });
  const folders = new Map(state.folders.map(folder => [folder.id, folder]));
  state.categories.forEach((category, index) => {
    const folder = folders.get(category.folderId);
    if (category.folderId !== undefined && (!folder || folder.ownerId !== category.ownerId)) delete category.folderId;
    if (!Number.isFinite(category.order)) category.order = index;
  });
}

function finishState(state) {
  for (const category of state.categories) {
    const shares = Object.fromEntries(PEOPLE.map(({ id }) => [id, category.incomeShares?.[id]]).filter(([, rate]) => Number.isInteger(rate) && rate > 0 && rate <= 10_000));
    if (Object.keys(shares).length) category.incomeShares = shares; else delete category.incomeShares;
  }
  for (const entry of state.entries) {
    if (entry.splits !== undefined && !(Array.isArray(entry.splits) && entry.splits.every(split =>
      typeof split?.categoryId === 'string' && Number.isInteger(split.rate) && Number.isSafeInteger(split.amount)))) delete entry.splits;
  }
  state.accentColor = parseAccent(state.accentColor) ?? DEFAULT_ACCENT;
  // The garden redesign made sage the default. Move the old default over once; later choices are kept.
  if (state.theme !== 'garden' && state.accentColor === LEGACY_ACCENT) state.accentColor = DEFAULT_ACCENT;
  state.theme = 'garden';
  state.tree = normalizeTree(state.tree);
  return state;
}
