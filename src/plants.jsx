// Long and Mei as two potted plants: a dragon tree and a plum blossom.
// All motion lives in style.css under "Plant mascots".

const LEAF = 'M0 0C-10 -22 -7 -52 0 -74C7 -52 10 -22 0 0Z';
const dragonLeaves = [
  { angle: -72, scale: .78, fill: '#7bb38d' }, { angle: 72, scale: .78, fill: '#7bb38d' },
  { angle: -46, scale: .92, fill: '#5f9c76' }, { angle: 48, scale: .92, fill: '#5f9c76' },
  { angle: -21, scale: 1, fill: '#4c8363' }, { angle: 23, scale: 1, fill: '#4c8363' },
  { angle: 0, scale: 1.06, fill: '#6aa881' },
];
const blossoms = [{ x: 70, y: 46, size: 1 }, { x: 109, y: 75, size: .82 }, { x: 43, y: 67, size: .7 }];
const petalAngles = [0, 72, 144, 216, 288];

function DragonTree() {
  return <>
    <path d="M80 134C78 117 82 106 80 92" fill="none" stroke="#8a6b4f" strokeWidth="7" strokeLinecap="round"/>
    {dragonLeaves.map(({ angle, scale, fill }, index) => <g key={angle} transform={`translate(80 94) rotate(${angle}) scale(${scale})`}>
      <path className="plant-leaf" d={LEAF} fill={fill} style={{ animationDelay: `${index * -0.7}s` }}/>
    </g>)}
  </>;
}

function PlumBlossom() {
  return <>
    <g fill="none" stroke="#8a6b4f" strokeLinecap="round">
      <path d="M80 134C80 113 70 101 66 79C64 68 66 59 70 50" strokeWidth="6"/>
      <path d="M72 101C84 95 97 92 107 79" strokeWidth="5"/>
      <path d="M67 85C58 83 51 80 45 71" strokeWidth="4"/>
    </g>
    <ellipse cx="88" cy="108" rx="10" ry="5.5" fill="#6aa881" transform="rotate(-32 88 108)"/>
    <ellipse cx="57" cy="98" rx="9" ry="5" fill="#5f9c76" transform="rotate(38 57 98)"/>
    <ellipse cx="90" cy="62" rx="5" ry="6.5" fill="#f3a9b8"/>
    {blossoms.map(({ x, y, size }, index) => <g key={x} transform={`translate(${x} ${y}) scale(${size})`}>
      <g className="plant-blossom" style={{ animationDelay: `${index * -1.3}s` }}>
        {petalAngles.map(angle => <circle key={angle} r="8" cx="0" cy="-9" fill="#f6b6c3" transform={`rotate(${angle})`}/>)}
        <circle r="4.5" fill="#f6d98b"/>
      </g>
    </g>)}
    <ellipse className="plant-petal" cx="104" cy="84" rx="4" ry="2.6" fill="#f6b6c3"/>
  </>;
}

const kinds = {
  long: { name: 'Long', Foliage: DragonTree, pot: '#e09a7c', rim: '#d2866a' },
  mei: { name: 'Mei', Foliage: PlumBlossom, pot: '#f3d488', rim: '#e6c063' },
};

export function Plant({ who }) {
  const { Foliage, pot, rim } = kinds[who];
  return <svg className={`plant plant-${who}`} viewBox="0 0 160 210" aria-hidden="true">
    <g className="plant-body">
      <g className="plant-foliage"><Foliage/></g>
      <path d="M46 142H114L106 196Q105 204 96 204H64Q55 204 54 196Z" fill={pot}/>
      <rect x="38" y="128" width="84" height="18" rx="9" fill={rim}/>
      <ellipse className="plant-eye" cx="68" cy="167" rx="3.6" ry="4.2" fill="#3b2f2a"/>
      <ellipse className="plant-eye" cx="92" cy="167" rx="3.6" ry="4.2" fill="#3b2f2a"/>
      <path d="M74 175Q80 181 86 175" fill="none" stroke="#3b2f2a" strokeWidth="2.6" strokeLinecap="round"/>
      <circle cx="59" cy="176" r="5.5" fill="#f08fa0" opacity=".55"/>
      <circle cx="101" cy="176" r="5.5" fill="#f08fa0" opacity=".55"/>
    </g>
  </svg>;
}

export function PlantPair({ mini = false }) {
  return <div className={mini ? 'plant-pair mini' : 'plant-pair'} aria-hidden="true">
    <Plant who="long"/>
    {!mini && <svg className="plant-heart" viewBox="0 0 24 24"><path d="M12 21C5 15.5 2.5 12 2.5 8.4A4.9 4.9 0 0 1 12 6.2a4.9 4.9 0 0 1 9.5 2.2C21.500 12 19 15.500 12 21Z" fill="#f08fa0"/></svg>}
    <Plant who="mei"/>
    {!mini && <span className="plant-ground"/>}
  </div>;
}
