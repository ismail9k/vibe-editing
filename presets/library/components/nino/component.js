export default {
  draw(p, { t, props, graphic }) {
    const size = p.rem * Number(props.size || 5), margin = p.rem * 2;
    const atEnd = props.corner !== 'start', rtl = p.dir === 'rtl';
    const right = atEnd !== rtl;
    const x = graphic.x !== undefined ? graphic.x * p.W - size / 2 : right ? p.W - margin - size : margin;
    const y0 = (graphic.y ?? 0.6) * p.H;
    const k = p.enter(t, 'playful');
    p.nino(x, y0 + (1 - k) * size * 0.8, size, { expression: String(props.expression), t, look: right ? 'start' : 'end', white: p.mode === 'green' });
  },
};
