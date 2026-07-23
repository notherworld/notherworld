import { useEffect, useRef, useState } from 'react';
import { describeUniverse, describeGalaxy, describeSuper, properName } from '../view/lexicon';
import { universeFacts, universeLaws, superFacts, galaxyFacts, galaxyStars, starOrdinalCell, starOf, planetOf, blackHoleOf, galaxyCoreOf, setDists, smallBodyLife, giantGravity, rogueAt, rogueStarOf, fieldGalaxyAt } from '../view/facts';
import { loadCharter } from '../temple/templates';
import { loadShip, fidelityOf, hoverOf } from '../game/ship';
import { ShipPanel } from '../game/ShipPanel';

// ── THE CHARTER TAKES EFFECT AT BOOT: if this visitor has set a universe in
// temple, its distribution dials override the base notherverse BEFORE any fact
// sheet or system is derived. One localStorage read; everything downstream obeys.
const bootCharter = loadCharter();
if (bootCharter?.dists) setDists(bootCharter.dists);

// ── THE SHIP TAKES EFFECT AT BOOT TOO — the player's equipment (game/ship.ts).
// Scanner fidelity threads into every planetOf derivation; thruster hover gates
// which giants will let you descend. Mutable: buying an upgrade updates it live —
// sheets derived AFTER the purchase read the new instrument (monotonic by the
// facts.ts invariant, so an upgrade only ever clears lies, never mints them).
const SHIP = loadShip();

// ── NOTHERSPACE — the TOP of the address ladder (see memory: notherspace-address-ladder).
//   multiverse > universe > supercluster > galaxy > star > … > [Atlas: city > … > farmer]
// Every rung is deterministic from its ADDRESS PATH: the same coordinates land every
// visitor at the same supercluster, the same galaxy, the same star — forever. The
// Atlas laws apply verbatim: dive = optical zoom-through (stale-while-revalidate),
// infinite space = ensureTile-style cell hashing, refs for everything the rAF loop
// reads, click == hover. Each rung is deep (zoom floor 0.05) with a far MOTE band,
// so a universe feels like millions of superclusters, a supercluster like a sea of
// galaxies, a galaxy like a blizzard of stars — all of it addressable.

// field cell sizes per rung — shared by the renderer AND the address-link parser
const CELL_U = 130, CELL_SC = 150, CELL_G = 110, CELL_ST = 80;

// determinism in the browser too — a coordinate renders identically, forever.
function mix(x: number): number {
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}
const rnd = (seed: number, salt: number) => (mix((seed | 0) ^ Math.imul(salt, 0x9e3779b1)) % 100000) / 100000;
const cellHash = (cx: number, cy: number) => mix(mix(cx * 0x1f1f1f1f) ^ (cy * 0x27d4eb2d));
function hsl(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; } else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; } else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

// ── RUNG 0: A UNIVERSE — a permanent address, rendered as a LIVING CELL. The
// multiverse reads as tissue under a microscope; INSIDE each cell is a cosmos.
interface Organelle { dx: number; dy: number; r: number; hue: number; kind: number; sp: number }
interface Harm { k: number; amp: number; ph: number } // one membrane deformation harmonic
interface Uni {
  addr: number; base: number; wx: number; wy: number; r: number;
  hue: number; sat: number; phase: number; breath: number; rot: number;
  harms: Harm[]; squash: number; tilt: number;   // membrane shape (never a perfect circle)
  nucHue: number; nucR: number; nucOff: number;  // the nucleus
  orgs: Organelle[];                             // organelles floating in the cytoplasm
  grain: number;                                 // cytoplasm speckle density
  cooling: number;                               // epoch dial 0 (young) … 1 (heat-dead): fades the cell
  desc: string; facts: string;                   // deterministic per-address text + data
}
function visualsFor(seed: number): Omit<Uni, 'addr' | 'base' | 'wx' | 'wy'> {
  const hue = 360 * rnd(seed, 14), sat = 0.5 + 0.35 * rnd(seed, 21);
  const r = 24 + 30 * rnd(seed, 13);
  // membrane = a base circle deformed by 3 layered harmonics of different frequency,
  // amplitude and phase → every cell dents its OWN way (asymmetric, never a rounded box).
  const harms: Harm[] = [
    { k: 2 + Math.floor(rnd(seed, 50) * 2), amp: 0.10 + 0.10 * rnd(seed, 51), ph: 6.283 * rnd(seed, 52) },
    { k: 3 + Math.floor(rnd(seed, 53) * 3), amp: 0.05 + 0.07 * rnd(seed, 54), ph: 6.283 * rnd(seed, 55) },
    { k: 5 + Math.floor(rnd(seed, 56) * 4), amp: 0.02 + 0.04 * rnd(seed, 57), ph: 6.283 * rnd(seed, 58) },
  ];
  const squash = 0.82 + 0.3 * rnd(seed, 59);              // ellipse aspect (some cells oblong)
  const tilt = 6.283 * rnd(seed, 60);                     // ellipse orientation
  const ocount = 5 + Math.floor(rnd(seed, 30) * 9);
  const orgs: Organelle[] = Array.from({ length: ocount }, (_, i) => {
    const rr = Math.pow(rnd(seed, 40 + i), 0.7) * 0.78;   // stay inside the membrane
    const ang = rnd(seed, 80 + i) * 6.283;
    return {
      dx: Math.cos(ang) * rr * r, dy: Math.sin(ang) * rr * r * 0.92,
      r: 1.2 + 2.4 * rnd(seed, 120 + i),
      hue: hue + (rnd(seed, 160 + i) - 0.5) * 60,
      kind: rnd(seed, 200 + i) > 0.55 ? 1 : 0,
      sp: rnd(seed, 240 + i) > 0.72 ? 1 : 0,
    };
  });
  return {
    r, hue, sat, phase: 6.283 * rnd(seed, 16), breath: 0.1 + 0.2 * rnd(seed, 17),
    rot: (rnd(seed, 24) - 0.5) * 0.18, harms, squash, tilt,
    nucHue: hue + (rnd(seed, 27) - 0.5) * 40, nucR: 0.22 + 0.14 * rnd(seed, 28),
    nucOff: (rnd(seed, 29) - 0.5) * 0.35, orgs, grain: 0.4 + 0.6 * rnd(seed, 31),
    cooling: universeLaws(seed).coolingN,       // the cell ages: old = cold, dim, near-dead
    desc: describeUniverse(seed), facts: universeFacts(seed),
  };
}
// build a universe FROM ITS ADDRESS — the canonical constructor. Everything about
// universe N derives from mix(N), NEVER from where in the grid it was found, so a
// wanderer and a teleporter see the identical universe (the addressability law).
function uniFromAddr(addr: number, wx: number, wy: number): Uni {
  const base = mix(addr);
  return { addr, base, wx, wy, ...visualsFor(base) };
}
function uniAt(cx: number, cy: number, i: number, CELL: number): Uni {
  const seed = mix(cellHash(cx, cy) ^ (i * 0x9e3779b1));   // placement seed only
  const addr = 100 + (seed % 999900);                       // → the permanent address
  return uniFromAddr(addr, cx * CELL + rnd(seed, 1) * CELL, cy * CELL + rnd(seed, 2) * CELL);
}

// membrane radius at angle a — layered harmonics + an elliptical squash, breathing and
// slowly turning. `rad` is the already-zoom-scaled base radius in buffer px.
function membraneR(u: Uni, rad: number, a: number, t: number, breathe: number): number {
  let wob = 1;
  for (const hm of u.harms) wob += hm.amp * Math.sin(a * hm.k + hm.ph + t * (0.25 + u.rot) * hm.k * 0.3);
  const ca = Math.cos(a - u.tilt), sa = Math.sin(a - u.tilt);
  const ell = 1 / Math.sqrt(ca * ca + (sa * sa) / (u.squash * u.squash));
  return rad * wob * ell * (0.94 + 0.08 * breathe);
}

// ── RUNG 1: A SUPERCLUSTER — the cosmic web. Inside a universe you don't see
// galaxies yet; you see the WEB: filamentary clumps of thousands of galaxies,
// knots strung on threads, voids between. Each is a named sub-address.
interface SCKnot { dx: number; dy: number; r: number; b: number }
interface SC {
  addr: number; uaddr: number; base: number; name: string; desc: string; facts: string;
  cell: [number, number, number];                        // its derivation — the link locator
  wx: number; wy: number; r: number; hue: number; phase: number; breath: number;
  knots: SCKnot[]; threads: [number, number][];
}
function scAt(uBase: number, uaddr: number, cx: number, cy: number, i: number, CELL: number): SC {
  const seed = mix(mix(uBase ^ cellHash(cx, cy)) ^ Math.imul(i + 1, 0x9e3779b1));
  const addr = 100 + (seed % 999900);
  const r = 18 + 24 * rnd(seed, 13);
  const hue = 185 + 110 * rnd(seed, 14);                   // cool web palette: teal → violet
  const kn = 4 + Math.floor(rnd(seed, 23) * 5);
  const knots: SCKnot[] = Array.from({ length: kn }, (_, j) => {
    const rr = Math.pow(rnd(seed, 40 + j), 0.7);
    const ang = rnd(seed, 80 + j) * 6.283;
    return { dx: Math.cos(ang) * rr * r, dy: Math.sin(ang) * rr * r * 0.85, r: 2 + 4 * rnd(seed, 120 + j), b: 0.5 + 0.5 * rnd(seed, 160 + j) };
  });
  // thread each knot to its nearest earlier knot → a connected filament skeleton
  const threads: [number, number][] = [];
  for (let j = 1; j < kn; j++) {
    let best = 0, bd = Infinity;
    for (let k = 0; k < j; k++) {
      const d = Math.hypot(knots[j].dx - knots[k].dx, knots[j].dy - knots[k].dy);
      if (d < bd) { bd = d; best = k; }
    }
    threads.push([j, best]);
  }
  return {
    addr, uaddr, base: mix(seed ^ 0x51ed270b), name: properName(seed, 3),
    desc: describeSuper(seed), facts: superFacts(seed), cell: [cx, cy, i],
    wx: cx * CELL + rnd(seed, 1) * CELL, wy: cy * CELL + rnd(seed, 2) * CELL,
    r, hue, phase: 6.283 * rnd(seed, 16), breath: 0.08 + 0.15 * rnd(seed, 17), knots, threads,
  };
}

// ── RUNG 2: A GALAXY — spiral discs drifting in a supercluster's sea.
interface GalPt { dx: number; dy: number; b: number; hue: number; sp: number }
interface Gal {
  addr: number; uaddr: number; scaddr: number; scname: string; base: number; gseed: number;
  cell: [number, number, number];
  name: string; desc: string; facts: string;
  wx: number; wy: number; r: number; hue: number; sat: number;
  phase: number; breath: number; rot: number; pts: GalPt[];
}
function galAt(scBase: number, uaddr: number, scaddr: number, scname: string, cx: number, cy: number, i: number, CELL: number): Gal {
  const seed = mix(mix(scBase ^ cellHash(cx, cy)) ^ Math.imul(i + 1, 0x9e3779b1));
  const addr = 100 + (seed % 999900);
  const r = 9 + 14 * rnd(seed, 13);
  const hue = 360 * rnd(seed, 14), sat = 0.55 + 0.35 * rnd(seed, 21);
  const arms = 2 + Math.floor(rnd(seed, 23) * 3), twist = 2.5 + 5 * rnd(seed, 25);
  const n = 26 + Math.floor(rnd(seed, 30) * 22);
  const pts: GalPt[] = Array.from({ length: n }, (_, j) => {
    const rr = Math.pow(rnd(seed, 40 + j), 0.55);
    const ang = (j % arms) * (6.283 / arms) + rr * twist + (rnd(seed, 80 + j) - 0.5) * 0.55;
    return {
      dx: Math.cos(ang) * rr * r, dy: Math.sin(ang) * rr * r * 0.82,
      b: 0.4 + 0.6 * rnd(seed, 120 + j),
      hue: hue + (rnd(seed, 160 + j) - 0.5) * 50,
      sp: rnd(seed, 200 + j) > 0.8 ? 1 : 0,
    };
  });
  return {
    addr, uaddr, scaddr, scname, base: mix(seed ^ 0x2545f491), gseed: seed, cell: [cx, cy, i],
    name: properName(seed), desc: describeGalaxy(seed), facts: galaxyFacts(seed),
    wx: cx * CELL + rnd(seed, 1) * CELL, wy: cy * CELL + rnd(seed, 2) * CELL,
    r, hue, sat, phase: 6.283 * rnd(seed, 16), breath: 0.15 + 0.25 * rnd(seed, 17),
    rot: (rnd(seed, 24) - 0.5) * 0.5, pts,
  };
}
// a FIELD GALAXY — a lone galaxy in a cosmic void, derived from the UNIVERSE base
// (no supercluster parent). cell[2] === -1 marks it; scaddr = uaddr as its stand-in.
// Its facts note the isolation. Diveable exactly like any galaxy (a synthetic SC
// carries the layer type). Same shareable-address round-trip discipline as rogues.
function fieldGalAt(uBase: number, uaddr: number, cx: number, cy: number, CELL: number): Gal {
  const g = galAt(uBase, uaddr, uaddr, 'the void', cx, cy, 0, CELL);
  const isolated = `  FIELD GALAXY · adrift in a cosmic void\n  no supercluster — the nearest is millions of ly off`;
  return { ...g, cell: [cx, cy, -1], name: `${properName(g.gseed)} (field)`, facts: `${isolated}\n${g.facts}` };
}

// ── RUNG 3: A STAR — where the facts become LAWS: class/temp/mass/worlds/life all
// roll from the address (facts.ts starOf), and the drawn color and size follow the
// physics. A star doesn't "look red" — it IS 2,900 K, and red follows.
interface Star {
  addr: number; uaddr: number; scaddr: number; gaddr: number; gname: string;
  cell: [number, number, number];
  name: string; facts: string; cls: string; base: number;
  bh: boolean; bhExit: number;                       // black holes: where the horizon LEADS
  tempK: number; planets: number; belts: number; life: string;   // the system its dive will open
  wx: number; wy: number; r: number; hue: number; sat: number; phase: number; tw: number;
  rogue?: boolean;                                   // flung out of its galaxy — adrift in the void
}
function starAt(gBase: number, uaddr: number, scaddr: number, gaddr: number, gname: string, cx: number, cy: number, i: number, CELL: number): Star {
  const seed = mix(mix(gBase ^ cellHash(cx, cy)) ^ Math.imul(i + 1, 0x9e3779b1));
  const addr = 100 + (seed % 999900);
  const base = mix(seed ^ 0x1b873593);
  const common = {
    addr, uaddr, scaddr, gaddr, gname, name: properName(seed, 9), base,
    cell: [cx, cy, i] as [number, number, number],
    wx: cx * CELL + rnd(seed, 1) * CELL, wy: cy * CELL + rnd(seed, 2) * CELL,
    phase: 6.283 * rnd(seed, 16),
  };
  // ~0.7% of "stars" are stellar BLACK HOLES — dark voids with an accretion ring,
  // and a deterministic wormhole exit (the same horizon always leads to the same
  // universe — even the joke is addressable).
  if (rnd(seed, 810) > 0.993) {
    const bh = blackHoleOf(seed);
    return { ...common, facts: bh.facts, cls: 'BH', bh: true, bhExit: bh.exit, tempK: 0, planets: 0, belts: 0, life: 'none', r: 4.2 + 1.6 * rnd(seed, 811), hue: 30, sat: 0.9, tw: 0.8 };
  }
  const law = starOf(seed);
  return {
    ...common, facts: law.facts, cls: law.cls, bh: false, bhExit: 0,
    tempK: law.tempK, planets: law.planets, belts: law.belts, life: law.life,
    r: law.r, hue: law.hue, sat: law.sat, tw: 1.6 + 1.8 * rnd(seed, 17),
  };
}

// ROGUE STAR — a star adrift in the INTERGALACTIC dark (a cell OUTSIDE the galaxy
// disc that rolled rogueAt). Reuses the Star shape so it renders/hovers/dives exactly
// like any star; its stats + exile lore come from rogueStarOf. Flung from its galaxy
// eons ago — its isolated worlds skew to rare life (the compose-time bias, §rogue).
function rogueStarAt(gBase: number, uaddr: number, scaddr: number, gaddr: number, gname: string, cx: number, cy: number, CELL: number): Star {
  const seed = mix(mix(gBase ^ cellHash(cx, cy)) ^ 0x9e37_79b9);   // fixed slot: one rogue per cell
  const addr = 100 + (seed % 999900);
  const law = rogueStarOf(seed);
  return {
    addr, uaddr, scaddr, gaddr, gname, name: `Rogue ${properName(seed, 9)}`, base: mix(seed ^ 0x1b873593),
    cell: [cx, cy, -1] as [number, number, number],   // i=-1 marks a rogue in the address
    wx: cx * CELL + rnd(seed, 1) * CELL, wy: cy * CELL + rnd(seed, 2) * CELL,
    phase: 6.283 * rnd(seed, 16),
    facts: law.facts, cls: law.cls, bh: false, bhExit: 0,
    tempK: law.tempK, planets: law.planets, belts: law.belts, life: law.life,
    r: law.r * 0.85, hue: law.hue, sat: law.sat, tw: 1.6 + 1.8 * rnd(seed, 17), rogue: true,
  };
}

