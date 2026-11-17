export const DEFAULT_ACCENT = '#4c8363';
export const LEGACY_ACCENT = '#5744c5';

export function parseAccent(value) {
  if (typeof value !== 'string') return null;
  const hex = value.trim().replace(/^#/, '').toLowerCase();
  return /^[0-9a-f]{6}$/.test(hex) ? '#' + hex : null;
}

function luminance(rgb) {
  return rgb.reduce((sum, channel, index) => {
    const value = channel / 255;
    const linear = value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    return sum + linear * [0.2126, 0.7152, 0.0722][index];
  }, 0);
}

export function accentStyles(value) {
  const accent = parseAccent(value) ?? DEFAULT_ACCENT;
  let rgb = accent.slice(1).match(/../g).map(channel => parseInt(channel, 16));
  // Keep accent text readable on both white and lightly tinted backgrounds.
  while (luminance(rgb) > 0.14) rgb = rgb.map(channel => Math.floor(channel * 0.94));
  return { '--accent-choice': accent, '--color-accent': `rgb(${rgb.join(' ')})` };
}
