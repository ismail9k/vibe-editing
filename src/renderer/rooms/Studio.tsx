// Studio: every component drawn in the chosen style, side by side; style params, brand and components edited on their own.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore, type StudioFocus } from '../store';
import { FrameCanvas } from '../ui/FrameCanvas';
import { SchemaForm, Field } from '../ui/SchemaForm';
import { writeLater } from '../writeLater';
import { addGraphic } from '../../core/ops';
import { componentId } from '../../core/component-template';
import type { Mode, Dir } from '../../core/model';
import { tileProject, type Library } from '../../core/render';
import { MAIN_BRAND, allBrands, brandFile, brandOf, type Brand } from '../../core/brand';

const LOOP_PAD = 0.8;

export function Studio() {
  const { lib, studio, setStudio } = useStore();
  if (!lib) return <div className="empty">Loading the library…</div>;
  const focus = studio.focus;
  const comps = Object.keys(lib.components);
  const big = focus?.kind === 'component' ? focus.id : null;

  return (
    <div className="studio">
      <StudioLibrary lib={lib} />

      <main className="studio-main">
        <div className="studio-bar">
          {/* The style list on the left is behind a tab, and the tab leaves when a component is focused, so the style
              can always be switched here. It keeps the focus: a component being looked at stays up as its style changes. */}
          <select className="style-pick" aria-label="Style" title="Style" value={studio.style} onChange={(e) => setStudio({ style: e.target.value })}>
            {Object.values(lib.styles).map((s) => <option key={s.id} value={s.id}>{s.meta.name}</option>)}
          </select>
          <span className="muted">{brandOf(lib, studio.brand).name} · {studio.mode} · {studio.dir.toUpperCase()}</span>
          <div className="seg">{(['dark', 'light', 'green'] as Mode[]).map((m) => <button key={m} className={studio.mode === m ? 'on' : ''} onClick={() => setStudio({ mode: m })}>{m}</button>)}</div>
          <div className="seg">{(['ltr', 'rtl'] as Dir[]).map((d) => <button key={d} className={studio.dir === d ? 'on' : ''} onClick={() => setStudio({ dir: d })}>{d.toUpperCase()}</button>)}</div>
          {big && <button className="ghost" onClick={() => setStudio({ focus: null })}>← All components</button>}
        </div>
        {big ? (
          <div className="studio-focus">
            <Tile lib={lib} comp={big} w={540} h={960} />
          </div>
        ) : (
          <div className="studio-grid">
            {comps.map((id) => (
              <figure key={id} className="tile" onClick={() => setStudio({ focus: { kind: 'component', id } })}>
                <Tile lib={lib} comp={id} w={360} h={640} />
                <figcaption>{lib.components[id].meta.name}</figcaption>
              </figure>
            ))}
          </div>
        )}
      </main>

      <aside className="panel right">
        <StudioInspector />
      </aside>
    </div>
  );
}

type LibraryTab = 'styles' | 'components';
const TABS: { id: LibraryTab; label: string; one: string }[] = [
  { id: 'styles', label: 'Styles', one: 'style' }, { id: 'components', label: 'Components', one: 'component' },
];

/** The left panel. Styles and components are two long lists, so each gets its own tab with a filter, and the tab
 *  follows the focus: a tile clicked in the grid, or a component Claude just made, brings its own list forward.
 *  The brand is a choice that holds under both, so it's a menu pinned at the foot, not a third list. */
