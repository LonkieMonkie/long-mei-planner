import { useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Pencil, Plus, Trash2, Wallet } from 'lucide-react';
import { PEOPLE, displayTime, money, shortDate } from './model.js';
import { personalSavings } from './personal-savings.js';
import { Empty, PanelHeading } from './ui.jsx';

const kinds = {
  in: { label: 'Added', tone: 'mint', Icon: ArrowDownLeft },
  out: { label: 'Taken out', tone: 'rose', Icon: ArrowUpRight },
  income: { label: 'Personal share of income', tone: 'indigo', Icon: Wallet },
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
        <span className="balance-icon"><Wallet size={23}/></span><p>{person.name}’s savings</p><strong>{money(savings.balance)}</strong>
        <div className="balance-actions">
          <button className="btn balance-button" onClick={() => open({ kind: 'saving', person: personId })}><Plus size={15}/> Add money</button>
          <button className="btn balance-button" onClick={() => open({ kind: 'saving', person: personId, direction: 'out' })}><ArrowUpRight size={15}/> Take out</button>
        </div>
        <div className="balance-breakdown"><span>Added <b>{money(savings.added)}</b></span><span>From income <b>{money(savings.fromIncome)}</b></span><span>Taken out <b>{money(savings.takenOut)}</b></span></div>
      </section>
      <section className="card contribution-card">
        <PanelHeading title="How it adds up" subtitle="Your savings are separate from Joint Savings."/>
        <ul className="savings-explainer">
          <li><b>Add money</b> or <b>Take out</b> here at any time.</li>
          <li>When you split income, the part left for <b>Personal</b> is added here automatically.</li>
          <li>Deposits toward the Wedding stay in Joint Savings.</li>
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
            <div className="row-actions">{row.kind === 'income'
              ? <button className="icon-btn" aria-label={`Edit the ${row.note} income entry`} title="Edit the income entry" onClick={() => editEntry(row.entry)}><Pencil size={15}/></button>
              : <>
                <button className="icon-btn" aria-label={`Edit ${label.toLowerCase()} of ${money(Math.abs(row.amount))}`} onClick={() => open({ kind: 'saving', item: row })}><Pencil size={15}/></button>
                <button className="icon-btn danger" aria-label={`Delete ${label.toLowerCase()} of ${money(Math.abs(row.amount))}`} onClick={() => open({ kind: 'delete-saving', item: row })}><Trash2 size={15}/></button>
              </>}</div>
          </article>;
        })}</div>}
    </section>
  </>;
}
