// The Edit room preview: one canvas draws everything, the footage included. The footage plays in a hidden
// <video> (and the clip's cutout matte in a second one) that the renderer draws from, the same way the export
// draws decoded frames. One animation-frame loop owns the clock; the videos and sounds follow it.
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { duration, footageAt, matteSrc, type Project } from '../../core/model';
import type { FrameMedia } from '../../core/media';
import { renderFrame } from '../../core/render';
import { CanvasEditor } from './CanvasEditor';

export function Preview() {
  const project = useStore((s) => s.project);
  const videoRef = useRef<HTMLVideoElement>(null);
  const matteRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // The clip under the playhead whose file can't be played (gone, renamed, or not a video the app can read).
  const [missing, setMissing] = useState<string | null>(null);

  useEffect(() => {
    const video = videoRef.current!, matte = matteRef.current!, canvas = canvasRef.current!;
    const sounds = new Map<string, HTMLAudioElement>();
    let raf = 0, last = performance.now(), drawn = '', dirty = false;
    // A paused seek lands after the frame was drawn: draw again when the picture arrives.
    const redraw = () => { dirty = true; };
    for (const v of [video, matte]) { v.addEventListener('seeked', redraw); v.addEventListener('loadeddata', redraw); }
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
      const hit = footageAt(p, t), gone = hit && video.dataset.ready === 'missing' ? hit.clip.src : null;
      setMissing((was) => (was === gone ? was : gone));
      // Cutout and aiming effects use a clip's matte when it has one (the export and snapshots do the same).
      const wantsMatte = p.tracks.graphics.some((g) => lib.components[g.type]?.meta.matte || lib.components[g.type]?.meta.aims);
      syncMatte(matte, video, wantsMatte ? p : null, name, t, st.playing, st.mattes?.version ?? 0);
      syncSounds(sounds, p, name, t, st.playing);
      // Redraw while playing, or when the time, project, library or a video picture changed.
      const key = `${t.toFixed(4)}`;
      if (st.playing || dirty || key !== drawn || p !== lastP || lib !== lastLib) {
        if (canvas.width !== p.format.w || canvas.height !== p.format.h) { canvas.width = p.format.w; canvas.height = p.format.h; }
        renderFrame(canvas.getContext('2d')!, p, lib, t, frameMedia(video, matte, wantsMatte ? p : null, name, t));
        drawn = key; lastP = p; lastLib = lib; dirty = false;
      }
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf); video.pause(); matte.pause(); sounds.forEach((a) => a.pause());
      for (const v of [video, matte]) { v.removeEventListener('seeked', redraw); v.removeEventListener('loadeddata', redraw); }
    };
  }, []);

  // What the canvas is drawing from right now, for the editor to draw a graphic alone the same way.
  const media = (): FrameMedia | null => {
    const st = useStore.getState(), lib = st.lib, p = st.project, video = videoRef.current, matte = matteRef.current;
    if (!p || !lib || !video || !matte) return null;
    const wantsMatte = p.tracks.graphics.some((g) => lib.components[g.type]?.meta.matte || lib.components[g.type]?.meta.aims);
    return frameMedia(video, matte, wantsMatte ? p : null, st.projectName ?? '', st.playhead);
  };

  const aspect = project ? `${project.format.w} / ${project.format.h}` : '9 / 16';
  return (
    <div className="preview">
      <div className="stage" style={{ aspectRatio: aspect }}>
        <video ref={videoRef} className="source" crossOrigin="anonymous" playsInline preload="auto" />
        <video ref={matteRef} className="source" crossOrigin="anonymous" playsInline muted preload="auto" />
        <canvas ref={canvasRef} />
        <CanvasEditor media={media} />
        {missing && (
          <div className="missing-media" role="status">
            <b>Missing media</b>
            <span>{missing}</span>
          </div>
        )}
      </div>
    </div>
  );
}

const shown = (v: HTMLVideoElement) => v.dataset.ready === '1' && v.readyState >= 2;

