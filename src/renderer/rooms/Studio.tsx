// Studio: every component drawn in the chosen style, side by side; style params, brand and components edited on their own.
import { useMemo, useState } from 'react';
import { useStore, type StudioFocus } from '../store';
import { FrameCanvas } from '../ui/FrameCanvas';
import { SchemaForm, Field } from '../ui/SchemaForm';
import { writeLater } from '../writeLater';
import { addGraphic } from '../../core/ops';
import { componentId } from '../../core/component-template';
import type { Mode, Dir } from '../../core/model';
import { tileProject, type Library } from '../../core/render';
import type { Brand } from '../../core/brand';

const LOOP_PAD = 0.8;

export function Studio() {
  const { lib, studio, setStudio } = useStore();
  if (!lib) return <div className="empty">Loading the library…</div>;
  const focus = studio.focus;
  const comps = Object.keys(lib.components);
  const big = focus?.kind === 'component' ? focus.id : null;

  return (
    <div className="studio">
      <aside className="panel left">
        <h4>Styles</h4>
        {Object.values(lib.styles).map((s) => (
          <button key={s.id} className={`row ${studio.style === s.id ? 'active' : ''} ${isFocus(focus, 'style', s.id) ? 'focused' : ''}`}
            onClick={() => setStudio({ style: s.id, focus: { kind: 'style', id: s.id } })}>
            <span>{s.meta.name}</span><i>{s.error ? '⚠' : s.meta.preset ? 'preset' : 'yours'}</i>
          </button>
        ))}
        <NewRow label="+ New style" placeholder={`Name (a copy of ${lib.styles[studio.style]?.meta.name ?? studio.style})`} create={(name) => newStyle(lib, studio.style, name)} />
        <h4>Components</h4>
        {comps.map((id) => (
          <button key={id} className={`row ${isFocus(focus, 'component', id) ? 'focused' : ''}`} onClick={() => setStudio({ focus: { kind: 'component', id } })}>
            <span>{lib.components[id].meta.name}</span><i>{lib.components[id].error ? '⚠' : ''}</i>
          </button>
        ))}
        <NewRow label="+ New component" placeholder={big ? `Name (a copy of ${lib.components[big]?.meta.name ?? big})` : 'Name (from a template)'} create={(name) => newComponent(lib, big, name)} />
        <h4>Brand</h4>
        <button className={`row ${focus?.kind === 'brand' ? 'focused' : ''}`} onClick={() => setStudio({ focus: { kind: 'brand' } })}>
          <span>{lib.brand.name}</span>
          <i className="swatches">{[lib.brand.colors.primary, lib.brand.colors.accent, lib.brand.colors.ink].map((c) => <b key={c} style={{ background: c }} />)}</i>
        </button>
      </aside>

      <main className="studio-main">
        <div className="studio-bar">
          <span className="muted">{lib.styles[studio.style]?.meta.name} · {studio.mode} · {studio.dir.toUpperCase()}</span>
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

function Tile({ lib, comp, w, h }: { lib: Library; comp: string; w: number; h: number }) {
  const { studio } = useStore();
  const props = studio.sample[comp] ?? {};
  const project = useMemo(() => tileProject(lib, studio.style, studio.mode, studio.dir, comp, props, w, h), [lib, studio.style, studio.mode, studio.dir, comp, props, w, h]);
  const loop = (lib.components[comp]?.meta.duration ?? 2) + LOOP_PAD;
  return <FrameCanvas project={project} lib={lib} time={() => (performance.now() / 1000) % loop} animate className="tile-canvas" />;
}

const isFocus = (f: StudioFocus | null, kind: string, id: string) => !!f && f.kind === kind && 'id' in f && f.id === id;

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
  if (!focus) return <p className="muted pad">Pick a style, a component or the brand on the left. Changes save to <code>~/Vibe/library</code>, so Claude sees them too.</p>;

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

  return <BrandEditor brand={lib.brand} />;
}

function BrandEditor({ brand }: { brand: Brand }) {
  const update = (next: Brand) => {
    const lib = useStore.getState().lib!;
    useStore.setState({ lib: { ...lib, brand: next } });
    writeLater('library/brand.json', JSON.stringify(next, null, 2) + '\n');
  };
  const colorKeys = Object.keys(brand.colors) as (keyof Brand['colors'])[];
  const fontKeys = Object.keys(brand.fonts) as (keyof Brand['fonts'])[];
  return (
    <div className="pad">
      <h3>Brand · {brand.name}</h3>
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
      <p className="hint">Mode tokens (dark / light / green) live in <code>library/brand.json</code>.</p>
    </div>
  );
}
