// The Edit room inspector: the selected item's fields, or the project's settings when nothing is selected.
import { useStore } from '../store';
import { SchemaForm, NumberInput } from './SchemaForm';
import * as ops from '../../core/ops';
import type { Graphic, Caption, Clip, AudioItem, Mode, Dir } from '../../core/model';

const FORMATS: Record<string, { w: number; h: number }> = { '9:16': { w: 1080, h: 1920 }, '16:9': { w: 1920, h: 1080 }, '1:1': { w: 1080, h: 1080 }, '4:5': { w: 1080, h: 1350 } };

export function Inspector() {
  const project = useStore((s) => s.project);
  const projectName = useStore((s) => s.projectName);
  const lib = useStore((s) => s.lib);
  const selection = useStore((s) => s.selection);
  const issues = useStore((s) => s.issues);
  const { apply, select } = useStore.getState();
  if (!project || !lib) return null;

  const item = selection ? (project.tracks[selection.track] as { id: string }[]).find((x) => x.id === selection.id) : null;
  const patch = (p: Record<string, unknown>) => selection && apply((pr) => ops.updateItem(pr, selection.track, selection.id, p));
  const remove = () => { if (selection) { apply((pr) => ops.deleteItem(pr, selection.track, selection.id)); select(null); } };
  const itemIssues = selection ? issues.filter((i) => {
    const idx = (project.tracks[selection.track] as { id: string }[]).findIndex((x) => x.id === selection.id);
    return i.path.startsWith(`tracks.${selection.track}[${idx}]`);
  }) : [];

  if (!item || !selection) {
    const fmt = Object.entries(FORMATS).find(([, f]) => f.w === project.format.w && f.h === project.format.h)?.[0] ?? 'custom';
    return (
      <div className="pad">
        <h3>{project.name}</h3>
        <div className="form">
          <label className="field">Format
            <select value={fmt} onChange={(e) => FORMATS[e.target.value] && apply((p) => ({ ...p, format: { ...p.format, ...FORMATS[e.target.value] } }))}>
              {Object.keys(FORMATS).map((k) => <option key={k} value={k}>{k} · {FORMATS[k].w}×{FORMATS[k].h}</option>)}
              {fmt === 'custom' && <option value="custom">{project.format.w}×{project.format.h}</option>}
            </select>
          </label>
          <label className="field">Frame rate
            <select value={project.format.fps} onChange={(e) => apply((p) => ({ ...p, format: { ...p.format, fps: Number(e.target.value) } }))}>
              {[24, 25, 30, 60].map((f) => <option key={f} value={f}>{f} fps</option>)}
            </select>
          </label>
          <label className="field">Style
            <select value={project.style} onChange={(e) => apply((p) => ({ ...p, style: e.target.value }))}>
              {Object.values(lib.styles).map((s) => <option key={s.id} value={s.id}>{s.meta.name}</option>)}
            </select>
          </label>
          <label className="field">Mode
            <select value={project.mode} onChange={(e) => apply((p) => ({ ...p, mode: e.target.value as Mode }))}>
              {['dark', 'light', 'green'].map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <label className="field">Direction
            <select value={project.dir} onChange={(e) => apply((p) => ({ ...p, dir: e.target.value as Dir }))}>
              <option value="ltr">Left to right</option><option value="rtl">Right to left (Arabic)</option>
            </select>
          </label>
        </div>
        {issues.length > 0 && (
          <>
            <h4>Problems</h4>
            <ul className="issues">{issues.map((i, n) => <li key={n} className={i.level}><code>{i.path}</code> {i.message}</li>)}</ul>
          </>
        )}
        <p className="hint">Select something on the timeline to edit it. Claude edits <code>projects/{projectName}.vibe/vibe.json</code>; you'll see its changes here.</p>
      </div>
    );
  }

  const timing = (it: { at: number; dur?: number }) => (
    <div className="field-row two">
      <label className="field">Start (s)<NumberInput value={it.at} onChange={(v) => patch({ at: Math.max(0, v) })} /></label>
      {it.dur !== undefined && <label className="field">Length (s)<NumberInput value={it.dur} onChange={(v) => patch({ dur: Math.max(0.1, v) })} /></label>}
    </div>
  );

  let body: React.ReactNode = null;
  if (selection.track === 'graphics') {
    const g = item as Graphic, comp = lib.components[g.type];
    body = (
      <>
        <h3>{comp?.meta.name ?? g.type} <small>{g.id}</small></h3>
        {comp && <p className="muted">{comp.meta.description}</p>}
        {timing(g)}
        {comp && <SchemaForm schema={comp.meta.schema} value={{ ...comp.meta.defaults, ...g.props }} onChange={(k, v) => patch({ props: { ...g.props, [k]: v } })} />}
        <details>
          <summary>Position</summary>
          <div className="field-row three">
            {(['x', 'y', 'w'] as const).map((k) => (
              <label key={k} className="field">{k}<NumberInput step={0.01} value={g[k] ?? NaN} onChange={(v) => patch({ [k]: v })} /></label>
            ))}
          </div>
          <button className="ghost" onClick={() => apply((p) => { const q = ops.updateItem(p, 'graphics', g.id, {}); const it = q.tracks.graphics.find((x) => x.id === g.id)!; delete it.x; delete it.y; delete it.w; return q; })}>Reset position</button>
        </details>
      </>
    );
  } else if (selection.track === 'captions') {
    const c = item as Caption;
    body = (
      <>
        <h3>Caption <small>{c.id}</small></h3>
        {timing(c)}
        <label className="field">Text<textarea rows={2} dir="auto" value={c.text} onChange={(e) => patch({ text: e.target.value })} /></label>
        <label className="field">Keyword (orange pill)<input dir="auto" value={c.keyword ?? ''} onChange={(e) => patch({ keyword: e.target.value || undefined })} /></label>
      </>
    );
  } else if (selection.track === 'footage') {
    const c = item as Clip;
    body = (
      <>
        <h3>Clip <small>{c.id}</small></h3>
        <p className="muted">{c.src}</p>
        <div className="field-row two">
          <label className="field">In (source s)<NumberInput value={c.in} onChange={(v) => patch({ in: Math.max(0, Math.min(v, c.out - 0.1)) })} /></label>
          <label className="field">Out (source s)<NumberInput value={c.out} onChange={(v) => patch({ out: Math.min(Math.max(v, c.in + 0.1), c.srcDur ?? Infinity) })} /></label>
        </div>
        <p className="hint">S splits the clip at the playhead. Drag a clip to reorder it; drag its edges to trim.</p>
      </>
    );
  } else {
    const a = item as AudioItem;
    body = (
      <>
        <h3>Sound <small>{a.id}</small></h3>
        <p className="muted">{a.src}</p>
        {timing(a)}
        <label className="field">Gain<NumberInput value={a.gain} step={0.05} onChange={(v) => patch({ gain: Math.max(0, v) })} /></label>
      </>
    );
  }

  return (
    <div className="pad">
      {body}
      {itemIssues.length > 0 && <ul className="issues">{itemIssues.map((i, n) => <li key={n} className={i.level}>{i.message}</li>)}</ul>}
      <button className="danger" onClick={remove}>Delete</button>
    </div>
  );
}
