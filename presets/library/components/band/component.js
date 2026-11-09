export default {
  draw(p, { t, props, place }) {
    const box = place({ y: 0.56, w: 1 }), h = p.H * 0.14, rtl = p.dir === 'rtl';
    const k = p.enter(t, 'heavy'), w = p.W * k;
    p.pill({ x: rtl ? p.W - w : 0, y: box.y, w, h }, { fill: p.brand.colors.primary, radius: 0 });
    const text = String(props.text), size = p.fit(text, { role: 'display', size: p.rem * 3, weight: 700, maxWidth: p.W * 0.86 });
    const cps = 24, typing = Math.min(1, Math.max(0, t - 0.2) * cps / [...text].length);
    const cy = box.y + h / 2 + size * 0.35;
    p.text(text, p.W / 2, cy, { role: 'display', size, weight: 700, color: p.brand.colors.onPrimary, align: 'center', progress: typing });
    const word = String(props.underline || '');
    const i = word ? text.indexOf(word) : -1;
    if (i >= 0 && typing >= 1) {
      const o = { role: 'display', size, weight: 700 };
      const full = p.measure(text, o), before = p.measure(text.slice(0, i), o), ww = p.measure(word, o);
      const x0 = rtl ? p.W / 2 + full / 2 - before : p.W / 2 - full / 2 + before;
      p.rule(x0, cy + size * 0.18, ww, { progress: p.m.tween(t, 0.2 + [...text].length / cps, 0.35) });
    }
  },
};
