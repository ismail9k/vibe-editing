// A canvas that draws a project at time t. `time` may be a function, read on every animation frame.
import { useEffect, useRef } from 'react';
import { renderFrame, type Library } from '../../core/render';
import type { Project } from '../../core/model';

interface Props {
  project: Project;
  lib: Library;
  time: number | (() => number);
  animate?: boolean;
  className?: string;
  onErrors?: (errors: string[]) => void;
}

export function FrameCanvas({ project, lib, time, animate = false, className, onErrors }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const latest = useRef({ project, lib, time, onErrors });
  latest.current = { project, lib, time, onErrors };

  useEffect(() => {
    const canvas = ref.current!;
    const draw = () => {
      const { project, lib, time, onErrors } = latest.current;
      if (canvas.width !== project.format.w || canvas.height !== project.format.h) {
        canvas.width = project.format.w; canvas.height = project.format.h;
      }
      const t = typeof time === 'function' ? time() : time;
      const errors = renderFrame(canvas.getContext('2d')!, project, lib, t);
      onErrors?.(errors);
    };
    draw();
    if (!animate) return;
    let raf = 0;
    const loop = () => { draw(); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [animate, project, lib, typeof time === 'number' ? time : 0]);

  return <canvas ref={ref} className={className} style={{ aspectRatio: `${project.format.w} / ${project.format.h}` }} />;
}