function StudioLibrary({ lib }: { lib: Library }) {
  const { studio, setStudio } = useStore();
  const focus = studio.focus;
  const [tab, setTab] = useState<LibraryTab>(focus?.kind === 'component' ? 'components' : 'styles');
  const [query, setQuery] = useState('');
  const list = useRef<HTMLDivElement>(null);
  const focusKey = focus ? `${focus.kind}:${focus.id}` : null;

  useEffect(() => {
    if (focus && focus.kind !== 'brand') setTab(`${focus.kind}s`);
  }, [focusKey]);
  // After the tab has caught up, bring the focused row into view (it may be far down a long list).
  useEffect(() => { list.current?.querySelector('.row.focused')?.scrollIntoView({ block: 'nearest' }); }, [focusKey, tab]);

  const q = query.trim().toLowerCase();
  const match = (name: string, id: string) => !q || name.toLowerCase().includes(q) || id.toLowerCase().includes(q);
  const styles = Object.values(lib.styles).filter((s) => match(s.meta.name, s.id));
  const comps = Object.values(lib.components).filter((c) => match(c.meta.name, c.id));
  const big = focus?.kind === 'component' ? focus.id : null;
  const counts = { styles: Object.keys(lib.styles).length, components: Object.keys(lib.components).length };
  const shown = { styles, components: comps }[tab].length;
  const brand = brandOf(lib, studio.brand);
  const one = TABS.find((t) => t.id === tab)!.one;
  const pick = (t: LibraryTab) => { setTab(t); setQuery(''); };

  return (
    <aside className="panel left studio-library">
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => pick(t.id)}>{t.label} <i>{counts[t.id]}</i></button>
        ))}
      </div>
      <div className="library-tools">
        <input className="filter" type="search" value={query} placeholder={`Filter ${tab}`}
          onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') setQuery(''); }} />
        {tab === 'styles'
          ? <NewRow key="style" label="+ New style" placeholder={`Name (a copy of ${lib.styles[studio.style]?.meta.name ?? studio.style})`} create={(name) => newStyle(lib, studio.style, name)} />
          : <NewRow key="component" label="+ New component" placeholder={big ? `Name (a copy of ${lib.components[big]?.meta.name ?? big})` : 'Name (from a template)'} create={(name) => newComponent(lib, big, name)} />}
      </div>
      <div className="library-list" ref={list}>
        {tab === 'styles' && styles.map((s) => (
          <button key={s.id} className={`row ${studio.style === s.id ? 'active' : ''} ${isFocus(focus, 'style', s.id) ? 'focused' : ''}`}
            onClick={() => setStudio({ style: s.id, focus: { kind: 'style', id: s.id } })}>
            <span>{s.meta.name}</span><i>{s.error ? '⚠' : s.meta.preset ? 'preset' : 'yours'}</i>
          </button>
        ))}
        {tab === 'components' && comps.map((c) => (
          <button key={c.id} className={`row ${isFocus(focus, 'component', c.id) ? 'focused' : ''}`} onClick={() => setStudio({ focus: { kind: 'component', id: c.id } })}>
            <span>{c.meta.name}</span><i>{c.error ? '⚠' : ''}</i>
          </button>
        ))}
        {!shown && <p className="muted none">{query.trim() ? `Nothing matches “${query.trim()}”.` : `No ${one} yet.`}</p>}
      </div>
      <div className={`library-foot ${focus?.kind === 'brand' ? 'focused' : ''}`}>
        <h4>Brand</h4>
        <div className="brand-pick">
          <select aria-label="Brand" value={studio.brand} onChange={(e) => setStudio({ brand: e.target.value, focus: { kind: 'brand', id: e.target.value } })}>
            {allBrands(lib).map(([id, b]) => <option key={id} value={id}>{b.name}</option>)}
          </select>
          <button className="brand-edit" title={`Edit ${brand.name}`} onClick={() => setStudio({ focus: { kind: 'brand', id: studio.brand } })}>
            <i className="swatches">{[brand.colors.primary, brand.colors.accent, brand.colors.ink].map((c, i) => <b key={i} style={{ background: c }} />)}</i>
            <span>Edit</span>
          </button>
        </div>
        <NewRow label="+ New brand" placeholder={`Name (a copy of ${brand.name})`} create={(name) => newBrand(lib, studio.brand, name)} />
      </div>
    </aside>
  );
}

function Tile({ lib, comp, w, h }: { lib: Library; comp: string; w: number; h: number }) {
  const { studio } = useStore();
  const props = studio.sample[comp] ?? {};
  const project = useMemo(() => tileProject(lib, studio.style, studio.mode, studio.dir, comp, props, w, h, studio.brand), [lib, studio.style, studio.brand, studio.mode, studio.dir, comp, props, w, h]);
  const loop = (lib.components[comp]?.meta.duration ?? 2) + LOOP_PAD;
  return <FrameCanvas project={project} lib={lib} time={() => (performance.now() / 1000) % loop} animate className="tile-canvas" />;
}

const isFocus = (f: StudioFocus | null, kind: string, id: string) => !!f && f.kind === kind && f.id === id;

