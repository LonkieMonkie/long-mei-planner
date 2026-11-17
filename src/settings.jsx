import { useState } from 'react';
import { Check, RotateCcw } from 'lucide-react';
import { DEFAULT_ACCENT, LEGACY_ACCENT, accentStyles, parseAccent } from './appearance.js';
import { ActionForm, PanelHeading } from './ui.jsx';
import { decimalUnits } from './model.js';
import { TREE_KINDS } from './tree-model.js';

const presets = [
  ['Sage', DEFAULT_ACCENT], ['Rose', '#aa416e'], ['Lavender', LEGACY_ACCENT],
  ['Ocean', '#256593'], ['Terracotta', '#a45335'], ['Plum', '#81539c'],
];

export function Settings({ accent, save }) {
  const [draft, setDraft] = useState(accent);
  const [error, setError] = useState('');
  const validAccent = parseAccent(draft);
  const preview = validAccent ?? accent;

  function choose(color) {
    setDraft(color);
    setError('');
  }

  function apply(color) {
    try {
      save(current => ({ ...current, accentColor: color }), 'Accent color saved');
      choose(color);
    } catch (error) {
      setError(error.message);
    }
  }

  return <section className="card settings-card">
    <PanelHeading title="Appearance" subtitle="Choose an accent color for the dashboard on this browser."/>
    <form className="form-stack" onSubmit={event => {
      event.preventDefault();
      if (validAccent) apply(validAccent);
      else setError('Enter a six-digit hex color, such as #4C8363.');
    }}>
      <fieldset className="accent-presets">
        <legend>Accent presets</legend>
        <div className="accent-options">{presets.map(([name, color]) => <button type="button" key={color}
          className="btn secondary small accent-option" aria-pressed={validAccent === color} onClick={() => choose(color)}>
          <span className="color-dot" style={{ backgroundColor: color }}/>
          {name}{validAccent === color && <Check size={13} aria-hidden="true"/>}
        </button>)}</div>
      </fieldset>
      <div className="accent-custom">
        <label>Custom color<input type="color" value={preview} onChange={event => choose(event.target.value)}/></label>
        <label>Hex color<input type="text" value={draft} maxLength={7} autoComplete="off" spellCheck={false}
          onChange={event => choose(event.target.value)} aria-invalid={Boolean(error && !validAccent)}/></label>
      </div>
      <div className="accent-preview" style={accentStyles(preview)}>
        <span className="color-dot" style={{ backgroundColor: preview }}/>
        <span>Accent preview</span>
        <span className="btn primary small">Primary button</span>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions">
        <button type="button" className="btn secondary" onClick={() => apply(DEFAULT_ACCENT)}><RotateCcw size={15}/> Reset to default</button>
        <button className="btn primary">Save accent color</button>
      </div>
    </form>
  </section>;
}

const swatches = { cherry: '#f7b6c8', oak: '#5f9c5a', maple: '#e8743b', pine: '#2f6b4f' };

export function TreeSettings({ tree, save }) {
  const [kind, setKind] = useState(tree.kind);
  return <section className="card settings-card">
    <PanelHeading title="Savings tree" subtitle="Choose the tree that grows on the Joint Savings page, and how much each meter is worth."/>
    <ActionForm label="Save tree" onSave={fields => {
      const perMeter = decimalUnits(fields.perMeter, 100_000_000);
      if (perMeter < 100) throw new Error('Enter at least $1 per meter.');
      save(current => ({ ...current, tree: { kind, perMeter } }), 'Savings tree saved');
    }}>
      <fieldset className="accent-presets">
        <legend>Type of tree</legend>
        <div className="tree-options">{TREE_KINDS.map(item => <button type="button" key={item.id} className="tree-option"
          aria-pressed={kind === item.id} onClick={() => setKind(item.id)}>
          <span className={`tree-swatch ${item.id}`} style={{ '--leaf': swatches[item.id] }}/>{item.name}
        </button>)}</div>
      </fieldset>
      <label>Savings for each meter ($)<input name="perMeter" type="number" min="1" max="1000000" step="0.01" defaultValue={tree.perMeter / 100} required/></label>
    </ActionForm>
  </section>;
}
