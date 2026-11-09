// The Edit room preview: footage in a <video>, graphics and captions on a canvas above it.
// One animation-frame loop owns the clock; the video and sounds follow it.
import { useEffect, useRef } from 'react';
import { useStore } from '../store';
import { duration, footageAt, type Project } from '../../core/model';
import { renderFrame } from '../../core/render';

export function Preview() {
  const project = useStore((s) => s.project);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const video = videoRef.current!, canvas = canvasRef.current!;
    const sounds = new Map<string, HTMLAudioElement>();
    let raf = 0, last = performance.now(), drawn = '';
    let lastP: Project | null = null, lastLib: unknown = null;

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const st = useStore.getState(), p = st.project, lib = st.lib, name = st.projectName;
      const dt = (now - last) / 1000;
      last = now;
      if (!p || !lib || !name) return;
      let t = st.playhead;
      if (st.playing) {
        t = Math.min(duration(p), t + dt);
        if (t >= duration(p)) useStore.setState({ playing: false, playhead: t });
        else useStore.setState({ playhead: t });
      }
      syncVideo(video, p, name, t, st.playing);
      syncSounds(sounds, p, name, t, st.playing);
      // Redraw while playing, or when the time, project or library changed.
      const key = `${t.toFixed(4)}`;
      if (st.playing || key !== drawn || p !== lastP || lib !== lastLib) {
        if (canvas.width !== p.format.w || canvas.height !== p.format.h) { canvas.width = p.format.w; canvas.height = p.format.h; }
        renderFrame(canvas.getContext('2d')!, p, lib, t);
        drawn = key; lastP = p; lastLib = lib;
      }
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); video.pause(); sounds.forEach((a) => a.pause()); };
  }, []);

  const aspect = project ? `${project.format.w} / ${project.format.h}` : '9 / 16';
  return (
    <div className="preview">
      <div className="stage" style={{ aspectRatio: aspect }}>
        <video ref={videoRef} playsInline preload="auto" />
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}

function syncVideo(video: HTMLVideoElement, p: Project, name: string, t: number, playing: boolean) {
  const hit = footageAt(p, t);
  if (!hit) {
    video.style.visibility = 'hidden';
    if (!video.paused) video.pause();
    return;
  }
  video.style.visibility = 'visible';
  const url = `vibe://ws/projects/${encodeURIComponent(name)}/${hit.clip.src.split('/').map(encodeURIComponent).join('/')}`;
  if (video.dataset.src !== url) {
    video.dataset.src = url;
    video.dataset.ready = '';
    video.src = url;
    video.onloadedmetadata = () => { video.dataset.ready = '1'; };
    return;
  }
  if (!video.dataset.ready || video.seeking) return;
  const drift = Math.abs(video.currentTime - hit.srcTime);
  if (playing) {
    if (video.paused) video.play().catch(() => {});
    if (drift > 0.2) video.currentTime = hit.srcTime;
  } else {
    if (!video.paused) video.pause();
    if (drift > 0.01) video.currentTime = hit.srcTime;
  }
}

function syncSounds(sounds: Map<string, HTMLAudioElement>, p: Project, name: string, t: number, playing: boolean) {
  const ids = new Set(p.tracks.audio.map((a) => a.id));
  for (const [id, el] of sounds) if (!ids.has(id)) { el.pause(); sounds.delete(id); }
  for (const a of p.tracks.audio) {
    let el = sounds.get(a.id);
    const url = `vibe://ws/projects/${encodeURIComponent(name)}/${a.src.split('/').map(encodeURIComponent).join('/')}`;
    if (!el || el.dataset.src !== url) { el?.pause(); el = new Audio(url); el.dataset.src = url; el.preload = 'auto'; sounds.set(a.id, el); }
    el.volume = Math.max(0, Math.min(1, a.gain));
    const local = t - a.at, len = Number.isFinite(el.duration) ? el.duration : 0;
    const inside = local >= 0 && local < (len || 0.05);
    if (playing && inside) {
      if (el.paused) { el.currentTime = local; el.play().catch(() => {}); }
    } else if (!el.paused) el.pause();
  }
}
