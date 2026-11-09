// A punch-in: the shot zooms towards your face on a heavy spring and holds; optionally eases back out.
export default {
  draw(p, { t, dur, props }) {
    const zoom = Math.max(1, Number(props.zoom) || 1.6);
    const k = p.enter(t, 'heavy') - (props.back ? p.enter(t - (dur - 0.7), 'default') : 0);
    const b = p.subjectBox();
    const focus = props.on === 'center' ? [0.5, 0.5] : [b.head.x / p.W, (b.head.y + b.head.r * 0.35) / p.H];
    p.footage({ zoom: 1 + (zoom - 1) * Math.max(0, k), focus });
  },
};
