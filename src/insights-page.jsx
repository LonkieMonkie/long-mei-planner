import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, BarChart3, CalendarDays, ChevronLeft, ChevronRight, Minus, Receipt, Trophy } from 'lucide-react';
import { categoryColor, localDate, money, shortDate } from './model.js';
import { monthLabel, monthlyTrend, periodRange, periodSummary, shiftMonth } from './insights.js';
import { Empty, PanelHeading } from './ui.jsx';

// Income and spending colors for charts: checked for colorblind separation and contrast on the card.
const INCOME = '#2f78b7';
const SPENDING = '#e0762f';

const shortMoney = cents => {
  const dollars = cents / 100;
  if (Math.abs(dollars) >= 10_000) return '$' + (dollars / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 }) + 'K';
  return '$' + Math.round(dollars).toLocaleString('en-US');
};

export function Insights({ state }) {
  const thisMonth = localDate().slice(0, 7);
  const [mode, setMode] = useState('month');
  const [key, setKey] = useState(thisMonth);
  const period = periodRange(key);
  const now = periodSummary(state, key);
  const before = periodSummary(state, period.previous);
  const previousLabel = mode === 'month' ? monthLabel(period.previous, 'short') : period.previous;
  const latest = mode === 'month' ? thisMonth : thisMonth.slice(0, 4);
  function chooseMode(next) {
    setMode(next);
    setKey(next === 'year' ? key.slice(0, 4) : key.length === 4 ? (key === thisMonth.slice(0, 4) ? thisMonth : key + '-12') : key);
  }
  const step = by => setKey(mode === 'month' ? shiftMonth(key, by) : String(Number(key) + by));
  return <>
    <div className="insights-period" role="group" aria-label="Period">
      <div className="segmented period-mode"><button type="button" aria-pressed={mode === 'month'} onClick={() => chooseMode('month')}>Month</button><button type="button" aria-pressed={mode === 'year'} onClick={() => chooseMode('year')}>Year</button></div>
      <div className="month-switch">
        <button className="icon-btn" aria-label={`Previous ${mode}`} onClick={() => step(-1)}><ChevronLeft size={17}/></button>
        <strong>{period.label}</strong>
        <button className="icon-btn" aria-label={`Next ${mode}`} onClick={() => step(1)} disabled={key >= latest}><ChevronRight size={17}/></button>
      </div>
    </div>

    <div className="recap-grid">
      <RecapTile label="Income" value={now.income} previous={before.income} previousLabel={previousLabel} upIsGood/>
      <RecapTile label="Spending" value={now.spent} previous={before.spent} previousLabel={previousLabel} caption="Deposits to joint goals count as saved"/>
      <RecapTile label="Left over" value={now.net} previous={before.net} previousLabel={previousLabel} upIsGood caption="Income minus spending"/>
      <RecapTile label="Saved" value={now.toGoals + now.toMySavings} previous={before.toGoals + before.toMySavings} previousLabel={previousLabel} upIsGood
        caption={`${money(now.toGoals, true)} joint · ${money(now.toMySavings, true)} personal`}/>
    </div>

    <div className="insights-columns">
      <section className="card">
        <PanelHeading title="Where it went" subtitle={`Spending by category, ${period.label}`}/>
        {!now.categories.length ? <Empty icon={Receipt}>No spending logged for {period.label}.</Empty>
          : <ul className="where-bars">{now.categories.map(({ category, spent }) => <li key={category.id}>
            <div className="where-label"><span>{category.name}</span><span><b>{money(spent)}</b> · {Math.round(spent / now.spent * 100)}%</span></div>
            <div className="where-track"><span style={{ width: `${Math.max(2, spent / now.categories[0].spent * 100)}%`, background: categoryColor(category) }}/></div>
          </li>)}</ul>}
      </section>
      <section className="card">
        <PanelHeading title={`Compared with ${previousLabel}`} subtitle="Spending by category, this period against the one before"/>
        <Comparison state={state} now={now} before={before}/>
      </section>
    </div>

    <TrendCard state={state} mode={mode} periodKey={key}/>
    <Highlights now={now} label={period.label}/>
  </>;
}

function Delta({ value, previous, previousLabel, upIsGood }) {
  const change = value - previous;
  if (!previous && !value) return <small className="delta">No activity in either period</small>;
  if (!change) return <small className="delta"><Minus size={13}/> Same as {previousLabel}</small>;
  const good = upIsGood ? change > 0 : change < 0;
  const Icon = change > 0 ? ArrowUpRight : ArrowDownRight;
  return <small className={`delta ${good ? 'good' : 'bad'}`}><Icon size={13} aria-hidden="true"/>{change > 0 ? '+' : '−'}{money(Math.abs(change), true)} vs {previousLabel}</small>;
}