/** A "+ New …" row that turns into a name field. Electron has no window.prompt (calling it throws), so new things
 *  are named inline: Enter makes it, Escape (or leaving it empty) cancels. */
function NewRow({ label, placeholder, create }: { label: string; placeholder: string; create(name: string): Promise<void> }) {
  const [naming, setNaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!naming) return <button className="row add" onClick={() => { setNaming(true); setError(null); }}>{label}</button>;
  const done = () => { setNaming(false); setError(null); };
  return (
    <>
      <form className="row add naming" onSubmit={async (e) => {
        e.preventDefault();
        const name = String(new FormData(e.currentTarget).get('name') ?? '').trim();
        if (!name) return done();
        try { await create(name); done(); } catch (err) { setError((err as Error).message); }
      }}>
        <input name="name" autoFocus placeholder={placeholder} onKeyDown={(e) => { if (e.key === 'Escape') done(); }}
          onBlur={(e) => { if (!e.currentTarget.value.trim()) done(); }} />
      </form>
      {error && <p className="bad">{error}</p>}
    </>
  );
}

/** A folder name for a new library item: from its name, or `fallback` for a name with no Latin letters, never taken. */
function freeId(name: string, fallback: string, taken: Record<string, unknown>) {
  const base = componentId(name) || fallback;
  let id = base;
  for (let n = 2; taken[id]; n++) id = `${base}-${n}`;
  return id;
}

async function newStyle(lib: Library, from: string, name: string) {
  const id = freeId(name, 'style', lib.styles);
  await window.vibe.duplicate(`library/styles/${from}`, `library/styles/${id}`);
  const meta = { ...lib.styles[from].meta, name, description: `Started from ${lib.styles[from].meta.name}. Ask Claude to rewrite style.js for the look you want.`, preset: false };
  await window.vibe.write(`library/styles/${id}/style.json`, JSON.stringify(meta, null, 2) + '\n');
  await useStore.getState().reloadLibrary();
  useStore.getState().setStudio({ style: id, focus: { kind: 'style', id } });
}

/** A copy of the brand being shown, under a new name: then its colours, fonts and rules are changed on the right. */
async function newBrand(lib: Library, from: string, name: string) {
  const id = freeId(name, 'brand', { ...lib.brands, [MAIN_BRAND]: lib.brand });
  const res = await window.vibe.write(brandFile(id), JSON.stringify({ ...brandOf(lib, from), name }, null, 2) + '\n');
  if (!res.ok) throw new Error(`Could not write ${brandFile(id)}`);
  await useStore.getState().reloadLibrary();
  useStore.getState().setStudio({ brand: id, focus: { kind: 'brand', id } });
}

/** A copy of the component in focus, or the template when none is: then Claude rewrites it. */
async function newComponent(lib: Library, from: string | null, name: string) {
  const id = freeId(name, 'component', lib.components);
  await window.vibe.createComponent(id, { from: from ?? undefined, name });
  await useStore.getState().reloadLibrary();
  useStore.getState().setStudio({ focus: { kind: 'component', id } });
}

