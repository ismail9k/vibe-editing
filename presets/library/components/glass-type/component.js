// Frosted-glass letters between you and the room: the shot, blurred and lifted, cut into the shape of the word.
export default {
  draw(p, { t, props }) {
    const c = p.ctx, word = String(props.text ?? ''), blur = Math.max(0, Number(props.blur) || 18);
    p.footage();
    if (word) {
      const size = Math.min(p.H * 0.3, (p.W * 0.94 * 100) / Math.max(1, p.measure(word, { role: 'display', size: 100, weight: 700 })));
      const y = p.H * 0.42 + size * 0.35, progress = Math.min(1, (t * 8) / Math.max(1, [...word].length));
      // Draw the word into a mask and the frosted shot into a layer (the painter pointed at each in turn),
      // then keep the frost only inside the letters.
      const onto = (draw) => { const layer = p.canvas(p.W, p.H), own = p.ctx; p.ctx = layer.getContext('2d'); try { draw(); } finally { p.ctx = own; } return layer; };
      const mask = onto(() => p.text(word, p.W / 2, y, { role: 'display', size, weight: 700, align: 'center', progress, caret: false }));
      const glass = onto(() => p.footage({ filter: `blur(${blur}px) brightness(1.45) saturate(0.7)` }));
      const g = glass.getContext('2d');
      g.globalCompositeOperation = 'destination-in'; g.drawImage(mask, 0, 0);
      c.drawImage(glass, 0, 0);
      c.save(); c.globalAlpha *= 0.14;
      p.text(word, p.W / 2, y, { role: 'display', size, weight: 700, align: 'center', color: p.brand.colors.onPrimary, progress, caret: false });
      c.restore();
    }
    p.subject();
  },
};
