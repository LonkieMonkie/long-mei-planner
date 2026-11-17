// Pure helpers for the savings tree: tree settings, height, and the sky for a given time.

export const TREE_KINDS = [
  { id: 'cherry', name: 'Cherry blossom' },
  { id: 'oak', name: 'Oak' },
  { id: 'maple', name: 'Maple' },
  { id: 'pine', name: 'Pine' },
];
export const DEFAULT_TREE = { kind: 'cherry', perMeter: 100_000 };
export const MAX_TREE_METERS = 400;

export function normalizeTree(tree) {
  const kind = TREE_KINDS.some(item => item.id === tree?.kind) ? tree.kind : DEFAULT_TREE.kind;
  const perMeter = Number.isSafeInteger(tree?.perMeter) && tree.perMeter >= 100 ? tree.perMeter : DEFAULT_TREE.perMeter;
  return { kind, perMeter };
}

// One meter of tree for every `perMeter` cents in the joint balance.
export const treeMeters = (balance, perMeter) => Math.min(MAX_TREE_METERS, Math.max(0, balance / perMeter));

// Approximate sunrise and sunset in local clock hours for a mid-northern latitude.
export function sunTimes(date) {
  const year = date.getFullYear();
  const dayOfYear = Math.round((new Date(year, date.getMonth(), date.getDate()) - new Date(year, 0, 1)) / 86_400_000) + 1;
  const daylight = 12 + 2.8 * Math.cos(2 * Math.PI * (dayOfYear - 172) / 365);
  const offsets = [new Date(year, 0, 1), new Date(year, 6, 1)].map(day => day.getTimezoneOffset());
  const noon = date.getTimezoneOffset() < Math.max(...offsets) ? 13 : 12;
  return { sunrise: noon - daylight / 2, sunset: noon + daylight / 2 };
}

const NIGHT = ['#0f1b3d', '#27325f', 1];
const DAY = ['#7cc4ee', '#dcf1fb', 0];
const rgb = hex => hex.slice(1).match(/../g).map(part => parseInt(part, 16));
const mix = (a, b, t) => 'rgb(' + rgb(a).map((channel, i) => Math.round(channel + (rgb(b)[i] - channel) * t)).join(' ') + ')';

export function skyAt(date) {
  const { sunrise, sunset } = sunTimes(date);
  const hour = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
  const stops = [
    [0, ...NIGHT], [sunrise - 1.2, ...NIGHT],
    [sunrise - 0.3, '#3a4a7a', '#f4a98a', .55], [sunrise + 0.5, '#8ec5e8', '#ffd9a8', .1],
    [sunrise + 1.8, ...DAY], [sunset - 1.8, ...DAY],
    [sunset - 0.4, '#6f9fd8', '#ffc48a', .05], [sunset + 0.2, '#51508f', '#f58a6b', .3],
    [sunset + 1.1, '#232a5c', '#6a5a8e', .7], [sunset + 2, ...NIGHT], [24, ...NIGHT],
  ];
  const next = Math.max(1, stops.findIndex(stop => stop[0] > hour));
  const [from, to] = [stops[next - 1], stops[next]];
  const t = Math.min(1, Math.max(0, (hour - from[0]) / (to[0] - from[0])));
  const arc = progress => ({ x: 8 + 84 * progress, y: 82 - 66 * Math.sin(Math.PI * progress) });
  const dayProgress = (hour - sunrise) / (sunset - sunrise);
  const nightLength = 24 - (sunset - sunrise);
  const nightProgress = ((hour - sunset + 24) % 24) / nightLength;
  return {
    top: mix(from[1], to[1], t), bottom: mix(from[2], to[2], t), night: from[3] + (to[3] - from[3]) * t,
    sun: dayProgress > -0.06 && dayProgress < 1.06 ? arc(dayProgress) : null,
    moon: nightProgress > 0.04 && nightProgress < 0.96 ? arc(nightProgress) : null,
  };
}