/** What the renderer draws from: the footage video, and its matte only when the matte shows the same moment of
 *  the same clip. Right after a cut the matte is still on the last clip or still seeking; using it then would cut
 *  you out of the wrong frame, so the frame draws as if it had no matte (as the export does for a missing one). */
export function frameMedia(video: HTMLVideoElement, matte: HTMLVideoElement, p: Project | null, name: string, t: number): FrameMedia {
  const frame = shown(video) ? video : null;
  const hit = p && footageAt(p, t);
  const inStep = !!hit && shown(matte) && !matte.seeking
    && (matte.dataset.src ?? '').startsWith(`${mediaUrl(name, matteSrc(hit.clip.src))}?`)
    && Math.abs(matte.currentTime - video.currentTime) <= MATTE_SLACK;
  return { frame, matte: frame && inStep ? matte : null };
}

/** How far the matte may drift from the picture while playing before it is re-seeked (and not used). */
const MATTE_SLACK = 0.25;

const mediaUrl = (name: string, src: string) => `vibe://ws/projects/${encodeURIComponent(name)}/${src.split('/').map(encodeURIComponent).join('/')}`;

/** How long a file that failed to load waits before it is tried again (it may have been copied in meanwhile). */
const RETRY_MS = 2000;

/** Point a video at a url; true when it's ready to be synced. */
function load(video: HTMLVideoElement, url: string): boolean {
  const retry = video.dataset.ready === 'missing' && performance.now() - Number(video.dataset.failedAt ?? 0) > RETRY_MS;
  if (video.dataset.src !== url || retry) {
    video.dataset.src = url;
    video.dataset.ready = '';
    video.src = url;
    video.onloadedmetadata = () => { video.dataset.ready = '1'; };
    video.onerror = () => { video.dataset.ready = 'missing'; video.dataset.failedAt = String(performance.now()); };
    return false;
  }
  return video.dataset.ready === '1';
}

/** The cutout matte follows the footage video: the same source time, and while playing its rate is nudged
 *  (not seeked) so the cutout doesn't lag the picture. */
function syncMatte(matte: HTMLVideoElement, video: HTMLVideoElement, p: Project | null, name: string, t: number, playing: boolean, version: number) {
  const hit = p && footageAt(p, t);
  if (!hit) { if (!matte.paused) matte.pause(); return; }
  if (!load(matte, `${mediaUrl(name, matteSrc(hit.clip.src))}?v=${version}`) || matte.seeking) return;
  const target = video.dataset.ready === '1' && !video.seeking ? video.currentTime : hit.srcTime;
  const drift = target - matte.currentTime;
  if (playing) {
    if (matte.paused) matte.play().catch(() => {});
    if (Math.abs(drift) > MATTE_SLACK) matte.currentTime = target;
    else matte.playbackRate = 1 + Math.max(-0.2, Math.min(0.2, drift * 2));
  } else {
    if (!matte.paused) matte.pause();
    matte.playbackRate = 1;
    if (Math.abs(drift) > 0.01) matte.currentTime = target;
  }
}

function syncVideo(video: HTMLVideoElement, p: Project, name: string, t: number, playing: boolean) {
  const hit = footageAt(p, t);
  if (!hit) {
    if (!video.paused) video.pause();
    return;
  }
  if (!load(video, mediaUrl(name, hit.clip.src))) return;
  if (video.seeking) return;
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
    const url = mediaUrl(name, a.src);
    if (!el || el.dataset.src !== url) { el?.pause(); el = new Audio(url); el.dataset.src = url; el.preload = 'auto'; sounds.set(a.id, el); }
    el.volume = Math.max(0, Math.min(1, a.gain));
    const local = t - a.at, len = Number.isFinite(el.duration) ? el.duration : 0;
    const inside = local >= 0 && local < (len || 0.05);
    if (playing && inside) {
      if (el.paused) { el.currentTime = local; el.play().catch(() => {}); }
    } else if (!el.paused) el.pause();
  }
}
