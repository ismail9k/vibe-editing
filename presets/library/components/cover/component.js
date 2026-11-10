// The 9k reel cover: wordmark and hashtag on one row, a huge typed headline with its key words in green,
// the sub line on a green box, and one orange burst. It draws no background, so it sits on whatever is under it.
const ZWJ = '‍';

export default {
  draw(p, { t, props, place }) {
    const box = place({ y: 0.14, w: 0.84 }), rtl = p.dir === 'rtl', c = p.ctx;
    const white = p.theme.text, green = p.theme.primaryText;
    // Physical-left text, so Latin words sit where they're measured in either direction.
    const leftAlign = rtl ? 'end' : 'start';

    // ---- Top row: the hashtag at the start edge, the wordmark (typed, with its green underscore) at the end.
    const rowH = p.rem * 2;
    const kTop = p.enter(t, 'default');
    c.save(); c.globalAlpha *= Math.min(1, kTop * 1.5);
    if (props.tag) p.badge(String(props.tag), box.start, box.y + (1 - kTop) * p.rem * 0.5, { variant: 'tag', size: p.rem * 0.8, align: 'start' });
    c.restore();
    const handle = String(props.handle ?? '');
    if (handle) {
      const o = { role: 'display', size: p.rem * 1.2, weight: 700 };
      const w = p.measure(handle, o), us = p.measure('_', o), base = box.y + rowH * 0.5 + o.size * 0.36;
      const left = rtl ? box.left : box.right - w - us;
      const typing = Math.min(1, (t * 16) / [...handle].length);
      p.text(handle, left, base, { ...o, align: leftAlign, color: white, progress: typing });
      if (typing >= 1) p.text('_', left + w, base, { ...o, align: leftAlign, color: p.brand.colors.primary }); // the deep green, as on the site
    }

    // ---- The headline: wrapped by hand so we know where each word lands, typed across its lines.
    const raw = String(props.title ?? '');
    let size = p.rem * Number(props.size || 4.2);
    const o = { role: 'display', weight: 700 };
    const longest = Math.max(1, ...raw.split(/\s+/).map((w) => p.measure(w, { ...o, size })));
    if (longest > box.w) size *= box.w / longest;
    // Lines broken by hand stay whole: shrink (to 70 % at most) before wrapping them.
    if (/\\n|\n/.test(raw)) {
      const widest = Math.max(1, ...raw.split(/\\n|\n/).map((l) => p.measure(l.trim(), { ...o, size })));
      if (widest > box.w) size *= Math.max(0.7, box.w / widest);
    }
    const lines = [];
    let offset = 0; // char offset in the flat text (paragraphs and words joined by single spaces)
    for (const para of raw.split(/\\n|\n/)) {
      let cur = '', start = offset;
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const next = cur ? `${cur} ${word}` : word;
        if (cur && p.measure(next, { ...o, size }) > box.w) { lines.push({ text: cur, start }); start += [...cur].length + 1; cur = word; }
        else cur = next;
      }
      if (cur) lines.push({ text: cur, start });
      offset = start + [...cur].length + 1;
    }
    const flat = lines.map((l) => l.text).join(' ');
    const hl = String(props.highlight ?? '').trim();
    const at = hl ? flat.indexOf(hl) : -1;
    const hs = at < 0 ? -1 : [...flat.slice(0, at)].length, he = hs + [...hl].length; // in characters, like the line offsets
    const total = lines.reduce((n, l) => n + [...l.text].length, 0), cps = 20, t0 = 0.3;
    const typed = Math.max(0, Math.round((t - t0) * cps));
    const lh = size * 1.1;
    let y = box.y + rowH + p.rem * 0.9 + size * 0.95, done = 0;
    // Width of the text before a cut, measured as it joins to what follows (so Arabic letters keep their joined form).
    const upTo = (line, n) => {
      const chars = [...line], s = chars.slice(0, n).join('');
      return p.measure(n > 0 && n < chars.length && chars[n] !== ' ' ? s + ZWJ : s, { ...o, size });
    };
    lines.forEach((line, i) => {
      const n = [...line.text].length, shown = Math.min(n, typed - done);
      const ly = y + i * lh;
      done += n;
      if (shown <= 0 && !(i === 0 && t >= t0)) return;
      const prog = n ? Math.max(0, shown) / n : 1;
      p.text(line.text, box.start, ly, { ...o, size, color: white, progress: prog, caret: shown < n });
      // The green words: the same line again in green, clipped to where they sit.
      if (hs < 0) return;
      const a = Math.max(hs, line.start) - line.start, b = Math.min(he, line.start + n) - line.start;
      if (b <= a) return;
      const x1 = upTo(line.text, a), x2 = upTo(line.text, b);
      c.save();
      c.beginPath();
      c.rect(rtl ? box.start - x2 : box.start + x1, ly - size * 1.3, x2 - x1, size * 1.9);
      c.clip();
      p.text(line.text, box.start, ly, { ...o, size, color: green, progress: prog, caret: false });
      c.restore();
    });
    let bottom = y + (lines.length - 1) * lh + size * 0.4;

    // ---- The sub line on a green box, wiping open from the start edge once the headline is typed.
    const after = t0 + total / cps;
    const sub = String(props.sub ?? '');
    if (sub) {
      const so = { role: 'body', size: p.rem * 1.3, weight: 600 };
      const padX = p.rem * 0.4, h = so.size * 1.55, w = Math.min(box.w, p.measure(sub, so) + padX * 2);
      const k = p.enter(t - after - 0.05, 'heavy');
      if (k > 0) {
        const ww = w * k;
        p.pill({ x: rtl ? box.start - ww : box.start, y: bottom, w: ww, h }, { fill: p.brand.colors.primary, radius: p.rem * 0.15 });
        c.save(); c.globalAlpha *= p.m.clamp((k - 0.5) * 2);
        p.text(sub, rtl ? box.start - padX : box.start + padX, bottom + h / 2 + so.size * 0.06, { ...so, color: p.brand.colors.onPrimary, baseline: 'middle', maxWidth: box.w - padX * 2 });
        c.restore();
      }
      bottom += h;
    }

    // ---- One orange burst near the start edge, popping in last and turning slowly.
    if (props.burst !== false) {
      const k = p.enter(t - after - 0.35, 'snappy');
      if (k > 0) {
        const r = p.rem * 1.05 * k, cx = rtl ? box.start - r : box.start + r - p.rem * 0.2, cy = bottom + p.rem * 2.6;
        const spin = t * 0.25;
        for (let i = 0; i < 6; i++) {
          const a = spin + (i * Math.PI) / 6, rr = i % 2 ? r * 0.72 : r;
          p.line([[cx - Math.cos(a) * rr, cy - Math.sin(a) * rr], [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]], { color: p.brand.colors.accent, width: p.rem * 0.2 });
        }
      }
    }
  },
};