function StudioInspector() {
  const { lib, studio, setStudio, project, apply, playhead, setRoom, select } = useStore();
  const focus = studio.focus;
  if (!lib) return null;
  if (!focus) return <p className="muted pad">Pick a style, a component or a brand on the left. Changes save to <code>~/Vibe/library</code>, so Claude sees them too.</p>;

  if (focus.kind === 'style') {
    const s = lib.styles[focus.id];
    if (!s) return null;
    const values = Object.fromEntries(Object.entries(s.meta.params).map(([k, v]) => [k, v.value]));
    const setParam = (k: string, v: unknown) => {
      const meta = { ...s.meta, params: { ...s.meta.params, [k]: { ...s.meta.params[k], value: v } } };
      useStore.setState({ lib: { ...lib, styles: { ...lib.styles, [s.id]: { ...s, meta } } } });
      writeLater(`library/styles/${s.id}/style.json`, JSON.stringify(meta, null, 2) + '\n');
    };
    return (
      <div className="pad">
        <h3>{s.meta.name}</h3>
        <p className="muted">{s.meta.description}</p>
        {s.error && <p className="bad">{s.error}</p>}
        {Object.keys(s.meta.params).length ? <SchemaForm schema={s.meta.params} value={values} onChange={setParam} /> : <p className="muted">No settings.</p>}
        {project && <button className="primary" disabled={project.style === s.id} onClick={() => apply((p) => ({ ...p, style: s.id }))}>{project.style === s.id ? 'Used in this project' : 'Use in this project'}</button>}
        <p className="hint">Files: <code>library/styles/{s.id}/</code></p>
      </div>
    );
  }

  if (focus.kind === 'component') {
    const c = lib.components[focus.id];
    if (!c) return null;
    const sample = { ...c.meta.defaults, ...(studio.sample[c.id] ?? {}) };
    return (
      <div className="pad">
        <h3>{c.meta.name}</h3>
        <p className="muted">{c.meta.description}</p>
        {c.error && <p className="bad">{c.error}</p>}
        <SchemaForm schema={c.meta.schema} value={sample} onChange={(k, v) => setStudio({ sample: { ...studio.sample, [c.id]: { ...sample, [k]: v } } })} />
        {project && (
          <button className="primary" onClick={() => {
            let id = '';
            apply((p) => { const r = addGraphic(p, c.id, playhead, c.meta.duration, studio.sample[c.id] ?? {}); id = r.id; return r.project; });
            select({ track: 'graphics', id }); setRoom('edit');
          }}>Add to the film at {playhead.toFixed(1)}s</button>
        )}
        <p className="hint">Sample text here is only for this preview. Files: <code>library/components/{c.id}/</code>. Ask Claude to change it: <code>vibe component snap {c.id}</code> shows him the result.</p>
      </div>
    );
  }

  if (focus.id !== MAIN_BRAND && !lib.brands?.[focus.id]) return null;
  return <BrandEditor id={focus.id} brand={brandOf(lib, focus.id)} />;
}

function BrandEditor({ id, brand }: { id: string; brand: Brand }) {
  const { project, apply } = useStore();
  const main = id === MAIN_BRAND;
  const update = (next: Brand) => {
    const lib = useStore.getState().lib!;
    useStore.setState({ lib: main ? { ...lib, brand: next } : { ...lib, brands: { ...lib.brands, [id]: next } } });
    writeLater(brandFile(id), JSON.stringify(next, null, 2) + '\n');
  };
  const used = !!project && (project.brand ?? MAIN_BRAND) === id;
  // The workspace's own brand is the one a film uses when it names none, so choosing it takes the name out.
  const use = () => apply((p) => { const { brand: _old, ...rest } = p; return main ? rest : { ...rest, brand: id }; });
  const colorKeys = Object.keys(brand.colors) as (keyof Brand['colors'])[];
  const fontKeys = Object.keys(brand.fonts) as (keyof Brand['fonts'])[];
  return (
    <div className="pad">
      <h3>Brand · {brand.name}{main && <small>workspace default</small>}</h3>
      <div className="form">
        <Field name="name" spec={{ type: 'text', label: 'name', value: '' }} value={brand.name} onChange={(v) => update({ ...brand, name: String(v) })} />
      </div>
      <h4>Colours</h4>
      <div className="form">
        {colorKeys.map((k) => <Field key={k} name={k} spec={{ type: 'color', label: k, value: '' }} value={brand.colors[k]} onChange={(v) => update({ ...brand, colors: { ...brand.colors, [k]: String(v) } })} />)}
      </div>
      <h4>Fonts</h4>
      <div className="form">
        {fontKeys.map((k) => <Field key={k} name={k} spec={{ type: 'text', label: k, value: '' }} value={brand.fonts[k]} onChange={(v) => update({ ...brand, fonts: { ...brand.fonts, [k]: String(v) } })} />)}
      </div>
      <h4>Design language</h4>
      <p className="hint">The rules Claude follows. Every style keeps these.</p>
      <textarea className="rules" rows={16} value={brand.rules} onChange={(e) => update({ ...brand, rules: e.target.value })} />
      {project && <button className="primary" disabled={used} onClick={use}>{used ? 'Used in this project' : 'Use in this project'}</button>}
      <p className="hint">Mode tokens (dark / light / green) live in <code>{brandFile(id)}</code>.{main ? ' Films that name no brand use this one.' : ''}</p>
    </div>
  );
}
