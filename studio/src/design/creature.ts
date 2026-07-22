// ── THE CREATURE COMPOSITOR — a reusable, AUTHORABLE part system. ──
// The engine owns the GENOME (stats: part indices + continuous tunes, rolled
// deterministically per address); this module owns the portrayal. Parts live in
// plain registries — to give the world more variety, ADD ENTRIES (and widen the
// matching slot count in the world's child_stats in the same pass).
//
// THE LAW (genome permanent, portrayal versioned): an address's STATS never
// change — but what a part index LOOKS like is this library's call. Growing a
// registry re-skins existing worlds (a visual version bump, like any game
// update). Never reorder existing entries casually — index N should keep its
// character across versions; append new parts at the end.
//
// ZOOM CONSISTENCY (same soul at every LOD): every drawing level reads the SAME
// stats — a district-view speck uses hue+size, a block-view silhouette adds
// torso proportions, the portrait adds every part. A creature must be
// recognizable as itself at all three.

export type Stats = Record<string, number>;
type Px = (x: number, y: number, w: number, h: number, c: string) => void;
export interface Ctx {
  px: Px;
  rnd: () => number;      // deterministic per-creature stream — stable placement
  cx: number;             // horizontal center
  by: number;             // torso top y
  bw: number;             // body width
  bh: number;             // body height
  body: string;           // base color
  accent: string;         // secondary color
  dark: string;           // outline/limb color
  size: number;           // 0..1 mass
}

// deterministic tiny hash-stream (per creature, stable across frames/visits)
export function stream(seed: number) {
  let s = Math.floor(seed * 2147483647) || 1;
  return () => {
    s = (s * 48271) % 2147483647;
    return s / 2147483647;
  };
}

// ---- PART REGISTRIES — append here to grow the bestiary's variety ----------

export const TORSOS: { name: string; draw: (c: Ctx) => void }[] = [
  { name: 'blob', draw: (c) => lump(c, c.bw, c.bh, c.by) },
  { name: 'long', draw: (c) => lump(c, c.bw * 1.3, c.bh * 0.7, c.by + c.bh * 0.2) },
  { name: 'tall', draw: (c) => lump(c, c.bw * 0.7, c.bh * 1.35, c.by - c.bh * 0.3) },
  {
    name: 'segmented',
    draw: (c) => {
      lump(c, c.bw * 0.55, c.bh * 0.9, c.by);
      c.px(c.cx - c.bw * 0.62 - 1, c.by + 1, c.bw * 0.42, c.bh * 0.75, c.body);
      c.px(c.cx + c.bw * 0.2 + 1, c.by + 1, c.bw * 0.42, c.bh * 0.75, c.body);
    },
  },
  { name: 'round', draw: (c) => lump(c, c.bw * 0.95, c.bh * 1.05, c.by) },
];

export const HEADS: { name: string; draw: (c: Ctx, hx: number, hy: number, r: number) => void }[] = [
  { name: 'round', draw: () => { /* bare skull */ } },
  { name: 'beaked', draw: (c, hx, hy, r) => c.px(hx + r / 2, hy - 1, r * 0.8, 2, c.accent) },
  {
    name: 'horned',
    draw: (c, hx, hy, r) => {
      c.px(hx - r / 2, hy - r / 2 - 3, 1, 3, c.dark);
      c.px(hx + r / 2 - 1, hy - r / 2 - 3, 1, 3, c.dark);
    },
  },
  {
    name: 'antenna',
    draw: (c, hx, hy, r) => {
      c.px(hx - 1, hy - r / 2 - 4, 1, 4, c.dark);
      c.px(hx - 1, hy - r / 2 - 5, 2, 2, c.accent);
    },
  },
  {
    name: 'crested',
    draw: (c, hx, hy, r) => {
      for (let i = 0; i < 3; i++) c.px(hx - r / 2 + i * 2, hy - r / 2 - 2 - i, 1, 2 + i, c.accent);
    },
  },
];

export const PATTERNS: { name: string; draw: (c: Ctx) => void }[] = [
  { name: 'plain', draw: () => {} },
  {
    name: 'spotted',
    draw: (c) => {
      for (let i = 0; i < 4 + c.size * 5; i++) c.px(c.cx - c.bw / 2 + c.rnd() * c.bw, c.by + c.rnd() * c.bh, 2, 2, c.accent);
    },
  },
  {
    name: 'striped',
    draw: (c) => {
      for (let x = -c.bw / 2 + 2; x < c.bw / 2 - 1; x += 4) c.px(c.cx + x, c.by + 1, 2, c.bh - 2, c.accent);
    },
  },
];

function lump(c: Ctx, w: number, h: number, y: number) {
  c.px(c.cx - w / 2, y, w, h, c.body);
  c.px(c.cx - w / 2 + 1, y - 1, w - 2, 1, c.body);
  c.px(c.cx - w / 2 + 1, y + h, w - 2, 1, c.body);
}

const idx = <T,>(arr: T[], v: number | undefined): T => arr[Math.max(0, Math.round(v ?? 0)) % arr.length];

