// Calendar events, including repeating ones. An event is stored once; its repeat rule
// says which other dates it falls on, and `skip` lists single dates that were deleted.
import { isDateKey, shortDate } from './model.js';

export const REPEATS = [
  { id: 'none', name: 'Does not repeat' },
  { id: 'daily', name: 'Every day', days: 1, unit: 'day' },
  { id: 'weekly', name: 'Every week', days: 7, unit: 'week' },
  { id: 'biweekly', name: 'Every two weeks', days: 14, unit: 'two weeks' },
  { id: 'monthly', name: 'Every month', months: 1, unit: 'month' },
  { id: 'yearly', name: 'Every year', months: 12, unit: 'year' },
];
const MAX_COUNT = 999;
const DAY = 86_400_000;
const parts = key => key.split('-').map(Number);
const daysInMonth = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();
// Date-only strings parse at UTC midnight, so daylight saving never shifts the arithmetic.
export const addDays = (key, days) => new Date(Date.parse(key) + days * DAY).toISOString().slice(0, 10);

// The occurrence number of `event` on `date` (0 for the first), or -1 if it doesn't fall there.
export function occurrenceIndex(event, date) {
  if (date < event.date) return -1;
  const rule = REPEATS.find(item => item.id === (event.repeat?.freq ?? 'none'));
  let index = -1;
  if (rule.id === 'none') index = date === event.date ? 0 : -1;
  else if (rule.days) {
    const gap = (Date.parse(date) - Date.parse(event.date)) / DAY;
    index = gap % rule.days === 0 ? gap / rule.days : -1;
  } else {
    // Monthly and yearly repeats on the 29th to 31st fall on the last day of shorter months.
    const [y0, m0, d0] = parts(event.date), [y, m, d] = parts(date);
    const months = (y - y0) * 12 + (m - m0);
    if (months % rule.months === 0 && d === Math.min(d0, daysInMonth(y, m))) index = months / rule.months;
  }
  if (index < 0) return -1;
  const { ends, until, count } = event.repeat ?? {};
  if ((ends === 'on' && date > until) || (ends === 'after' && index >= count)) return -1;
  return event.skip?.includes(date) ? -1 : index;
}

export const occursOn = (event, date) => occurrenceIndex(event, date) >= 0;

// The next `limit` occurrences on or after `from`, looking up to a year ahead.
export function upcomingEvents(events, from, limit = 3) {
  const found = [];
  for (let day = 0; day <= 366 && found.length < limit; day++) {
    const date = addDays(from, day);
    for (const event of events) if (occursOn(event, date)) found.push({ event, date });
  }
  return found.sort((a, b) => (a.date + (a.event.time ?? '')).localeCompare(b.date + (b.event.time ?? ''))).slice(0, limit);
}

export function repeatSummary(event) {
  const repeat = event.repeat;
  if (!repeat || repeat.freq === 'none') return '';
  const rule = REPEATS.find(item => item.id === repeat.freq);
  const end = repeat.ends === 'on' ? ' until ' + shortDate(repeat.until) : repeat.ends === 'after' ? `, ${repeat.count} times` : '';
  return rule.name + end;
}

export function eventFromFields(fields, id = crypto.randomUUID()) {
  const title = fields.title.trim();
  if (!title) throw new Error('Enter a title.');
  if (!isDateKey(fields.date)) throw new Error('Choose a valid event date.');
  const event = { id, title, date: fields.date, time: fields.time ?? '', description: (fields.description ?? '').trim() };
  const freq = REPEATS.some(item => item.id === fields.freq) ? fields.freq : 'none';
  if (freq === 'none') return event;
  const ends = ['never', 'on', 'after'].includes(fields.ends) ? fields.ends : 'never';
  const repeat = { freq, ends };
  if (ends === 'on') {
    if (!isDateKey(fields.until) || fields.until < fields.date) throw new Error('Choose an end date on or after the event date.');
    repeat.until = fields.until;
  }
  if (ends === 'after') {
    const count = Number(fields.count);
    if (!Number.isInteger(count) || count < 1 || count > MAX_COUNT) throw new Error(`Enter a number of times from 1 to ${MAX_COUNT}.`);
    repeat.count = count;
  }
  return { ...event, repeat };
}

// Removes one date, that date and everything after it, or the whole event.
export function deleteEvent(events, id, date, scope) {
  return events.flatMap(event => {
    if (event.id !== id) return [event];
    if (scope === 'all' || !event.repeat || (scope === 'following' && date <= event.date)) return [];
    if (scope === 'one') return [{ ...event, skip: [...(event.skip ?? []), date] }];
    const until = addDays(date, -1);
    const lastByCount = event.repeat.ends === 'after' ? null : event.repeat.until;
    const repeat = { freq: event.repeat.freq, ends: 'on', until: lastByCount && lastByCount < until ? lastByCount : until };
    if (event.repeat.ends === 'after') {
      // Keep whichever ends first: the remaining count or the new cut-off.
      let last = event.date;
      for (let day = event.date; day < date; day = addDays(day, 1)) if (occurrenceIndex(event, day) >= 0 || event.skip?.includes(day)) last = day;
      repeat.until = last;
    }
    return [{ ...event, repeat, skip: event.skip?.filter(day => day < date) }];
  });
}

// Applies an edit to every date, to one date only, or to one date and the ones after it.
// Editing one date skips it in the series and adds a separate one-off event there; editing
// from a date onward ends the series the day before and starts a new one with the changes.
export function editEvent(events, original, date, scope, edited) {
  if (!original.repeat || scope === 'all' || (scope === 'following' && date <= original.date)) {
    const replacement = { ...edited, id: original.id, ...(edited.repeat && original.skip?.length ? { skip: original.skip } : {}) };
    return events.map(event => event.id === original.id ? replacement : event);
  }
  if (scope === 'one') {
    const { repeat, ...single } = edited;
    return [...deleteEvent(events, original.id, date, 'one'), single];
  }
  return [...deleteEvent(events, original.id, date, 'following'), edited];
}

// Accepts events saved by earlier versions and drops malformed repeat rules.
export function normalizeEvent(event) {
  const clean = { ...event };
  delete clean.repeat;
  delete clean.skip;
  const repeat = event.repeat;
  if (repeat && REPEATS.some(item => item.id === repeat.freq && item.id !== 'none')) {
    if (repeat.ends === 'on' && isDateKey(repeat.until)) clean.repeat = { freq: repeat.freq, ends: 'on', until: repeat.until };
    else if (repeat.ends === 'after' && Number.isInteger(repeat.count) && repeat.count > 0) clean.repeat = { freq: repeat.freq, ends: 'after', count: repeat.count };
    else clean.repeat = { freq: repeat.freq, ends: 'never' };
    const skip = Array.isArray(event.skip) ? event.skip.filter(isDateKey) : [];
    if (skip.length) clean.skip = skip;
  }
  return clean;
}
