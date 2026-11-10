// The starting point for a new component (`vibe component new`, the Studio's "+ New component"): a small working
// component that shows the house idioms (place(), a spring in, typed text, RTL-aware edges) for Claude to rewrite.
import type { ComponentMeta } from './validate';

/** A component's folder name from a display name: "Big Number!" -> "big-number" ('' when nothing is left). */
export const componentId = (name: string) => name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** A display name from a folder name: "big-number" -> "Big Number". */
export const componentName = (id: string) => id.split('-').filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

/** Folder names a component can have: lowercase letters, digits and single dashes. */
export const COMPONENT_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function componentTemplate(name: string): { meta: ComponentMeta; code: string } {
  const meta: ComponentMeta = {
    name,
    description: 'A panel with a typed title and a sub line that lands after it. A starting point: rewrite it.',
    duration: 3,
    defaults: { title: 'Your title here', sub: 'A sub line that lands after it' },
    schema: { title: { type: 'text', label: 'Title' }, sub: { type: 'text', label: 'Sub line' } },
  };
  const code = `// ${name.replace(/\n/g, ' ')}: a starting point from \`vibe component new\`. Rewrite draw() for what it should show.
// Draw through the painter \`p\`, never raw canvas calls for the look, so every style can restyle it. Colours come
// from p.theme and p.brand. The guide is "Writing a component" in the workspace's CLAUDE.md.
export default {
  draw(p, { t, props, place }) {
    // Where it sits, as frame fractions (centre x, top y, width). Dragging it on the preview overrides these.
    const box = place({ y: 0.4, w: 0.84 }), pad = p.rem * 1.4, inner = box.w - pad * 2;
    const start = p.dir === 'rtl' ? box.right - pad : box.left + pad; // the reading-start edge, inside the panel
    const title = String(props.title), sub = String(props.sub || '');
    const to = { role: 'display', size: p.rem * 2, weight: 700 }, so = { role: 'body', size: p.rem * 1.1 };
    const h = pad * 2 + to.size * 1.1 + (sub ? p.rem * 0.6 + so.size * 1.3 : 0);

    // In: the panel springs open, the title types at 24 letters a second, then the sub line lands.
    const k = p.enter(t, 'default');
    p.panel({ x: box.left, y: box.y, w: box.w, h }, { variant: 'feature', progress: k });
    const cps = 24, len = [...title].length;
    p.text(title, start, box.y + pad + to.size * 0.9, { ...to, maxWidth: inner, progress: Math.min(1, ((t - 0.15) * cps) / Math.max(1, len)) });
    if (sub) {
      const ks = p.enter(t - 0.15 - len / cps, 'default');
      p.ctx.save();
      p.ctx.globalAlpha *= ks;
      p.text(sub, start, box.y + pad + to.size * 1.1 + p.rem * 0.6 + so.size + (1 - ks) * p.rem * 0.5, { ...so, color: p.theme.muted, maxWidth: inner });
      p.ctx.restore();
    }
  },
};
`;
  return { meta, code };
}
