// A zoom-through transition: accelerate into the frame, land on the cut at the deepest point, decelerate out of the next shot.
export default {
  draw(p, { t, dur, props }) {
    const depth = Math.max(1.5, Number(props.depth) || 5), u = Math.min(1, Math.max(0, t / dur));
    const e = u < 0.5 ? Math.pow(u * 2, 3) : Math.pow((1 - u) * 2, 3);
    const b = p.subjectBox();
    const focus = props.on === 'center' ? [0.5, 0.5] : [b.head.x / p.W, b.head.y / p.H];
    p.footage({ zoom: 1 + (depth - 1) * e, focus });
  },
};
