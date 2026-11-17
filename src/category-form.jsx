import { useState } from 'react';
import { DEFAULT_ACCENT, parseAccent } from './appearance.js';
import { PEOPLE, WEDDING_CATEGORY_ID, categoryColor, decimalUnits, isWeddingName } from './model.js';
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

export function CategoryForm({ item, state, done, close }) {
  const wedding = item?.id === WEDDING_CATEGORY_ID;
  return <ActionForm cancel={close} label={item ? 'Save category' : 'Add category'} onSave={fields => {
    const color = parseAccent(fields.color);
    if (!color) throw new Error('Enter a six-digit hex color.');
    const name = fields.name?.trim();
    if (!item && !name) throw new Error('Enter a category name.');
    if (!item && isWeddingName(name)) throw new Error('Wedding is already a permanent category.');
    const savingsRates = Object.fromEntries(PEOPLE.map(({ id }) => [id, decimalUnits(fields[id] || '0', 10_000)]));
    const update = { color, savingsRates, savingsGoalId: wedding ? item.savingsGoalId : fields.savingsGoalId };
    done(current => ({
      ...current,
      categories: item
        ? current.categories.map(category => category.id === item.id ? { ...category, ...update } : category)
        : [...current.categories, { id: crypto.randomUUID(), name, limit: 0, icon: 'tag', tone: 'indigo', ...update }],
    }), item ? 'Category settings saved' : 'Category added');
  }}>
    {!item && <label>Category name<input name="name" autoFocus required maxLength={70} placeholder="e.g. Traveling"/></label>}
    <CategoryColorPicker initial={item ? categoryColor(item) : DEFAULT_ACCENT}/>
    <div className="form-row">{PEOPLE.map(person => <label key={person.id}>{person.name} savings (%)
      <input type="number" name={person.id} min="0" max="100" step="0.01" defaultValue={(item?.savingsRates?.[person.id] ?? 0) / 100}/>
    </label>)}</div>
    {wedding ? <p className="field-help">Wedding is permanent and adds to the Wedding goal in Joint Savings.</p> : <label>Joint savings goal<select name="savingsGoalId" defaultValue={item?.savingsGoalId || state.goals[0]?.id}>
      {state.goals.map(goal => <option key={goal.id} value={goal.id}>{goal.name}</option>)}
    </select></label>}
    <p className="field-help">These rates apply to new entries in this category. Saved entries keep their recorded rate.</p>
  </ActionForm>;
}
