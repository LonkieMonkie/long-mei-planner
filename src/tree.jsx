import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronsDown, ChevronsUp } from 'lucide-react';
import { money } from './model.js';
import { PanelHeading } from './ui.jsx';
import { TREE_KINDS, skyAt, treeMeters } from './tree-model.js';

const W = 400, CX = 200, PX = 110, GROUND = 70, SKY_PAD = 150, MIN_H = 470;
const LOOKS = {
  cherry: { trunk: '#5e3d33', bark: '#8a5e4c', leaves: ['#e57fa4', '#f49bb9', '#f9bccf', '#fde2ea'], dots: '#ffffff', fall: '#f7b6c8', spread: 76, wide: 1.3, bend: .22 },
  oak: { trunk: '#5a4230', bark: '#84664a', leaves: ['#3f7d4a', '#5a9a57', '#7ab56b', '#a9d58f'], dots: '#d3ecb4', spread: 82, wide: 1.36, bend: .12 },
  maple: { trunk: '#553a2c', bark: '#7d5a44', leaves: ['#b8402a', '#dc5f33', '#ef8a3c', '#f8c063'], dots: '#fde3a0', fall: '#e8743b', spread: 66, wide: 1.12, bend: .34 },
  pine: { trunk: '#6b4a35', bark: '#8a654b', leaves: ['#2f6b4f', '#3b7d5c', '#285c44'], cone: true },
};
const CLOUD_BANK = [[-330, 6, 46], [-270, 30, 56], [-205, 8, 44], [-150, -6, 30], [250, 2, 40], [305, 26, 54], [370, 4, 46], [440, 22, 38], [-420, 20, 40]];
const GRASS = Array.from({ length: 70 }, (_, i) => [(i - 35) * 17 + rnd(i, 15) * 12, 7 + rnd(i, 16) * 9, (rnd(i, 17) - .5) * 10]);
const FALLEN = Array.from({ length: 26 }, (_, i) => [(rnd(i, 18) - .5) * 560, 10 + rnd(i, 19) * 48, rnd(i, 20) * 180]);
const grassDip = dx => dx * dx / 5200;
const SPARKLES = [[14, 22, 0], [72, 14, 1.4], [86, 46, 2.3], [30, 58, .8], [58, 34, 3.1], [8, 70, 1.9]];
const STARS = Array.from({ length: 34 }, (_, i) => ({ x: rnd(i, 1) * 100, y: rnd(i, 2) * 72, r: 1 + rnd(i, 3) * 1.6 }));

