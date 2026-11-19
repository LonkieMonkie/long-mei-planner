import { useState } from 'react';
import { DEFAULT_ACCENT, parseAccent } from './appearance.js';
import { FOLDER_KINDS, PEOPLE, categoryColor, decimalUnits, moveCategory, visibleFolders } from './model.js';
import { ActionForm } from './ui.jsx';

function toHsv(hex) {
  const [r, g, b] = hex.slice(1).match(/../g).map(channel => parseInt(channel, 16) / 255);
  const value = Math.max(r, g, b);
  const delta = value - Math.min(r, g, b);
  let hue = 0;
  if (delta && value === r) hue = (g - b) / delta;
  else if (delta && value === g) hue = (b - r) / delta + 2;
  else if (delta) hue = (r - g) / delta + 4;
  return { hue: (hue * 60 + 360) % 360, saturation: value ? delta / value : 0, value };
}

function toHex({ hue, saturation, value }) {
  const chroma = value * saturation;
  const secondary = chroma * (1 - Math.abs(hue / 60 % 2 - 1));
  const rgb = [[chroma, secondary, 0], [secondary, chroma, 0], [0, chroma, secondary],
    [0, secondary, chroma], [secondary, 0, chroma], [chroma, 0, secondary]][Math.floor(hue / 60)];
  return '#' + rgb.map(channel => Math.round(255 * (channel + value - chroma)).toString(16).padStart(2, '0')).join('');
}

function CategoryColorPicker({ initial }) {
  const [hsv, setHsv] = useState(() => toHsv(initial));
  const [draft, setDraft] = useState(initial);
  const preview = toHex(hsv);
  const angle = hsv.hue * Math.PI / 180;

  function changeHex(value) {
    setDraft(value);
    const parsed = parseAccent(value);
    if (parsed) setHsv(toHsv(parsed));
  }

  function changeWheel(next) {
    setHsv(next);
    setDraft(toHex(next));
  }

  function pick(event) {
    const { x, y, width, height } = event.currentTarget.getBoundingClientRect();
    const dx = event.clientX - x - width / 2;
    const dy = event.clientY - y - height / 2;
    changeWheel({
      hue: (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360,
      saturation: Math.min(1, Math.hypot(dx, dy) / (width / 2)),
      value: hsv.value || 1,
    });
  }

  return <fieldset className="category-color-fields">
    <legend>Category color</legend>
    <div className="category-color-layout">
      <div className="color-wheel" aria-hidden="true" style={{ '--wheel-darkness': 1 - hsv.value }}
        onPointerDown={event => {
          if (event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          pick(event);
        }}
        onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) pick(event); }}>
        <span style={{ left: 50 + Math.cos(angle) * hsv.saturation * 50 + '%',
          top: 50 + Math.sin(angle) * hsv.saturation * 50 + '%', backgroundColor: preview }}/>
      </div>
      <div className="category-color-inputs">
        <label>Brightness<input type="range" min="0" max="100" value={Math.round(hsv.value * 100)}
          onChange={event => changeWheel({ ...hsv, value: Number(event.target.value) / 100 })}/></label>
        <div className="accent-custom">
          <label>Custom color<input type="color" value={preview} onChange={event => changeHex(event.target.value)}/></label>
          <label>Hex color<input name="color" value={draft} maxLength={7} autoComplete="off" spellCheck={false}
            onChange={event => changeHex(event.target.value)} required/></label>
        </div>
      </div>
    </div>
  </fieldset>;
}

