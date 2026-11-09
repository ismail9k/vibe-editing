// Out of the frame: the shot becomes a card whose top edge drops to your eyes, and you stay whole above it.
export default {
  draw(p, { t, props }) {
    const c = p.ctx, k = p.enter(t, 'heavy'), scale = Math.min(0.95, Math.max(0.4, Number(props.scale) || 0.76));
    const s = 1 - (1 - scale) * k, cy = p.H * (0.5 + 0.04 * k), b = p.subjectBox();
    const top = b.head.y * k;                        // the card's top edge, in film coordinates
    const X = (fx) => p.W / 2 + (fx - p.W / 2) * s, Y = (fy) => cy + (fy - p.H / 2) * s;
    const card = { x: X(0), y: Y(top), w: p.W * s, h: Y(p.H) - Y(top) };
    p.background(t);
    const pad = p.rem * 0.5 * k;
    p.panel({ x: card.x - pad, y: card.y - pad, w: card.w + pad * 2, h: card.h + pad * 2 }, { variant: 'flat' });
    const film = () => { c.translate(p.W / 2, cy); c.scale(s, s); c.translate(-p.W / 2, -p.H / 2); };
    c.save(); c.beginPath(); c.rect(card.x, card.y, card.w, card.h); c.clip(); film(); p.footage(); c.restore();
    c.save(); c.beginPath(); c.rect(card.x, 0, card.w, card.y + card.h); c.clip(); film(); p.subject(); c.restore();
    if (props.label) {
      const str = String(props.label);
      p.text(str, p.W / 2, card.y + card.h + pad + p.rem * 2, { role: 'display', size: p.rem * 1.4, weight: 700, align: 'center', maxWidth: p.W * 0.86,
        progress: Math.max(0, Math.min(1, ((t - 0.5) * 24) / Math.max(1, [...str].length))) });
    }
  },
};