function RecapTile({ label, value, previous, previousLabel, upIsGood = false, caption }) {
  return <article className="card recap-tile">
    <p>{label}</p><strong>{value < 0 ? '−' : ''}{money(Math.abs(value))}</strong>
    <Delta {...{ value, previous, previousLabel, upIsGood }}/>
    {caption && <small className="recap-caption">{caption}</small>}
  </article>;
}

function Comparison({ state, now, before }) {
  const rows = state.categories
    .map(category => ({ category, now: now.byCategory.get(category.id) ?? 0, before: before.byCategory.get(category.id) ?? 0 }))
    .filter(row => row.now || row.before)
    .sort((a, b) => Math.abs(b.now - b.before) - Math.abs(a.now - a.before));
  if (!rows.length) return <Empty icon={BarChart3}>No spending in either period yet.</Empty>;
  return <div className="table-scroll"><table className="compare-table">
    <thead><tr><th scope="col">Category</th><th scope="col">Now</th><th scope="col">Before</th><th scope="col">Change</th></tr></thead>
    <tbody>{rows.map(row => {
      const change = row.now - row.before;
      const Icon = change > 0 ? ArrowUpRight : change < 0 ? ArrowDownRight : Minus;
      return <tr key={row.category.id}>
        <td><span className="compare-name"><i style={{ background: categoryColor(row.category) }} aria-hidden="true"/>{row.category.name}</span></td>
        <td>{money(row.now)}</td><td>{money(row.before)}</td>
        <td className="change"><span><Icon size={13} aria-hidden="true"/>{change ? (change > 0 ? '+' : '−') + money(Math.abs(change)) : 'Same'}</span></td>
      </tr>;
    })}</tbody>
  </table></div>;
}

function useWidth(ref) {
  const [width, setWidth] = useState(600);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return width;
}

const niceStep = max => {
  const raw = max / 4;
  const power = 10 ** Math.floor(Math.log10(raw || 1));
  return [1, 2, 2.5, 5, 10].map(n => n * power).find(n => n >= raw);
};

function TrendCard({ state, mode, periodKey }) {
  const [span, setSpan] = useState(6);
  const months = mode === 'year' ? 12 : span;
  const end = mode === 'year' ? periodKey + '-12' : periodKey;
  const rows = monthlyTrend(state, end, months);
  const hasData = rows.some(row => row.income || row.spent);
  return <section className="card">
    <PanelHeading title="Income and spending over time" subtitle={mode === 'year' ? `Each month of ${periodKey}` : `The ${span} months up to ${monthLabel(periodKey)}`}
      action={mode === 'month' && <div className="segmented small-segmented" aria-label="How many months"><button type="button" aria-pressed={span === 6} onClick={() => setSpan(6)}>6 months</button><button type="button" aria-pressed={span === 12} onClick={() => setSpan(12)}>12 months</button></div>}/>
    <div className="chart-legend"><span><i style={{ background: INCOME }}/>Income</span><span><i style={{ background: SPENDING }}/>Spending</span></div>
    {hasData ? <TrendChart rows={rows}/> : <Empty icon={BarChart3}>Nothing logged in these months yet.</Empty>}
    {hasData && <details className="chart-table"><summary>View as table</summary><div className="table-scroll"><table className="compare-table">
      <thead><tr><th scope="col">Month</th><th scope="col">Income</th><th scope="col">Spending</th><th scope="col">Left over</th></tr></thead>
      <tbody>{rows.map(row => <tr key={row.month}><td>{monthLabel(row.month, 'short')}</td><td>{money(row.income)}</td><td>{money(row.spent)}</td><td>{row.income - row.spent < 0 ? '−' : ''}{money(Math.abs(row.income - row.spent))}</td></tr>)}</tbody>
    </table></div></details>}
  </section>;
}

