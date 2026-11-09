// Drawn scenery for films without footage (the illustrated reels): flat shapes in the mode's tokens, moving slowly
// enough to sit behind text. Everything random is seeded and everything moving is a function of t.
const TAU = Math.PI * 2;

/** A hill's height at x: a few slow sine waves, so each hill has its own shape. */
export function hill(x, W, seed) {
  return Math.sin((x / W) * Math.PI * (1.2 + seed * 0.3) + seed * 2) * 0.5 + Math.sin((x / W) * Math.PI * 3.1 + seed * 5) * 0.2;
}

function fillHill(c, W, H, top, amp, seed, color) {
  c.fillStyle = color;
  c.beginPath(); c.moveTo(0, H);
  for (let x = 0; x <= W; x += W / 60) c.lineTo(x, top - hill(x, W, seed) * amp);
  c.lineTo(W, H); c.closePath(); c.fill();
}

function night(p, t) {
  const c = p.ctx, { W, H } = p, r = p.rng('night');
  c.fillStyle = p.theme.bg; c.fillRect(0, 0, W, H);
  for (let i = 0; i < 90; i++) {
    const x = r() * W, y = r() * H * 0.62, s = r() < 0.15 ? 3 : 2, ph = r();
    c.globalAlpha = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(TAU * (t / (2 + ph * 3) + ph)));
    c.fillStyle = p.theme.text; c.fillRect(Math.round(x), Math.round(y), s, s);
  }
  c.globalAlpha = 1;
  // The moon: a crescent cut from a full disc, bobbing a little.
  const mr = W * 0.09, mx = W * 0.74, my = H * 0.36 + Math.sin(t * 0.6) * p.rem * 0.2;
  const moon = p.canvas(Math.ceil(mr * 2.4), Math.ceil(mr * 2.4)), g = moon.getContext('2d');
  // In light mode the sky is pale, so the moon is the glow's amber rather than a dark disc.
  g.fillStyle = p.mode === 'light' ? p.theme.glow[1] : p.theme.text; g.beginPath(); g.arc(mr * 1.2, mr * 1.2, mr, 0, TAU); g.fill();
  g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(mr * 1.62, mr * 0.95, mr * 0.88, 0, TAU); g.fill();
  c.drawImage(moon, mx - mr * 1.2, my - mr * 1.2);
  // Light mode's surfaces are white like its sky, so its hills are drawn in the border grey instead.
  const light = p.mode === 'light';
  if (light) c.globalAlpha = 0.55;
  fillHill(c, W, H, H * 0.7, H * 0.05, 1, light ? p.theme.border : p.theme.raised);
  c.globalAlpha = 1;
  fillHill(c, W, H, H * 0.8, H * 0.04, 3, light ? p.theme.border : p.theme.surface);
  // The house on the near hill, its window lit.
  const hx = W * 0.3, base = H * 0.8 - hill(hx, W, 3) * H * 0.04 + p.rem * 0.4, hw = W * 0.2, hh = hw * 0.7;
  c.fillStyle = p.theme.sunken; c.fillRect(hx - hw / 2, base - hh, hw, hh);
  c.fillRect(hx + hw * 0.18, base - hh - hw * 0.42, hw * 0.12, hw * 0.3); // chimney
  c.fillStyle = p.brand.colors.primary;
  c.beginPath(); c.moveTo(hx - hw * 0.62, base - hh); c.lineTo(hx, base - hh - hw * 0.45); c.lineTo(hx + hw * 0.62, base - hh); c.closePath(); c.fill();
  // Lamplight: amber (the dark mode's warning tone, the light glow's middle), flickering a little.
  const flick = 0.85 + 0.15 * Math.sin(t * 7) * Math.sin(t * 3.1), ws = hw * 0.22, lamp = p.mode === 'dark' ? p.theme.warning ?? p.theme.glow[1] : p.theme.glow[1];
  c.save(); c.globalAlpha = 0.35 * flick; c.shadowColor = lamp; c.shadowBlur = p.rem * 2;
  c.fillStyle = lamp; c.fillRect(hx - ws / 2, base - hh * 0.68, ws, ws); c.restore();
  c.fillStyle = lamp; c.globalAlpha = flick; c.fillRect(hx - ws / 2, base - hh * 0.68, ws, ws); c.globalAlpha = 1;
  c.fillStyle = p.theme.sunken; c.fillRect(hx - p.rem * 0.04, base - hh * 0.68, p.rem * 0.08, ws); c.fillRect(hx - ws / 2, base - hh * 0.68 + ws / 2 - p.rem * 0.04, ws, p.rem * 0.08);
}

