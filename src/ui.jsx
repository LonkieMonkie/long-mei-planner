import { useEffect, useRef, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Car, Heart, Pencil, Receipt, ShoppingBasket, Tag, Trash2, Utensils, X } from 'lucide-react';
import { PEOPLE, categoryColor, entryContribution, money, shortDate, timestamp } from './model.js';

export const CATEGORY_ICONS = { basket: ShoppingBasket, car: Car, heart: Heart, utensils: Utensils, receipt: Receipt, tag: Tag };

export function Person({ id, onlyAvatar = false }) {
  const person = PEOPLE.find(p => p.id === id);
  return <span className="person"><span className={`avatar ${person.tone}`}>{person.initials}</span>{!onlyAvatar && person.name}</span>;
}

export function PanelHeading({ title, subtitle, action }) {
  return <div className="panel-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</div>;
}

export function Empty({ icon: Icon, children, action }) {
  return <div className="empty-state"><span className="icon-tile indigo"><Icon size={19}/></span><p>{children}</p>{action}</div>;
}

export function Progress({ value, max, tone = 'indigo', label, color }) {
  const percent = max ? Math.min(100, Math.max(0, 100 * value / max)) : 0;
  return <div className="progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)}>
    <span className={tone} style={{ width: percent + '%', backgroundColor: color }}/>
  </div>;
}

export function Modal({ title, children, close }) {
  const ref = useRef(null);
  useEffect(() => { const dialog = ref.current; dialog.showModal(); return () => dialog.close(); }, []);
  return <dialog ref={ref} aria-labelledby="dialog-title" className="modal" onCancel={e => { e.preventDefault(); close(); }}>
    <div className="modal-heading"><h2 id="dialog-title">{title}</h2><button className="icon-btn" type="button" aria-label="Close dialog" onClick={close}><X size={19}/></button></div>
    {children}
  </dialog>;
}

export function ActionForm({ children, onSave, label = 'Save', cancel }) {
  const [error, setError] = useState('');
  function submit(event) {
    event.preventDefault();
    setError('');
    try { onSave(Object.fromEntries(new FormData(event.currentTarget))); }
    catch (error) { setError(error.message); }
  }
  return <form className="form-stack" onSubmit={submit}>
    {children}
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="form-actions">{cancel && <button type="button" className="btn secondary" onClick={cancel}>Cancel</button>}<button className="btn primary">{label}</button></div>
  </form>;
}

export function EntryHistory({ state, entries, onEdit, onDelete, compact = false }) {
  if (!entries.length) return <Empty icon={Receipt}>No entries for this view.</Empty>;
  const goals = new Map(state.goals.map(goal => [goal.id, goal.name]));
  return <div className="table-scroll"><table className="history-table">
    <thead><tr><th scope="col">Source</th><th scope="col">Added by</th><th scope="col">Logged at</th><th scope="col">Amount</th><th scope="col">Joint contribution</th>{!compact && <th scope="col">Actions</th>}</tr></thead>
    <tbody>{entries.map(entry => {
      const FlowIcon = entry.type === 'income' ? ArrowDownLeft : ArrowUpRight;
      const category = state.categories.find(item => item.id === entry.categoryId);
      return <tr key={entry.id}>
        <td><div className="entry-source"><span className={`icon-tile ${category ? 'category-icon' : entry.type === 'income' ? 'mint' : 'rose'}`} style={category ? { '--category-color': categoryColor(category) } : undefined}><FlowIcon size={17}/></span><div><strong>{entry.source}</strong><small>{entry.type === 'income' ? 'Income' : 'Expense'} · {shortDate(entry.date)}</small></div></div></td>
        <td><Person id={entry.personId}/></td>
        <td>{timestamp(entry.createdAt)}{entry.editedAt && <small title={timestamp(entry.editedAt)}>Edited {timestamp(entry.editedAt)}</small>}</td>
        <td className={entry.type === 'income' ? 'positive' : ''}><strong>{entry.type === 'income' ? '+' : '−'}{money(entry.amount)}</strong></td>
        <td>{entry.goalId && entry.rate ? <><strong>{money(entryContribution(entry))}</strong><small>{goals.get(entry.goalId)} · {entry.rate / 100}%{entry.type === 'income' && ' · Legacy'}</small></> : '—'}</td>
        {!compact && <td><div className="entry-actions">
          <button className="icon-btn" aria-label={`Edit ${entry.source} entry`} title="Edit entry" onClick={() => onEdit(entry)}><Pencil size={15}/></button>
          <button className="icon-btn danger" aria-label={`Delete ${entry.source} entry`} title="Delete entry" onClick={() => onDelete(entry)}><Trash2 size={16}/></button>
        </div></td>}
      </tr>;
    })}</tbody>
  </table></div>;
}

export function InlineName({ name, save }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [error, setError] = useState('');
  function finish() {
    const value = draft.trim();
    if (value && value !== name) {
      try { save(value); }
      catch (e) { setError(e.message); }
    }
    setEditing(false);
  }
  return <div className="inline-name">
    {editing
      ? <input autoFocus aria-label={`Rename ${name}`} value={draft} maxLength={70}
          onFocus={e => e.target.select()} onChange={e => setDraft(e.target.value)} onBlur={finish}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } if (e.key === 'Escape') setEditing(false); }}/>
      : <button className="rename" onClick={() => { setDraft(name); setError(''); setEditing(true); }}>{name}<Pencil size={13}/></button>}
    {error && <small className="form-error" role="alert">{error}</small>}
  </div>;
}