export function CategoryForm({ item, state, done, close, me, folderId: startFolder }) {
  // Signed in, you only see and change your own rates; the other person's are kept as they are.
  const people = me ? PEOPLE.filter(person => person.id === me) : PEOPLE;
  const owner = item?.ownerId ?? me;
  const folders = owner ? visibleFolders(state, owner) : [];
  const [folderId, setFolderId] = useState(item ? item.folderId ?? '' : startFolder ?? '');
  const kind = folders.find(folder => folder.id === folderId)?.kind ?? null;
  return <ActionForm cancel={close} label={item ? 'Save category' : 'Add category'} onSave={fields => {
    const color = parseAccent(fields.color);
    if (!color) throw new Error('Enter a six-digit hex color.');
    const name = fields.name?.trim().replace(/\s+/g, ' ');
    if (!name) throw new Error('Enter a category name.');
    const savingsRates = { ...item?.savingsRates, ...Object.fromEntries(people.map(({ id }) => [id, decimalUnits(fields[id] || '0', 10_000)])) };
    const incomeShares = { ...item?.incomeShares, ...Object.fromEntries(people.map(({ id }) => [id, decimalUnits(fields['share-' + id] || '0', 10_000)])) };
    const update = { name, color, savingsRates, incomeShares, savingsGoalId: fields.savingsGoalId ?? item?.savingsGoalId };
    done(current => {
      const id = item?.id ?? crypto.randomUUID();
      let next = { ...current, categories: item
        ? current.categories.map(category => category.id === item.id ? { ...category, ...update } : category)
        : [...current.categories, { id, limit: 0, icon: 'tag', tone: 'indigo', ...update, ...(me ? { ownerId: me } : {}), order: Math.max(0, ...current.categories.map(c => c.order ?? 0)) + 1 }] };
      // Placing it in a folder goes through the same move as dragging, at the end of that folder.
      if (owner && (folderId || '') !== (item?.folderId ?? '')) next = moveCategory(next, id, folderId || null, Infinity);
      return next;
    }, item ? 'Category settings saved' : 'Category added');
  }}>
    <label>Category name<input name="name" autoFocus={!item} required maxLength={70} defaultValue={item?.name ?? ''} placeholder="e.g. Traveling"/></label>
    {owner && <label>Folder<select value={folderId} onChange={e => setFolderId(e.target.value)}>
      <option value="">Not in a folder</option>
      {folders.map(folder => <option key={folder.id} value={folder.id}>{folder.name} ({FOLDER_KINDS[folder.kind]?.name})</option>)}
    </select></label>}
    {kind === 'joint' ? <p className="field-help">In <b>Joint saving</b>, its income shares and expenses all go to the joint goal below.</p>
      : kind === 'saving' ? <p className="field-help">In a <b>Personal saving</b> folder, its income shares and expenses go to that folder.</p>
      : kind === 'checking' ? <p className="field-help">In a <b>Personal checking</b> folder, its expenses are paid from that folder.</p>
      : <p className="field-help">Outside folders, its expenses are paid from your paycheck folder.</p>}
    {!item && me && <p className="field-help">This category is private to you. Your partner sees what you spend in it, but not your budget for it.</p>}
    <CategoryColorPicker initial={item ? categoryColor(item) : DEFAULT_ACCENT}/>
    {kind !== 'joint' && kind !== 'saving' ? <div className="form-row">{people.map(person => <label key={person.id}>{me ? 'Your' : person.name} savings (%)
      <input type="number" name={person.id} min="0" max="100" step="0.01" defaultValue={(item?.savingsRates?.[person.id] ?? 0) / 100}/>
    </label>)}</div> : people.map(person => <input type="hidden" key={person.id} name={person.id} value={(item?.savingsRates?.[person.id] ?? 0) / 100}/>)}
    <div className="form-row">{people.map(person => <label key={person.id}>{me ? 'Your' : person.name} share of income (%)
      <input type="number" name={'share-' + person.id} min="0" max="100" step="0.01" defaultValue={(item?.incomeShares?.[person.id] ?? 0) / 100}/>
    </label>)}</div>
    {kind !== 'saving' && <label>Joint savings goal<select name="savingsGoalId" defaultValue={item?.savingsGoalId || state.goals[0]?.id}>
      {state.goals.map(goal => <option key={goal.id} value={goal.id}>{goal.name}</option>)}
    </select></label>}
    <p className="field-help">{kind === 'joint' || kind === 'saving' ? 'The folder decides where new entries go. Saved entries keep where they went.' : 'Savings rates apply to new expenses in this category.'} The share of income is suggested when {me ? 'you add' : 'that person adds'} income.</p>
  </ActionForm>;
}
