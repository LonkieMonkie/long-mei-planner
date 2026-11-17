import { useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, ExternalLink, Link2, Plus, Trash2 } from 'lucide-react';
import { calendarDays, dateFromKey, googleEmbed, localDate, shiftMonth, shortDate } from './model.js';
import { Empty, PanelHeading } from './ui.jsx';

export function CalendarView({ state, save, open, month, setMonth, selected, setSelected }) {
  const today = localDate();
  const [url, setUrl] = useState(state.googleUrl);
  const [error, setError] = useState('');
  const days = calendarDays(month);
  const eventsOn = date => state.events.filter(event => event.date === date).sort((a, b) => a.time.localeCompare(b.time));
  const events = eventsOn(selected);
  function link(event) {
    event.preventDefault();
    try {
      const googleUrl = googleEmbed(url);
      save(current => ({ ...current, googleUrl }), googleUrl ? 'Google Calendar connected' : 'Google Calendar removed');
      setUrl(googleUrl);
      setError('');
    } catch (e) { setError(e.message); }
  }
  function move(step) {
    const next = shiftMonth(month, step);
    setMonth(next);
    setSelected(next === today.slice(0, 7) ? today : next + '-01');
  }
  return <>
    <div className="calendar-layout">
      <section className="card calendar-card">
        <PanelHeading title={dateFromKey(month + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          action={<div className="calendar-controls"><button className="btn secondary small" onClick={() => { setSelected(today); setMonth(today.slice(0, 7)); }}>Today</button><button className="icon-btn bordered" aria-label="Previous month" onClick={() => move(-1)}><ChevronLeft size={17}/></button><button className="icon-btn bordered" aria-label="Next month" onClick={() => move(1)}><ChevronRight size={17}/></button></div>}/>
        <div className="calendar-grid">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => <span className="calendar-weekday" key={day}>{day}</span>)}
          {days.map(day => {
            const items = eventsOn(day);
            return <button key={day} className={`calendar-day ${day.startsWith(month) ? '' : 'outside'} ${day === today ? 'today-cell' : ''} ${day === selected ? 'selected' : ''}`}
              aria-label={`${shortDate(day)}, ${items.length} events`} aria-pressed={day === selected}
              onClick={() => { setSelected(day); setMonth(day.slice(0, 7)); }}>
              <span className="day-number">{Number(day.slice(-2))}</span>
              {items.slice(0, 2).map(item => <span className="day-event" key={item.id}>{item.title}</span>)}
              {items.length > 2 && <span className="day-more">+{items.length - 2}</span>}
            </button>;
          })}
        </div>
      </section>
      <section className="card agenda-card">
        <PanelHeading title={shortDate(selected)} subtitle="Local events" action={<button className="icon-btn bordered" aria-label="Add event on selected day" onClick={() => open({ kind: 'event', date: selected })}><Plus size={18}/></button>}/>
        {!events.length ? <Empty icon={CalendarDays}>No local events on this day.</Empty> : events.map(event => <article className="agenda-event" key={event.id}>
          <div><h3>{event.title}</h3><p className="event-time"><Clock3 size={13}/>{event.time ? new Date(`${event.date}T${event.time}`).toLocaleTimeString('en-US', {hour: 'numeric', minute: '2-digit'}) : 'All day'}</p></div>
          <button className="icon-btn danger" aria-label={`Delete event ${event.title}`} onClick={() => open({ kind: 'delete-event', item: event })}><Trash2 size={15}/></button>
          {event.description && <p className="event-description">{event.description}</p>}
        </article>)}
        <button className="btn secondary w-full" onClick={() => open({ kind: 'event', date: selected })}><Plus size={16}/> Add local event</button>
      </section>
    </div>
    <section className="card google-card">
      <PanelHeading title="Google Calendar" subtitle="Paste a public calendar URL from Google Calendar’s Integrate calendar settings." action={state.googleUrl && <a href={state.googleUrl} target="_blank" rel="noreferrer" className="btn secondary small">Open calendar <ExternalLink size={14}/></a>}/>
      <form className="google-form" onSubmit={link}>
        <label className="google-input"><Link2 size={17}/><input type="url" aria-label="Public Google Calendar URL" placeholder="https://calendar.google.com/calendar/embed?src=…" value={url} onChange={e => setUrl(e.target.value)}/></label>
        <button className="btn primary">Save calendar link</button>
        {state.googleUrl && <button type="button" className="btn secondary" onClick={() => {
          try { save(current => ({ ...current, googleUrl: '' }), 'Google Calendar removed'); setUrl(''); setError(''); }
          catch (e) { setError(e.message); }
        }}>Remove</button>}
      </form>
      {error && <p className="form-error" role="alert">{error}</p>}
      {state.googleUrl && <iframe className="google-frame" src={state.googleUrl} title="Public Google Calendar" referrerPolicy="no-referrer" loading="lazy"/>}
    </section>
  </>;
}
