import { ArrowRight, Check, ReceiptText, Scale } from 'lucide-react';
import { PEOPLE, debtBalances, money, timestamp } from './model.js';
import { Empty, PanelHeading, Person } from './ui.jsx';

export function DebtTracker({ debts, open }) {
  const balance = debtBalances(debts);
  const debtor = PEOPLE.find(person => person.id === balance.debtorId);
  const creditor = PEOPLE.find(person => person.id !== balance.debtorId);
  return <>
    <div className="savings-layout">
      <section className="balance-card debt-balance">
        <span className="balance-icon"><Scale size={23}/></span>
        <p>Net balance</p>
        <strong>{money(balance.net)}</strong>
        <p>{debtor ? `${debtor.name} owes ${creditor.name} after offsetting both directions.`
          : balance.count ? 'Open debts offset each other.' : 'You’re all settled up.'}</p>
      </section>
      <section className="card contribution-card">
        <PanelHeading title="Open debts" subtitle={`${balance.count} ${balance.count === 1 ? 'item' : 'items'} awaiting payment`}/>
        {PEOPLE.map(person => <div className="contribution-person" key={person.id}>
          <span className="debt-direction"><Person id={person.id}/><ArrowRight size={14}/><Person id={PEOPLE.find(other => other.id !== person.id).id}/></span>
          <strong>{money(balance[person.id])}</strong>
        </div>)}
      </section>
    </div>
    <section className="card">
      <PanelHeading title="Debt history" subtitle="Open and settled transactions between Long and Mei."/>
      {!debts.length ? <Empty icon={ReceiptText}>No debt transactions yet.</Empty> : <div className="debt-history">
        {debts.map(debt => <article key={debt.id} className="debt-row">
          <div className="debt-details"><h3>{debt.description}</h3>
            <div className="debt-direction"><Person id={debt.debtorId}/><span>owes</span><Person id={debt.creditorId}/></div>
            <p>Logged by {PEOPLE.find(person => person.id === debt.addedBy).name} · {timestamp(debt.createdAt)}</p>
          </div>
          <div className="debt-action"><strong>{money(debt.amount)}</strong>
            {debt.settledAt ? <span className="debt-paid"><Check size={15}/> Settled {timestamp(debt.settledAt)}</span>
              : <button className="btn secondary small" onClick={() => open({ kind: 'settle-debt', item: debt })}>Confirm payment</button>}
          </div>
        </article>)}
      </div>}
    </section>
  </>;
}