function TrendChart({ rows }) {
  const box = useRef(null);
  const width = useWidth(box);
  const [hover, setHover] = useState(null);
  const height = 240, top = 12, bottom = 28, left = 52, right = 8;
  const plotW = Math.max(120, width - left - right), plotH = height - top - bottom;
  const max = Math.max(1, ...rows.flatMap(row => [row.income, row.spent]));
  const stepSize = niceStep(max);
  const ticks = Array.from({ length: Math.ceil(max / stepSize) + 1 }, (_, i) => i * stepSize);
  const yMax = ticks[ticks.length - 1];
  const y = value => top + plotH - value / yMax * plotH;
  const band = plotW / rows.length;
  const barW = Math.max(3, Math.min(24, (band * 0.72 - 2) / 2));
  const bar = (x, value) => {
    if (!value) return '';
    const h = Math.max(2, plotH - (y(value) - top)), r = Math.min(4, barW / 2, h);
    const yt = top + plotH - h;
    return `M${x} ${top + plotH}V${yt + r}Q${x} ${yt} ${x + r} ${yt}H${x + barW - r}Q${x + barW} ${yt} ${x + barW} ${yt + r}V${top + plotH}Z`;
  };
  const showLabels = band >= 34 ? 1 : band >= 20 ? 2 : 3;
  useEffect(() => setHover(null), [rows.length]);
  const active = hover === null ? null : rows[hover];
  return <div className="trend-chart" ref={box} onPointerLeave={() => setHover(null)}>
    <svg width={width} height={height} role="img" aria-label="Income and spending by month. The table below lists every value.">
      {ticks.map(tick => <g key={tick}>
        <line x1={left} x2={left + plotW} y1={y(tick)} y2={y(tick)} className="chart-grid"/>
        <text x={left - 8} y={y(tick) + 4} textAnchor="end" className="chart-tick">{shortMoney(tick)}</text>
      </g>)}
      {rows.map((row, i) => {
        const x0 = left + i * band + (band - (barW * 2 + 2)) / 2;
        return <g key={row.month} className={hover === null || hover === i ? 'trend-group' : 'trend-group dim'}>
          <path d={bar(x0, row.income)} fill={INCOME}/>
          <path d={bar(x0 + barW + 2, row.spent)} fill={SPENDING}/>
          {i % showLabels === 0 && <text x={left + i * band + band / 2} y={height - 8} textAnchor="middle" className="chart-tick">{monthLabel(row.month, 'short').split(' ')[0]}</text>}
          <rect x={left + i * band} y={top} width={band} height={plotH} fill="transparent" tabIndex={0}
            aria-label={`${monthLabel(row.month)}: income ${money(row.income)}, spending ${money(row.spent)}`}
            onPointerMove={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}/>
        </g>;
      })}
      <line x1={left} x2={left + plotW} y1={top + plotH} y2={top + plotH} className="chart-axis"/>
    </svg>
    {active && <div className="chart-tooltip" role="status" style={{ left: Math.min(Math.max(left + hover * band + band / 2, 90), width - 90) }}>
      <span className="tooltip-title">{monthLabel(active.month)}</span>
      <span><i style={{ background: INCOME }}/><b>{money(active.income)}</b> income</span>
      <span><i style={{ background: SPENDING }}/><b>{money(active.spent)}</b> spending</span>
      <span className="tooltip-net">{active.income - active.spent < 0 ? '−' : ''}{money(Math.abs(active.income - active.spent))} left over</span>
    </div>}
  </div>;
}

function Highlights({ now, label }) {
  const savedShare = now.income ? Math.round((now.toGoals + now.toMySavings) / now.income * 100) : null;
  const items = [
    now.biggest && { Icon: Receipt, title: 'Biggest expense', value: money(now.biggest.amount), note: `${now.biggest.source} · ${shortDate(now.biggest.date)}` },
    now.categories[0] && { Icon: Trophy, title: 'Top category', value: now.categories[0].category.name, note: `${money(now.categories[0].spent)} · ${Math.round(now.categories[0].spent / now.spent * 100)}% of spending` },
    now.busiestDay && { Icon: CalendarDays, title: 'Biggest spending day', value: shortDate(now.busiestDay.date), note: `${money(now.busiestDay.amount)} spent` },
    { Icon: BarChart3, title: 'Saved from income', value: savedShare === null ? '—' : `${savedShare}%`, note: `${now.count} ${now.count === 1 ? 'entry' : 'entries'} logged` },
  ].filter(Boolean);
  return <section className="card">
    <PanelHeading title={`${label} highlights`} subtitle="A quick recap to look back on together"/>
    <div className="highlights">{items.map(({ Icon, title, value, note }) => <article key={title}>
      <span className="icon-tile indigo"><Icon size={17}/></span>
      <div><p>{title}</p><strong>{value}</strong><small>{note}</small></div>
    </article>)}</div>
  </section>;
}
