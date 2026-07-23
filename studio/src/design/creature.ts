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
  // ── appended v2 (indices 5+) — body PLANS, not sizes. Keep the silhouette
  // readable (drawSilhouette reduces to torso proportion). Never reorder 0–4.
  {
    name: 'humped',
    draw: (c) => {                                              // a low back with a raised hump
      lump(c, c.bw, c.bh * 0.85, c.by + c.bh * 0.15);
      c.px(c.cx - c.bw * 0.18, c.by - c.bh * 0.25, c.bw * 0.36, c.bh * 0.5, c.body);
    },
  },
  {
    name: 'tapered',
    draw: (c) => {                                              // teardrop: broad front, thin rear
      lump(c, c.bw * 0.9, c.bh, c.by);
      c.px(c.cx - c.bw * 0.55, c.by + c.bh * 0.3, c.bw * 0.3, c.bh * 0.4, c.body);
    },
  },
  {
    name: 'plated-back',
    draw: (c) => {                                              // a stegosaur ridge of plates
      lump(c, c.bw, c.bh, c.by);
      for (let x = -c.bw * 0.3; x < c.bw * 0.3; x += 3) c.px(c.cx + x, c.by - 2, 2, 2, c.accent);
    },
  },
  {
    name: 'barrel',
    draw: (c) => lump(c, c.bw * 1.15, c.bh * 1.1, c.by - c.bh * 0.05),   // heavy-set, wide
  },
  {
    name: 'sinuous',
    draw: (c) => {                                              // an eel-like double-lump body
      lump(c, c.bw * 0.7, c.bh * 0.8, c.by);
      c.px(c.cx - c.bw * 0.7, c.by + c.bh * 0.3, c.bw * 0.5, c.bh * 0.55, c.body);
    },
  },
  {
    name: 'winged-body',
    draw: (c) => {                                              // side flaps flush to the torso
      lump(c, c.bw * 0.8, c.bh, c.by);
      c.px(c.cx - c.bw * 0.62, c.by + c.bh * 0.25, c.bw * 0.22, 2, c.accent);
      c.px(c.cx + c.bw * 0.4, c.by + c.bh * 0.25, c.bw * 0.22, 2, c.accent);
    },
  },
  {
    name: 'crested-back',
    draw: (c) => {                                              // a continuous dorsal fin
      lump(c, c.bw, c.bh, c.by);
      for (let x = -c.bw * 0.35; x < c.bw * 0.35; x += 1) {
        const d = 1 - Math.abs(x) / (c.bw * 0.35);
        c.px(c.cx + x, c.by - 1 - d * 2, 1, 1 + d * 2, c.accent);
      }
    },
  },
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
  // ── appended v2 (indices 5+) — SHAPES, not sizes; each reads at 40×40. Never
  // reorder 0–4 above (an address's head index must keep its character).
  {
    name: 'tusked',
    draw: (c, hx, hy, r) => {                                   // two downward fangs
      c.px(hx - r / 2 + 1, hy + r / 2 - 1, 1, 3, c.accent);
      c.px(hx + r / 2 - 1, hy + r / 2 - 1, 1, 3, c.accent);
    },
  },
  {
    name: 'frilled',
    draw: (c, hx, hy, r) => {                                   // a fan collar behind the skull
      for (let i = -2; i <= 2; i++) c.px(hx + i * 2, hy - r / 2 - 1, 1, 2 + Math.abs(2 - Math.abs(i)), c.accent);
    },
  },
  {
    name: 'eyestalk',
    draw: (c, hx, hy, r) => {                                   // one raised eye on a stalk
      c.px(hx, hy - r / 2 - 4, 1, 4, c.dark);
      c.px(hx - 1, hy - r / 2 - 6, 2, 2, c.body);
      c.px(hx, hy - r / 2 - 5, 1, 1, '#0f1018');
    },
  },
  {
    name: 'snouted',
    draw: (c, hx, hy, r) => c.px(hx + r / 2 - 1, hy, 3, r * 0.5, c.body),   // a blunt muzzle
  },
  {
    name: 'plated',
    draw: (c, hx, hy, r) => {                                   // an armored brow ridge
      c.px(hx - r / 2, hy - r / 2, r, 2, c.dark);
      c.px(hx - r / 2 + 1, hy - r / 2 - 1, r - 2, 1, c.dark);
    },
  },
  {
    name: 'twin-horned',
    draw: (c, hx, hy, r) => {                                   // curved paired horns, wider set
      c.px(hx - r / 2 - 1, hy - r / 2 - 2, 1, 2, c.dark);
      c.px(hx - r / 2, hy - r / 2 - 4, 1, 2, c.dark);
      c.px(hx + r / 2, hy - r / 2 - 2, 1, 2, c.dark);
      c.px(hx + r / 2 - 1, hy - r / 2 - 4, 1, 2, c.dark);
    },
  },
  {
    name: 'whiskered',
    draw: (c, hx, hy, r) => {                                   // side whiskers off the muzzle
      c.px(hx + r / 2, hy + 1, 3, 1, c.accent);
      c.px(hx + r / 2, hy + 3, 3, 1, c.accent);
    },
  },
  {
    name: 'crowned',
    draw: (c, hx, hy, r) => {                                   // a ring of short spikes on top
      for (let i = 0; i < 4; i++) c.px(hx - r / 2 + 1 + i * 2, hy - r / 2 - 2, 1, 2, c.accent);
    },
  },
  {
    name: 'hooded',
    draw: (c, hx, hy, r) => {                                   // a cobra-like hood framing the head
      c.px(hx - r / 2 - 2, hy - 1, 2, r * 0.7, c.accent);
      c.px(hx + r / 2, hy - 1, 2, r * 0.7, c.accent);
    },
  },
  {
    name: 'mandibled',
    draw: (c, hx, hy, r) => {                                   // insect pincers reaching forward
      c.px(hx + r / 2, hy, 3, 1, c.dark);
      c.px(hx + r / 2, hy + r / 2 - 1, 3, 1, c.dark);
      c.px(hx + r / 2 + 2, hy + 1, 1, r / 2 - 1, c.dark);
    },
  },
  {
    name: 'domed',
    draw: (c, hx, hy, r) => {                                   // a tall bulbous cranium
      c.px(hx - r / 2 + 1, hy - r / 2 - 2, r - 2, 2, c.body);
      c.px(hx - r / 2 + 2, hy - r / 2 - 3, r - 4, 1, c.body);
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

// ---- LEGS — a NEW registry (genome stat `legs`). Each style draws ALL the legs
// given the row of foot anchors; the compositor computes count/spacing/length from
// size+height (so styles are SHAPES, not sizes) and hands each style the geometry.
// `groundY` is the foot line, `topY` where legs meet the body. Flyers skip legs.
export interface LegCtx {
  px: Px; cx: number; topY: number; groundY: number; bw: number;
  pairs: number; legLen: number; body: string; dark: string; accent: string;
}
export const LEGS: { name: string; draw: (c: LegCtx) => void }[] = [
  {
    name: 'plain',                                             // simple straight posts (the original)
    draw: (c) => {
      for (let i = 0; i < c.pairs; i++) {
        const lx = c.cx - c.bw * 0.36 + (i / Math.max(1, c.pairs - 1)) * c.bw * 0.72;
        c.px(lx, c.topY, 2, c.legLen, c.dark);
      }
    },
  },
  {
    name: 'clawed',                                            // posts with a splayed foot
    draw: (c) => {
      for (let i = 0; i < c.pairs; i++) {
        const lx = c.cx - c.bw * 0.36 + (i / Math.max(1, c.pairs - 1)) * c.bw * 0.72;
        c.px(lx, c.topY, 2, c.legLen, c.dark);
        c.px(lx - 1, c.topY + c.legLen - 1, 4, 1, c.dark);    // foot
      }
    },
  },
  {
    name: 'bent',                                              // a mid-joint kink (insectoid/avian)
    draw: (c) => {
      for (let i = 0; i < c.pairs; i++) {
        const lx = c.cx - c.bw * 0.36 + (i / Math.max(1, c.pairs - 1)) * c.bw * 0.72;
        const knee = c.topY + c.legLen * 0.5;
        c.px(lx, c.topY, 2, c.legLen * 0.5, c.dark);          // thigh
        c.px(lx + (i % 2 ? -1 : 1), knee, 2, c.legLen * 0.5, c.dark);   // shin, kicked out
      }
    },
  },
  {
    name: 'stumpy',                                            // thick short columns
    draw: (c) => {
      for (let i = 0; i < c.pairs; i++) {
        const lx = c.cx - c.bw * 0.36 + (i / Math.max(1, c.pairs - 1)) * c.bw * 0.72;
        c.px(lx - 1, c.topY, 4, Math.max(2, c.legLen * 0.7), c.body);
        c.px(lx - 1, c.topY + Math.max(2, c.legLen * 0.7) - 1, 4, 1, c.dark);
      }
    },
  },
];

// ---- TAILS — a NEW registry (genome stat `tail`). Drawn off the REAR of the body
// (the side opposite the head, which sits front-right, so the tail trails left).
// `rx` is the rear x, `by`/`bh` the body top/height.
export interface TailCtx {
  px: Px; rx: number; by: number; bh: number; body: string; accent: string; dark: string;
}
export const TAILS: { name: string; draw: (c: TailCtx) => void }[] = [
  { name: 'none', draw: () => {} },
  {
    name: 'stub',
    draw: (c) => c.px(c.rx - 2, c.by + c.bh * 0.4, 2, 2, c.body),
  },
  {
    name: 'tapered',                                           // a segmented tail thinning to a point
    draw: (c) => {
      c.px(c.rx - 3, c.by + c.bh * 0.35, 3, 2, c.body);
      c.px(c.rx - 5, c.by + c.bh * 0.4, 2, 1, c.body);
      c.px(c.rx - 6, c.by + c.bh * 0.45, 1, 1, c.dark);
    },
  },
  {
    name: 'tufted',                                            // a thin tail with a fan tip
    draw: (c) => {
      c.px(c.rx - 4, c.by + c.bh * 0.4, 4, 1, c.dark);
      c.px(c.rx - 6, c.by + c.bh * 0.25, 2, 4, c.accent);     // the tuft
    },
  },
  {
    name: 'finned',                                            // a broad vertical fluke
    draw: (c) => {
      c.px(c.rx - 3, c.by + c.bh * 0.35, 3, 2, c.body);
      c.px(c.rx - 5, c.by, 2, c.bh, c.accent);                // vertical fin
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
    legs: idx(LEGS, s.legs).name,
    tail: idx(TAILS, s.tail).name,
  };
}

// ── COMMON NAME — the folk name, DERIVED from the genome (the scientific name is a
// syllable hash elsewhere; this is the "bigheaded bumble fly" layer). Deterministic:
// same genome → same name for everyone, forever. Trait adjectives read off the body
// plan + a colour word + a noun from locomotion. Kept append-only like the parts.
const HUE_WORDS = ['crimson', 'amber', 'golden', 'olive', 'jade', 'teal', 'azure', 'indigo', 'violet', 'rose', 'ashen', 'russet'];
function hueWord(h: number): string { return HUE_WORDS[Math.floor(((h % 1) + 1) % 1 * HUE_WORDS.length) % HUE_WORDS.length]; }

export function commonName(s: Stats): string {
  const size = s.size ?? 0.5, height = s.height ?? 0.5;
  const flyer = (s.flyer ?? 0) > 0.5;
  const headBig = (s.size ?? 0.5) > 0.55 && (s.head ?? 0) % 4 < 2;   // proportion cue, not literal head size
  const round = (Math.round(s.torso ?? 0) % TORSOS.length) === 4 || (Math.round(s.torso ?? 0) % TORSOS.length) === 8;
  const furry = (s.fur ?? 0) > 0.6;
  const fierce = (s.temper ?? 0) > 0.66;

  // an adjective or two (0–2), leading with the strongest trait
  const adj: string[] = [];
  if (headBig) adj.push('bigheaded');
  if (furry) adj.push('woolly');
  else if (fierce) adj.push('bristling');
  if (flyer && round && adj.length < 2) adj.push('bumble');
  if (adj.length === 0) adj.push(size > 0.66 ? 'great' : size < 0.3 ? 'lesser' : height > 0.7 ? 'tall' : 'common');

  // the noun from locomotion + build
  const noun = flyer
    ? (round ? 'fly' : (s.tail ?? 0) > 3 ? 'flitter' : 'wing')
    : (s.leglen ?? 0.3) > 0.6 ? 'strider'
    : size > 0.6 ? 'lumberer'
    : (s.shy ?? 0.5) > 0.6 ? 'lurker'
    : 'crawler';

  return `${hueWord(s.hue ?? 0)} ${adj.slice(0, 2).join(' ')} ${noun}`
    .replace(/\s+/g, ' ').trim();
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
    idx(LEGS, s.legs).draw({ px, cx, topY: by + bh - 2, groundY, bw, pairs, legLen: legLen + 2, body, dark, accent });
  }

  // TAIL trails off the REAR (head sits front-right, so the tail is to the left).
  idx(TAILS, s.tail).draw({ px, rx: cx - bw / 2, by, bh, body, accent, dark });

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
