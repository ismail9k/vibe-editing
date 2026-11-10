// The Edit room library: add components at the playhead, switch the film's style, import media.
import { useState } from 'react';
import { useStore } from '../store';
import * as ops from '../../core/ops';
import type { ImportedMedia } from '../../shared/api';

/** Put media on the timeline: a video joins the end of the footage, a sound starts at the playhead. */
export function addImported(media: ImportedMedia[]) {
  const st = useStore.getState();
  st.apply((p) => media.reduce((acc, m) => (m.kind === 'video' ? ops.addClip(acc, m.src, m.duration) : ops.addAudio(acc, m.src, st.playhead).project), p));
  st.refreshMedia();
}

const length = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : `${s.toFixed(1)}s`);

export function LibraryPanel() {
  const [tab, setTab] = useState<'components' | 'styles' | 'media'>('components');
  const lib = useStore((s) => s.lib);
  const project = useStore((s) => s.project);
  const name = useStore((s) => s.projectName);
  const files = useStore((s) => s.media);
  const { apply, select } = useStore.getState();
  if (!lib || !project || !name) return null;

  const add = (type: string) => {
    const meta = lib.components[type].meta;
    let id = '';
    apply((p) => { const r = ops.addGraphic(p, type, useStore.getState().playhead, meta.duration, {}); id = r.id; return r.project; });
    select({ track: 'graphics', id });
  };
  const importMedia = async () => {
    try { addImported(await window.vibe.importMedia(name)); } catch (e) { alert((e as Error).message); }
  };
  // A file the film points at that isn't in the folder (yet) still shows, so it can be seen to be missing.
  const used = new Map<string, number>();
  for (const x of [...project.tracks.footage, ...project.tracks.audio]) used.set(x.src, (used.get(x.src) ?? 0) + 1);
  const gone = [...used.keys()].filter((src) => !files.some((m) => m.src === src));

  return (
    <div className="library">
      <div className="tabs">
        {(['components', 'styles', 'media'] as const).map((t) => <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t[0].toUpperCase() + t.slice(1)}</button>)}
      </div>
      {tab === 'components' && (
        <div className="list">
          {Object.values(lib.components).map((c) => (
            <button key={c.id} className="row" onClick={() => add(c.id)} title={c.meta.description}>
              <span>{c.meta.name}</span><i>{c.error ? '⚠' : `${c.meta.duration}s`}</i>
            </button>
          ))}
          <p className="hint">Click to add at the playhead.</p>
        </div>
      )}
      {tab === 'styles' && (
        <div className="list">
          {Object.values(lib.styles).map((s) => (
            <button key={s.id} className={`row ${project.style === s.id ? 'active' : ''}`} onClick={() => apply((p) => ({ ...p, style: s.id }))} title={s.meta.description}>
              <span>{s.meta.name}</span><i>{project.style === s.id ? '●' : ''}</i>
            </button>
          ))}
          <p className="hint">Switching style redraws the whole film. Timing stays.</p>
        </div>
      )}
      {tab === 'media' && (
        <div className="list">
          <button className="primary" onClick={importMedia}>Import video or sound…</button>
          {files.map((m) => (
            <button key={m.src} className="row" onClick={() => addImported([m])}
              title={m.kind === 'video' ? 'Add to the end of the footage' : 'Add at the playhead'}>
              <span>{m.src.replace(/^media\//, '')}</span>
              <i>{m.kind === 'video' ? 'video' : 'sound'} · {length(m.duration)}{used.get(m.src) ? '' : ' · unused'}</i>
            </button>
          ))}
          {gone.map((src) => <div key={src} className="row static"><span>{src.replace(/^media\//, '')}</span><i className="bad">missing</i></div>)}
          <p className="hint">Click a file to put it on the timeline again. Or drop files anywhere on the Edit room. Videos join the footage track; sounds land at the playhead.</p>
        </div>
      )}
    </div>
  );
}