function sea(p, t) {
  const c = p.ctx, { W, H, rem } = p, r = p.rng('sea');
  c.fillStyle = p.theme.bg; c.fillRect(0, 0, W, H);
  // Depth in printed steps of the brand green: lightest at the surface.
  c.fillStyle = p.brand.colors.primary;
  for (let i = 0; i < 6; i++) { c.globalAlpha = 0.07; c.fillRect(0, 0, W, H * (0.12 + i * 0.1)); }
  // Light shafts swaying from the surface.
  c.fillStyle = p.theme.text;
  for (let i = 0; i < 5; i++) {
    const x = W * (0.1 + i * 0.2) + Math.sin(t * 0.4 + i) * W * 0.04, w = W * (0.04 + 0.03 * ((i * 7) % 3));
    c.globalAlpha = 0.035 + 0.02 * Math.sin(t * 0.7 + i * 2);
    c.beginPath(); c.moveTo(x, 0); c.lineTo(x + w, 0); c.lineTo(x + w * 3 - W * 0.12, H * 0.85); c.lineTo(x - W * 0.12, H * 0.85); c.closePath(); c.fill();
  }
  c.globalAlpha = 1;
  // Fish crossing at their own depths and speeds, wrapping round.
  for (let i = 0; i < 7; i++) {
    const y = H * (0.25 + r() * 0.5), s = rem * (0.8 + r() * 1.2), v = rem * (0.8 + r() * 1.6) * (r() < 0.5 ? -1 : 1), x0 = r() * W;
    const span = W + s * 6, x = ((((x0 + v * t) % span) + span) % span) - s * 3, d = Math.sign(v), wag = Math.sin(t * 6 + i) * 0.25;
    c.fillStyle = i % 3 ? p.theme.raised : p.theme.border;
    c.beginPath(); c.ellipse(x, y + Math.sin(t + i) * rem * 0.3, s, s * 0.45, 0, 0, TAU); c.fill();
    c.beginPath(); c.moveTo(x - d * s * 0.85, y); c.lineTo(x - d * s * 1.6, y - s * (0.45 + wag)); c.lineTo(x - d * s * 1.6, y + s * (0.45 - wag)); c.closePath(); c.fill();
  }
  fillHill(c, W, H, H * 0.88, H * 0.025, 2, p.theme.surface);
  // Weed on the floor, swaying (through the painter, so styles restyle it).
  for (let i = 0; i < 9; i++) {
    const bx = W * (0.05 + i * 0.11 + r() * 0.04), by = H * 0.9, len = H * (0.08 + r() * 0.1), pts = [];
    for (let k = 0; k <= 8; k++) { const f = k / 8; pts.push([bx + Math.sin(t * 1.1 + i + f * 3) * rem * 0.8 * f, by - len * f]); }
    p.line(pts, { color: p.theme.primaryText, width: rem * 0.22 });
  }
  // Bubbles rising.
  c.strokeStyle = p.theme.text; c.lineWidth = Math.max(1, rem / 16);
  for (let i = 0; i < 16; i++) {
    const bx = r() * W, sp = rem * (1.5 + r() * 2), rad = rem * (0.12 + r() * 0.25), ph = r() * H;
    const y = H * 0.9 - ((ph + sp * t) % (H * 0.9));
    c.globalAlpha = 0.35; c.beginPath(); c.arc(bx + Math.sin(t * 2 + i) * rem * 0.3, y, rad, 0, TAU); c.stroke();
  }
  c.globalAlpha = 1;
}

