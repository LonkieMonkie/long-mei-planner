import { useState } from 'react';
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Folder, FolderPlus, LockKeyhole, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { FOLDER_KINDS, PEOPLE, displayTime, folderSummaries, money, paycheckFolder, shortDate } from './model.js';
import { CategoryIcon, Empty, PanelHeading, Person } from './ui.jsx';

const INTRO = {
  joint: 'Shared folders for money you save together. Each adds up every Joint saving category inside, from both of you.',
  saving: 'Your own savings folders. Each adds up its categories, income shares, deposits and transfers.',
  checking: 'Your everyday money. Expenses outside the saving folders are paid from your paycheck folder.',
};

// One tab's folders (Joint saving, Personal saving or Personal checking) as accounts: each
// folder's all-time balance, this month's money in and out, its categories, and its activity.
export function FolderAccounts({ state, me, kind, month, open, save }) {
  const people = kind === 'joint' || me ? [me] : PEOPLE.map(person => person.id);
  const summaries = people.flatMap(personId => folderSummaries(state, personId, month).filter(row => row.folder.kind === kind))
    .filter((row, index, all) => all.findIndex(other => other.folder.id === row.folder.id) === index);
  const [selected, setSelected] = useState(null);
  const active = summaries.find(row => row.folder.id === selected) ?? summaries[0];
  const total = summaries.reduce((sum, row) => sum + row.balance, 0);
  const monthName = new Date(month + '-02').toLocaleDateString('en-US', { month: 'long' });
  return <section className="card accounts">
    <PanelHeading title={`${FOLDER_KINDS[kind].name} folders`} subtitle={INTRO[kind]} action={<div className="flex flex-wrap gap-2">
      <button className="btn secondary" onClick={() => open({ kind: 'transfer', ...(active ? { to: kind === 'checking' ? undefined : active.folder.id, from: kind === 'checking' ? active.folder.id : undefined } : {}) })}><ArrowLeftRight size={16}/> Transfer</button>
      <button className="btn secondary" onClick={() => open({ kind: 'folder', folderKind: kind })}><FolderPlus size={16}/> Add folder</button>
    </div>}/>
    <p className="accounts-total">All {FOLDER_KINDS[kind].name.toLowerCase()} folders <strong className={total < 0 ? 'negative' : ''}>{total < 0 ? '−' : ''}{money(Math.abs(total))}</strong></p>
    <div className="account-grid">{summaries.map(row => {
      const { folder } = row;
      const paycheck = kind === 'checking' && paycheckFolder(state, folder.ownerId) === folder.id;
      return <article key={folder.id} className={active?.folder.id === folder.id ? 'account-card selected' : 'account-card'} style={{ '--folder-color': folder.color }}>
        <button type="button" className="account-select" aria-pressed={active?.folder.id === folder.id} onClick={() => setSelected(folder.id)}>
          <span className="account-name"><Folder size={16} aria-hidden="true"/>{folder.name}{folder.locked && <LockKeyhole size={12} aria-label="Built-in folder"/>}</span>
          {!me && kind !== 'joint' && <small>{PEOPLE.find(person => person.id === folder.ownerId)?.name}</small>}
          <strong className={row.balance < 0 ? 'account-balance negative' : 'account-balance'}>{row.balance < 0 ? '−' : ''}{money(Math.abs(row.balance))}</strong>
          <span className="account-month"><span className={row.in ? 'positive' : ''}><ArrowDownLeft size={13} aria-hidden="true"/>{row.in ? '+' : ''}{money(row.in)} in</span><span className={row.out ? 'negative' : ''}><ArrowUpRight size={13} aria-hidden="true"/>{row.out ? '−' : ''}{money(row.out || 0)} out</span><span>in {monthName}</span></span>
        </button>
        {paycheck && <p className="paycheck-badge"><Star size={12} aria-hidden="true"/> Paycheck lands here</p>}
        <div className="account-actions">
          {<>
            <button className="icon-btn" title="Add money" aria-label={`Add money to ${folder.name}`} onClick={() => open({ kind: 'saving', folderId: folder.id })}><Plus size={15}/></button>
            <button className="icon-btn" title="Take out" aria-label={`Take money out of ${folder.name}`} onClick={() => open({ kind: 'saving', folderId: folder.id, direction: 'out' })}><ArrowUpRight size={15}/></button>
          </>}
          {kind === 'checking' && !paycheck && <button className="text-link" onClick={() => save(current => ({ ...current, paycheck: { ...current.paycheck, [folder.ownerId]: folder.id } }), `${folder.name} now gets the rest of each paycheck`)}>Make paycheck folder</button>}
          {!folder.locked && <>
            <button className="icon-btn" title="Name and color" aria-label={`${folder.name} folder settings`} onClick={() => open({ kind: 'folder', item: folder })}><Pencil size={14}/></button>
            <button className="icon-btn danger" title="Delete folder" aria-label={`Delete ${folder.name} folder`} onClick={() => open({ kind: 'delete-folder', item: folder })}><Trash2 size={15}/></button>
          </>}
        </div>
      </article>;
    })}</div>
    {active && <div className="account-detail">
      <div>
        <h3>Inside {active.folder.name}</h3>
        {active.categories.length ? <ul className="account-categories">{active.categories.map(category => {
          const spent = state.entries.filter(entry => entry.type === 'expense' && entry.categoryId === category.id && entry.date.startsWith(month + '-')).reduce((sum, entry) => sum + entry.amount, 0);
          return <li key={category.id}><CategoryIcon category={category} size={14}/><span>{category.name}</span><b>{money(spent)}</b></li>;
        })}</ul> : <p className="muted-note">No categories yet. Move some here on the Budget page.</p>}
        {active.budgeted > 0 && <p className="muted-note">Budgets inside add up to {money(active.budgeted)} a month; {money(active.spent)} logged in {monthName}.</p>}
      </div>
      <div>
        <h3>Activity</h3>
        {!active.rows.length ? <Empty icon={Folder}>Nothing has moved through this folder yet.</Empty>
          : <ul className="account-activity">{active.rows.slice(0, 12).map((row, index) => <li key={index}>
            <span><strong>{row.label}</strong><small>{[kindLabel(row), shortDate(row.date), displayTime(row.time)].join(' · ')}</small></span>
            {kind === 'joint' && <Person id={row.personId} onlyAvatar/>}
            <b className={row.amount < 0 ? 'negative' : 'positive'}>{row.amount < 0 ? '−' : '+'}{money(Math.abs(row.amount))}</b>
            {row.transfer && row.transfer.personId === me && <span className="row-actions">
              <button className="icon-btn" aria-label="Edit transfer" onClick={() => open({ kind: 'transfer', item: row.transfer })}><Pencil size={14}/></button>
              <button className="icon-btn danger" aria-label="Delete transfer" onClick={() => open({ kind: 'delete-transfer', item: row.transfer })}><Trash2 size={14}/></button></span>}
          </li>)}</ul>}
      </div>
    </div>}
  </section>;
}

function kindLabel(row) {
  if (row.transfer) return row.amount < 0 ? 'Transfer out' : 'Transfer in';
  if (row.record) return row.amount < 0 ? 'Taken out' : 'Added';
  if (row.kind === 'income') return 'Income';
  return row.amount < 0 ? 'Expense' : 'Deposit';
}
