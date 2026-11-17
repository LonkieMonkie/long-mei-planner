import { ArrowDownLeft, ArrowUpRight, CalendarDays, ChevronLeft, ChevronRight, Clock3, Pencil, PiggyBank, Plus, ReceiptText, Repeat, Trash2 } from 'lucide-react';
import { PEOPLE, calendarDays, calendarItems, dateFromKey, displayTime, localDate, money, shiftMonth, shortDate } from './model.js';
import { Empty, PanelHeading } from './ui.jsx';
import { repeatSummary } from './events.js';

const styles = {
  income: { tone: 'mint', label: 'Income', Icon: ArrowDownLeft },
  expense: { tone: 'rose', label: 'Expense', Icon: ArrowUpRight },
  deposit: { tone: 'mint', label: 'Deposit', Icon: PiggyBank },
  payment: { tone: 'blue', label: 'Debt payment', Icon: ReceiptText },
  event: { tone: 'blue', label: 'Event', Icon: CalendarDays },
};

function itemStyle(item) {
  if (item.color) return { '--category-color': item.color };
}

function AgendaDetails({ item, label }) {
  const { entry, debt, event, time } = item;
  const person = id => PEOPLE.find(person => person.id === id)?.name;
  let details;
  if (item.kind === 'deposit') {
    details = [person(entry.personId), '+' + money(item.amount), item.goal].filter(Boolean).join(' · ');
  } else if (debt) {
    details = `${person(debt.debtorId)} paid ${person(debt.creditorId)} · ${money(debt.amount)}`;
  } else if (entry) {
    details = `${label} · ${person(entry.personId)} · ${entry.type === 'income' ? '+' : '−'}${money(entry.amount)}`;
  }
  return <>
    <p className="event-time"><Clock3 size={13} aria-hidden="true"/>{time ? displayTime(time) : 'All day'}</p>
    {details && <p className="event-time">{details}</p>}
    {event?.repeat && <p className="event-time"><Repeat size={13} aria-hidden="true"/>{repeatSummary(event)}</p>}
    {event?.description && <p className="event-description">{event.description}</p>}
  </>;
}

function AgendaItem({ item, open }) {
  const { Icon, tone, label } = styles[item.kind];
  const { entry, event } = item;
  return <article className="agenda-event calendar-agenda-item">
    <span className={`icon-tile ${tone} ${item.color ? 'category-icon' : ''}`} style={itemStyle(item)}><Icon size={16}/></span>
    <div>
      <h3>{item.title}</h3>
      <AgendaDetails item={item} label={label}/>
    </div>
    {entry && <button className="icon-btn" aria-label={`Edit ${item.title} entry`} onClick={() => open({ kind: 'entry', item: entry })}><Pencil size={15}/></button>}
    {event && <button className="icon-btn" aria-label={`Edit event ${item.title}`} onClick={() => open({ kind: 'event', item: event, date: item.date })}><Pencil size={15}/></button>}
    {event && <button className="icon-btn danger" aria-label={`Delete event ${item.title}`} onClick={() => open({ kind: 'delete-event', item: event, date: item.date })}><Trash2 size={15}/></button>}
  </article>;
}

export function CalendarView({ state, open, month, setMonth, selected, setSelected }) {
  const today = localDate();
  const days = calendarDays(month);
  const byDate = calendarItems(state, days);
  const events = byDate.get(selected) ?? [];
  function move(step) {
    const next = shiftMonth(month, step);
    setMonth(next);
    setSelected(next === today.slice(0, 7) ? today : next + '-01');
  }
  return <div className="calendar-layout">
    <section className="card calendar-card">
      <PanelHeading title={dateFromKey(month + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        action={<div className="calendar-controls"><button className="btn secondary small" onClick={() => { setSelected(today); setMonth(today.slice(0, 7)); }}>Today</button><button className="icon-btn bordered" aria-label="Previous month" onClick={() => move(-1)}><ChevronLeft size={17}/></button><button className="icon-btn bordered" aria-label="Next month" onClick={() => move(1)}><ChevronRight size={17}/></button></div>}/>
      <div className="calendar-grid">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => <span className="calendar-weekday" key={day}>{day}</span>)}
        {days.map(day => {
          const items = byDate.get(day);
          return <button key={day} className={`calendar-day ${day.startsWith(month) ? '' : 'outside'} ${day === today ? 'today-cell' : ''} ${day === selected ? 'selected' : ''}`}
            aria-label={[shortDate(day), ...items.map(item => item.time ? `${item.title} at ${displayTime(item.time)}` : item.title)].join(', ')} aria-pressed={day === selected} aria-current={day === today ? 'date' : undefined}
            onClick={() => { setSelected(day); setMonth(day.slice(0, 7)); }}>
            <span className="day-number">{Number(day.slice(-2))}</span>
            {items.slice(0, 2).map(item => <span className={`day-event ${styles[item.kind].tone} ${item.color ? 'category-calendar' : ''}`}
              title={item.time ? `${displayTime(item.time)} · ${item.title}` : item.title}
              style={itemStyle(item)} key={item.id}>{item.title}</span>)}
            {items.length > 2 && <span className="day-more">+{items.length - 2}</span>}
          </button>;
        })}
      </div>
      <div className="calendar-legend">{Object.values(styles).map(({ tone, label }) => <span key={label}><i className={`day-event ${tone}`}/>{label}{label === 'Expense' && ' · category color'}</span>)}</div>
    </section>
    <section className="card agenda-card">
      <PanelHeading title={shortDate(selected)} subtitle="Day’s agenda"/>
      {!events.length ? <Empty icon={CalendarDays}>No activity on this day.</Empty> : events.map(item => <AgendaItem {...{ item, open }} key={item.id}/>)}
      <div className="agenda-actions">
        <button className="btn secondary small" onClick={() => open({ kind: 'event', date: selected })}><Plus size={15}/> Add event</button>
        <button className="btn secondary small" onClick={() => open({ kind: 'entry', date: selected })}><Plus size={15}/> Add entry</button>
      </div>
    </section>
  </div>;
}