function museum(p, t) {
  const c = p.ctx, { W, H, rem } = p, floor = H * 0.78, light = p.mode === 'light';
  // White marble needs a wall it stands out from: dark walls in dark mode, a grey room in light mode.
  const tone = light
    ? { wall: p.theme.sunken, panel: p.theme.border, marble: p.theme.surface, shade: p.theme.text, plinth: p.theme.border }
    : { wall: p.theme.surface, panel: p.theme.sunken, marble: p.theme.text, shade: p.theme.bg, plinth: p.theme.raised };
  c.fillStyle = tone.wall; c.fillRect(0, 0, W, floor);
  c.save(); if (light) c.globalAlpha = 0.5; c.fillStyle = tone.panel; c.fillRect(0, floor - H * 0.16, W, H * 0.16); c.restore();
  p.rule(p.dir === 'rtl' ? W : 0, floor - H * 0.16, W, { color: p.theme.border, height: Math.max(2, rem * 0.08) });
  c.fillStyle = p.theme.bg; c.fillRect(0, floor, W, H - floor);
  c.strokeStyle = p.theme.border; c.lineWidth = 1;
  for (let i = -6; i <= 6; i++) { c.beginPath(); c.moveTo(W / 2 + i * W * 0.08, floor); c.lineTo(W / 2 + i * W * 0.3, H); c.stroke(); }
  // The picture: a frame with the brand's glow behind a hill, hung high.
  const fw = W * 0.56, fh = fw * 0.72, fx = (W - fw) / 2, fy = H * 0.1, m = rem * 0.8;
  c.fillStyle = p.theme.raised; c.fillRect(fx, fy, fw, fh);
  c.strokeStyle = p.theme.border; c.lineWidth = rem * 0.12; c.strokeRect(fx + rem * 0.06, fy + rem * 0.06, fw - rem * 0.12, fh - rem * 0.12);
  c.save();
  c.beginPath(); c.rect(fx + m, fy + m, fw - m * 2, fh - m * 2); c.clip();
  c.fillStyle = p.theme.bg; c.fillRect(fx + m, fy + m, fw - m * 2, fh - m * 2);
  c.globalAlpha = 0.9; c.fillStyle = p.theme.glow[2];
  c.beginPath(); c.arc(fx + fw * 0.62, fy + fh * 0.48, fw * 0.12, 0, TAU); c.fill();
  c.globalAlpha = 1;
  c.translate(fx, fy); fillHill(c, fw, fh, fh * 0.66, fh * 0.08, 4, p.brand.colors.primary);
  c.restore();
  // The spotlight on the bust.
  const bx = W / 2, top = H * 0.44;
  c.save(); c.globalAlpha = 0.05 + 0.01 * Math.sin(t * 0.8); c.fillStyle = p.theme.text;
  c.beginPath(); c.moveTo(bx - W * 0.05, 0); c.lineTo(bx + W * 0.05, 0); c.lineTo(bx + W * 0.3, floor + H * 0.04); c.lineTo(bx - W * 0.3, floor + H * 0.04); c.closePath(); c.fill(); c.restore();
  // Plinth and a marble bust: head, neck, shoulders, a little shade on one side.
  const pw = W * 0.32, ph = H * 0.2;
  c.fillStyle = tone.plinth; c.fillRect(bx - pw / 2, floor - ph + H * 0.03, pw, ph);
  c.fillStyle = p.theme.border; c.fillRect(bx - pw * 0.56, floor - ph + H * 0.03, pw * 1.12, rem * 0.5);
  const hr = W * 0.075, hy = top + hr, sy = floor - ph + H * 0.03;
  const bust = () => {
    c.beginPath(); c.moveTo(bx - W * 0.17, sy); c.quadraticCurveTo(bx - W * 0.16, hy + hr * 1.6, bx - hr * 0.45, hy + hr * 1.25);
    c.ellipse(bx, hy, hr * 0.82, hr, 0, Math.PI * 0.62, Math.PI * 2.38);
    c.lineTo(bx + hr * 0.45, hy + hr * 1.25); c.quadraticCurveTo(bx + W * 0.16, hy + hr * 1.6, bx + W * 0.17, sy); c.closePath();
  };
  c.save();
  c.fillStyle = tone.marble; bust(); c.fill();
  if (light) { c.strokeStyle = p.theme.border; c.lineWidth = Math.max(1, rem / 16); c.stroke(); }
  c.clip();
  // Shade on the side away from the spotlight, kept inside the marble.
  c.globalAlpha = light ? 0.08 : 0.16; c.fillStyle = tone.shade;
  c.beginPath(); c.ellipse(bx + hr * 0.5, hy, hr * 0.55, hr * 1.1, 0, 0, TAU); c.fill();
  c.fillRect(bx + W * 0.04, hy + hr * 1.2, W * 0.2, sy - hy);
  c.restore();
  c.globalAlpha = 1;
}

const SCENES = { night, sea, museum };

export default {
  draw(p, { t, props }) {
    (SCENES[String(props.scene)] ?? night)(p, t);
  },
};
