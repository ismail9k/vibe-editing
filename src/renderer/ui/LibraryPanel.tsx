// The Edit room library: add components at the playhead, switch the film's style, import media.
import { useState } from 'react';
import { useStore } from '../store';
import * as ops from '../../core/ops';
import type { ImportedMedia } from '../../shared/api';

export function addImported(media: ImportedMedia[]) {
  const st = useStore.getState();
  st.apply((p) => media.reduce((acc, m) => (m.kind === 'video' ? ops.addClip(acc, m.src, m.duration) : ops.addAudio(acc, m.src, st.playhead).project), p));
}

export function LibraryPanel() {
  const [tab, setTab] = useState<'components' | 'styles' | 'media'>('components');
  const lib = useStore((s) => s.lib);
  const project = useStore((s) => s.project);
  const name = useStore((s) => s.projectName);
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
  const media = [...new Set([...project.tracks.footage, ...project.tracks.audio].map((x) => x.src))];

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
          {media.map((m) => <div key={m} className="row static"><span>{m.replace(/^media\//, '')}</span></div>)}
          <p className="hint">Or drop files anywhere on the Edit room. Videos join the footage track; sounds land at the playhead.</p>
        </div>
      )}
    </div>
  );
}
