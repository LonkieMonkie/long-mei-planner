import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Folder, FolderPlus, GripVertical, LockKeyhole, Pencil, Plus, SlidersHorizontal, Trash2 } from 'lucide-react';
import { warningLevel } from './insights.js';
import { PEOPLE, budgetGroups, categoryColor, money, moveCategory } from './model.js';
import { CategoryIcon, InlineName, Progress, WARN_COLOR, WarningBadge } from './ui.jsx';

const FOLDER_NOTES = {
  joint: 'Goes to Joint Savings',
  saving: 'Goes to your own savings',
  checking: 'Everyday money · gets the rest of each income',
};
const COLLAPSED_KEY = 'our-little-life:collapsed-folders';

function readCollapsed() {
  try { return new Set(JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? '[]')); } catch { return new Set(); }
}

// The Budget page's categories, grouped in collapsible folders. Drag a category by its handle
// (mouse, pen or touch) to reorder it or move it into another folder; on a keyboard, focus the
// handle and use the arrow keys. The order and folders are private to each person.
export function BudgetBoard({ state, budget, me, save, open }) {
  const owners = me ? [me] : PEOPLE.map(person => person.id);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [drag, setDrag] = useState(null); // { id, owner, name, x, y, group, folderId, index }
  const boardRef = useRef(null);
  const pointer = useRef(null);
  const live = useRef(null);
  const [announce, setAnnounce] = useState('');

  function toggle(id) {
    setCollapsed(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next])); } catch { /* Collapsing still works for this visit. */ }
      return next;
    });
  }

  // Where a drop at (x, y) would land: the group under the pointer (or nearest), and the
  // position among that group's other categories.
  function targetAt(owner, id, y) {
    const groups = [...(boardRef.current?.querySelectorAll(`[data-group][data-owner="${owner}"]`) ?? [])];
    if (!groups.length) return null;
    let best = null, distance = Infinity;
    for (const group of groups) {
      const { top, bottom } = group.getBoundingClientRect();
      const d = y < top ? top - y : y > bottom ? y - bottom : 0;
      if (d < distance) { best = group; distance = d; }
    }
    const rows = [...best.querySelectorAll('[data-cat]')].filter(row => row.dataset.cat !== id);
    const index = best.dataset.collapsed === 'true' ? rows.length : rows.filter(row => {
      const { top, height } = row.getBoundingClientRect();
      return top + height / 2 < y;
    }).length;
    return { group: best.dataset.group, folderId: best.dataset.folder || null, index };
  }

  function start(event, category) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const owner = category.ownerId ?? me;
    pointer.current = { y: event.clientY };
    live.current = { id: category.id, owner, name: category.name, color: categoryColor(category), x: event.clientX, y: event.clientY, ...targetAt(owner, category.id, event.clientY) };
    setDrag(live.current);
  }
  // The latest position is kept in a ref too, because a pointerup can arrive before React has
  // re-rendered after the last pointermove.
  function update(changes) {
    if (!live.current) return;
    live.current = { ...live.current, ...changes };
    setDrag(live.current);
  }
  function move(event) {
    if (!live.current) return;
    pointer.current = { y: event.clientY };
    update({ x: event.clientX, y: event.clientY, ...targetAt(live.current.owner, live.current.id, event.clientY) });
  }
  function finish(commit, event) {
    if (event && live.current) move(event);
    const current = live.current;
    live.current = null;
    setDrag(null);
    pointer.current = null;
    if (!commit || !current?.group) return;
    const category = state.categories.find(item => item.id === current.id);
    const groups = budgetGroups(state, current.owner);
    const from = groups.find(group => group.categories.some(item => item.id === current.id));
    const position = from?.categories.findIndex(item => item.id === current.id);
    if (category && (from?.folder?.id ?? null) === current.folderId && position === current.index) return;
    save(latest => moveCategory(latest, current.id, current.folderId, current.index), 'Budget order saved');
  }

  // While dragging near the top or bottom of the screen, scroll so far-away folders are reachable.
  useEffect(() => {
    if (!drag) return undefined;
    let frame;
    const tick = () => {
      const y = pointer.current?.y;
      if (y !== undefined) {
        // On phones the menu stays pinned at the top, so the scroll zone starts below it.
        const header = document.querySelector('.sidebar');
        const top = header && getComputedStyle(header).position === 'sticky' ? header.getBoundingClientRect().bottom : 0;
        const edge = 72, speed = y < top + edge ? -Math.min(24, (top + edge - y) / 3) : y > innerHeight - edge ? Math.min(24, (y - innerHeight + edge) / 3) : 0;
        if (speed) {
          scrollBy(0, speed);
          if (live.current) update(targetAt(live.current.owner, live.current.id, y));
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const cancel = event => { if (event.key === 'Escape') finish(false); };
    addEventListener('keydown', cancel);
    return () => { cancelAnimationFrame(frame); removeEventListener('keydown', cancel); };
  }, [Boolean(drag)]); // eslint-disable-line react-hooks/exhaustive-deps

  // Arrow keys move a category one step, crossing into the next or previous folder at the ends.
  function keyMove(event, category, owner) {
    if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const groups = budgetGroups(state, owner).filter(group => !group.folder || !collapsed.has(group.folder.id) || group.categories.some(item => item.id === category.id));
    const g = groups.findIndex(group => group.categories.some(item => item.id === category.id));
    const i = groups[g].categories.findIndex(item => item.id === category.id);
    let target;
    if (event.key === 'ArrowUp') target = i > 0 ? [g, i - 1] : g > 0 ? [g - 1, groups[g - 1].categories.length] : null;
    else target = i < groups[g].categories.length - 1 ? [g, i + 1] : g < groups.length - 1 ? [g + 1, 0] : null;
    if (!target) return;
    const group = groups[target[0]];
    save(latest => moveCategory(latest, category.id, group.folder?.id ?? null, target[1]), 'Budget order saved');
    setAnnounce(`${category.name} moved ${group.folder ? 'in ' + group.folder.name : 'outside folders'}, position ${target[1] + 1}.`);
    const handle = event.currentTarget;
    requestAnimationFrame(() => boardRef.current?.querySelector(`[data-cat="${category.id}"] .drag-handle`)?.focus() ?? handle.focus());
  }

  const row = (category, owner, dropBefore = false) => {
    const spent = budget.spentByCategory.get(category.id) ?? 0;
    const limit = budget.limit(category);
    const level = budget.kindOf(category) === 'joint' || budget.kindOf(category) === 'saving' ? null : warningLevel(spent, limit);
    const used = limit ? Math.round(spent / limit * 100) : null;
    const funded = budget.fundedByCategory.get(category.id);
    return <div className={['budget-row', level, drag?.id === category.id && 'dragging', dropBefore && 'drop-before'].filter(Boolean).join(' ')} role="row" key={category.id} data-cat={category.id}>
      <div className="budget-name" role="cell">
        <button type="button" className="drag-handle" aria-label={`Move ${category.name}. Drag, or use the up and down arrow keys.`} title="Drag to move"
          onPointerDown={event => start(event, category)} onPointerMove={move} onPointerUp={event => finish(true, event)} onPointerCancel={() => finish(false)}
          onKeyDown={event => keyMove(event, category, owner)}><GripVertical size={16}/></button>
        <CategoryIcon category={category} size={17}/>
        <div><InlineName name={category.name} save={name => save(current => ({ ...current, categories: current.categories.map(item => item.id === category.id ? { ...item, name } : item) }), 'Category renamed')}/>
          {funded > 0 && <small className="set-aside">{money(funded)} set aside from income</small>}</div>
      </div>
      <div className="budget-cell" role="cell" data-label="Budget"><button className="budget-limit" onClick={() => open({ kind: 'limit', item: category })} aria-label={`Set ${category.name} budget`}>{limit ? money(limit) : <><Plus size={13}/> Add budget</>}</button></div>
      <div className="budget-cell" role="cell" data-label={budget.kindOf(category) === 'joint' || budget.kindOf(category) === 'saving' ? 'Saved' : 'Spent'}><strong className={level === 'over' ? 'negative' : ''}>{money(spent)}</strong></div>
      <div className="budget-cell" role="cell" data-label="Remaining">{limit ? <strong className={limit - spent < 0 ? 'negative' : ''}>{limit - spent < 0 ? '−' : ''}{money(Math.abs(limit - spent))}</strong> : <span className="muted-dash">—</span>}</div>
      <div className={limit ? 'budget-cell budget-used' : 'budget-cell budget-used empty'} role="cell" data-label="Used">
        {limit ? <><Progress value={spent} max={limit} color={level === 'warn' ? WARN_COLOR : level === 'over' ? undefined : categoryColor(category)} tone="rose" label={`${category.name} ${used}% used`}/>
          <span className="used-figure">{level ? <WarningBadge level={level} spent={spent} limit={limit}/> : `${used}%`}</span></>
          : <span className="muted-dash">No budget set</span>}
      </div>
      <div className="budget-actions" role="cell">
        <button className="icon-btn" aria-label={`${category.name} category settings`} title="Name, folder, color and rates" onClick={() => open({ kind: 'category', item: category })}><SlidersHorizontal size={15}/></button>
        <button className="icon-btn danger" aria-label={`Delete ${category.name} category`} title="Delete category" onClick={() => open({ kind: 'delete-category', item: category })}><Trash2 size={15}/></button>
      </div>
    </div>;
  };

  // The rows of one group, with a line showing where a dragged category would land. The line is
  // drawn by the row it sits above (or a fixed slot at the end), so rows never move in the page
  // while dragging; moving the dragged row's element would end the drag.
  const rows = (key, categories, owner) => {
    const others = categories.filter(category => category.id !== drag?.id);
    const here = drag?.group === key;
    const before = here ? others[drag.index]?.id : null;
    return <>
      {categories.map(category => row(category, owner, category.id === before))}
      <div className={here && drag.index >= others.length ? 'drop-slot on' : 'drop-slot'} aria-hidden="true"/>
    </>;
  };

  return <div className={drag ? 'budget-board is-dragging' : 'budget-board'} ref={boardRef}>
    <div className="budget-table" role="table" aria-label="Budget by folder and category">
      <div className="budget-head" role="row"><span role="columnheader">Category</span><span role="columnheader">Budget</span><span role="columnheader">Spent</span><span role="columnheader">Remaining</span><span role="columnheader">Used</span><span role="columnheader"><span className="sr-only">Actions</span></span></div>
      {owners.map(owner => <div className="budget-owner" key={owner}>
        {!me && <p className="budget-owner-name">{PEOPLE.find(person => person.id === owner).name}</p>}
        {budgetGroups(state, owner).map(({ folder, categories }) => {
          const key = folder?.id ?? 'loose:' + owner;
          const isCollapsed = folder && collapsed.has(folder.id) && drag?.group !== key;
          if (!folder) return <div className="budget-group loose" key={key} data-group={key} data-owner={owner} data-folder="">
            {(categories.length > 0 || drag) && <div className="folder-row loose" role="row"><span role="cell" className="folder-title plain">Not in a folder</span></div>}
            {rows(key, categories, owner)}
          </div>;
          const limit = categories.reduce((sum, category) => sum + budget.limit(category), 0);
          const spent = categories.reduce((sum, category) => sum + (budget.spentByCategory.get(category.id) ?? 0), 0);
          const saving = folder.kind === 'joint' || folder.kind === 'saving';
          return <div className={isCollapsed ? 'budget-group collapsed' : 'budget-group'} key={key} data-group={key} data-owner={owner} data-folder={folder.id} data-collapsed={String(Boolean(isCollapsed))}
            style={{ '--folder-color': folder.color }}>
            <div className={drag?.group === key ? 'folder-row drop-target' : 'folder-row'} role="row">
              <div className="folder-title" role="cell">
                <button type="button" className="folder-toggle" aria-expanded={!isCollapsed} aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${folder.name}`} onClick={() => toggle(folder.id)}><ChevronDown size={16}/></button>
                <Folder size={17} className="folder-icon" aria-hidden="true"/>
                <div>{folder.locked
                  ? <span className="rename"><strong>{folder.name}</strong><LockKeyhole size={12} aria-label="Built-in folder"/></span>
                  : <InlineName name={folder.name} save={name => save(current => ({ ...current, folders: current.folders.map(item => item.id === folder.id ? { ...item, name: name.slice(0, 40) } : item) }), 'Folder renamed')}/>}
                  <small>{folder.kind ? FOLDER_NOTES[folder.kind] : `${categories.length} ${categories.length === 1 ? 'category' : 'categories'}`}</small></div>
              </div>
              <div className="budget-cell" role="cell" data-label="Budget"><span className="folder-sum" title="Adds up the budgets inside">{money(limit)}</span></div>
              <div className="budget-cell" role="cell" data-label={saving ? 'Saved' : 'Spent'}><span className="folder-sum">{money(spent)}</span></div>
              <div className="budget-cell" role="cell" data-label="Remaining">{limit ? <span className={!saving && limit - spent < 0 ? 'folder-sum negative' : 'folder-sum'}>{limit - spent < 0 ? '−' : ''}{money(Math.abs(limit - spent))}</span> : <span className="muted-dash">—</span>}</div>
              <div className={limit ? 'budget-cell budget-used' : 'budget-cell budget-used empty'} role="cell" data-label="Used">{limit ? <><Progress value={spent} max={limit} color={folder.color} label={`${folder.name} ${Math.round(spent / limit * 100)}% used`}/><span className="used-figure">{Math.round(spent / limit * 100)}%</span></> : <span className="muted-dash">Add budgets inside</span>}</div>
              <div className="budget-actions" role="cell">
                <button className="icon-btn" aria-label={`Add a category to ${folder.name}`} title="Add a category here" onClick={() => open({ kind: 'category', folderId: folder.id })}><Plus size={15}/></button>
                {!folder.locked && <>
                  <button className="icon-btn" aria-label={`${folder.name} folder settings`} title="Name and color" onClick={() => open({ kind: 'folder', item: folder })}><Pencil size={14}/></button>
                  <button className="icon-btn danger" aria-label={`Delete ${folder.name} folder`} title="Delete folder" onClick={() => open({ kind: 'delete-folder', item: folder })}><Trash2 size={15}/></button>
                </>}
              </div>
            </div>
            {!isCollapsed && <div className="folder-body">
              {rows(key, categories, owner)}
              {!categories.length && drag?.group !== key && <p className="folder-empty">Drag categories here</p>}
            </div>}
          </div>;
        })}
      </div>)}
    </div>
    {me && <button type="button" className="btn secondary add-folder" onClick={() => open({ kind: 'folder' })}><FolderPlus size={16}/> Add folder</button>}
    <p className="sr-only" aria-live="polite">{announce}</p>
    {drag && <div className="drag-ghost" style={{ left: drag.x, top: drag.y, '--category-color': drag.color }} aria-hidden="true"><GripVertical size={14}/>{drag.name}</div>}
  </div>;
}