// a star's SOLAR SYSTEM — exactly the worlds its fact sheet promised, each typed by
// real orbital physics (planetOf), each a named sub-address. A planet's surface is
// an entire Atlas world — that handoff is the ladder's final rung.
// MOONS ARE DATA — each one a named address hanging off its planet (the founder's
// Atlas moon model plugs in here). Same for ASTEROIDS: every rock in a belt has an
// address and an ORE roll — mineable later, addressable now.
interface Moon { addr: number; idx: number; name: string; facts: string; icy: boolean; r: number; orbit: number; phase: number; speed: number }
interface Roid {
  addr: number; idx: number; name: string; facts: string; res: string;
  rad: number; ang0: number; sp: number; br: number;
  rsz: number; ph1: number; ph2: number;               // render size (world units) + lumpy-shape phases
}
interface Belt { r: number; rocks: Roid[] }
interface Planet {
  addr: number; idx: number; uaddr: number; scaddr: number; gaddr: number; saddr: number; sname: string;
  name: string; facts: string; type: string; life: string; hasLife: boolean; density: number; noStar: boolean;
  orbit: number; phase: number; speed: number; r: number; hue: number; sat: number;
  moons: number; rings: boolean; moonsD: Moon[];
}
const ORES = ['iron', 'nickel', 'water ice', 'carbon', 'silicates', 'platinum', 'gold'];
function planetsFor(s: Star): Planet[] {
  const starLaw = { cls: s.cls, tempK: s.tempK, hue: s.hue, sat: s.sat, r: s.r, planets: s.planets, belts: s.belts, life: s.life, facts: '' };
  // COSMIC EPOCH: this universe's age dial, reproduced from its address exactly as the
  // HUD + cell fade do (visualsFor derives from base = mix(addr); uaddr carries addr).
  // An ancient universe's worlds land deader — heat death made walkable. See IDEAS step 2.
  const epoch = universeLaws(mix(s.uaddr)).coolingN;
  return Array.from({ length: s.planets }, (_, i) => {
    const pseed = mix(s.base ^ Math.imul(i + 1, 0x9e3779b1));
    const addr = 100 + (pseed % 999900);
    const law = planetOf(pseed, i, starLaw, fidelityOf(SHIP), epoch);   // read through YOUR scanner, at this universe's epoch
    const moonsD: Moon[] = Array.from({ length: law.moons }, (_, j) => {
      const mseed = mix(pseed ^ Math.imul(j + 1, 0xc2b2ae35));
      const icy = rnd(mseed, 3) > 0.5;
      return {
        addr: 100 + (mseed % 999900), idx: j, name: properName(mseed, 15),
        facts: `  moon · ${Math.round(400 + rnd(mseed, 2) * 4600)} km · ${icy ? 'ice' : 'rock'}`,
        icy, r: 0.8 + 0.9 * rnd(mseed, 4), orbit: 3.2 + j * 2.3,
        // slow, Kepler-ish: inner moons ~20s a lap, outer ones a leisurely minute —
        // watchable AND clickable (they were whipping around in ~4s, unhoverable)
        phase: 6.283 * rnd(mseed, 5), speed: 0.3 / (1 + j * 0.45),
      };
    });
    return {
      addr, idx: i, uaddr: s.uaddr, scaddr: s.scaddr, gaddr: s.gaddr, saddr: s.addr, sname: s.name,
      name: properName(pseed, 12), facts: law.facts, type: law.type, life: law.life, hasLife: law.hasLife, density: law.density, noStar: law.noStar,
      orbit: 58 + i * 46 + 18 * rnd(pseed, 921),     // strictly widening rings
      phase: 6.283 * rnd(pseed, 922), speed: 0.55 / Math.pow(i + 1, 1.4),
      r: law.r * 2.2, hue: law.hue, sat: law.sat, moons: law.moons, rings: law.rings, moonsD,
    };
  });
}
// a star's belts — deterministic radii, each rock an addressed body with an ore roll
function beltsFor(s: Star, planets: Planet[]): Belt[] {
  const maxOrbit = planets.length ? planets[planets.length - 1].orbit : 260;
  return Array.from({ length: s.belts }, (_, k) => {
    const bseed = mix(s.base ^ Math.imul(k + 1, 0x85ebca6b));
    const r = 70 + ((k + 0.5 + (rnd(bseed, 1) - 0.5) * 0.5) * (maxOrbit + 140)) / Math.max(1, s.belts);
    const nRocks = 90 + Math.floor(rnd(bseed, 2) * 80);
    const rocks: Roid[] = Array.from({ length: nRocks }, (_, i) => {
      const rseed = mix(bseed ^ Math.imul(i + 1, 0x27d4eb2f));
      const res = ORES[Math.floor(Math.pow(rnd(rseed, 3), 1.6) * ORES.length)];   // precious = rare
      const sizeM = Math.round(80 + rnd(rseed, 4) * 1900);
      return {
        addr: 100 + (rseed % 999900), idx: i, name: `${properName(rseed, 18).slice(0, 2).toUpperCase()}-${rseed % 99999}`,
        facts: `  asteroid · ${sizeM} m\n  ore: ${res} (${Math.round(4 + rnd(rseed, 5) * 60)}%) · mineable`,
        res, rad: r + (rnd(rseed, 6) - 0.5) * 17,
        ang0: rnd(rseed, 7) * 6.283, sp: 0.008 + rnd(rseed, 8) * 0.012, br: 14 + 26 * rnd(rseed, 9),
        rsz: 0.35 + (sizeM / 1980) * 1.15,             // its stated SIZE fixes its drawn size
        ph1: 6.283 * rnd(rseed, 21), ph2: 6.283 * rnd(rseed, 22),
      };
    });
    return { r, rocks };
  });
}

// what the rAF loop reports as "under the cursor" — one shape for every rung
type Hover =
  | { kind: 'uni'; u: Uni } | { kind: 'sc'; sc: SC }
  | { kind: 'gal'; g: Gal } | { kind: 'star'; s: Star }
  | { kind: 'core'; g: Gal }                              // a galaxy's supermassive heart
  | { kind: 'planet'; p: Planet }
  | { kind: 'moon'; m: Moon; p: Planet }
  | { kind: 'roid'; a: Roid; s: Star; belt: number };
// which rung we're rendering — the NEXT-map of this half of the ladder
type Layer =
  | { kind: 'multiverse' }
  | { kind: 'universe'; u: Uni }
  | { kind: 'super'; u: Uni; sc: SC }
  | { kind: 'galaxy'; u: Uni; sc: SC; g: Gal }
  | { kind: 'system'; u: Uni; sc: SC; g: Gal; s: Star };
// live bounce state for a visible cell (render-layer motion, Atlas pawn-glide style)
interface Phys { x: number; y: number; vx: number; vy: number }

// the HUD identity of each rung: base info (shown when nothing hovered) + breadcrumb
function layerChrome(l: Layer): { base: string; head: string; rest: string; hint: string } {
  switch (l.kind) {
    case 'multiverse':
      return { base: '', head: 'the multiverse', rest: ' · a culture of universes', hint: 'drag to wander · hover a cell · click to descend · every universe is a coordinate you could text a friend.' };
    case 'universe':
      return {
        base: `universe ${l.u.addr}\n${l.u.facts}`,
        head: `universe ${l.u.addr}`, rest: ' · the cosmic web',
        hint: 'every supercluster is a sub-address · click one to descend · zoom far out to surface.',
      };
    case 'super':
      return {
        base: `${l.sc.name} · supercluster ${l.sc.addr} of universe ${l.u.addr}\n${l.sc.facts}`,
        head: l.sc.name, rest: ` · supercluster · a sea of galaxies`,
        hint: 'every galaxy is a sub-address · click one to descend · zoom far out to surface.',
      };
    case 'galaxy':
      return {
        base: `${l.g.name} · galaxy ${l.g.addr} of ${l.sc.name}\n${l.g.facts}`,
        head: l.g.name, rest: ` · galaxy · a field of stars`,
        hint: 'every star is a sub-address · type #k to jump to the k-th star (the count is the law) · beware the dark ones.',
      };
    case 'system':
      return {
        base: `${l.s.name} · solar system\n${l.s.facts}`,
        head: l.s.name, rest: ` · ${l.s.planets} worlds · ${l.s.belts} belt${l.s.belts === 1 ? '' : 's'}`,
        hint: 'worlds, moons, even belt rocks — all sub-addresses · a planet is an entire Atlas · zoom far out to surface.',
      };
  }
}

