// The reel's format: title on top, a numbered list on the reading-start side that fills in as each look arrives,
// and on the other side a card of your shot. Each new look wipes over the last with a hard edge.
const NAMES = {
  neon: 'Neon', sketch: 'Pencil sketch', comic: 'Comic', chalk: 'Chalkboard', pixel: 'Pixel art',
  riso: 'Riso print', lowpoly: 'Low poly', papercut: 'Paper cut', bricks: 'Bricks', terminal: 'Terminal',
  hologram: 'Hologram', cyberpunk: 'Cyberpunk neon', isometric: 'Isometric', blueprint: 'Blueprint',
  thermal: 'Thermal cam', anime: 'Anime cel', watercolor: 'Watercolour', clay: 'Claymation',
  woodblock: 'Woodblock print', noir: 'Noir comic', oldcartoon: '1930s cartoon', crt: 'CRT vector', sumi: 'Sumi ink',
  knit: 'Knitted', ps2: 'PS2 style', synthwave: 'Synthwave', marble: 'Marble museum', underwater: 'Underwater',
  collage: 'Collage',
};
const LEAD = 0.5, WIPE = 0.3;
const clamp = (v) => Math.min(1, Math.max(0, v));

export default {
  draw(p, { t, props }) {
    const ids = Array.isArray(props.looks) ? props.looks.map(String) : [];
    const names = Array.isArray(props.names) ? props.names.map(String) : [];
    const items = ids.map((id, i) => ({ id, name: (names[i] ?? '').trim() || NAMES[id] })).filter((it) => NAMES[it.id]);
    if (!items.length) { p.footage(); return; }
    const each = Math.max(0.3, Number(props.each) || 1.1);
    const cur = Math.max(0, Math.min(items.length - 1, Math.floor((t - LEAD) / each)));
    const into = t - (LEAD + cur * each);
    const rtl = p.dir === 'rtl', c = p.ctx, rem = p.rem;

    p.background(t);
    const title = String(props.title ?? ''), sub = String(props.subtitle ?? '');
    if (title) p.text(title, p.W / 2, p.H * 0.1, { role: 'display', size: rem * 2.6, weight: 800, align: 'center', maxWidth: p.W * 0.88, progress: clamp((t * 30) / [...title].length) });
    if (sub) p.text(sub, p.W / 2, p.H * 0.1 + rem * 2.4, { size: rem * 1.1, align: 'center', color: p.theme.muted, maxWidth: p.W * 0.8 });

    // The card on the reading-end side, the list on the start side.
    const margin = p.W * 0.06, cw = p.W * 0.5, ch = (cw * 16) / 9, top = p.H * 0.2;
    const card = { x: rtl ? margin : p.W - margin - cw, y: top + (1 - p.enter(t, 'default')) * rem * 2, w: cw, h: ch };
    const listW = p.W - margin * 3 - cw, start = rtl ? p.W - margin : margin;
    const row = Math.min(rem * 3, (ch - rem) / items.length);
    items.forEach((it, i) => {
      const y = top + rem * 1.4 + i * row, from = i === 0 ? 0 : LEAD + i * each, reached = t >= from;
      const now = i === cur;
      p.text(String(i + 1), start, y, { role: 'mono', size: rem * 1.05, weight: 700, color: reached ? p.brand.colors.accent : p.theme.muted });
      if (reached) {
        p.text(it.name, rtl ? start - rem * 1.8 : start + rem * 1.8, y, {
          size: rem * (now ? 1.4 : 1.2), weight: now ? 700 : 500, color: now ? p.theme.text : p.theme.muted,
          maxWidth: listW - rem * 1.8, progress: clamp((t - from) / 0.3), caret: false,
        });
      }
    });

    c.save();
    c.beginPath(); c.roundRect(card.x, card.y, card.w, card.h, rem * 0.8); c.clip();
    const prev = cur > 0 && into < WIPE ? items[cur - 1] : null;
    if (prev) {
      p.footage({ look: prev.id, rect: card });
      const k = clamp(into / WIPE), w = card.w * k * k * (3 - 2 * k);
      c.beginPath(); c.rect(rtl ? card.x + card.w - w : card.x, card.y, w, card.h); c.clip();
    }
    p.footage({ look: items[cur].id, rect: card });
    c.restore();
    p.pill(card, { stroke: p.theme.border, radius: rem * 0.8 });
  },
};
