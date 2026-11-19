import { useState } from 'react';
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Pencil, Plus, Trash2, Wallet } from 'lucide-react';
import { PEOPLE, displayTime, money, shortDate } from './model.js';
import { personalSavings } from './personal-savings.js';
import { Empty, PanelHeading } from './ui.jsx';

const kinds = {
  in: { label: 'Added', tone: 'income', Icon: ArrowDownLeft },
  out: { label: 'Taken out', tone: 'expense', Icon: ArrowUpRight },
  income: { label: 'Saved from income', tone: 'indigo', Icon: Wallet },
  budget: { label: 'Logged in Personal saving', tone: 'indigo', Icon: Wallet },
  transfer: { label: 'Transfer', tone: 'indigo', Icon: ArrowLeftRight },
};

export function MySavings({ state, me, open, editEntry }) {
  // Signed in, this is your own savings; without sign-in, choose whose to see.
  const [chosen, setChosen] = useState('long');
  const personId = me ?? chosen;
  const person = PEOPLE.find(p => p.id === personId);
  const savings = personalSavings(state, personId);
  return <>
    {!me && <div className="segmented person-switch" aria-label="Whose savings">{PEOPLE.map(p =>
      <button key={p.id} type="button" aria-pressed={personId === p.id} onClick={() => setChosen(p.id)}>{p.name}</button>)}</div>}
    <div className="savings-layout">
      <section className="balance-card">
        <span className="balance-icon"><Wallet size={23}/></span><p>{person.name}’s savings, all folders</p><strong>{money(savings.balance)}</strong>
        <div className="balance-actions">
          <button className="btn balance-button" onClick={() => open({ kind: 'saving', person: personId })}><Plus size={15}/> Add money</button>
          <button className="btn balance-button" onClick={() => open({ kind: 'saving', person: personId, direction: 'out' })}><ArrowUpRight size={15}/> Take out</button>
        </div>
        <div className="balance-breakdown"><span>Added <b>{money(savings.added)}</b></span><span>From entries <b>{money(savings.fromIncome)}</b></span><span>Taken out <b>{money(savings.takenOut)}</b></span></div>
      </section>
      <section className="card contribution-card">
        <PanelHeading title="How it adds up" subtitle="Your savings are separate from joint savings."/>
        <ul className="savings-explainer">
          <li><b>Add money</b> or <b>Take out</b> here at any time.</li>
          <li>Income shares and entries in categories inside your <b>Personal saving</b> folders are added here.</li>
          <li><b>Transfer</b> moves money between your folders, like from checking into savings.</li>
          <li>Categories in a <b>Joint saving</b> folder go to joint savings instead.</li>
        </ul>
      </section>
    </div>
    <section className="card">
      <PanelHeading title="History" subtitle={`Every change to ${person.name}’s savings, newest first.`}/>
      {!savings.rows.length ? <Empty icon={Wallet}>Nothing here yet. Add money to start your savings.</Empty>
        : <div className="savings-rows">{savings.rows.map(row => {
          const { label, tone, Icon } = kinds[row.kind];
          return <article className="savings-row" key={row.id}>
            <span className={`icon-tile ${tone}`}><Icon size={16}/></span>
            <div><strong>{row.note || label}</strong><small>{[row.note ? label : '', shortDate(row.date), displayTime(row.time)].filter(Boolean).join(' · ')}</small></div>
            <b className={row.amount < 0 ? 'negative' : 'positive'}>{row.amount < 0 ? '−' : '+'}{money(Math.abs(row.amount))}</b>
            <div className="row-actions">{row.kind === 'transfer' ? <>
                <button className="icon-btn" aria-label="Edit transfer" onClick={() => open({ kind: 'transfer', item: row.transfer })}><Pencil size={15}/></button>
                <button className="icon-btn danger" aria-label="Delete transfer" onClick={() => open({ kind: 'delete-transfer', item: row.transfer })}><Trash2 size={15}/></button></>
              : row.kind === 'income' || row.kind === 'budget'
              ? <button className="icon-btn" aria-label={`Edit the ${row.note} entry`} title="Edit the entry" onClick={() => editEntry(row.entry)}><Pencil size={15}/></button>
              : <>
                <button className="icon-btn" aria-label={`Edit ${label.toLowerCase()} of ${money(Math.abs(row.amount))}`} onClick={() => open({ kind: 'saving', item: row })}><Pencil size={15}/></button>
                <button className="icon-btn danger" aria-label={`Delete ${label.toLowerCase()} of ${money(Math.abs(row.amount))}`} onClick={() => open({ kind: 'delete-saving', item: row })}><Trash2 size={15}/></button>
              </>}</div>
          </article>;
        })}</div>}
    </section>
  </>;
}
