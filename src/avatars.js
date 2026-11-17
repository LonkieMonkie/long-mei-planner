// Profile pictures, kept small: each photo is cropped to a square and shrunk to a JPEG data URL
// of a few kilobytes. With sync on they live in their own document (planner/avatars) so the
// main planner document stays small; without sync they stay in this browser.
import { PEOPLE } from './model.js';

export const AVATAR_KEY = 'our-little-life.avatars';
const MAX_LENGTH = 150_000;
const SIZE = 192;

export const isAvatar = url => typeof url === 'string' && url.length <= MAX_LENGTH && /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(url);

export function cleanAvatars(raw) {
  return Object.fromEntries(PEOPLE.map(({ id }) => [id, raw?.[id]]).filter(([, url]) => isAvatar(url)));
}

export function readLocalAvatars(storage) {
  try { return cleanAvatars(JSON.parse(storage.getItem(AVATAR_KEY) ?? '{}')); } catch { return {}; }
}

async function decode(file) {
  if (window.createImageBitmap) {
    try { return await createImageBitmap(file); } catch { /* Fall back to an <img>, which some browsers decode more widely. */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally { URL.revokeObjectURL(url); }
}

export async function imageToAvatar(file) {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file, such as a JPG or PNG.');
  let image;
  try { image = await decode(file); } catch { throw new Error('That image couldn’t be read. Try a JPG or PNG.'); }
  const side = Math.min(image.width, image.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const context = canvas.getContext('2d');
  context.fillStyle = '#fff'; // Transparent PNGs get a white background instead of black.
  context.fillRect(0, 0, SIZE, SIZE);
  context.drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
  for (const quality of [0.86, 0.72, 0.58]) {
    const url = canvas.toDataURL('image/jpeg', quality);
    if (isAvatar(url)) return url;
  }
  throw new Error('That image is too detailed to use. Try a different photo.');
}