function rnd(k, salt) {
  const x = Math.sin(k * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}
const clamp = (value, low = 0, high = 1) => Math.min(high, Math.max(low, value));

// Animates the drawn height toward the saved height so the tree visibly grows.
function useGrowth(target) {
  const [shown, setShown] = useState(0);
  const current = useRef(0);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { current.current = target; setShown(target); return; }
    const from = current.current, start = performance.now();
    let frame = requestAnimationFrame(function step(now) {
      const t = clamp((now - start) / 1600);
      current.current = from + (target - from) * (1 - (1 - t) ** 3);
      setShown(current.current);
      if (t < 1) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [target]);
  return shown;
}

function branchesFor(h, groundY, canopyBottom, baseW, topW, trunkTop) {
  const list = [];
  for (let k = 1; k < h + 1; k++) {
    const at = k - 0.62 + rnd(k, 4) * 0.3;
    const y = groundY - at * PX;
    if (y < canopyBottom + 14) break;
    const side = k % 2 ? 1 : -1;
    const grown = clamp((y - canopyBottom - 14) / 40);
    const half = (topW + (baseW - topW) * (y - trunkTop) / Math.max(1, groundY - trunkTop)) / 2;
    const length = (44 + rnd(k, 5) * 34 + Math.min(46, (h - at) * 7)) * grown;
    list.push({ k, side, y, x: CX + side * (half - 1), length, lift: 16 + rnd(k, 6) * 16, grown });
  }
  return list;
}

// The crown: limbs fan out from the upper trunk and each carries its own puff of leaves,
// so the branches stay visible between the foliage.
function crownFor(look, R, base, crownH, topW) {
  const fractions = R < 20 ? [-1, 0, 1] : R < 46 ? [-1, -.5, 0, .5, 1] : [-1, -.68, -.36, 0, .36, .68, 1];
  return fractions.map((f, i) => {
    const angle = (f * look.spread + (rnd(i, 11) - .5) * 9) * Math.PI / 180;
    const sx = CX + f * topW * .3, sy = base - (1 - Math.abs(f)) * crownH * .42;
    const ex = CX + Math.sin(angle) * R * look.wide * (.86 + rnd(i, 12) * .16);
    const ey = base - crownH * (.26 + .62 * Math.cos(angle) ** 1.2);
    return {
      i, f, sx, sy, ex, ey, size: R / 96 * (.64 + rnd(i, 13) * .2), width: Math.max(1.8, topW * (.66 - Math.abs(f) * .2)),
      cx: sx + (ex - sx) * (.55 - look.bend * .4), cy: sy - (sy - ey) * (.12 + look.bend * .8), outer: Math.abs(f) > .3,
    };
  });
}

// A spray is one bough's worth of foliage: shadowed dabs underneath, lighter ones on the
// sunlit top. Three variants are defined once and reused across the whole tree.
function sprayDabs(seed) {
  const dabs = [];
  const within = x => Math.sqrt(Math.max(0, 1 - (x / 62) ** 2));
  for (let i = 0; i < 9; i++) dabs.push({ x: (rnd(i, seed) - .5) * 96, y: 7 + (rnd(i, seed + 1) - .5) * 16, r: 13 + rnd(i, seed + 2) * 7, shade: 0 });
  for (let i = 0; i < 26; i++) { const x = (rnd(i, seed + 3) - .5) * 116; dabs.push({ x, y: (rnd(i, seed + 4) - .55) * 38 * within(x), r: 6.5 + rnd(i, seed + 5) * 4, shade: 1 + i % 2 }); }
  for (let i = 0; i < 16; i++) { const x = (rnd(i, seed + 6) - .5) * 100 - 6; dabs.push({ x, y: (-5 - rnd(i, seed + 7) * 17) * within(x), r: 3.6 + rnd(i, seed + 8) * 2.6, shade: 3 }); }
  for (let i = 0; i < 6; i++) { const x = (rnd(i, seed + 9) - .5) * 90; dabs.push({ x, y: (rnd(i, seed + 10) - .7) * 26 * within(x), r: 1.7, shade: 4 }); }
  return dabs;
}
const SPRAYS = [21, 47, 83].map(sprayDabs);

// All dabs of one shade are drawn as a single path, so each cluster is a handful of elements
// instead of dozens of circles. That keeps the page light enough for phones.
const circlePath = ({ x, y, r }) => `M${(x - r).toFixed(1)} ${y.toFixed(1)}a${r.toFixed(1)} ${r.toFixed(1)} 0 1 0 ${(2 * r).toFixed(1)} 0a${r.toFixed(1)} ${r.toFixed(1)} 0 1 0 ${(-2 * r).toFixed(1)} 0`;
const byShade = (dabs, shadeOf) => [0, 1, 2, 3, 4].map(shade => dabs.filter(dab => shadeOf(dab) === shade).map(circlePath).join('')).map((d, shade) => [shade, d]).filter(([, d]) => d);

function SprayDefs({ look }) {
  const fills = [...look.leaves, look.dots];
  return <defs>
    {SPRAYS.map((dabs, v) => <g id={`tree-spray-${v}`} key={v}>{byShade(dabs, dab => dab.shade).map(([shade, d]) => <path key={shade} d={d} fill={fills[shade]}/>)}</g>)}
    <g id="tree-spray-back">{byShade(SPRAYS[0].filter(dab => dab.shade < 3), dab => Math.min(1, dab.shade)).map(([shade, d]) => <path key={shade} d={d} fill={fills[shade]}/>)}</g>
    <linearGradient id="tree-hill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#a9d77c"/><stop offset=".35" stopColor="#7fbf6c"/><stop offset="1" stopColor="#5fa564"/></linearGradient>
  </defs>;
}
const Spray = ({ x, y, scale, v, tilt = 0 }) => <use href={`#tree-spray-${v}`} transform={`translate(${x} ${y}) rotate(${tilt}) scale(${scale})`}/>;

function Bird({ x, y, side }) {
  return <g transform={`translate(${x} ${y}) scale(${-side} 1)`}>
    <g className="tree-bird">
      <path d="M-7 -6L-17 -9L-9 -2Z" fill="#4d6f93"/>
      <ellipse cx="0" cy="-7" rx="9" ry="7" fill="#6289b3"/>
      <ellipse cx="2" cy="-5" rx="6" ry="4.6" fill="#fbe9d3"/>
      <circle cx="7" cy="-13" r="5.2" fill="#6289b3"/>
      <path d="M11.5 -14L16.5 -12.5L11.5 -11Z" fill="#f0a23c"/>
      <circle cx="8.5" cy="-14" r="1.1" fill="#2f3b32"/>
      <path d="M-1 0v3M3 0v3" stroke="#f0a23c" strokeWidth="1.3" strokeLinecap="round"/>
    </g>
  </g>;
}

export function SavingsTree({ balance, tree }) {
  const look = LOOKS[tree.kind];
  const target = treeMeters(balance, tree.perMeter);
  const h = useGrowth(target);
  const scroller = useRef(null);
  const drag = useRef(null);
  const [now, setNow] = useState(() => new Date());
  const [bird, setBird] = useState(null);
  const sky = useMemo(() => skyAt(now), [now]);

  // Layout uses the saved height so the scene does not resize while the tree grows.
  const nextMeter = Math.floor(target + 1e-9) + 1;
  const totalH = Math.max(MIN_H, GROUND + Math.max(target, nextMeter) * PX + SKY_PAD);
  const groundY = totalH - GROUND;
  const treeTop = groundY - h * PX;
  const R = Math.min(14 + 110 * (1 - Math.exp(-h / 3)), h * PX * (look.cone ? .3 : .4));
  const canopyH = look.cone ? R * 2.6 : R * 1.9;
  const trunkTop = look.cone ? treeTop + R * .5 : treeTop + canopyH;
  const canopyBottom = treeTop + canopyH;
  const baseW = h ? 7 + 58 * (1 - Math.exp(-h / 6)) : 0;
  const topW = Math.max(3, baseW * .42);
  const crown = look.cone ? [] : crownFor(look, R, trunkTop, canopyH - R * .2, topW);
  const branches = branchesFor(h, groundY, canopyBottom, baseW, topW, trunkTop);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const scrollToMeters = (meters, smooth) => {
    const el = scroller.current;
    const scale = el.scrollHeight / totalH;
    el.scrollTo({ top: Math.max(0, (groundY - meters * PX - 120) * scale), behavior: smooth ? 'smooth' : 'auto' });
  };
  // Start at the treetop, and follow it when the balance changes.
  useLayoutEffect(() => { scrollToMeters(target, false); measure(); }, [target, tree.kind]);

  // Which part of the scene is on screen, in drawing units. Branches and meter lines are only
  // drawn within a screen's height of it, so a very tall tree stays light.
  const [view, setView] = useState(null);
  const frame = useRef(0);
  function measure() {
    const el = scroller.current;
    if (!el) return;
    const scale = el.scrollHeight / totalH;
    setView({ top: el.scrollTop / scale, bottom: (el.scrollTop + el.clientHeight) / scale });
  }
  const onScroll = () => { cancelAnimationFrame(frame.current); frame.current = requestAnimationFrame(measure); };
  useEffect(() => {
    window.addEventListener('resize', onScroll);
    return () => { window.removeEventListener('resize', onScroll); cancelAnimationFrame(frame.current); };
  }, [totalH]);
  const span = view ? view.bottom - view.top : 900;
  const near = y => view ? y > view.top - span - 60 && y < view.bottom + span + 60 : y > treeTop - 900 && y < treeTop + 1800;

  // A bird lands now and then on a branch that is on screen.
  const perches = useRef([]);
  perches.current = branches.filter(branch => branch.grown === 1);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = setInterval(() => setBird(current => {
      if (current || Math.random() < .35) return null;
      const el = scroller.current;
      const scale = el.scrollHeight / totalH;
      const seen = perches.current.filter(branch => branch.y * scale > el.scrollTop + 40 && branch.y * scale < el.scrollTop + el.clientHeight - 40);
      const pick = seen[Math.floor(Math.random() * seen.length)];
      return pick ? { k: pick.k, id: Date.now() } : { k: 0, id: Date.now() };
    }), 8000);
    return () => clearInterval(timer);
  }, [totalH]);
  const perch = bird && (bird.k ? branches.find(branch => branch.k === bird.k) : h >= .5 ? { top: true } : null);

  const pointer = {
    onPointerDown: event => { if (event.pointerType === 'mouse') { drag.current = { y: event.clientY, top: scroller.current.scrollTop }; event.currentTarget.setPointerCapture(event.pointerId); } },
    onPointerMove: event => { if (drag.current) scroller.current.scrollTop = drag.current.top - (event.clientY - drag.current.y); },
    onPointerUp: () => { drag.current = null; }, onPointerCancel: () => { drag.current = null; },
  };

  const kindName = TREE_KINDS.find(kind => kind.id === tree.kind).name;
  const toNext = nextMeter * tree.perMeter - balance;
  const summary = target
    ? `${target.toFixed(1)} m tall · ${money(Math.max(0, toNext))} to the next meter`
    : 'Add to your joint savings to plant it.';
  const lines = Array.from({ length: nextMeter }, (_, i) => i + 1);

  return <section className="card tree-card">
    <PanelHeading title={`Our ${kindName.toLowerCase()} tree`} subtitle={summary} action={<div className="calendar-controls">
      <button className="icon-btn bordered" aria-label="Go to the treetop" title="Treetop" onClick={() => scrollToMeters(target, true)}><ChevronsUp size={16}/></button>
      <button className="icon-btn bordered" aria-label="Go to the ground" title="Ground" onClick={() => scrollToMeters(-1e6, true)}><ChevronsDown size={16}/></button>
    </div>}/>
    <div className="tree-scene" style={{ '--sky-top': sky.top, '--sky-bottom': sky.bottom, '--night': sky.night }}>
      <div className="tree-sky" aria-hidden="true">
        <div className="tree-stars">{STARS.map((star, i) => <span key={i} style={{ left: star.x + '%', top: star.y + '%', width: star.r * 1.3, height: star.r * 1.3 }}/>)}</div>
        {sky.sun && <span className="tree-sun" style={{ left: sky.sun.x + '%', top: sky.sun.y + '%' }}/>}
        {sky.moon && <span className="tree-moon" style={{ left: sky.moon.x + '%', top: sky.moon.y + '%' }}/>}
        <span className="tree-cloud one"/><span className="tree-cloud two"/><span className="tree-cloud three"/>
      </div>
      <div className="tree-scroll" ref={scroller} onScroll={onScroll} tabIndex={0} role="img" aria-label={`${kindName} tree, ${target.toFixed(1)} meters tall. One meter for every ${money(tree.perMeter, true)} saved.`} {...pointer}>
        <svg className="tree-svg" viewBox={`0 0 ${W} ${totalH}`} preserveAspectRatio="xMidYMax meet">
          <SprayDefs look={look}/>
          <g className="tree-bank">{CLOUD_BANK.map(([dx, dy, r], i) => <circle key={i} cx={CX + dx} cy={groundY - dy} r={r} fill="#fff"/>)}</g>
          <ellipse cx={CX} cy={groundY + 600} rx="2600" ry="612" fill="url(#tree-hill)"/>
          {GRASS.map(([dx, height, lean], i) => <path key={i} d={`M${CX + dx - 3} ${groundY + grassDip(dx) + 4}Q${CX + dx + lean * .4} ${groundY + grassDip(dx) - height * .6} ${CX + dx + lean} ${groundY + grassDip(dx) - height}Q${CX + dx + lean * .7} ${groundY + grassDip(dx) - height * .4} ${CX + dx + 3} ${groundY + grassDip(dx) + 4}Z`} fill={i % 3 ? '#9ad27a' : '#84c46c'}/>)}
          {look.fall && target >= 1 && FALLEN.map(([dx, dy, turn], i) => <ellipse key={i} cx={CX + dx} cy={groundY + dy} rx="5" ry="2.6" fill={look.fall} transform={`rotate(${turn} ${CX + dx} ${groundY + dy})`}/>)}
          {h > 0 && <g className="tree-plant">
            <path d={`M${CX - baseW / 2 - baseW * .35} ${groundY + 4}Q${CX - baseW / 2} ${groundY - 2} ${CX - baseW / 2} ${groundY - baseW * .7}L${CX - topW / 2} ${trunkTop}H${CX + topW / 2}L${CX + baseW / 2} ${groundY - baseW * .7}Q${CX + baseW / 2} ${groundY - 2} ${CX + baseW / 2 + baseW * .35} ${groundY + 4}Z`} fill={look.trunk}/>
            <path d={`M${CX + baseW * .14} ${groundY - baseW * .5}L${CX + topW * .12} ${trunkTop}H${CX + topW * .36}L${CX + baseW * .36} ${groundY - baseW * .5}Z`} fill={look.bark} opacity=".3"/>
            {branches.filter(branch => near(branch.y)).map(branch => {
              const { k, side, x, y, length, lift } = branch;
              const ex = x + side * length, ey = y - lift * branch.grown;
              return <g key={k}>
                <path d={`M${x} ${y + 3}C${x + side * length * .4} ${y} ${x + side * length * .75} ${ey + 6} ${ex} ${ey}`} stroke={look.trunk} strokeWidth={3 + Math.min(5, baseW * .1)} strokeLinecap="round" fill="none"/>
                <g className="tree-tuft" style={{ transformOrigin: `${ex}px ${ey}px`, animationDelay: `${-rnd(k, 7) * 5}s` }}>
                  {look.cone
                    ? <ellipse cx={ex - side * length * .3} cy={ey + 5} rx={length * .62} ry={9 * branch.grown} fill={look.leaves[k % 3]} transform={`rotate(${-side * 12} ${ex} ${ey})`}/>
                    : <Spray x={ex - side * 6} y={ey - 6} scale={(.36 + rnd(k, 14) * .16) * branch.grown} v={k % 3} tilt={-side * 8}/>}
                </g>
              </g>;
            })}
            <g className="tree-canopy" style={{ transformOrigin: `${CX}px ${trunkTop}px` }}>
              {look.cone
                ? [0, 1, 2, 3].map(i => { const top = treeTop + i * R * .52, half = R * (.42 + i * .2); return <path key={i} d={`M${CX} ${top}L${CX + half} ${top + R * .95}Q${CX} ${top + R * 1.08} ${CX - half} ${top + R * .95}Z`} fill={look.leaves[i % 3]}/>; }).reverse()
                : <>
                  {crown.map(limb => <use key={'b' + limb.i} href="#tree-spray-back" transform={`translate(${limb.ex - limb.f * R * .12} ${limb.ey + 14 * limb.size}) scale(${limb.size * 1.05})`}/>)}
                  <path d={`M${CX - topW / 2} ${trunkTop + 1}L${CX} ${trunkTop - canopyH * .62}L${CX + topW / 2} ${trunkTop + 1}Z`} fill={look.trunk}/>
                  {crown.map(limb => <path key={limb.i} d={`M${limb.sx} ${limb.sy}Q${limb.cx} ${limb.cy} ${limb.ex} ${limb.ey}`} stroke={look.trunk} strokeWidth={limb.width} strokeLinecap="round" fill="none"/>)}
                  {crown.filter(limb => limb.outer && R > 40).map(limb => <Spray key={'m' + limb.i} x={(limb.sx + 2 * limb.cx + limb.ex) / 4} y={(limb.sy + 2 * limb.cy + limb.ey) / 4 - 16 * limb.size} scale={limb.size * .7} v={(limb.i + 1) % 3} tilt={limb.f * -8}/>)}
                  {crown.map(limb => <Spray key={limb.i} x={limb.ex} y={limb.ey - 10 * limb.size} scale={limb.size} v={limb.i % 3} tilt={limb.f * -10}/>)}
                  {R > 46 && [[-.4, .8], [.38, .84], [0, 1.02]].map(([dx, up], i) => <Spray key={'t' + i} x={CX + dx * R * look.wide} y={trunkTop - canopyH * up * .86} scale={R / 96 * .66} v={(i + 2) % 3}/>)}
                </>}
            </g>
            {perch && <Bird key={bird.id} x={perch.top ? CX + R * .1 : perch.x + perch.side * perch.length * .62} y={perch.top ? treeTop + (look.cone ? R * .62 : R * .12) : perch.y - perch.lift * .55} side={perch.top ? -1 : perch.side}/>}
          </g>}
          {lines.filter(m => near(groundY - m * PX)).map(m => {
            const y = groundY - m * PX, reached = m <= h + 1e-9, amount = money(m * tree.perMeter, true);
            return <g key={m} className={reached ? 'tree-line reached' : 'tree-line'}>
              <line x1="-900" x2="1300" y1={y} y2={y}/>
              <rect x="6" y={y - 11} width={String(m).length * 7 + 28} height="22" rx="11"/>
              <text x="16" y={y + 4.5}>{m} m</text>
              <rect x={W - 6 - (amount.length * 6.6 + 18)} y={y - 11} width={amount.length * 6.6 + 18} height="22" rx="11"/>
              <text x={W - 15} y={y + 4.5} textAnchor="end">{amount}</text>
            </g>;
          })}
          {!h && <g><ellipse cx={CX} cy={groundY + 2} rx="26" ry="9" fill="#8a6b4f"/><path d={`M${CX} ${groundY - 2}v-12`} stroke="#5d9960" strokeWidth="3" strokeLinecap="round"/><ellipse cx={CX + 6} cy={groundY - 16} rx="7" ry="4" fill="#77b06b" transform={`rotate(-30 ${CX + 6} ${groundY - 16})`}/></g>}
        </svg>
      </div>
      {look.fall && target >= 1 && <div className="tree-falling" aria-hidden="true">{[0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => <span key={i} style={{ left: 14 + rnd(i, 8) * 66 + '%', background: look.fall, animationDelay: `${-i * 1.4}s`, animationDuration: `${9 + rnd(i, 9) * 5}s` }}/>)}</div>}
      <div className="tree-dusk" aria-hidden="true"/>
      <div className="tree-sparkles" aria-hidden="true">{SPARKLES.map(([x, y, delay], i) => <span key={i} style={{ left: x + '%', top: y + '%', animationDelay: `${-delay}s` }}/>)}</div>
    </div>
    <p className="tree-hint">Scroll or drag to move up and down the tree. Each dotted line is one meter, or {money(tree.perMeter, true)} saved.</p>
  </section>;
}