/** the parts a genome resolves to — for card labels and codex text */
export function partsOf(s: Stats) {
  return {
    torso: idx(TORSOS, s.torso).name,
    head: idx(HEADS, s.head).name,
    pattern: idx(PATTERNS, s.pattern).name,
  };
}

/** FULL PORTRAIT — all parts, onto a 40×40 logical grid. */
export function drawCreature(cv: HTMLCanvasElement, s: Stats) {
  const G = 40;
  const ctx = cv.getContext('2d')!;
  ctx.clearRect(0, 0, G, G);
  const rnd = stream((s.species ?? 0) * 0.7 + (s.gene ?? 0) * 13.7 + 0.123);
  const size = s.size ?? 0.5;
  const height = s.height ?? 0.5;              // stature — independent of mass
  const flyer = (s.flyer ?? 0) > 0.5;
  const hue = (s.hue ?? 0) * 360, hue2 = (s.hue2 ?? 0.5) * 360;
  const body = `hsl(${hue},52%,${42 + size * 14}%)`;
  const accent = `hsl(${hue2},58%,52%)`;
  const dark = `hsl(${hue},45%,26%)`;
  const px: Px = (x, y, w, h, c) => {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
  };

  const bw = 10 + size * 16;
  const bh = (5 + size * 8) * (0.7 + height * 0.7);
  const cx = G / 2;
  const groundY = G - 6;
  const legLen = ((s.leglen ?? 0.3) * 9 + 1) * (0.6 + height * 0.8);
  const hover = flyer ? 6 + size * 3 : 0;
  const by = groundY - (flyer ? 1 : legLen) - bh - hover + (flyer ? 2 : 0);
  const c: Ctx = { px, rnd, cx, by, bw, bh, body, accent, dark, size };

  px(cx - bw * 0.4, groundY + 1, bw * 0.8, 2, 'rgba(0,0,0,0.28)');   // shadow

  if (!flyer) {
    const pairs = 1 + Math.round(((s.torso ?? 0) === 3 ? 2 : 1) + size);
    for (let i = 0; i < pairs; i++) {
      const lx = cx - bw * 0.36 + (i / Math.max(1, pairs - 1)) * bw * 0.72;
      px(lx, by + bh - 2, 2, legLen + 2, dark);
    }
  }

  idx(TORSOS, s.torso).draw(c);
  idx(PATTERNS, s.pattern).draw(c);

  if ((s.fur ?? 0) > 0.55) {
    for (let x = -bw / 2 + 1; x < bw / 2; x += 2) px(cx + x, by - 1 - rnd() * 2, 1, 2, accent);
  }

  if (flyer) {
    const ww = bw * 0.7, wy = by - 2;
    px(cx - bw / 2 - ww * 0.6, wy - 3, ww * 0.7, 3, accent);
    px(cx + bw / 2 - ww * 0.1, wy - 3, ww * 0.7, 3, accent);
    px(cx - bw / 2 - ww * 0.35, wy - 5, ww * 0.45, 2, accent);
    px(cx + bw / 2 + ww * 0.0, wy - 5, ww * 0.45, 2, accent);
  }

  const headR = 3 + size * 3.2;
  const hx = cx + bw / 2 - headR * 0.2, hy = by - headR * 0.6;
  px(hx - headR / 2, hy - headR / 2, headR, headR, body);
  idx(HEADS, s.head).draw(c, hx, hy, headR);
  const fierce = (s.temper ?? 0) > 0.66;
  px(hx + headR * 0.15, hy - headR * 0.15, 2, fierce ? 1 : 2, '#0f1018');
}

/** BLOCK-VIEW SILHOUETTE — the same soul, small: torso proportion + hue + head
 *  nub, no fine parts. For in-world stamping (terra critters, map views). */
export function drawSilhouette(px: Px, x: number, y: number, s: Stats, scale: number) {
  const size = s.size ?? 0.5;
  const height = s.height ?? 0.5;
  const flyer = (s.flyer ?? 0) > 0.5;
  const hue = (s.hue ?? 0) * 360;
  const body = `hsl(${hue},52%,${42 + size * 14}%)`;
  const dark = `hsl(${hue},45%,26%)`;
  const t = Math.round(s.torso ?? 0) % TORSOS.length;
  const w = Math.max(2, (2 + size * 4) * (t === 1 ? 1.3 : t === 2 ? 0.75 : 1) * scale);
  const h = Math.max(2, (1.5 + size * 2.5) * (t === 2 ? 1.3 : t === 1 ? 0.7 : 1) * (0.7 + height * 0.6) * scale);
  const lift = flyer ? h : 0;
  px(x - w / 2, y - h - lift, w, h, body);                                  // torso
  px(x + w / 2 - Math.max(1, w * 0.25), y - h - lift - 1, Math.max(1, w * 0.3), Math.max(1, h * 0.5), body); // head nub
  if (!flyer) px(x - w * 0.3, y - Math.max(1, h * 0.3), 1, Math.max(1, h * 0.4) + (s.leglen ?? 0.3) * 2 * scale, dark);
}