export default function Nother() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const camRef = useRef({ x: 0, y: 0 });
  // ZOOM lives in a ref (Atlas law: anything the rAF loop reads stays a ref, never
  // state, so panning/zooming never restarts the draw loop). `z` eases to `target`.
  // `anchor` = the screen point + the world point under it: while the zoom eases,
  // the draw loop RE-PINS the camera every frame so that world point stays exactly
  // under your fingers (correcting once, instantly, drifted the view sideways).
  const zoomRef = useRef<{ z: number; target: number; anchor: { sx: number; sy: number; wx: number; wy: number } | null }>({ z: 1, target: 1, anchor: null });
  const layerRef = useRef<Layer>({ kind: 'multiverse' });
  // a pending descend: click armed it; the draw loop swaps rungs when the
  // zoom-through crosses the threshold (Atlas dive: optical first, detail after).
  const diveRef = useRef<Hover | null>(null);
  const dragRef = useRef<{ mx: number; my: number; cx: number; cy: number; moved: boolean } | null>(null);
  const mouseRef = useRef<{ x: number; y: number } | null>(null);
  const focusRef = useRef<{ addr: number; at: number } | null>(null);
  const physRef = useRef<Map<number, Phys>>(new Map());
  const touchesRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{ dist: number; z: number; cx: number; cy: number } | null>(null);
  const suppressClickRef = useRef(false);
  // the thing currently under the cursor — written by the draw loop (the SAME
  // result the HUD shows), read by the click handler so click == hover, always.
  const hovRef = useRef<Hover | null>(null);
  // an in-flight wormhole crossing: streak-tunnel in, layer swap at the flash,
  // streaks decay out over the new universe. Rendered by the draw loop.
  const warpRef = useRef<{ t0: number; exit: number; label: string; fired: boolean; url?: string } | null>(null);
  // TRACKING: a clicked planet/moon/rock — the camera rides its orbit (sim keeps
  // running) until a drag or scroll-pan takes the wheel back. Zooming keeps the lock.
  const trackRef = useRef<{ kind: 'planet'; p: Planet } | { kind: 'moon'; m: Moon; p: Planet } | { kind: 'roid'; a: Roid; belt: number } | null>(null);

  const [hudOpen, setHudOpen] = useState(true);
  const [tele, setTele] = useState('');
  const [info, setInfo] = useState<string>('');
  const [trail, setTrail] = useState({ head: 'the multiverse', rest: ' · a culture of universes', hint: 'drag to wander · hover a cell · click to descend · every universe is a coordinate you could text a friend.' });
  // the currently selected surface-bearing body — powers the ⤓ land prompt that
  // floats IN THE SCENE under the tracked body (the camera holds it centered)
  const [explorable, setExplorable] = useState<{ label: string; url: string } | null>(null);
  const [shipOpen, setShipOpen] = useState(false);   // the ⬡ ship panel (game/ShipPanel)
  const setExplorableRef = useRef(setExplorable); setExplorableRef.current = setExplorable;
  const explore = () => {
    if (!explorable || warpRef.current) return;
    warpRef.current = { t0: performance.now(), exit: 0, label: explorable.label, fired: false, url: explorable.url };
    setInfo(`⤓ descending to the surface of ${explorable.label}…`);
  };
  const setInfoRef = useRef(setInfo); setInfoRef.current = setInfo;
  const setTrailRef = useRef(setTrail); setTrailRef.current = setTrail;
  const baseInfoRef = useRef<string>('');

  // ── DESCEND one rung (dive target → child layer) / SURFACE one rung back up.
  // Both keep every ref-law intact and re-skin the HUD from layerChrome.
  const applyChrome = (l: Layer) => {
    const c = layerChrome(l);
    baseInfoRef.current = c.base;
    setInfoRef.current(c.base);
    setTrailRef.current({ head: c.head, rest: c.rest, hint: c.hint });
  };
  const enterChild = (hv: Hover) => {
    const l = layerRef.current;
    let next: Layer | null = null;
    if (hv.kind === 'uni') next = { kind: 'universe', u: hv.u };
    else if (hv.kind === 'sc' && l.kind === 'universe') next = { kind: 'super', u: l.u, sc: hv.sc };
    else if (hv.kind === 'gal' && l.kind === 'super') next = { kind: 'galaxy', u: l.u, sc: l.sc, g: hv.g };
    // a FIELD GALAXY hovers at the universe layer (cell[2] === -1, no supercluster).
    // Dive to its galaxy, with a synthetic SC stand-in (the void it drifts in).
    else if (hv.kind === 'gal' && hv.g.cell[2] === -1 && l.kind === 'universe') {
      const vsc = scAt(l.u.base, l.u.addr, hv.g.cell[0], hv.g.cell[1], 0, CELL_SC);
      next = { kind: 'galaxy', u: l.u, sc: { ...vsc, wx: hv.g.wx, wy: hv.g.wy, name: 'the void' }, g: hv.g };
    }
    else if (hv.kind === 'star' && l.kind === 'galaxy') next = { kind: 'system', u: l.u, sc: l.sc, g: l.g, s: hv.s };
    // a ROGUE star lives at the super layer (no galaxy) — dive straight to its
    // system, with a synthetic Gal stand-in (the void it drifts in) so the layer
    // type holds and back-out surfaces you at the rogue's spot.
    else if (hv.kind === 'star' && hv.s.rogue && l.kind === 'super') {
      const vg = galAt(l.sc.base, l.sc.uaddr, l.sc.addr, l.sc.name, hv.s.cell[0], hv.s.cell[1], 0, CELL_G);
      next = { kind: 'system', u: l.u, sc: l.sc, g: { ...vg, wx: hv.s.wx, wy: hv.s.wy, name: `the drift of ${hv.s.name}` }, s: hv.s };
    }
    if (!next) return;
    layerRef.current = next;
    camRef.current = { x: 0, y: 0 };
    // arrive pulling INTO the rung; a system is a bounded scene, so arrive wider
    zoomRef.current = next.kind === 'system' ? { z: 0.14, target: 0.5, anchor: null } : { z: 0.32, target: 1, anchor: null };
    diveRef.current = null; dragRef.current = null; pinchRef.current = null;
    focusRef.current = null; hovRef.current = null; trackRef.current = null;
    setExplorable(null);
    applyChrome(next);
  };
  const leaveToParent = () => {
    const l = layerRef.current;
    let next: Layer | null = null; let at: { x: number; y: number } | null = null; let addr = 0;
    if (l.kind === 'universe') { next = { kind: 'multiverse' }; at = { x: l.u.wx, y: l.u.wy }; addr = l.u.addr; }
    else if (l.kind === 'super') { next = { kind: 'universe', u: l.u }; at = { x: l.sc.wx, y: l.sc.wy }; addr = l.sc.addr; }
    else if (l.kind === 'galaxy') { next = { kind: 'super', u: l.u, sc: l.sc }; at = { x: l.g.wx, y: l.g.wy }; addr = l.g.addr; }
    else if (l.kind === 'system') { next = { kind: 'galaxy', u: l.u, sc: l.sc, g: l.g }; at = { x: l.s.wx, y: l.s.wy }; addr = l.s.addr; }
    if (!next || !at) return;
    layerRef.current = next;
    camRef.current = at;                                 // surface AT the child you were in
    zoomRef.current = { z: 5, target: 1, anchor: null }; // pull back out through it
    dragRef.current = null; pinchRef.current = null; hovRef.current = null; trackRef.current = null;
    setExplorable(null);
    focusRef.current = { addr, at: performance.now() };
    applyChrome(next);
  };
  const enterRef = useRef(enterChild); enterRef.current = enterChild;
  const leaveRef = useRef(leaveToParent); leaveRef.current = leaveToParent;

  useEffect(() => {
    const cv = canvasRef.current!;
    const ctx = cv.getContext('2d')!;
    const PX = 4;
    const CELL = CELL_U, SCCELL = CELL_SC, GCELL = CELL_G, STCELL = CELL_ST;   // shared with the link parser
    // zoom floors: the multiverse is the shallow top; every rung below is DEEP —
    // you zoom out through a widening field (motes at the far band) before surfacing.
    const ZMAX = 8, ZMIN_M = 0.35, ZMIN_D = 0.05;
    const ZMIN = () => (layerRef.current.kind === 'multiverse' ? ZMIN_M : ZMIN_D);
    const DUST = 0.14;   // below this, entities render as lit motes (optical LOD)

    const cellCache = new Map<string, Uni[]>();
    const cellUnis = (cx: number, cy: number): Uni[] => {
      const k = `${cx},${cy}`; let v = cellCache.get(k);
      if (!v) { const n = cellHash(cx, cy) % 3; v = Array.from({ length: n }, (_, i) => uniAt(cx, cy, i, CELL)); cellCache.set(k, v); }
      return v;
    };
    // each rung's field cache — keyed by the full parent path, ensureTile-style.
    const scCache = new Map<string, SC[]>();
    const scUnis = (u: Uni, cx: number, cy: number): SC[] => {
      const k = `${u.addr}:${cx},${cy}`; let v = scCache.get(k);
      if (!v) {
        const n = 1 + (mix(u.base ^ cellHash(cx, cy)) % 2);
        v = Array.from({ length: n }, (_, i) => scAt(u.base, u.addr, cx, cy, i, SCCELL));
        scCache.set(k, v);
        if (scCache.size > 1400) scCache.clear();
      }
      return v;
    };
    // FIELD GALAXIES — lone galaxies adrift in the cosmic VOIDS between supercluster
    // filaments (real: not every galaxy joins a supercluster). Rare per-cell at the
    // universe view. A field galaxy is a normal Gal derived from the UNIVERSE base
    // (cell[2] === -1 marks it), diveable via a synthetic-SC stand-in.
    const fieldGalCache = new Map<string, Gal[]>();
    const fieldGalUnis = (u: Uni, cx: number, cy: number): Gal[] => {
      const k = `f:${u.addr}:${cx},${cy}`; let v = fieldGalCache.get(k);
      if (!v) {
        if (fieldGalaxyAt(u.base, cx, cy)) {
          const fg = fieldGalAt(u.base, u.addr, cx, cy, SCCELL);
          // FIND THE VOID: gather EVERY supercluster in this cell + the 8 neighbours,
          // try a ring of candidate spots around the cell centre, and place the field
          // galaxy at the one FARTHEST from any SC (weighted by SC radius/reach). This
          // clears neighbour-cell filaments the naive one-SC push missed.
          const near: { x: number; y: number; r: number }[] = [];
          for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++)
            for (const s of scUnis(u, cx + dx, cy + dy)) near.push({ x: s.wx, y: s.wy, r: s.r });
          if (near.length) {
            const ccx = (cx + 0.5) * SCCELL, ccy = (cy + 0.5) * SCCELL;
            let best = { x: fg.wx, y: fg.wy, score: -Infinity };
            for (let a = 0; a < 12; a++) {
              const ang = (a / 12) * 6.283;
              const px = ccx + Math.cos(ang) * SCCELL * 0.55, py = ccy + Math.sin(ang) * SCCELL * 0.55;
              // score = distance to the NEAREST supercluster (bigger = emptier)
              let mind = Infinity;
              for (const s of near) mind = Math.min(mind, Math.hypot(px - s.x, py - s.y) - s.r * 2.4);
              if (mind > best.score) best = { x: px, y: py, score: mind };
            }
            fg.wx = best.x; fg.wy = best.y;
          }
          v = [fg];
        } else v = [];
        fieldGalCache.set(k, v);
        if (fieldGalCache.size > 1400) fieldGalCache.clear();
      }
      return v;
    };
    const galCache = new Map<string, Gal[]>();
    const rogueCache = new Map<string, Star[]>();
    const galUnis = (sc: SC, cx: number, cy: number): Gal[] => {
      const k = `${sc.uaddr}:${sc.addr}:${cx},${cy}`; let v = galCache.get(k);
      if (!v) {
        const n = 1 + (mix(sc.base ^ cellHash(cx, cy)) % 3);
        v = Array.from({ length: n }, (_, i) => galAt(sc.base, sc.uaddr, sc.addr, sc.name, cx, cy, i, GCELL));
        galCache.set(k, v);
        if (galCache.size > 1400) galCache.clear();
      }
      return v;
    };
    // ROGUE STARS at the sea-of-galaxies zoom: rare per-cell specks adrift in the
    // void BETWEEN the galaxy motes. A rogue is a self-contained Star (no galaxy) —
    // its `cell[2] === -1` marks it, and its host-galaxy fields point at the SC so
    // it can dive to a system on its own. Deterministic + cached like galUnis.
    const rogueUnis = (sc: SC, cx: number, cy: number): Star[] => {
      const k = `r:${sc.uaddr}:${sc.addr}:${cx},${cy}`; let v = rogueCache.get(k);
      if (!v) {
        // galaxies fill every cell (1-3 each), so "between galaxies" is POSITIONAL:
        // a rogue sits at its own spot in the cell, naturally in the gaps — the small
        // galaxy motes rarely overlap. Rare per-cell roll gates it.
        v = rogueAt(sc.base, cx, cy) ? [rogueStarAt(sc.base, sc.uaddr, sc.addr, sc.addr, sc.name, cx, cy, GCELL)] : [];
        rogueCache.set(k, v);
        if (rogueCache.size > 1400) rogueCache.clear();
      }
      return v;
    };
    const starCache = new Map<string, Star[]>();
    const sysCache = new Map<number, { planets: Planet[]; belts: Belt[] }>();   // star addr → its system

    let raf = 0, lastHover = -1, lastNow = 0, W = 0, H = 0;
    let img: ImageData | null = null, acc: Float32Array | null = null;
    const start = performance.now();

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const t = (now - start) / 1000;
      const dt = lastNow ? Math.min(0.05, (now - lastNow) / 1000) : 0.016;
      lastNow = now;
      const nw = Math.max(1, Math.round(cv.clientWidth / PX)), nh = Math.max(1, Math.round(cv.clientHeight / PX));
      if (nw !== W || nh !== H) { W = nw; H = nh; cv.width = W; cv.height = H; img = ctx.createImageData(W, H); acc = new Float32Array(W * H * 3); }
      if (!img || !acc) return;
      acc.fill(0);
      const zc = zoomRef.current;
      zc.z += (zc.target - zc.z) * 0.16;
      if (Math.abs(zc.target - zc.z) < 0.001) { zc.z = zc.target; if (zc.anchor && !pinchRef.current) zc.anchor = null; }
      // hold the gesture's world point pinned under its screen point through the ease
      if (zc.anchor) {
        camRef.current = {
          x: zc.anchor.wx - (zc.anchor.sx / PX - W / 2) / zc.z,
          y: zc.anchor.wy - (zc.anchor.sy / PX - H / 2) / zc.z,
        };
      }
      // FOLLOW a tracked body: its orbit is closed-form in t, so the camera sits
      // exactly on it every frame while the whole system keeps moving around you.
      {
        const trk = trackRef.current;
        if (trk && layerRef.current.kind === 'system') {
          if (trk.kind === 'planet') {
            const ang = trk.p.phase + t * trk.p.speed * 0.3;
            camRef.current = { x: Math.cos(ang) * trk.p.orbit, y: Math.sin(ang) * trk.p.orbit * 0.96 };
          } else if (trk.kind === 'moon') {
            const p = trk.p;
            const ang = p.phase + t * p.speed * 0.3;
            const ma = t * trk.m.speed + trk.m.phase;
            const mo = p.r + trk.m.orbit;
            camRef.current = {
              x: Math.cos(ang) * p.orbit + Math.cos(ma) * mo,
              y: Math.sin(ang) * p.orbit * 0.96 + Math.sin(ma) * mo * 0.8,
            };
          } else {
            const a2 = trk.a.ang0 + t * trk.a.sp;
            camRef.current = { x: Math.cos(a2) * trk.a.rad, y: Math.sin(a2) * trk.a.rad * 0.96 };
          }
        } else if (trk) trackRef.current = null;         // left the system → release
      }

      // ── RUNG TRANSITIONS. Descend: an armed dive swaps once the zoom-through
      // crosses the threshold. Surface: zooming out past the floor folds one rung up.
      if (diveRef.current && zc.z > 5.5) { enterRef.current(diveRef.current); lastHover = -2; }
      if (layerRef.current.kind !== 'multiverse' && zc.target <= ZMIN_D + 0.001 && zc.z < ZMIN_D * 1.4) { leaveRef.current(); lastHover = -2; }

      const Z = zc.z;
      const cam = camRef.current;
      const ox = cam.x - W / 2 / Z, oy = cam.y - H / 2 / Z;   // world coord of buffer px (0,0)
      const A = acc;
      const layer = layerRef.current;
      const foc = focusRef.current;
      const m = mouseRef.current; const mLo = m ? { x: m.x / PX, y: m.y / PX } : null;
      let hov: Hover | null = null; let hovD = Infinity;

      if (layer.kind === 'multiverse') {
        // ── the SUBSTRATE: a warm dark medium (culture fluid / slide), not the void.
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const d = Math.hypot(x - W / 2, y - H / 2) / (Math.min(W, H) * 0.95);
          const v = 7 * Math.max(0, 1 - d); const i = (y * W + x) * 3;
          A[i] += v * 1.1; A[i + 1] += v * 1.05; A[i + 2] += v * 0.9;
        }
        const gBias = 0.4;
        for (let s = 0; s < 460; s++) {
          const sx = ((rnd(s, 5) * 4000 - cam.x * gBias) % W + W) % W;
          const sy = ((rnd(s, 6) * 4000 - cam.y * gBias) % H + H) % H;
          const a = (0.2 + 0.5 * rnd(s, 7)) * (0.55 + 0.45 * Math.sin(t * 0.5 + rnd(s, 8) * 6.283)) * 70;
          const i = ((sy | 0) * W + (sx | 0)) * 3; A[i] += a * 0.9; A[i + 1] += a; A[i + 2] += a * 0.85;
        }

        const c0x = Math.floor(ox / CELL) - 1, c1x = Math.floor((ox + W / Z) / CELL) + 1;
        const c0y = Math.floor(oy / CELL) - 1, c1y = Math.floor((oy + H / Z) / CELL) + 1;
        const vis: Uni[] = [];
        for (let cx = c0x; cx <= c1x; cx++) for (let cy = c0y; cy <= c1y; cy++) vis.push(...cellUnis(cx, cy));

        // ── BOUNCE: cells drift around their address anchor and shove each other
        // apart on contact. The ADDRESS anchor is the deterministic truth; the
        // jiggle around it is ambience. Frozen mid-dive so the target holds still.
        const phys = physRef.current;
        const pos = new Map<number, Phys>();
        for (const u of vis) {
          let p = phys.get(u.addr);
          if (!p) { p = { x: u.wx, y: u.wy, vx: (rnd(u.addr, 91) - 0.5) * 7, vy: (rnd(u.addr, 92) - 0.5) * 7 }; phys.set(u.addr, p); }
          pos.set(u.addr, p);
        }
        if (!diveRef.current) {
          for (const u of vis) {
            const p = pos.get(u.addr)!;
            p.vx += (u.wx - p.x) * 0.35 * dt; p.vy += (u.wy - p.y) * 0.35 * dt;
            p.vx *= 1 - 0.06 * dt; p.vy *= 1 - 0.06 * dt;
            p.x += p.vx * dt; p.y += p.vy * dt;
          }
          for (let a2 = 0; a2 < vis.length; a2++) for (let b2 = a2 + 1; b2 < vis.length; b2++) {
            const ua = vis[a2], ub = vis[b2];
            const pa = pos.get(ua.addr)!, pb = pos.get(ub.addr)!;
            const dx = pb.x - pa.x, dy = pb.y - pa.y;
            const dd = Math.hypot(dx, dy), min = (ua.r + ub.r) * 0.92;
            if (dd >= min || dd < 0.01) continue;
            const nx = dx / dd, ny = dy / dd, ov = (min - dd) / 2;
            pa.x -= nx * ov; pa.y -= ny * ov; pb.x += nx * ov; pb.y += ny * ov;
            const rv = (pb.vx - pa.vx) * nx + (pb.vy - pa.vy) * ny;
            if (rv < 0) { const k = rv * 0.92; pa.vx += nx * k; pa.vy += ny * k; pb.vx -= nx * k; pb.vy -= ny * k; }
          }
          if (phys.size > 900) { for (const k of [...phys.keys()]) if (!pos.has(k)) phys.delete(k); }
        }

        // ── VEINS: faint connective tissue between neighbouring cells
        for (let a2 = 0; a2 < vis.length; a2++) {
          const ua = vis[a2]; const pa = pos.get(ua.addr)!;
          const ax = (pa.x - ox) * Z, ay = (pa.y - oy) * Z;
          for (let b2 = a2 + 1; b2 < vis.length; b2++) {
            const ub = vis[b2]; const pb = pos.get(ub.addr)!;
            const bx = (pb.x - ox) * Z, by = (pb.y - oy) * Z;
            const dd = Math.hypot(ax - bx, ay - by);
            const reach = (ua.r + ub.r) * 1.7 * Z;
            if (dd > reach || dd < 1) continue;
            const strength = (1 - dd / reach) * 10;
            const col = hsl((ua.hue + ub.hue) / 2, 0.35, 0.45);
            const steps = Math.max(2, dd | 0);
            for (let k = 0; k <= steps; k++) {
              const f = k / steps;
              if ((k & 3) === 0) continue;
              const px = (ax + (bx - ax) * f) | 0, py = (ay + (by - ay) * f) | 0;
              if (px < 0 || py < 0 || px >= W || py >= H) continue;
              const wob = 0.6 + 0.4 * Math.sin(f * 9 + t * 1.3 + ua.phase);
              const g = strength * wob; const i = (py * W + px) * 3;
              A[i] += col[0] / 255 * g; A[i + 1] += col[1] / 255 * g; A[i + 2] += col[2] / 255 * g;
            }
          }
        }

        // ── THE CELLS
        for (const u of vis) {
          const p = pos.get(u.addr)!;
          const ur = u.r * Z;
          const sx = (p.x - ox) * Z, sy = (p.y - oy) * Z;
          if (sx < -ur * 1.5 || sy < -ur * 1.5 || sx > W + ur * 1.5 || sy > H + ur * 1.5) continue;
          const breathe = 0.5 + 0.5 * Math.sin(t * u.breath + u.phase);
          const pulse = foc && foc.addr === u.addr ? Math.max(0, 1 - (now - foc.at) / 1400) : 0;
          // ── COSMIC EPOCH made visible: an aging universe is a dying CELL. `cooling`
          // (0 young … 1 heat-dead) dims the membrane (vitality), drains its colour
          // toward cold grey (csat), and — hardest — starves the organelles (the life
          // inside). A young cell glows warm and busy; an ancient one is a faint, cold
          // ghost. Same number that cools its bg temp + kills its life on the HUD.
          const cool = u.cooling;
          const vitality = 1 - cool * 0.5;                 // membrane/body: a ghost, not gone
          const csat = u.sat * (1 - cool * 0.6);           // colour drains out with age
          const bright = (0.6 + 0.45 * breathe) * (1 + pulse * 1.3) * vitality;
          if (mLo) { const d = Math.hypot(mLo.x - sx, mLo.y - sy); if (d < ur && d < hovD) { hovD = d; hov = { kind: 'uni', u }; } }

          const cyto = hsl(u.hue, csat, 0.42);
          const R = ur * 1.35;
          const nx = sx + Math.cos(u.phase) * u.nucOff * ur, ny = sy + Math.sin(u.phase) * u.nucOff * ur;
          const nucR = u.nucR * ur, nucCol = hsl(u.nucHue, csat + 0.15, 0.6);
          const rimCol = hsl(u.hue, Math.min(1, csat + 0.22), 0.74);
          const HALO = 5;
          const bx0 = Math.max(0, (sx - R - HALO) | 0), bx1 = Math.min(W - 1, (sx + R + HALO) | 0);
          const by0 = Math.max(0, (sy - R - HALO) | 0), by1 = Math.min(H - 1, (sy + R + HALO) | 0);
          for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) {
            const px = x - sx, py = y - sy; const dist = Math.hypot(px, py);
            if (dist < 0.001) continue;
            const ang = Math.atan2(py, px);
            const edge = membraneR(u, ur, ang, t, breathe);
            const sd = dist - edge;
            if (sd > HALO) continue;
            const i = (y * W + x) * 3;
            if (sd <= 0) {
              const rimT = dist / edge;
              const speck = 0.7 + 0.6 * rnd((x * 73856093) ^ (y * 19349663), u.addr) * u.grain;
              const lit = 1 + 0.5 * ((-px - py) / (edge + 1));
              const body = (0.9 - 0.4 * rimT) * 9 * bright * speck * Math.max(0.4, lit);
              A[i] += cyto[0] / 255 * body; A[i + 1] += cyto[1] / 255 * body; A[i + 2] += cyto[2] / 255 * body;
            }
            const wall = Math.max(0, 1 - Math.abs(sd) / 2.2);
            if (wall > 0) {
              const g = wall * wall * 62 * bright;
              A[i] += rimCol[0] / 255 * g; A[i + 1] += rimCol[1] / 255 * g; A[i + 2] += rimCol[2] / 255 * g;
            }
            if (sd > 0) {
              const hb = Math.pow(1 - sd / HALO, 2.4) * 18 * bright;
              A[i] += rimCol[0] / 255 * hb; A[i + 1] += rimCol[1] / 255 * hb; A[i + 2] += rimCol[2] / 255 * hb;
            }
            if (sd <= 0) {
              const nd = Math.hypot(x - nx, y - ny);
              if (nd < nucR) {
                const nf = 1 - nd / nucR; const g = Math.pow(nf, 1.7) * 42 * bright;
                A[i] += nucCol[0] / 255 * g; A[i + 1] += nucCol[1] / 255 * g; A[i + 2] += nucCol[2] / 255 * g;
              }
            }
          }
          const cs = Math.cos(t * u.rot), sn = Math.sin(t * u.rot);
          for (const gg of u.orgs) {
            const gx = (sx + (gg.dx * cs - gg.dy * sn) * Z) | 0, gy = (sy + (gg.dx * sn + gg.dy * cs) * Z) | 0;
            const [r, gr, b] = hsl(gg.hue, 0.7 * (1 - cool * 0.6), gg.kind ? 0.68 : 0.5);
            const bb = (gg.kind ? 130 : 80) * (0.7 + 0.5 * breathe) * (1 + 0.6 * pulse) * (1 - cool * 0.75);
            const put = (dx: number, dy: number, k: number) => {
              const px2 = gx + dx, py2 = gy + dy; if (px2 < 0 || py2 < 0 || px2 >= W || py2 >= H) return;
              const i = (py2 * W + px2) * 3; A[i] += r / 255 * bb * k; A[i + 1] += gr / 255 * bb * k; A[i + 2] += b / 255 * bb * k;
            };
            put(0, 0, 1);
            if (gg.r > 2 || gg.sp) { put(1, 0, 0.35); put(-1, 0, 0.35); put(0, 1, 0.35); put(0, -1, 0.35); }
          }
        }
      } else if (layer.kind === 'universe') {
        // ══ INSIDE A UNIVERSE — the COSMIC WEB. The biggest scale there is: not
        // galaxies yet, but superclusters — filament-knotted clumps strung across
        // the void, joined by faint web threads. Millions before you'd run out.
        const u = layer.u;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const d = Math.hypot(x - W / 2, y - H / 2) / (Math.min(W, H) * 0.9);
          const v = 8 * Math.max(0, 1 - d); const i = (y * W + x) * 3;
          A[i] += v * 0.8; A[i + 1] += v * 0.65; A[i + 2] += v * 1.35;  // deep violet void
        }
        const sBias = 0.3;
        for (let s = 0; s < 380; s++) {                       // faint background motes
          const sx = ((rnd(s ^ u.base, 5) * 4000 - cam.x * sBias * Z) % W + W) % W;
          const sy = ((rnd(s ^ u.base, 6) * 4000 - cam.y * sBias * Z) % H + H) % H;
          const a = (0.2 + 0.5 * rnd(s, 7)) * (0.5 + 0.5 * Math.sin(t * 0.6 + rnd(s, 8) * 6.283)) * 60;
          const i = ((sy | 0) * W + (sx | 0)) * 3; A[i] += a * 0.75; A[i + 1] += a * 0.7; A[i + 2] += a;
        }

        const c0x = Math.floor(ox / SCCELL) - 1, c1x = Math.floor((ox + W / Z) / SCCELL) + 1;
        const c0y = Math.floor(oy / SCCELL) - 1, c1y = Math.floor((oy + H / Z) / SCCELL) + 1;

        if (Z < DUST) {
          // far band: superclusters as pale web-motes — same addresses, unresolved
          for (let cx = c0x; cx <= c1x; cx++) for (let cy = c0y; cy <= c1y; cy++) {
            const ch = mix(u.base ^ cellHash(cx, cy));
            const n = 1 + (ch % 2);
            for (let i = 0; i < n; i++) {
              const seed = mix(mix(u.base ^ cellHash(cx, cy)) ^ Math.imul(i + 1, 0x9e3779b1));
              const wx = cx * SCCELL + rnd(seed, 1) * SCCELL, wy = cy * SCCELL + rnd(seed, 2) * SCCELL;
              const ix = ((wx - ox) * Z) | 0, iy = ((wy - oy) * Z) | 0;
              if (ix < 0 || iy < 0 || ix >= W || iy >= H) continue;
              const r = 18 + 24 * rnd(seed, 13);
              const tw = 0.6 + 0.4 * Math.sin(t * 0.7 + rnd(seed, 16) * 6.283);
              const bb = (32 + r * 6) * tw;
              const [cr2, cg2, cb2] = hsl(185 + 110 * rnd(seed, 14), 0.55, 0.66);
              const i3 = (iy * W + ix) * 3;
              A[i3] += cr2 / 255 * bb; A[i3 + 1] += cg2 / 255 * bb; A[i3 + 2] += cb2 / 255 * bb;
              const put = (dx: number, dy: number) => {
                const px2 = ix + dx, py2 = iy + dy; if (px2 < 0 || py2 < 0 || px2 >= W || py2 >= H) return;
                const j = (py2 * W + px2) * 3; A[j] += cr2 / 255 * bb * 0.35; A[j + 1] += cg2 / 255 * bb * 0.35; A[j + 2] += cb2 / 255 * bb * 0.35;
              };
              put(1, 0); put(-1, 0); put(0, 1); put(0, -1);
            }
          }
        } else {
          const vis: SC[] = [];
          for (let cx = c0x; cx <= c1x; cx++) for (let cy = c0y; cy <= c1y; cy++) vis.push(...scUnis(u, cx, cy));

          // the WEB between superclusters — thin unbroken filaments (this is the
          // real cosmic-web structure; the multiverse's veins are its organic echo)
          for (let a2 = 0; a2 < vis.length; a2++) {
            const sa2 = vis[a2]; const ax = (sa2.wx - ox) * Z, ay = (sa2.wy - oy) * Z;
            for (let b2 = a2 + 1; b2 < vis.length; b2++) {
              const sb = vis[b2]; const bx = (sb.wx - ox) * Z, by = (sb.wy - oy) * Z;
              const dd = Math.hypot(ax - bx, ay - by);
              const reach = (sa2.r + sb.r) * 2.4 * Z;
              if (dd > reach || dd < 1) continue;
              const strength = (1 - dd / reach) * 12;
              const steps = Math.max(2, dd | 0);
              for (let k = 1; k < steps; k++) {
                const f = k / steps;
                const wob = Math.sin(f * 6 + sa2.phase) * 2 * Z;   // filaments sag a little
                const px = (ax + (bx - ax) * f - wob * (by - ay) / dd) | 0;
                const py = (ay + (by - ay) * f + wob * (bx - ax) / dd) | 0;
                if (px < 0 || py < 0 || px >= W || py >= H) continue;
                const i = (py * W + px) * 3;
                A[i] += strength * 0.75; A[i + 1] += strength * 0.85; A[i + 2] += strength * 1.1;
              }
            }
          }

          for (const sc of vis) {
            const sr = sc.r * Z;
            const sx = (sc.wx - ox) * Z, sy = (sc.wy - oy) * Z;
            if (sx < -sr * 2 || sy < -sr * 2 || sx > W + sr * 2 || sy > H + sr * 2) continue;
            const breathe = 0.5 + 0.5 * Math.sin(t * sc.breath + sc.phase);
            const pulse = foc && foc.addr === sc.addr ? Math.max(0, 1 - (now - foc.at) / 1400) : 0;
            const bright = (0.6 + 0.4 * breathe) * (1 + pulse * 1.4);
            if (mLo) { const d = Math.hypot(mLo.x - sx, mLo.y - sy); if (d < sr * 1.2 && d < hovD) { hovD = d; hov = { kind: 'sc', sc }; } }

            // ambient halo — the clump's presence
            const RG = sr * 1.5, x0 = Math.max(0, (sx - RG) | 0), x1 = Math.min(W - 1, (sx + RG) | 0);
            const y0 = Math.max(0, (sy - RG) | 0), y1 = Math.min(H - 1, (sy + RG) | 0);
            const glow = hsl(sc.hue, 0.5, 0.52);
            for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
              const f = Math.hypot(x - sx, y - sy) / RG; if (f > 1) continue;
              const gl = Math.pow(1 - f, 2.4) * 19 * bright; const i = (y * W + x) * 3;
              A[i] += glow[0] / 255 * gl; A[i + 1] += glow[1] / 255 * gl; A[i + 2] += glow[2] / 255 * gl;
            }
            // internal threads between knots (the filament skeleton)
            for (const [ja, jb] of sc.threads) {
              const ka = sc.knots[ja], kb = sc.knots[jb];
              const x1t = sx + ka.dx * Z, y1t = sy + ka.dy * Z, x2t = sx + kb.dx * Z, y2t = sy + kb.dy * Z;
              const dd = Math.hypot(x2t - x1t, y2t - y1t); const steps = Math.max(2, dd | 0);
              for (let k = 0; k <= steps; k++) {
                const f = k / steps;
                const px = (x1t + (x2t - x1t) * f) | 0, py = (y1t + (y2t - y1t) * f) | 0;
                if (px < 0 || py < 0 || px >= W || py >= H) continue;
                const i = (py * W + px) * 3; const g = 15 * bright;
                A[i] += glow[0] / 255 * g; A[i + 1] += glow[1] / 255 * g; A[i + 2] += glow[2] / 255 * g;
              }
            }
            // the knots — galaxy-cluster nodes, bright little cores
            for (const kn of sc.knots) {
              const kx = sx + kn.dx * Z, ky = sy + kn.dy * Z;
              const KR = Math.max(1.4, kn.r * Z);
              const kx0 = Math.max(0, (kx - KR) | 0), kx1 = Math.min(W - 1, (kx + KR) | 0);
              const ky0 = Math.max(0, (ky - KR) | 0), ky1 = Math.min(H - 1, (ky + KR) | 0);
              for (let y = ky0; y <= ky1; y++) for (let x = kx0; x <= kx1; x++) {
                const f = Math.hypot(x - kx, y - ky) / KR; if (f > 1) continue;
                const gl = Math.pow(1 - f, 1.6) * 82 * kn.b * bright; const i = (y * W + x) * 3;
                A[i] += gl * 0.85; A[i + 1] += gl * 0.9; A[i + 2] += gl;
              }
            }
          }

          // FIELD GALAXIES — a lone spiral adrift in the void between the filaments.
          // A soft violet mote with a faint spin, distinct from the supercluster
          // knots. Hover → its isolation facts; click → dive into it (real galaxy).
          for (let cx = c0x; cx <= c1x; cx++) for (let cy = c0y; cy <= c1y; cy++) {
            for (const fg of fieldGalUnis(u, cx, cy)) {
              const sx = (fg.wx - ox) * Z, sy = (fg.wy - oy) * Z;
              if (sx < -20 || sy < -20 || sx > W + 20 || sy > H + 20) continue;
              const breathe = 0.5 + 0.5 * Math.sin(t * fg.breath + fg.phase);
              const bright = 0.7 + 0.5 * breathe;
              if (mLo) { const d = Math.hypot(mLo.x - sx, mLo.y - sy); if (d < 11 && d < hovD) { hovD = d; hov = { kind: 'gal', g: fg }; } }
              const RR = 12, rx0 = Math.max(0, (sx - RR) | 0), rx1 = Math.min(W - 1, (sx + RR) | 0);
              const ry0 = Math.max(0, (sy - RR) | 0), ry1 = Math.min(H - 1, (sy + RR) | 0);
              for (let y = ry0; y <= ry1; y++) for (let x = rx0; x <= rx1; x++) {
                const dr = Math.hypot(x - sx, y - sy) / RR; if (dr > 1) continue;
                const gl = Math.pow(1 - dr, 2) * 26 * bright; const i = (y * W + x) * 3;
                A[i] += gl * 0.85; A[i + 1] += gl * 0.6; A[i + 2] += gl * 1.15;   // lone violet
              }
              // a few spin motes so it reads as a GALAXY, not a star
              const cs = Math.cos(t * fg.rot), sn = Math.sin(t * fg.rot);
              for (const pt of fg.pts) {
                const gx = (sx + (pt.dx * cs - pt.dy * sn) * Z * 0.5) | 0, gy = (sy + (pt.dx * sn + pt.dy * cs) * Z * 0.5) | 0;
                if (gx < 0 || gy < 0 || gx >= W || gy >= H) continue;
                const bb = pt.b * 90 * bright; const i = (gy * W + gx) * 3;
                A[i] += bb / 255 * 200; A[i + 1] += bb / 255 * 150; A[i + 2] += bb / 255 * 235;
              }
            }
          }
        }
      } else if (layer.kind === 'super') {
        // ══ INSIDE A SUPERCLUSTER — the sea of galaxies. Deep space + parallax
        // stars, spiral discs with blazing cores, cell-hashed from the SC's address.
        const sc = layer.sc;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const d = Math.hypot(x - W / 2, y - H / 2) / (Math.min(W, H) * 0.9);
          const v = 9 * Math.max(0, 1 - d); const i = (y * W + x) * 3;
          A[i] += v * 0.7; A[i + 1] += v * 0.8; A[i + 2] += v * 1.7;
        }
        const sBias = 0.35;
        for (let s = 0; s < 520; s++) {
          const sx = ((rnd(s ^ sc.base, 5) * 4000 - cam.x * sBias * Z) % W + W) % W;
          const sy = ((rnd(s ^ sc.base, 6) * 4000 - cam.y * sBias * Z) % H + H) % H;
          const a = (0.3 + 0.7 * rnd(s, 7)) * (0.5 + 0.5 * Math.sin(t * 0.8 + rnd(s, 8) * 6.283)) * 130;
          const i = ((sy | 0) * W + (sx | 0)) * 3; A[i] += a * 0.8; A[i + 1] += a * 0.85; A[i + 2] += a;
        }

        const c0x = Math.floor(ox / GCELL) - 1, c1x = Math.floor((ox + W / Z) / GCELL) + 1;
        const c0y = Math.floor(oy / GCELL) - 1, c1y = Math.floor((oy + H / Z) / GCELL) + 1;

        if (Z < DUST) {
          for (let cx = c0x; cx <= c1x; cx++) for (let cy = c0y; cy <= c1y; cy++) {
            const ch = mix(sc.base ^ cellHash(cx, cy));
            const n = 1 + (ch % 3);
            for (let i = 0; i < n; i++) {
              const seed = mix(ch ^ Math.imul(i + 1, 0x9e3779b1));
              const wx = cx * GCELL + rnd(seed, 1) * GCELL, wy = cy * GCELL + rnd(seed, 2) * GCELL;
              const ix = ((wx - ox) * Z) | 0, iy = ((wy - oy) * Z) | 0;
              if (ix < 0 || iy < 0 || ix >= W || iy >= H) continue;
              const r = 9 + 14 * rnd(seed, 13);
              const tw = 0.6 + 0.4 * Math.sin(t * 0.9 + rnd(seed, 16) * 6.283);
              const bb = (26 + r * 8) * tw;
              const [cr2, cg2, cb2] = hsl(360 * rnd(seed, 14), 0.7, 0.66);
              const i3 = (iy * W + ix) * 3;
              A[i3] += cr2 / 255 * bb; A[i3 + 1] += cg2 / 255 * bb; A[i3 + 2] += cb2 / 255 * bb;
              if (r > 15) {
                const put = (dx: number, dy: number) => {
                  const px2 = ix + dx, py2 = iy + dy; if (px2 < 0 || py2 < 0 || px2 >= W || py2 >= H) return;
                  const j = (py2 * W + px2) * 3; A[j] += cr2 / 255 * bb * 0.3; A[j + 1] += cg2 / 255 * bb * 0.3; A[j + 2] += cb2 / 255 * bb * 0.3;
                };
                put(1, 0); put(-1, 0); put(0, 1); put(0, -1);
              }
            }
            // rogue beacon (far band) — a throbbing cold cross glint that pops out
            // of the void even at this zoom. The "what's out there?" pull.
            if (rogueAt(sc.base, cx, cy)) {
              const seed = mix(mix(sc.base ^ cellHash(cx, cy)) ^ 0x9e37_79b9);
              const wx = cx * GCELL + rnd(seed, 1) * GCELL, wy = cy * GCELL + rnd(seed, 2) * GCELL;
              const ix = ((wx - ox) * Z) | 0, iy = ((wy - oy) * Z) | 0;
              if (ix >= 1 && iy >= 1 && ix < W - 1 && iy < H - 1) {
                const throb = 0.5 + 0.5 * Math.sin(t * 2.6 + rnd(seed, 16) * 6.283);
                const bb = 130 * (0.5 + throb);
                const put = (dx: number, dy: number, k: number) => {
                  const j = ((iy + dy) * W + (ix + dx)) * 3;
                  A[j] += bb * k * 0.7; A[j + 1] += bb * k * 0.9; A[j + 2] += bb * k * 1.2;
                };
                put(0, 0, 1); put(1, 0, 0.5); put(-1, 0, 0.5); put(0, 1, 0.5); put(0, -1, 0.5);
              }
            }
          }
        } else {
          const vis: Gal[] = [];
          for (let cx = c0x; cx <= c1x; cx++) for (let cy = c0y; cy <= c1y; cy++) vis.push(...galUnis(sc, cx, cy));

          for (const g of vis) {
            const gr = g.r * Z;
            const sx = (g.wx - ox) * Z, sy = (g.wy - oy) * Z;
            if (sx < -gr * 2 || sy < -gr * 2 || sx > W + gr * 2 || sy > H + gr * 2) continue;
            const breathe = 0.5 + 0.5 * Math.sin(t * g.breath + g.phase);
            const pulse = foc && foc.addr === g.addr ? Math.max(0, 1 - (now - foc.at) / 1400) : 0;
            const bright = (0.6 + 0.45 * breathe) * (1 + pulse * 1.4);
            if (mLo) { const d = Math.hypot(mLo.x - sx, mLo.y - sy); if (d < gr * 1.3 && d < hovD) { hovD = d; hov = { kind: 'gal', g }; } }

            const RG = gr * 1.6, x0 = Math.max(0, (sx - RG) | 0), x1 = Math.min(W - 1, (sx + RG) | 0);
            const y0 = Math.max(0, (sy - RG) | 0), y1 = Math.min(H - 1, (sy + RG) | 0);
            const glow = hsl(g.hue, g.sat, 0.5);
            for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
              const f = Math.hypot(x - sx, y - sy) / RG; if (f > 1) continue;
              const gl = Math.pow(1 - f, 2.2) * 20 * bright; const i = (y * W + x) * 3;
              A[i] += glow[0] / 255 * gl; A[i + 1] += glow[1] / 255 * gl; A[i + 2] += glow[2] / 255 * gl;
            }
            const CR = Math.max(1.5, gr * 0.3);
            const cx0 = Math.max(0, (sx - CR) | 0), cx1 = Math.min(W - 1, (sx + CR) | 0);
            const cy0 = Math.max(0, (sy - CR) | 0), cy1 = Math.min(H - 1, (sy + CR) | 0);
            for (let y = cy0; y <= cy1; y++) for (let x = cx0; x <= cx1; x++) {
              const f = Math.hypot(x - sx, y - sy) / CR; if (f > 1) continue;
              const gl = Math.pow(1 - f, 1.4) * 90 * bright; const i = (y * W + x) * 3;
              A[i] += gl; A[i + 1] += gl * 0.94; A[i + 2] += gl * 0.85;
            }
            const cs = Math.cos(t * g.rot), sn = Math.sin(t * g.rot);
            for (const pt of g.pts) {
              const gx = (sx + (pt.dx * cs - pt.dy * sn) * Z) | 0, gy = (sy + (pt.dx * sn + pt.dy * cs) * Z) | 0;
              if (gx < 0 || gy < 0 || gx >= W || gy >= H) continue;
              const [r, gre, b] = hsl(pt.hue, 0.8, 0.72);
              const bb = pt.b * (150 + 100 * breathe) * (0.6 + 0.7 * pulse);
              const i = (gy * W + gx) * 3;
              A[i] += r / 255 * bb; A[i + 1] += gre / 255 * bb; A[i + 2] += b / 255 * bb;
              if (pt.sp) {
                const put = (dx: number, dy: number) => {
                  const px2 = gx + dx, py2 = gy + dy; if (px2 < 0 || py2 < 0 || px2 >= W || py2 >= H) return;
                  const j = (py2 * W + px2) * 3; A[j] += r / 255 * bb * 0.4; A[j + 1] += gre / 255 * bb * 0.4; A[j + 2] += b / 255 * bb * 0.4;
                };
                put(1, 0); put(-1, 0); put(0, 1); put(0, -1);
              }
            }
          }

          // ROGUE STARS — beacons in the void between the galaxies. They MUST out-
          // shine the field, so: throbbing cold core + long always-on cross spikes +
          // an icy halo. Hoverable/clickable → dives straight to the rogue's system.
          for (let cx = c0x; cx <= c1x; cx++) for (let cy = c0y; cy <= c1y; cy++) {
            for (const s of rogueUnis(sc, cx, cy)) {
              const sx = (s.wx - ox) * Z, sy = (s.wy - oy) * Z;
              if (sx < -30 || sy < -30 || sx > W + 30 || sy > H + 30) continue;
              const throb = 0.55 + 0.45 * Math.sin(t * 2.6 + s.phase);
              const beB = (0.9 + throb);
              if (mLo) { const d = Math.hypot(mLo.x - sx, mLo.y - sy); if (d < 12 && d < hovD) { hovD = d; hov = { kind: 'star', s }; } }
              const RR = 16, rx0 = Math.max(0, (sx - RR) | 0), rx1 = Math.min(W - 1, (sx + RR) | 0);
              const ry0 = Math.max(0, (sy - RR) | 0), ry1 = Math.min(H - 1, (sy + RR) | 0);
              for (let y = ry0; y <= ry1; y++) for (let x = rx0; x <= rx1; x++) {
                const dr = Math.hypot(x - sx, y - sy) / RR; if (dr > 1) continue;
                const gl = Math.pow(1 - dr, 2.2) * 30 * beB; const i = (y * W + x) * 3;
                A[i] += gl * 0.55; A[i + 1] += gl * 0.8; A[i + 2] += gl * 1.2;
              }
              const len = 13;
              for (let k = 1; k <= len; k++) {
                const fade = Math.pow(1 - k / (len + 1), 1.6) * 70 * beB;
                const putR = (dx: number, dy: number) => {
                  const px2 = (sx + dx) | 0, py2 = (sy + dy) | 0;
                  if (px2 < 0 || py2 < 0 || px2 >= W || py2 >= H) return;
                  const i = (py2 * W + px2) * 3; A[i] += fade * 0.7; A[i + 1] += fade * 0.9; A[i + 2] += fade * 1.2;
                };
                putR(k, 0); putR(-k, 0); putR(0, k); putR(0, -k);
              }
              const ci = ((sy | 0) * W + (sx | 0)) * 3; const cg = 230 * beB;
              A[ci] += cg * 0.8; A[ci + 1] += cg * 0.95; A[ci + 2] += cg * 1.2;
            }
          }
        }
      } else if (layer.kind === 'galaxy') {
        // ══ INSIDE A GALAXY — the starfield. The galactic PLANE crosses the view
        // as a milky band the stars crowd toward; every star's color and size obey
        // its address-rolled physics (class, temperature — facts ARE the laws).
        const g = layer.g;
        const bandA = 6.283 * rnd(g.base, 33);
        const ca = Math.cos(bandA), sa = Math.sin(bandA);
        const BW = 240;                                     // band half-width, world units
        for (let y = 0; y < H; y++) {
          const wy0 = oy + y / Z;
          for (let x = 0; x < W; x++) {
            const wx0 = ox + x / Z;
            const d0 = Math.hypot(x - W / 2, y - H / 2) / (Math.min(W, H) * 0.9);
            const i = (y * W + x) * 3;
            const v = 8 * Math.max(0, 1 - d0);
            A[i] += v * 0.75; A[i + 1] += v * 0.8; A[i + 2] += v * 1.5;
            const db = Math.abs(wx0 * sa - wy0 * ca);      // distance to the plane (world-anchored)
            if (db < BW) {
              const band = 1 - (db / BW) * (db / BW);
              const bg = band * band * 12;
              A[i] += bg; A[i + 1] += bg * 0.97; A[i + 2] += bg * 0.88;
            }
          }
        }
        const sBias = 0.35;
        for (let s = 0; s < 560; s++) {
          const sx = ((rnd(s ^ g.base, 5) * 4000 - cam.x * sBias * Z) % W + W) % W;
          const sy = ((rnd(s ^ g.base, 6) * 4000 - cam.y * sBias * Z) % H + H) % H;
          const a = (0.2 + 0.5 * rnd(s, 7)) * (0.5 + 0.5 * Math.sin(t * 0.7 + rnd(s, 8) * 6.283)) * 70;
          const i = ((sy | 0) * W + (sx | 0)) * 3; A[i] += a * 0.85; A[i + 1] += a * 0.9; A[i + 2] += a;
        }

        const c0x = Math.floor(ox / STCELL) - 1, c1x = Math.floor((ox + W / Z) / STCELL) + 1;
        const c0y = Math.floor(oy / STCELL) - 1, c1y = Math.floor((oy + H / Z) / STCELL) + 1;
        // COUNTS ARE CAPACITIES: the fact sheet's star count IS the disc. A cell
        // inside the galaxy's radius holds exactly gs.c stars; outside holds NONE —
        // wander far enough and the starfield genuinely ends at intergalactic dark.
        const gs = galaxyStars(g.gseed);
        const starN = (cx: number, cy: number) =>
          Math.max(Math.abs(cx), Math.abs(cy)) <= gs.R ? gs.c : 0;

        if (Z < DUST) {
          for (let cx = c0x; cx <= c1x; cx++) for (let cy = c0y; cy <= c1y; cy++) {
            const ch = mix(g.base ^ cellHash(cx, cy));
            const n = starN(cx, cy);
            for (let i = 0; i < n; i++) {
              const seed = mix(ch ^ Math.imul(i + 1, 0x9e3779b1));
              const wx = cx * STCELL + rnd(seed, 1) * STCELL, wy = cy * STCELL + rnd(seed, 2) * STCELL;
              const ix = ((wx - ox) * Z) | 0, iy = ((wy - oy) * Z) | 0;
              if (ix < 0 || iy < 0 || ix >= W || iy >= H) continue;
              const tw = 0.6 + 0.4 * Math.sin(t * 1.4 + rnd(seed, 16) * 6.283);
              const bb = (24 + 46 * rnd(seed, 13)) * tw;
              const warm = rnd(seed, 14);                    // cheap tint: warm ↔ cool white
              const i3 = (iy * W + ix) * 3;
              A[i3] += bb * (0.85 + 0.15 * warm); A[i3 + 1] += bb * 0.9; A[i3 + 2] += bb * (1 - 0.15 * warm);
            }
          }
        } else {
          const vis: Star[] = [];
          for (let cx = c0x; cx <= c1x; cx++) for (let cy = c0y; cy <= c1y; cy++) {
            const k = `${g.uaddr}:${g.scaddr}:${g.addr}:${cx},${cy}`;
            let v = starCache.get(k);
            if (!v) {
              const n = starN(cx, cy);
              v = Array.from({ length: n }, (_, i) => starAt(g.base, g.uaddr, g.scaddr, g.addr, g.name, cx, cy, i, STCELL));
              starCache.set(k, v);
              if (starCache.size > 1400) starCache.clear();
            }
            vis.push(...v);
          }

          for (const s of vis) {
            const sr = Math.max(0.8, s.r * Z);
            const sx = (s.wx - ox) * Z, sy = (s.wy - oy) * Z;
            if (sx < -sr * 5 || sy < -sr * 5 || sx > W + sr * 5 || sy > H + sr * 5) continue;
            const tw = 0.7 + 0.3 * Math.sin(t * s.tw + s.phase);
            const pulse = foc && foc.addr === s.addr ? Math.max(0, 1 - (now - foc.at) / 1400) : 0;
            const bright = tw * (1 + pulse * 1.2);
            if (mLo) { const d = Math.hypot(mLo.x - sx, mLo.y - sy); if (d < Math.max(4, sr * 2.5) && d < hovD) { hovD = d; hov = { kind: 'star', s }; } }

            if (s.bh) {
              // ⚫ a stellar black hole — carve the void out of the buffer (negative
              // adds; the dither clamps), ring it with a doppler-hot accretion band.
              const VR = sr * 1.9;
              const vx0 = Math.max(0, (sx - VR * 2.4) | 0), vx1 = Math.min(W - 1, (sx + VR * 2.4) | 0);
              const vy0 = Math.max(0, (sy - VR * 2.4) | 0), vy1 = Math.min(H - 1, (sy + VR * 2.4) | 0);
              for (let y = vy0; y <= vy1; y++) for (let x = vx0; x <= vx1; x++) {
                const dxp = x - sx, dyp = y - sy; const dist = Math.hypot(dxp, dyp);
                const i = (y * W + x) * 3;
                if (dist < VR) { const f = 1 - dist / VR; A[i] -= 500 * f; A[i + 1] -= 500 * f; A[i + 2] -= 500 * f; }
                const rd = Math.hypot(dxp, dyp * 2.4);           // the disc, seen at a tilt
                const band = Math.abs(rd - VR * 1.35) / (VR * 0.45);
                if (band < 1) {
                  const dop = 1 + 0.8 * (dxp / Math.max(1, rd)); // one side blazes toward you
                  const gl = (1 - band) * (1 - band) * 70 * bright * dop;
                  A[i] += gl; A[i + 1] += gl * 0.62; A[i + 2] += gl * 0.3;
                }
                const ph = Math.abs(dist - VR * 1.04) / 1.6;     // thin photon ring
                if (ph < 1) { const gl = (1 - ph) * 45 * bright; A[i] += gl * 0.9; A[i + 1] += gl * 0.95; A[i + 2] += gl; }
              }
              continue;
            }

            // ROGUE BEACON — it MUST out-shine a field already full of stars, or it
            // vanishes. A strong throb (fast pulse the eye catches as motion) + long
            // always-on cross spikes (no background mote has spikes) + a cold halo.
            // The one thing that reads "anomaly, go look" against the crowd.
            if (s.rogue) {
              const throb = 0.55 + 0.45 * Math.sin(t * 2.6 + s.phase);   // fast, catches the eye
              const beB = bright * (0.9 + throb);
              // cold wide halo
              const RR = sr * 7, rx0 = Math.max(0, (sx - RR) | 0), rx1 = Math.min(W - 1, (sx + RR) | 0);
              const ry0 = Math.max(0, (sy - RR) | 0), ry1 = Math.min(H - 1, (sy + RR) | 0);
              for (let y = ry0; y <= ry1; y++) for (let x = rx0; x <= rx1; x++) {
                const dr = Math.hypot(x - sx, y - sy) / RR; if (dr > 1) continue;
                const gl = Math.pow(1 - dr, 2.2) * 34 * beB; const i = (y * W + x) * 3;
                A[i] += gl * 0.55; A[i + 1] += gl * 0.8; A[i + 2] += gl * 1.15;   // icy blue-white
              }
              // long cross spikes — ALWAYS on (not zoom-gated), the signature no
              // background star has, so a rogue is unmistakable at any distance.
              const len = Math.max(10, (sr * 8) | 0);
              for (let k = 1; k <= len; k++) {
                const fade = Math.pow(1 - k / (len + 1), 1.7) * 60 * beB;
                const putR = (dx: number, dy: number) => {
                  const px2 = (sx + dx) | 0, py2 = (sy + dy) | 0;
                  if (px2 < 0 || py2 < 0 || px2 >= W || py2 >= H) return;
                  const i = (py2 * W + px2) * 3;
                  A[i] += fade * 0.7; A[i + 1] += fade * 0.9; A[i + 2] += fade * 1.15;
                };
                putR(k, 0); putR(-k, 0); putR(0, k); putR(0, -k);
              }
            }
            const col = hsl(s.hue, s.sat, 0.6);
            // halo — the class color lives here (red dwarfs smoulder, O-stars blaze blue)
            const HR = sr * 3.4, x0 = Math.max(0, (sx - HR) | 0), x1 = Math.min(W - 1, (sx + HR) | 0);
            const y0 = Math.max(0, (sy - HR) | 0), y1 = Math.min(H - 1, (sy + HR) | 0);
            for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
              const f = Math.hypot(x - sx, y - sy) / HR; if (f > 1) continue;
              const gl = Math.pow(1 - f, 2.4) * 26 * bright; const i = (y * W + x) * 3;
              A[i] += col[0] / 255 * gl; A[i + 1] += col[1] / 255 * gl; A[i + 2] += col[2] / 255 * gl;
            }
            // core — near-white, tinted by class
            const CR = Math.max(1.2, sr * 1.1);
            const cx0 = Math.max(0, (sx - CR) | 0), cx1 = Math.min(W - 1, (sx + CR) | 0);
            const cy0 = Math.max(0, (sy - CR) | 0), cy1 = Math.min(H - 1, (sy + CR) | 0);
            for (let y = cy0; y <= cy1; y++) for (let x = cx0; x <= cx1; x++) {
              const f = Math.hypot(x - sx, y - sy) / CR; if (f > 1) continue;
              const gl = Math.pow(1 - f, 1.3) * 120 * bright; const i = (y * W + x) * 3;
              A[i] += gl * (0.8 + 0.2 * col[0] / 255); A[i + 1] += gl * (0.8 + 0.2 * col[1] / 255); A[i + 2] += gl * (0.8 + 0.2 * col[2] / 255);
            }
            {   // saturated centre + tiny glint — a star is a POINT of light first
              const ix2 = sx | 0, iy2 = sy | 0;
              if (ix2 >= 0 && iy2 >= 0 && ix2 < W && iy2 < H) {
                const i = (iy2 * W + ix2) * 3; const g = 210 * bright;
                A[i] += g; A[i + 1] += g * 0.96; A[i + 2] += g * 0.9;
              }
              const putG = (dx: number, dy: number, k: number) => {
                const px2 = ix2 + dx, py2 = iy2 + dy;
                if (px2 < 0 || py2 < 0 || px2 >= W || py2 >= H) return;
                const g = 95 * bright * k; const i = (py2 * W + px2) * 3;
                A[i] += g; A[i + 1] += g * 0.95; A[i + 2] += g * 0.88;
              };
              putG(1, 0, 1); putG(-1, 0, 1); putG(0, 1, 1); putG(0, -1, 1);
              putG(2, 0, 0.4); putG(-2, 0, 0.4); putG(0, 2, 0.4); putG(0, -2, 0.4);
            }
            // diffraction spikes — the pixel-pretty star signature (near zoom only)
            if (sr > 1.6) {
              const len = sr * 4.5 | 0;
              for (let k = 1; k <= len; k++) {
                const fade = Math.pow(1 - k / (len + 1), 2) * 40 * bright;
                const putS = (dx: number, dy: number) => {
                  const px2 = (sx + dx) | 0, py2 = (sy + dy) | 0;
                  if (px2 < 0 || py2 < 0 || px2 >= W || py2 >= H) return;
                  const i = (py2 * W + px2) * 3;
                  A[i] += fade * (0.7 + 0.3 * col[0] / 255); A[i + 1] += fade * (0.7 + 0.3 * col[1] / 255); A[i + 2] += fade * (0.7 + 0.3 * col[2] / 255);
                };
                putS(k, 0); putS(-k, 0); putS(0, k); putS(0, -k);
              }
            }
          }
        }

        // ⚫ THE CORE — the supermassive hole the galaxy's fact sheet promised
        // (same seed, same salt → the SAME mass number), parked at the exact centre.
        {
          const core = galaxyCoreOf(g.gseed);
          const bxc = (0 - ox) * Z, byc = (0 - oy) * Z;
          const CRR = (9 + core.massM * 0.22) * Z;
          if (bxc > -CRR * 3 && byc > -CRR * 3 && bxc < W + CRR * 3 && byc < H + CRR * 3) {
            if (mLo) { const d = Math.hypot(mLo.x - bxc, mLo.y - byc); if (d < CRR * 1.8 && d < hovD) { hovD = d; hov = { kind: 'core', g }; } }
            const vx0 = Math.max(0, (bxc - CRR * 2.6) | 0), vx1 = Math.min(W - 1, (bxc + CRR * 2.6) | 0);
            const vy0 = Math.max(0, (byc - CRR * 2.6) | 0), vy1 = Math.min(H - 1, (byc + CRR * 2.6) | 0);
            for (let y = vy0; y <= vy1; y++) for (let x = vx0; x <= vx1; x++) {
              const dxp = x - bxc, dyp = y - byc; const dist = Math.hypot(dxp, dyp);
              const i = (y * W + x) * 3;
              if (dist < CRR) { const f = 1 - dist / CRR; A[i] -= 600 * f; A[i + 1] -= 600 * f; A[i + 2] -= 600 * f; }
              const rd = Math.hypot(dxp, dyp * 2.2);
              const band = Math.abs(rd - CRR * 1.4) / (CRR * 0.5);
              if (band < 1) {
                const swirl = 0.75 + 0.25 * Math.sin(Math.atan2(dyp, dxp) * 3 + t * 1.6);
                const dop = 1 + 0.7 * (dxp / Math.max(1, rd));
                const gl = (1 - band) * (1 - band) * 85 * swirl * dop;
                A[i] += gl; A[i + 1] += gl * 0.66; A[i + 2] += gl * 0.34;
              }
              const ph = Math.abs(dist - CRR * 1.05) / 1.8;
              if (ph < 1) { const gl = (1 - ph) * 55; A[i] += gl * 0.9; A[i + 1] += gl * 0.95; A[i + 2] += gl; }
            }
          }
        }
      } else {
        // ══ INSIDE A SOLAR SYSTEM — a bounded scene (Atlas's "enter a building"):
        // the star ablaze at the centre, the EXACT worlds its fact sheet promised
        // on their orbits, moons, rings, and an asteroid belt — every one a
        // sub-address. Each planet's surface is an entire Atlas world (the handoff).
        const s = layer.s;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const d = Math.hypot(x - W / 2, y - H / 2) / (Math.min(W, H) * 0.9);
          const v = 8 * Math.max(0, 1 - d); const i = (y * W + x) * 3;
          A[i] += v * 0.7; A[i + 1] += v * 0.75; A[i + 2] += v * 1.5;
        }
        for (let st = 0; st < 420; st++) {
          const sx2 = ((rnd(st ^ s.base, 5) * 4000 - cam.x * 0.3 * Z) % W + W) % W;
          const sy2 = ((rnd(st ^ s.base, 6) * 4000 - cam.y * 0.3 * Z) % H + H) % H;
          const a = (0.25 + 0.55 * rnd(st, 7)) * (0.5 + 0.5 * Math.sin(t * 0.8 + rnd(st, 8) * 6.283)) * 90;
          const i = ((sy2 | 0) * W + (sx2 | 0)) * 3; A[i] += a * 0.85; A[i + 1] += a * 0.9; A[i + 2] += a;
        }

        // ── THE STAR at the origin — granulated surface, crisp limb ring, corona,
        // long diffraction spikes: a pixel-art SUN, not a soft blob.
        const scol = hsl(s.hue, s.sat, 0.6);
        const SR = Math.max(3, s.r * 5.5 * Z);
        const ssx = (0 - ox) * Z, ssy = (0 - oy) * Z;
        if (mLo) { const d = Math.hypot(mLo.x - ssx, mLo.y - ssy); if (d < SR * 1.7 && d < hovD) { hovD = d; hov = { kind: 'star', s }; } }
        const flare = 0.85 + 0.15 * Math.sin(t * 2.1 + s.phase);
        const KR = SR * 2.7;
        const kx0 = Math.max(0, (ssx - KR) | 0), kx1 = Math.min(W - 1, (ssx + KR) | 0);
        const ky0 = Math.max(0, (ssy - KR) | 0), ky1 = Math.min(H - 1, (ssy + KR) | 0);
        for (let y = ky0; y <= ky1; y++) for (let x = kx0; x <= kx1; x++) {
          const dist = Math.hypot(x - ssx, y - ssy);
          const f = dist / KR; if (f > 1) continue;
          const i = (y * W + x) * 3;
          const gl = Math.pow(1 - f, 2.6) * 40 * flare;                       // corona, class-colored
          A[i] += scol[0] / 255 * gl; A[i + 1] += scol[1] / 255 * gl; A[i + 2] += scol[2] / 255 * gl;
          const fc = dist / SR;
          if (fc <= 1) {
            // SEETHING granulation: two stable speckle fields crossfading on a
            // per-cell clock — up close the surface visibly boils in place.
            const h1 = rnd((x * 2246822519) ^ (y * 3266489917), s.addr);
            const h2 = rnd((x * 668265263) ^ (y * 374761393), s.addr);
            const w2 = 0.5 + 0.5 * Math.sin(t * 1.9 + h2 * 6.283);
            const gran = 0.62 + 0.62 * (h1 * (1 - w2) + h2 * w2);
            const gc = Math.pow(1 - fc, 0.9) * 120 * flare * gran;
            A[i] += gc; A[i + 1] += gc * 0.95; A[i + 2] += gc * 0.88;
            const limb = Math.abs(fc - 0.93) / 0.07;                          // crisp bright limb
            if (limb < 1) { const lg = (1 - limb) * 55 * flare; A[i] += scol[0] / 255 * lg; A[i + 1] += scol[1] / 255 * lg; A[i + 2] += scol[2] / 255 * lg; }
          }
        }
        // SUNSPOTS — dark cells drifting slowly across the disc (some stars are spotless)
        for (let sp2 = 0; sp2 < 3; sp2++) {
          if (rnd(s.addr, 950 + sp2) < 0.4) continue;
          const sa3 = rnd(s.addr, 953 + sp2) * 6.283 + t * 0.03 * (sp2 + 1);
          const srr = SR * (0.2 + 0.45 * rnd(s.addr, 956 + sp2));
          const spx = ssx + Math.cos(sa3) * srr, spy = ssy + Math.sin(sa3) * srr * 0.9;
          const spr = Math.max(1.5, SR * (0.05 + 0.06 * rnd(s.addr, 959 + sp2)));
          const sx0b = Math.max(0, (spx - spr) | 0), sx1b = Math.min(W - 1, (spx + spr) | 0);
          const sy0b = Math.max(0, (spy - spr) | 0), sy1b = Math.min(H - 1, (spy + spr) | 0);
          for (let y = sy0b; y <= sy1b; y++) for (let x = sx0b; x <= sx1b; x++) {
            const fsp = Math.hypot(x - spx, y - spy) / spr; if (fsp > 1) continue;
            if (Math.hypot(x - ssx, y - ssy) > SR * 0.97) continue;           // stay on the disc
            const dk = Math.pow(1 - fsp, 1.4) * 95; const i = (y * W + x) * 3;
            A[i] -= dk; A[i + 1] -= dk * 0.97; A[i + 2] -= dk * 0.92;
          }
        }
        // PROMINENCES — fiery arcs breathing off the limb, each on its own clock
        for (let pf = 0; pf < 4; pf++) {
          const pa = rnd(s.addr, 970 + pf) * 6.283 + t * 0.02;
          const amp = (0.5 + 0.5 * Math.sin(t * (0.5 + 0.35 * rnd(s.addr, 974 + pf)) + pf * 2.2)) * SR * 0.38;
          if (amp < SR * 0.07) continue;
          const cpa = Math.cos(pa), spa = Math.sin(pa);
          for (let q = 0; q <= 26; q++) {
            const f2 = q / 26;
            const lift = Math.sin(f2 * 3.1416) * amp;                         // the arch
            const wob = (f2 - 0.5) * SR * 0.55;                               // spread along the limb
            const px2 = (ssx + cpa * (SR + lift) - spa * wob) | 0;
            const py2 = (ssy + spa * (SR + lift) + cpa * wob) | 0;
            if (px2 < 0 || py2 < 0 || px2 >= W || py2 >= H) continue;
            const gl = (1 - Math.abs(f2 - 0.5) * 2) * 75 * flare;             // hot: white→orange
            const i = (py2 * W + px2) * 3;
            A[i] += gl; A[i + 1] += gl * 0.78; A[i + 2] += gl * 0.5;
          }
        }
        {                                                                      // diffraction spikes
          const len = (SR * 3.2) | 0;
          for (let k = (SR * 1.05) | 0; k <= len; k++) {
            const fade = Math.pow(1 - k / (len + 1), 1.8) * 46 * flare;
            const putS = (dx: number, dy: number) => {
              const px2 = (ssx + dx) | 0, py2 = (ssy + dy) | 0;
              if (px2 < 0 || py2 < 0 || px2 >= W || py2 >= H) return;
              const i = (py2 * W + px2) * 3;
              A[i] += fade * (0.7 + 0.3 * scol[0] / 255); A[i + 1] += fade * (0.7 + 0.3 * scol[1] / 255); A[i + 2] += fade * (0.7 + 0.3 * scol[2] / 255);
            };
            putS(k, 0); putS(-k, 0); putS(0, k); putS(0, -k);
          }
        }
        // FAR SHINE — a real star out-blazes everything orbiting it, at ANY zoom.
        // As the disc shrinks toward a point, a saturated core + a crisp cross
        // glint take over, so the sun reads as the brightest thing on screen.
        {
          const small = Math.max(0, Math.min(1, 1.6 - SR / 14));   // 0 near … 1 far
          if (small > 0.05) {
            const cxs = ssx | 0, cys = ssy | 0;
            const putC = (dx: number, dy: number, k: number) => {
              const px2 = cxs + dx, py2 = cys + dy;
              if (px2 < 0 || py2 < 0 || px2 >= W || py2 >= H) return;
              const g = 255 * small * k * flare; const i = (py2 * W + px2) * 3;
              A[i] += g; A[i + 1] += g * 0.96; A[i + 2] += g * 0.9;
            };
            putC(0, 0, 1.6); putC(1, 0, 0.9); putC(-1, 0, 0.9); putC(0, 1, 0.9); putC(0, -1, 0.9);
            putC(1, 1, 0.45); putC(-1, 1, 0.45); putC(1, -1, 0.45); putC(-1, -1, 0.45);
            const glen = (5 + 9 * small) | 0;                      // the cross glint
            for (let k = 2; k <= glen; k++) {
              const fade = Math.pow(1 - k / (glen + 1), 1.6) * 150 * small * flare;
              const putG = (dx: number, dy: number) => {
                const px2 = cxs + dx, py2 = cys + dy;
                if (px2 < 0 || py2 < 0 || px2 >= W || py2 >= H) return;
                const i = (py2 * W + px2) * 3;
                A[i] += fade; A[i + 1] += fade * 0.95; A[i + 2] += fade * 0.88;
              };
              putG(k, 0); putG(-k, 0); putG(0, k); putG(0, -k);
            }
          }
        }

        // ── ORBITS + PLANETS (lit by the star: the day side faces the origin)
        let sys = sysCache.get(s.addr);
        if (!sys) {
          const planets = planetsFor(s);
          sys = { planets, belts: beltsFor(s, planets) };
          sysCache.set(s.addr, sys);
          if (sysCache.size > 40) sysCache.clear();
        }
        for (const p of sys.planets) {
          const orad = p.orbit * Z;
          if (orad < (W + H)) {                                    // ring can touch the view
            const steps = Math.min(1200, Math.max(80, (6.283 * orad) | 0));
            for (let k = 0; k < steps; k += 2) {                   // faint dashed orbit ring
              const a2 = (k / steps) * 6.283;
              const px2 = (ssx + Math.cos(a2) * orad) | 0, py2 = (ssy + Math.sin(a2) * orad * 0.96) | 0;
              if (px2 < 0 || py2 < 0 || px2 >= W || py2 >= H) continue;
              const i = (py2 * W + px2) * 3; A[i] += 3.2; A[i + 1] += 3.4; A[i + 2] += 4.2;
            }
          }
          const ang = p.phase + t * p.speed * 0.3;
          const pwx = Math.cos(ang) * p.orbit, pwy = Math.sin(ang) * p.orbit * 0.96;
          const psx = (pwx - ox) * Z, psy = (pwy - oy) * Z;
          const pr = Math.max(1.2, p.r * Z);
          const pulse = foc && foc.addr === p.addr ? Math.max(0, 1 - (now - foc.at) / 1400) : 0;
          if (mLo) { const d = Math.hypot(mLo.x - psx, mLo.y - psy); if (d < Math.max(4, pr * 1.8) && d < hovD) { hovD = d; hov = { kind: 'planet', p }; } }
          if (psx < -pr * 6 || psy < -pr * 6 || psx > W + pr * 6 || psy > H + pr * 6) continue;
          if (p.rings) {                                           // ringed giants
            const RR = pr * 2.1, rsteps = Math.max(60, (6.283 * RR) | 0);
            for (let k = 0; k < rsteps; k++) {
              const a2 = (k / rsteps) * 6.283;
              const px2 = (psx + Math.cos(a2) * RR) | 0, py2 = (psy + Math.sin(a2) * RR * 0.34) | 0;
              if (px2 < 0 || py2 < 0 || px2 >= W || py2 >= H) continue;
              const i = (py2 * W + px2) * 3; A[i] += 11; A[i + 1] += 10; A[i + 2] += 8;
            }
          }
          const dlen = Math.max(1, Math.hypot(pwx, pwy));          // light from the star
          const ldx = -pwx / dlen, ldy = -pwy / dlen;
          const pcol = hsl(p.hue, p.sat, 0.5);
          const px0 = Math.max(0, (psx - pr) | 0), px1 = Math.min(W - 1, (psx + pr) | 0);
          const py0 = Math.max(0, (psy - pr) | 0), py1 = Math.min(H - 1, (psy + pr) | 0);
          for (let y = py0; y <= py1; y++) for (let x = px0; x <= px1; x++) {
            const dxp = (x - psx) / pr, dyp = (y - psy) / pr;
            const f = Math.hypot(dxp, dyp); if (f > 1) continue;
            const lit = Math.max(0.07, dxp * ldx + dyp * ldy + 0.35);
            // crisp pixel edge: the lit limb pops, the dark limb stays soft
            const rim = f > 0.86 ? 1 + 0.5 * Math.max(0, lit - 0.3) : 1;
            const gl = (14 + 70 * Math.min(1, lit)) * rim * (1 + pulse * 1.2);
            const i = (y * W + x) * 3;
            A[i] += pcol[0] / 255 * gl; A[i + 1] += pcol[1] / 255 * gl; A[i + 2] += pcol[2] / 255 * gl;
          }
          {                                                        // specular glint on the day side
            const gx2 = (psx + ldx * pr * 0.45) | 0, gy2 = (psy + ldy * pr * 0.45) | 0;
            if (gx2 >= 0 && gy2 >= 0 && gx2 < W && gy2 < H && pr > 2) {
              const i = (gy2 * W + gx2) * 3; A[i] += 55; A[i + 1] += 55; A[i + 2] += 52;
            }
          }
          // MOONS — real data, each a named address (hover one for its sheet)
          for (let j = 0; j < Math.min(p.moonsD.length, 8); j++) {
            const mn = p.moonsD[j];
            const ma = t * mn.speed + mn.phase;
            const mr = (p.r + mn.orbit) * Z;             // world-space orbit — matches the tracker exactly
            const mx = psx + Math.cos(ma) * mr, my = psy + Math.sin(ma) * mr * 0.8;
            const mpulse = foc && foc.addr === mn.addr ? Math.max(0, 1 - (now - foc.at) / 1400) : 0;
            if (mLo && pr > 1.6) { const d = Math.hypot(mLo.x - mx, mLo.y - my); if (d < Math.max(3.5, mn.r * Z * 1.5) && d < hovD) { hovD = d; hov = { kind: 'moon', m: mn, p }; } }
            const mr2 = mn.r * Z;                                  // real size: grows as you zoom
            if (mr2 < 1.4) {                                       // far: a lit dot
              const ix = mx | 0, iy = my | 0;
              if (ix < 0 || iy < 0 || ix >= W || iy >= H) continue;
              const mb = (46 + 30 * mn.r) * (1 + mpulse * 1.5);
              const i = (iy * W + ix) * 3; A[i] += mb; A[i + 1] += mb; A[i + 2] += mb * 0.96;
            } else {                                               // near: a shaded little world
              const mx0 = Math.max(0, (mx - mr2) | 0), mx1 = Math.min(W - 1, (mx + mr2) | 0);
              const my0 = Math.max(0, (my - mr2) | 0), my1 = Math.min(H - 1, (my + mr2) | 0);
              for (let y = my0; y <= my1; y++) for (let x = mx0; x <= mx1; x++) {
                const dxm = (x - mx) / mr2, dym = (y - my) / mr2;
                const f = Math.hypot(dxm, dym); if (f > 1) continue;
                const lit = Math.max(0.1, dxm * ldx + dym * ldy + 0.3);   // same sun lights it
                const crater = 0.8 + 0.4 * rnd((x * 73856093) ^ (y * 19349663), mn.addr);
                const gl = (12 + 55 * Math.min(1, lit)) * crater * (1 + mpulse * 1.5);
                const i = (y * W + x) * 3;
                if (mn.icy) { A[i] += gl * 0.85; A[i + 1] += gl * 0.95; A[i + 2] += gl * 1.1; }
                else { A[i] += gl * 0.95; A[i + 1] += gl * 0.9; A[i + 2] += gl * 0.82; }
              }
            }
          }
        }

        // ── THE BELTS — 0..9 rings of addressed, ore-bearing rocks (mineable later)
        for (let bi = 0; bi < sys.belts.length; bi++) {
          const belt = sys.belts[bi];
          for (const rock of belt.rocks) {
            const a2 = rock.ang0 + t * rock.sp;
            const rx = (Math.cos(a2) * rock.rad - ox) * Z, ry = (Math.sin(a2) * rock.rad * 0.96 - oy) * Z;
            const rpulse = foc && foc.addr === rock.addr ? Math.max(0, 1 - (now - foc.at) / 1400) : 0;
            if (mLo && Z > 0.35) { const d = Math.hypot(mLo.x - rx, mLo.y - ry); if (d < Math.max(3, rock.rsz * Z * 1.6) && d < hovD) { hovD = d; hov = { kind: 'roid', a: rock, s, belt: bi }; } }
            // ore tint: ice runs blue, gold glints warm, the rest stay stone-grey
            const tint: [number, number, number] = rock.res === 'water ice' ? [0.8, 0.92, 1.15]
              : rock.res === 'gold' || rock.res === 'platinum' ? [1.2, 1.05, 0.7] : [1, 0.96, 0.88];
            const pxr = rock.rsz * Z;                              // real size: grows as you zoom
            if (pxr < 1.4) {                                       // far: an ore-tinted mote
              const ix = rx | 0, iy = ry | 0;
              if (ix < 0 || iy < 0 || ix >= W || iy >= H) continue;
              const b = rock.br * (1 + rpulse * 2);
              const i = (iy * W + ix) * 3;
              A[i] += b * tint[0]; A[i + 1] += b * tint[1]; A[i + 2] += b * tint[2];
            } else {                                               // near: a LUMPY lit rock
              const rwx = Math.cos(a2) * rock.rad, rwy = Math.sin(a2) * rock.rad * 0.96;
              const rlen = Math.max(1, Math.hypot(rwx, rwy));
              const rldx = -rwx / rlen, rldy = -rwy / rlen;        // sunward
              const RB = pxr * 1.35;
              const rx0 = Math.max(0, (rx - RB) | 0), rx1 = Math.min(W - 1, (rx + RB) | 0);
              const ry0 = Math.max(0, (ry - RB) | 0), ry1 = Math.min(H - 1, (ry + RB) | 0);
              for (let y = ry0; y <= ry1; y++) for (let x = rx0; x <= rx1; x++) {
                const dxr = x - rx, dyr = y - ry; const dist = Math.hypot(dxr, dyr);
                if (dist < 0.001) continue;
                const angp = Math.atan2(dyr, dxr);
                // the lump: radius wobbles by two harmonics — no two rocks share a shape
                const edge = pxr * (1 + 0.28 * Math.sin(angp * 3 + rock.ph1) + 0.16 * Math.sin(angp * 5 + rock.ph2));
                if (dist > edge) continue;
                const nx2 = dxr / edge, ny2 = dyr / edge;
                const lit = Math.max(0.12, nx2 * rldx + ny2 * rldy + 0.3);
                const grain = 0.75 + 0.5 * rnd((x * 2654435761) ^ (y * 40503), rock.addr);
                const gl = (10 + 46 * Math.min(1, lit)) * grain * (1 + rpulse * 1.6);
                const i = (y * W + x) * 3;
                A[i] += gl * tint[0]; A[i + 1] += gl * tint[1]; A[i + 2] += gl * tint[2];
              }
            }
          }
        }
      }

      // ── WORMHOLE WARP — the streak tunnel over whatever's rendering. Phase in
      // (0-420ms): rays accelerate outward + a central flash builds; at 420ms the
      // layer SWAPS to the exit universe under the flash; phase out (420-900ms):
      // the streaks decay over the new sky. One continuous crossing, no cut.
      {
        const wp = warpRef.current;
        if (wp) {
          const el = now - wp.t0;
          if (el >= 900) warpRef.current = null;
          else {
            if (el >= 420 && !wp.fired) {
              wp.fired = true;
              if (wp.url) { location.href = wp.url; return; }   // ⤓ surface descent: hand off to temple
              enterRef.current({ kind: 'uni', u: uniFromAddr(wp.exit, 0, 0) });
              setInfoRef.current(`⚫ crossed the horizon of ${wp.label}\n  …spat out in universe ${wp.exit}\n  (it always exits here — even wormholes are addresses)`);
              lastHover = -2;
            }
            const cx2 = W / 2, cy2 = H / 2;
            const k1 = el < 420 ? el / 420 : 1 - (el - 420) / 480;   // intensity envelope
            for (let ray = 0; ray < 110; ray++) {
              const a2 = rnd(ray, 71) * 6.283;
              const sp = 0.3 + 0.7 * rnd(ray, 72);
              const prog = ((el / 1000) * (2.2 + sp * 3) + rnd(ray, 73)) % 1;
              const r0 = prog * prog * (Math.max(W, H) * 0.75);
              const len = 6 + prog * 30;
              const ca2 = Math.cos(a2), sa2 = Math.sin(a2);
              for (let q = 0; q < len; q++) {
                const rr2 = r0 + q;
                const px2 = (cx2 + ca2 * rr2) | 0, py2 = (cy2 + sa2 * rr2) | 0;
                if (px2 < 0 || py2 < 0 || px2 >= W || py2 >= H) continue;
                const i = (py2 * W + px2) * 3; const gl = (1 - q / len) * 120 * k1;
                A[i] += gl * 0.75; A[i + 1] += gl * 0.85; A[i + 2] += gl * 1.25;
              }
            }
            const fl = Math.max(0, 1 - Math.abs(el - 420) / 240) * 210;   // the crossing flash
            if (fl > 2) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
              const d = Math.hypot(x - cx2, y - cy2) / (Math.min(W, H) * 0.7);
              const g = Math.max(0, 1 - d) * fl; const i = (y * W + x) * 3;
              A[i] += g * 0.9; A[i + 1] += g * 0.95; A[i + 2] += g;
            }
          }
        }
      }

      // dither → 8-bit
      const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
      const data = img.data;
      for (let p = 0, i = 0, o = 0; p < W * H; p++, i += 3, o += 4) {
        const dth = (BAYER[((p / W | 0) & 3) * 4 + (p % W & 3)] - 7.5) * 2.0;
        data[o] = Math.min(255, Math.max(0, acc[i] + dth)); data[o + 1] = Math.min(255, Math.max(0, acc[i + 1] + dth)); data[o + 2] = Math.min(255, Math.max(0, acc[i + 2] + dth)); data[o + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);

      // hover → HUD. Fact sheets + the FULL ADDRESS PATH (⌖) — hover the same
      // coordinates tomorrow, get the same place. Falls back to the layer's base.
      if (dragRef.current?.moved) hov = null;
      hovRef.current = hov;
      const hoverAddr = hov
        ? (hov.kind === 'uni' ? hov.u.addr : hov.kind === 'sc' ? hov.sc.addr : hov.kind === 'gal' ? hov.g.addr
          : hov.kind === 'core' ? -hov.g.addr : hov.kind === 'planet' ? hov.p.addr + 2000000
          : hov.kind === 'moon' ? hov.m.addr + 4000000 : hov.kind === 'roid' ? hov.a.addr + 6000000 : hov.s.addr)
        : -1;
      if (hoverAddr !== lastHover) {
        lastHover = hoverAddr;
        if (!hov) setInfoRef.current(baseInfoRef.current);
        else if (hov.kind === 'uni') setInfoRef.current(`universe ${hov.u.addr}\n  ${hov.u.desc}\n${hov.u.facts}\n  ⌖ ${hov.u.addr}`);
        else if (hov.kind === 'sc') setInfoRef.current(`${hov.sc.name} · supercluster\n  ${hov.sc.desc}\n${hov.sc.facts}\n  ⌖ ${hov.sc.uaddr} / ${hov.sc.addr}`);
        else if (hov.kind === 'gal') setInfoRef.current(`${hov.g.name} · galaxy of ${hov.g.scname}\n  ${hov.g.desc}\n${hov.g.facts}\n  ⌖ ${hov.g.uaddr} / ${hov.g.scaddr} / ${hov.g.addr}`);
        else if (hov.kind === 'core') setInfoRef.current(`${hov.g.name}'s core\n${galaxyCoreOf(hov.g.gseed).facts}\n  ⌖ ${hov.g.uaddr} / ${hov.g.scaddr} / ${hov.g.addr} / core`);
        else if (hov.kind === 'planet') setInfoRef.current(`${hov.p.name} · world of ${hov.p.sname}\n${hov.p.facts}\n  ⌖ ${hov.p.uaddr} / ${hov.p.scaddr} / ${hov.p.gaddr} / ${hov.p.saddr} / ${hov.p.addr}`);
        else if (hov.kind === 'moon') setInfoRef.current(`${hov.m.name} · moon of ${hov.p.name}\n${hov.m.facts}\n  ⌖ ${hov.p.uaddr} / ${hov.p.scaddr} / ${hov.p.gaddr} / ${hov.p.saddr} / ${hov.p.addr} / ${hov.m.addr}`);
        else if (hov.kind === 'roid') setInfoRef.current(`${hov.a.name} · belt ${hov.belt + 1} rock\n${hov.a.facts}\n  ⌖ ${hov.s.uaddr} / ${hov.s.scaddr} / ${hov.s.gaddr} / ${hov.s.addr} / b${hov.belt + 1} / ${hov.a.addr}`);
        else if (hov.s.bh) setInfoRef.current(`${hov.s.name} · black hole\n${hov.s.facts}\n  ⌖ ${hov.s.uaddr} / ${hov.s.scaddr} / ${hov.s.gaddr} / ${hov.s.addr}`);
        else if (hov.s.rogue) setInfoRef.current(`${hov.s.name} · rogue star · adrift beyond ${hov.s.gname}\n${hov.s.facts}\n  ⌖ ${hov.s.uaddr} / ${hov.s.scaddr} / ${hov.s.gaddr} / ${hov.s.addr}`);
        else setInfoRef.current(`${hov.s.name} · star of ${hov.s.gname}\n${hov.s.facts}\n  ⌖ ${hov.s.uaddr} / ${hov.s.scaddr} / ${hov.s.gaddr} / ${hov.s.addr}`);
      }
    };
    raf = requestAnimationFrame(draw);

    // ── INPUT (Atlas parity): ONE Pointer Events path covers mouse + touch + pen.
    const clampZ = (z: number) => Math.max(ZMIN(), Math.min(ZMAX, z));
    const rel = (e: { clientX: number; clientY: number }) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const screenToWorld = (sxp: number, syp: number) => {
      const z = zoomRef.current.z, cam = camRef.current;
      return { wx: cam.x + (sxp / PX - W / 2) / z, wy: cam.y + (syp / PX - H / 2) / z };
    };
    const zoomAt = (sxp: number, syp: number, nextZ: number) => {
      const w = screenToWorld(sxp, syp);                  // the world point under the gesture
      zoomRef.current.target = clampZ(nextZ);
      zoomRef.current.anchor = { sx: sxp, sy: syp, wx: w.wx, wy: w.wy };
    };

    const onDown = (e: PointerEvent) => {
      cv.setPointerCapture?.(e.pointerId);
      const p = rel(e); touchesRef.current.set(e.pointerId, p);
      if (touchesRef.current.size === 2) {
        const [a, b] = [...touchesRef.current.values()];
        pinchRef.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), z: zoomRef.current.target, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
        dragRef.current = null;
      } else {
        zoomRef.current.anchor = null;                    // a fresh drag owns the camera
        if (trackRef.current) { trackRef.current = null; setExplorableRef.current(null); }   // release body + prompt
        dragRef.current = { mx: p.x, my: p.y, cx: camRef.current.x, cy: camRef.current.y, moved: false };
      }
    };
    const onMove = (e: PointerEvent) => {
      const p = rel(e); mouseRef.current = p;
      if (touchesRef.current.has(e.pointerId)) touchesRef.current.set(e.pointerId, p);
      const pin = pinchRef.current;
      if (pin && touchesRef.current.size >= 2) {
        const [a, b] = [...touchesRef.current.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        zoomAt(mid.x, mid.y, pin.z * (dist / Math.max(1, pin.dist)));
        return;
      }
      const d = dragRef.current;
      if (d) {
        if (!d.moved && Math.hypot(p.x - d.mx, p.y - d.my) < 5) return;
        d.moved = true;
        const z = zoomRef.current.z;
        camRef.current = { x: d.cx - (p.x - d.mx) / PX / z, y: d.cy - (p.y - d.my) / PX / z };
      }
    };
    const onUp = (e: PointerEvent) => {
      cv.releasePointerCapture?.(e.pointerId);
      touchesRef.current.delete(e.pointerId);
      if (touchesRef.current.size < 2) pinchRef.current = null;
      const d = dragRef.current; dragRef.current = null;
      if (d?.moved) { suppressClickRef.current = true; setTimeout(() => { suppressClickRef.current = false; }, 0); }
    };
    // WHEEL — three gestures share this event, mapped like a maps app:
    //  · trackpad PINCH arrives as ctrl+wheel → zoom, anchored at the cursor
    //  · a discrete MOUSE-WHEEL notch (big integer deltaY, no deltaX) → zoom too
    //  · plain two-finger SCROLL → PAN (treating scroll as anchored zoom was the
    //    "zooms sideways while scaling" bug — scroll now moves the field).
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = rel(e);
      if (e.ctrlKey) {
        zoomAt(p.x, p.y, zoomRef.current.target * Math.exp(-e.deltaY * 0.012));
      } else if (Math.abs(e.deltaY) >= 60 && Math.abs(e.deltaX) < 1 && Number.isInteger(e.deltaY)) {
        zoomAt(p.x, p.y, zoomRef.current.target * Math.exp(-e.deltaY * 0.0015));
      } else {
        zoomRef.current.anchor = null;                    // scrolling pans; drop the pin
        if (trackRef.current) { trackRef.current = null; setExplorableRef.current(null); }
        const z = zoomRef.current.z;
        camRef.current = { x: camRef.current.x + e.deltaX / PX / z, y: camRef.current.y + e.deltaY / PX / z };
      }
    };
    const onLeave = () => { mouseRef.current = null; };
    const onKey = (e: KeyboardEvent) => { if ((e.key === 'h' || e.key === 'H') && (document.activeElement as HTMLElement)?.tagName !== 'INPUT') setHudOpen((v) => !v); };

    cv.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp); window.addEventListener('pointercancel', onUp);
    cv.addEventListener('wheel', onWheel, { passive: false });
    cv.addEventListener('pointerleave', onLeave); window.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf);
      cv.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onUp);
      cv.removeEventListener('wheel', onWheel);
      cv.removeEventListener('pointerleave', onLeave); window.removeEventListener('keydown', onKey);
    };
  }, []);

  // DIVE one rung down — Atlas's optical zoom-through: aim the camera at the thing,
  // drive the zoom hard; the draw loop swaps rungs when we cross the threshold.
  const diveInto = (hv: Hover) => {
    if (hv.kind === 'planet' || hv.kind === 'core' || hv.kind === 'moon' || hv.kind === 'roid') return;   // handled by the click switch
    if (hv.kind === 'star' && hv.s.bh) return;                // horizons don't dive — they SWALLOW
    const at = hv.kind === 'uni'
      ? (physRef.current.get(hv.u.addr) ?? { x: hv.u.wx, y: hv.u.wy })
      : hv.kind === 'sc' ? { x: hv.sc.wx, y: hv.sc.wy }
      : hv.kind === 'gal' ? { x: hv.g.wx, y: hv.g.wy } : { x: hv.s.wx, y: hv.s.wy };
    const addr = hv.kind === 'uni' ? hv.u.addr : hv.kind === 'sc' ? hv.sc.addr : hv.kind === 'gal' ? hv.g.addr : hv.s.addr;
    const name = hv.kind === 'uni' ? `universe ${hv.u.addr}` : hv.kind === 'sc' ? hv.sc.name : hv.kind === 'gal' ? hv.g.name : hv.s.name;
    camRef.current = { x: at.x, y: at.y };
    zoomRef.current.target = 9;                           // past the threshold
    diveRef.current = hv;
    focusRef.current = { addr, at: performance.now() };
    setInfo(`→ descending into ${name}…`);
  };
  // ⚫ THE WORMHOLE — cross a horizon, get spat out in another universe. The exit
  // is derived from the hole's address, so the same hole ALWAYS leads to the same
  // place: a deterministic wormhole network, addressable like everything else.
  const wormhole = (exit: number, label: string) => {
    if (warpRef.current) return;                          // one crossing at a time
    warpRef.current = { t0: performance.now(), exit, label, fired: false };
    setInfo(`⚫ crossing the horizon of ${label}…`);
  };
  // ── THE SHAREABLE ADDRESS — the thesis made literal. Rung addresses are
  // DISCOVERED (derived from cells), not invertible, so the link encodes the
  // DERIVATION: universe addr + each rung's (cellX,cellY,index) + body indices.
  // e.g. #u894574.sc12,-3,1.g44,7,0.s-2,9,2.p3.m1 — anyone opening it lands on
  // the exact same moon of the exact same world. Text a friend a coordinate.
  const openPath = (hash: string): boolean => {
    try {
      let u: Uni | null = null, sc: SC | null = null, g: Gal | null = null, s: Star | null = null;
      let pIdx = -1, mIdx = -1, bIdx = -1, rIdx = -1;
      for (const sg of hash.split('.')) {
        if (sg.startsWith('sc')) { const [cx, cy, i] = sg.slice(2).split('_').map(Number); if (u && [cx, cy, i].every(Number.isFinite)) sc = scAt(u.base, u.addr, cx, cy, i, CELL_SC); }
        else if (sg.startsWith('u')) { const a = parseInt(sg.slice(1), 10); if (Number.isFinite(a)) u = uniFromAddr(a, 0, 0); }
        else if (sg.startsWith('g')) {
          const [cx, cy, i] = sg.slice(1).split('_').map(Number);
          // a FIELD GALAXY (i === -1) derives from the UNIVERSE base (no supercluster);
          // a normal galaxy from its supercluster. Both need sc present for the layer.
          if (i === -1 && u && sc && [cx, cy].every(Number.isFinite)) g = fieldGalAt(u.base, u.addr, cx, cy, CELL_SC);
          else if (sc && [cx, cy, i].every(Number.isFinite)) g = galAt(sc.base, sc.uaddr, sc.addr, sc.name, cx, cy, i, CELL_G);
        }
        else if (sg.startsWith('s')) {
          const [cx, cy, i] = sg.slice(1).split('_').map(Number);
          // a ROGUE (i === -1) derives from the SUPERCLUSTER base (it has no galaxy);
          // a normal star derives from its galaxy. Both need g present for the layer.
          if (i === -1 && sc && g && [cx, cy].every(Number.isFinite)) s = rogueStarAt(sc.base, sc.uaddr, sc.addr, sc.addr, sc.name, cx, cy, CELL_G);
          else if (g && [cx, cy, i].every(Number.isFinite)) s = starAt(g.base, g.uaddr, g.scaddr, g.addr, g.name, cx, cy, i, CELL_ST);
        }
        else if (sg.startsWith('p')) pIdx = parseInt(sg.slice(1), 10);
        else if (sg.startsWith('m')) mIdx = parseInt(sg.slice(1), 10);
        else if (sg.startsWith('b')) bIdx = parseInt(sg.slice(1), 10);
        else if (sg.startsWith('r')) rIdx = parseInt(sg.slice(1), 10);
      }
      if (!u) return false;
      enterChild({ kind: 'uni', u });
      if (sc) enterChild({ kind: 'sc', sc });
      if (sc && g) enterChild({ kind: 'gal', g });
      if (sc && g && s && !s.bh) enterChild({ kind: 'star', s });
      if (s && pIdx >= 0) {                               // land tracking the exact body
        const p = planetsFor(s)[pIdx];
        if (p) {
          const m = mIdx >= 0 ? p.moonsD[mIdx] : undefined;
          trackRef.current = m ? { kind: 'moon', m, p } : { kind: 'planet', p };
          focusRef.current = { addr: (m ?? p).addr, at: performance.now() };
          zoomRef.current.target = 2;
        }
      } else if (s && bIdx >= 0 && rIdx >= 0) {
        const rk = beltsFor(s, planetsFor(s))[bIdx]?.rocks[rIdx];
        if (rk) { trackRef.current = { kind: 'roid', a: rk, belt: bIdx }; focusRef.current = { addr: rk.addr, at: performance.now() }; zoomRef.current.target = 2.6; }
      }
      return true;
    } catch { return false; }
  };
  // serialize where you ARE (and what you're tracking) into a link
  const copyLink = () => {
    const l = layerRef.current;
    const parts: string[] = [];
    if (l.kind !== 'multiverse') {
      parts.push(`u${l.u.addr}`);
      if (l.kind === 'super' || l.kind === 'galaxy' || l.kind === 'system') parts.push(`sc${l.sc.cell.join('_')}`);
      if (l.kind === 'galaxy' || l.kind === 'system') parts.push(`g${l.g.cell.join('_')}`);
      if (l.kind === 'system') {
        parts.push(`s${l.s.cell.join('_')}`);
        const trk = trackRef.current;
        if (trk?.kind === 'planet') parts.push(`p${trk.p.idx}`);
        else if (trk?.kind === 'moon') parts.push(`p${trk.p.idx}`, `m${trk.m.idx}`);
        else if (trk?.kind === 'roid') parts.push(`b${trk.belt}`, `r${trk.a.idx}`);
      }
    }
    const hash = parts.join('.');
    const url = `${location.origin}${location.pathname}${hash ? '#' + hash : ''}`;
    history.replaceState(null, '', hash ? `#${hash}` : location.pathname);
    void navigator.clipboard?.writeText(url);
    setInfo(hash
      ? `⌖ link copied\n  …#${hash}\n  same address, same place — for anyone, forever.`
      : `⌖ link copied — the multiverse itself.`);
  };
  // teleport: a bare number = instant arrival inside that universe; a PASTED
  // address path (u….sc….g….s…) = arrival at that exact place. Same canonical
  // constructors as the wanderer path — the "text a friend a coordinate" move.
  const teleport = () => {
    const t0 = tele.trim();
    // `#k` = a LOCAL ordinal at the current rung — and the count on the fact sheet
    // is the LAW: a galaxy of N stars answers #1..#N and refuses #N+1. Same for a
    // system's worlds. "30 million stars" means exactly 30 million addresses.
    if (/^#\d+$/.test(t0)) {                              // (a pasted URL's #u… path falls through below)
      const k = parseInt(t0.slice(1), 10);
      const l = layerRef.current;
      if (l.kind === 'galaxy') {
        const gs = galaxyStars(l.g.gseed);
        if (k < 1 || k > gs.N) {
          setInfo(`⌖ star #${k.toLocaleString('en-US')} does not exist\n  ${l.g.name} holds exactly ${gs.N.toLocaleString('en-US')} stars —\n  every one of them is here. that one isn't.`);
        } else {
          const { cx, cy, i } = starOrdinalCell(k, gs.c);
          const st = starAt(l.g.base, l.g.uaddr, l.g.scaddr, l.g.addr, l.g.name, cx, cy, i, CELL_ST);
          camRef.current = { x: st.wx, y: st.wy };
          zoomRef.current.target = 2;
          focusRef.current = { addr: st.addr, at: performance.now() };
          setInfo(`${st.name} · star #${k.toLocaleString('en-US')} of ${gs.N.toLocaleString('en-US')}\n${st.facts}\n  ⌖ ${st.uaddr} / ${st.scaddr} / ${st.gaddr} / ${st.addr}`);
        }
        setTele(''); return;
      }
      if (l.kind === 'system') {
        if (k < 1 || k > l.s.planets) {
          setInfo(`⌖ world #${k} does not exist\n  ${l.s.name} holds exactly ${l.s.planets} world${l.s.planets === 1 ? '' : 's'}.`);
        } else {
          const p = planetsFor(l.s)[k - 1];
          trackRef.current = { kind: 'planet', p };
          focusRef.current = { addr: p.addr, at: performance.now() };
          zoomRef.current.target = Math.max(zoomRef.current.target, 1.6);
          setInfo(`${p.name} · world #${k} of ${l.s.planets} · tracking\n${p.facts}\n  ⌖ ${p.uaddr} / ${p.scaddr} / ${p.gaddr} / ${p.saddr} / ${p.addr}`);
        }
        setTele(''); return;
      }
      setInfo(`⌖ #ordinals work inside a galaxy (stars) or a system (worlds).`);
      setTele(''); return;
    }
    const raw = t0.replace(/^.*#/, '');                   // accept a full pasted URL too
    if (raw.includes('.') || raw.startsWith('u')) { if (openPath(raw)) { setTele(''); return; } }
    const addr = parseInt(raw, 10);
    if (!Number.isFinite(addr)) return;
    enterChild({ kind: 'uni', u: uniFromAddr(addr, 0, 0) });
    setTele('');
  };
  // deep link: open the app AT a shared address
  const openedRef = useRef(false);
  useEffect(() => {
    if (openedRef.current) return; openedRef.current = true;
    const h = location.hash.slice(1);
    if (h) openPath(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // CLICK == the hovered thing (never a re-search). Everything divable dives;
  // horizons swallow you; a planet (the current floor) pulses — its surface is an
  // entire Atlas world, the ladder's final handoff.
  const onCanvasClick = () => {
    if (suppressClickRef.current) return;
    const hov = hovRef.current;
    if (!hov) return;
    if (hov.kind === 'star' && hov.s.bh) { wormhole(hov.s.bhExit, hov.s.name); return; }
    if (hov.kind === 'star' && layerRef.current.kind === 'system') return;   // already inside it
    if (hov.kind === 'core') { wormhole(galaxyCoreOf(hov.g.gseed).exit, `${hov.g.name}'s core`); return; }
    if (hov.kind === 'planet') {
      const p = hov.p;
      trackRef.current = { kind: 'planet', p };          // camera rides the orbit
      focusRef.current = { addr: p.addr, at: performance.now() };
      // which surface template this body's PHYSICS asks for (the charter may override).
      // GIANTS ARE A THRUSTER GATE, not a wall: descending to the storm shelf needs
      // hover ≥ the giant's storm gravity (a fixed address law, facts.ts giantGravity).
      // Under-equipped, the prompt tells you WHY — locked content you can SEE is the
      // progression hook. Cleared, the storm-shelf template opens (aerial biome).
      const isGiant = p.type.includes('giant');
      const grav = isGiant ? giantGravity(p.addr) : 0;
      const canHover = !isGiant || hoverOf(SHIP) >= grav;
      const nk = p.type === 'lava world' ? 'lava'
        : p.type === 'living world' || p.type === 'ocean world' ? 'verdant'
        : p.type === 'ice world' || p.type === 'tundra world' || p.type === 'rogue world' ? 'ice'   // rogue = frigid terrain
        : isGiant ? (canHover ? 'gas' : null) : 'barren';
      // a giant is NEVER 'settled' (nobody builds on wind) — its hidden aerial life
      // rides the ~d density segment alone; the unsettled path spawns fauna, no city.
      const settledFlag = isGiant ? 0 : (p.hasLife ? 1 : 0);
      // STRAY? a planet of a rogue star, or of a star inside a field galaxy. Isolation
      // is a law the surface reads: its fauna skew rare (compose-time bias). Carried as
      // an optional ~s1 URL segment (older links / normal worlds omit it → not stray).
      const lyr = layerRef.current;
      const isStray = lyr.kind === 'system' && (lyr.s.rogue === true || lyr.g.cell[2] === -1);
      // NOSTAR (~n1): a ROGUE PLANET — sunless. The surface locks to permanent night +
      // renders toward grayscale (rod-cell colour loss). Optional flag, omitted if false.
      setExplorable(nk ? { label: p.name, url: `terra.html#x=${nk}~${p.uaddr}~${p.gaddr}~${p.saddr}~${p.addr}~${settledFlag}~${encodeURIComponent(p.name)}${p.hasLife ? `~d${Math.round(p.density * 100)}` : ''}${isStray ? '~s1' : ''}${p.noStar ? '~n1' : ''}` } : null);
      const landLine = nk
        ? (isGiant ? '  ⤓ descend to the storm shelf — thrusters hold' : '  ⤓ explore lands on its surface — an entire Atlas')
        : isGiant ? `  ⚠ storm gravity ${grav.toFixed(2)} — hover ${hoverOf(SHIP).toFixed(2)} can't hold · upgrade thrusters (⬡ ship)`
        : '  no surface to land on';
      setInfo(`${p.name} · world of ${p.sname} · tracking\n${p.facts}\n${landLine}\n  ⌖ ${p.uaddr} / ${p.scaddr} / ${p.gaddr} / ${p.saddr} / ${p.addr}`);
      return;
    }
    if (hov.kind === 'moon') {
      trackRef.current = { kind: 'moon', m: hov.m, p: hov.p };
      focusRef.current = { addr: hov.m.addr, at: performance.now() };
      const nk = hov.m.icy ? 'ice' : 'barren';
      const ml = smallBodyLife(hov.m.addr);   // extremophile chance — a rare moon clings to life
      setExplorable({ label: hov.m.name, url: `terra.html#x=${nk}~${hov.p.uaddr}~${hov.p.gaddr}~${hov.p.saddr}~${hov.m.addr}~${ml.hasLife ? 1 : 0}~${encodeURIComponent(hov.m.name)}${ml.hasLife ? `~d${Math.round(ml.density * 100)}` : ''}` });
      setInfo(`${hov.m.name} · moon of ${hov.p.name} · tracking\n${hov.m.facts}\n  ⤓ explore lands on it — this moon is an Atlas world too\n  ⌖ ${hov.p.uaddr} / ${hov.p.scaddr} / ${hov.p.gaddr} / ${hov.p.saddr} / ${hov.p.addr} / ${hov.m.addr}`);
      return;
    }
    if (hov.kind === 'roid') {
      trackRef.current = { kind: 'roid', a: hov.a, belt: hov.belt };
      focusRef.current = { addr: hov.a.addr, at: performance.now() };
      const al = smallBodyLife(hov.a.addr);   // a barren rock that's somehow alive — the rare payoff
      setExplorable({ label: hov.a.name, url: `terra.html#x=barren~${hov.s.uaddr}~${hov.s.gaddr}~${hov.s.addr}~${hov.a.addr}~${al.hasLife ? 1 : 0}~${encodeURIComponent(hov.a.name)}${al.hasLife ? `~d${Math.round(al.density * 100)}` : ''}` });
      setInfo(`${hov.a.name} · belt ${hov.belt + 1} rock · tracking\n${hov.a.facts}\n  ⤓ explore lands on it\n  ⌖ ${hov.s.uaddr} / ${hov.s.scaddr} / ${hov.s.gaddr} / ${hov.s.addr} / b${hov.belt + 1} / ${hov.a.addr}`);
      return;
    }
    diveInto(hov);
  };

  return (
    <div className="nother-root">
      <canvas ref={canvasRef} className="nother-canvas" onClick={onCanvasClick} />
      {explorable && (
        // the IN-SCENE landing prompt — the tracked body sits at screen centre,
        // so the prompt floats just beneath it. Click → warp → terra.
        <button className="nother-land" onClick={explore}>⤓ land on {explorable.label}</button>
      )}
      {hudOpen ? (
        <div className="nother-hud">
          <div className="nother-hud-title"><b>notherspace</b><span>H · drag · scroll/pinch to zoom</span></div>
          <div className="nother-hud-trail">
            <b>{trail.head}</b><span className="dim" style={{ color: 'var(--ink-dim)' }}>{trail.rest}</span>
            <button className="nother-copy" onClick={copyLink} title="copy a link to this exact place">⌖ link</button>
            <button className="nother-copy" onClick={() => setShipOpen((v) => !v)} title="your ship — data + upgrades">⬡ ship</button>
            {explorable && (
              <button className="nother-copy nother-explore" title={`land on ${explorable.label}`} onClick={explore}>⤓ explore</button>
            )}
          </div>
          <div className="nother-tele">
            <label>teleport ›</label>
            <input value={tele} onChange={(e) => setTele(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && teleport()} placeholder="a universe, e.g. 4821" />
          </div>
          <div className="nother-hud-div" />
          <div className="nother-hud-info">{info ? info : <span className="dim">{trail.hint}</span>}</div>
        </div>
      ) : (
        <button className="nother-showhud" onClick={() => setHudOpen(true)}>H · show</button>
      )}
      {shipOpen && (
        <ShipPanel ship={SHIP} onClose={() => setShipOpen(false)}
          note="new readings apply to systems you derive from here on — re-visit a misread world to confirm."
          onChange={() => setInfo((s) => s)} />
      )}
    </div>
  );
}
