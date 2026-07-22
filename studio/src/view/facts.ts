// ── DETERMINISTIC FACT SHEETS — the addressability proof at the DATA layer.
//
// Every address on the ladder (universe > galaxy > star > … > Atlas's farmer) owns
// a fact sheet derived ONLY from its seed: same address, same numbers, for every
// visitor, forever. This is what makes a stranger go "wait — universe 8946937
// always has THESE stats?" Yes. That's the whole thesis.
//
// Later these become LAWS the layers below actually obey (a universe whose bias
// says volcanic worlds run common really spawns more lava planets — the numbers
// feed the generators, not just the HUD). Keep the derivations here so that
// upgrade changes one file.
//
// Append-only rule (same as lexicon.ts): never reorder/remove entries of a
// shipped table or change a salt — that re-rolls every existing address's facts.

import { h } from './hash';

// ── CHARTER DISTRIBUTIONS — the universe's dials (PLANET_TEMPLATES.md §7).
// The BASE universe (what every visitor sees) uses the defaults below. A charter
// overrides them for YOUR notherverse: 99% of planets bear life, 85% run heavy
// atmospheres, only 5% of systems have belts — whatever your universe's laws
// say. Still deterministic: charter + address → the same world for everyone
// visiting YOUR universe. Set once at boot via setDists().
export interface Dists {
  lifeChance?: number;    // chance a solid world bears life; ABSENT = physics-gated (the base law)
  cloudyChance: number;   // chance a world runs a heavy atmosphere
  beltChance: number;     // chance a system has any belts
}
// THE BASE NOTHERVERSE — not an approximation of the formulas below but the
// literal constants they read. Temple edits THIS object's values; notherspace
// derives every sheet from them. Supercluster to the man: one system.
export const BASE_DISTS: Dists = { cloudyChance: 0.3, beltChance: 0.75 };
let DISTS: Dists = { ...BASE_DISTS };
export function setDists(d: Partial<Dists> | null): void { DISTS = { ...BASE_DISTS, ...(d ?? {}) }; }

// ranged deterministic draw: seed+salt → [lo,hi], fixed decimals
const f = (seed: number, salt: number, lo: number, hi: number, dp = 1): string =>
  (lo + h(seed, salt) * (hi - lo)).toFixed(dp);

// how each universe's physics leans — later this biases the actual generators
const BIAS = [
  'volcanic worlds run common', 'ocean worlds run common', 'gas giants dominate',
  'rocky belts everywhere', 'ice worlds prevail', 'tidally-locked worlds common',
  'binary suns run common', 'rogue planets everywhere', 'ring systems on most worlds',
  'thin atmospheres prevail',
];

// UNIVERSE — slightly different physical constants per address (the "randomized
// laws" seed): gravity tilt, expansion rate, temperature, and a generation bias.
export function universeFacts(seed: number): string {
  const bias = BIAS[Math.floor(h(seed, 610) * BIAS.length)];
  return [
    `age ${f(seed, 601, 8.2, 17.6)} Gyr · bg temp ${f(seed, 602, 1.9, 4.1)} K`,
    `G ×${f(seed, 603, 0.91, 1.09, 2)} · H₀ ${f(seed, 604, 54, 88, 0)} km/s/Mpc`,
    `~${f(seed, 605, 90, 940, 0)}B galaxies · life ${f(seed, 606, 0.1, 42.0)}/M`,
    `bias: ${bias}`,
  ].map((l) => `  ${l}`).join('\n');
}

// SUPERCLUSTER — the rung between a universe and its galaxies: the cosmic web.
export function superFacts(seed: number): string {
  return [
    `~${f(seed, 751, 2, 90, 0)}k galaxies · spans ${f(seed, 752, 60, 520, 0)} Mly`,
    `${f(seed, 753, 0.4, 18.0)}e15 M☉ · ${f(seed, 754, 3, 14, 0)} great walls`,
    `voids: ${f(seed, 755, 1, 9, 0)} · flow ${f(seed, 756, 200, 900, 0)} km/s`,
  ].map((l) => `  ${l}`).join('\n');
}

// GALAXY — the next rung: stars, age, core black hole, habitable-world estimate.
//
// COUNTS ARE CAPACITIES (the law): the star count on the sheet is not flavor —
// it is the EXACT number of addressable stars. The galaxy is a finite disc of
// cells (Chebyshev radius R, a constant c stars per cell), so N = c·(1+4R(R+1))
// exactly, star ordinals 1..N enumerate every star, and ordinal N+1 DOES NOT
// EXIST. Ask for star #k and you get the same star as everyone else; ask past N
// and the galaxy tells you that address isn't in it.
export interface GalaxyStars { c: number; R: number; N: number }
export function galaxyStars(seed: number): GalaxyStars {
  const c = 2 + Math.floor(h(seed, 706) * 3);            // stars per cell (2-4)
  const R = Math.round(Math.pow(10, 3.3 + 2.0 * h(seed, 701)));  // disc radius in cells
  return { c, R, N: c * (1 + 4 * R * (R + 1)) };
}
// ordinal → its cell + slot, closed-form over square spiral rings (random access,
// no iteration over cells): ring m holds 8m cells; cells before it: 1+4(m-1)m.
export function starOrdinalCell(k: number, c: number): { cx: number; cy: number; i: number } {
  const q = Math.floor((k - 1) / c), i = (k - 1) % c;
  if (q === 0) return { cx: 0, cy: 0, i };
  let m = Math.max(1, Math.ceil((Math.sqrt(q + 1) - 1) / 2));
  while (1 + 4 * m * (m + 1) <= q) m++;
  while (1 + 4 * (m - 1) * m > q) m--;
  const t = q - (1 + 4 * (m - 1) * m);                   // position along the ring
  const side = Math.floor(t / (2 * m)), off = t % (2 * m);
  if (side === 0) return { cx: m, cy: -m + off, i };
  if (side === 1) return { cx: m - off, cy: m, i };
  if (side === 2) return { cx: -m, cy: m - off, i };
  return { cx: -m + off, cy: -m, i };
}
export function galaxyFacts(seed: number): string {
  const gs = galaxyStars(seed);
  return [
    `${gs.N.toLocaleString('en-US')} stars · ${f(seed, 702, 1.1, 13.2)} Gyr old`,
    `core hole ${f(seed, 703, 0.3, 41.0)}M M☉`,
    `~${f(seed, 704, 0.1, 9.8)}B habitable worlds`,
  ].map((l) => `  ${l}`).join('\n');
}

// STAR — the rung where facts become LAWS the renderer obeys: the address rolls a
// mass (IMF-skewed: most stars are red dwarfs), mass fixes the class, class fixes
// temperature AND the exact color/size drawn on screen. A star doesn't "look red";
// it IS 2,900 K, and red follows. This is the pattern every layer converges on.
export interface StarLaw { cls: string; tempK: number; hue: number; sat: number; r: number; planets: number; belts: number; life: string; facts: string }
export function starOf(seed: number): StarLaw {
  const mass = 0.08 + Math.pow(h(seed, 801), 3.4) * 22;   // M☉, heavy-tailed like a real IMF
  const cls = mass > 14 ? 'O' : mass > 5 ? 'B' : mass > 1.9 ? 'A' : mass > 1.15 ? 'F' : mass > 0.85 ? 'G' : mass > 0.5 ? 'K' : 'M';
  const T: Record<string, [number, number]> = { M: [2400, 3700], K: [3700, 5200], G: [5200, 6000], F: [6000, 7400], A: [7400, 10000], B: [10000, 30000], O: [30000, 45000] };
  const C: Record<string, [number, number, number]> = {   // hue, sat, base render radius
    M: [8, 0.85, 2.0], K: [25, 0.72, 2.4], G: [45, 0.5, 2.8], F: [50, 0.3, 3.1],
    A: [208, 0.28, 3.6], B: [214, 0.45, 4.3], O: [222, 0.55, 5.2],
  };
  const [tlo, thi] = T[cls]; const tempK = Math.round(tlo + h(seed, 802) * (thi - tlo));
  const [hue, sat, rb] = C[cls];
  const giant = h(seed, 806) > 0.965;                     // the rare swollen ones
  const r = rb * (0.85 + 0.3 * h(seed, 807)) * (giant ? 2.1 : 1);
  // system SHAPE rolls independently and wild — most stars keep 0-8 worlds, some
  // hoard 10-35, the rare monster drags 35-69; belts likewise 0-9. A system can be
  // 9 belts + 2 planets, or 69 planets and no belt at all — the address decides.
  const proll = h(seed, 808);
  const planets = proll > 0.988 ? 35 + Math.floor(h(seed, 809) * 35)
    : proll > 0.9 ? 10 + Math.floor(h(seed, 809) * 25)
    : Math.floor(h(seed, 803) * 9);
  const belts = h(seed, 820) < DISTS.beltChance ? 1 + Math.floor(Math.pow(h(seed, 821), 2.2) * 9) : 0;
  const lifeP: Record<string, number> = { G: 0.2, K: 0.16, F: 0.11, M: 0.09, A: 0.03, B: 0.01, O: 0.005 };
  const lr = h(seed, 804);
  const life = planets === 0 ? 'no worlds' : lr < lifeP[cls] * 0.3 ? 'verdant worlds' : lr < lifeP[cls] ? 'microbial seas' : 'none detected';
  const facts = [
    `class ${cls}${giant ? ' giant' : ''} · ${tempK.toLocaleString('en-US')} K`,
    `${mass.toFixed(2)} M☉ · ${planets} worlds · ${belts} belt${belts === 1 ? '' : 's'}`,
    `life: ${life}`,
  ].map((l) => `  ${l}`).join('\n');
  return { cls, tempK, hue, sat, r, planets, belts, life, facts };
}

// PLANET — the rung where the ladder meets the ground: orbit distance × the star's
// temperature fixes an equilibrium temp, temp fixes the TYPE, and the type fixes
// the color drawn. A star whose sheet says "7 worlds" opens to exactly 7 — the
// system view is the fact sheet made walkable. (Each planet's SURFACE is an Atlas
// world — that handoff is the final rung.)
export interface PlanetLaw {
  type: string; hue: number; sat: number; r: number; orbit: number; tempK: number;
  moons: number; rings: boolean; life: string; facts: string;
  sizeKm: number; grid: number;   // SIZE IS THE LAW: surface = grid×grid regions —
                                  // a big planet is literally more world to explore
  cloudy: boolean;                // heavy atmosphere (charter-tiltable)
}
export function planetOf(seed: number, index: number, star: StarLaw): PlanetLaw {
  const orbit = (index + 1) * (0.55 + 0.5 * h(seed, 901));            // AU-ish
  const tempK = Math.round(star.tempK * 0.048 / Math.sqrt(orbit));    // Earth ≈ 277 K sanity
  const gas = index >= 2 && h(seed, 902) > 0.62;
  const habitable = tempK > 235 && tempK < 330;
  // life: the BASE universe gates it on physics (habitable band + the star's
  // roll); a charter's lifeChance overrides the gate outright — a universe whose
  // constants favor life simply HAS it, even on worlds ours would call hostile.
  const life = DISTS.lifeChance !== undefined
    ? (!gas && h(seed, 905) < DISTS.lifeChance ? (h(seed, 907) < 0.35 ? 'verdant' : 'microbial') : 'none')
    : (!gas && habitable && star.life !== 'none detected' && star.life !== 'no worlds'
      ? (star.life === 'verdant worlds' && h(seed, 905) > 0.4 ? 'verdant' : 'microbial') : 'none');
  const cloudy = !gas && h(seed, 909) < DISTS.cloudyChance;
  const type = gas ? (tempK > 150 ? 'gas giant' : 'ice giant')
    : tempK > 600 ? 'lava world' : tempK > 330 ? 'desert world'
    : habitable ? (life !== 'none' ? 'living world' : 'rocky world')
    : tempK > 150 ? 'tundra world' : 'ice world';
  const LOOK: Record<string, [number, number]> = {                    // hue, sat — type IS the color
    'lava world': [12, 0.85], 'desert world': [35, 0.6], 'rocky world': [28, 0.3],
    'living world': [140, 0.55], 'tundra world': [190, 0.35], 'ice world': [188, 0.2],
    'gas giant': [38, 0.5], 'ice giant': [210, 0.55],
  };
  const [hue, sat] = LOOK[type];
  const r = gas ? 3.6 + 2.2 * h(seed, 903) : 1.5 + 1.3 * h(seed, 903);
  const moons = gas ? 2 + Math.floor(h(seed, 904) * 8) : Math.floor(h(seed, 904) * 3);
  const rings = gas && h(seed, 906) > 0.5;
  // surface extent from the body itself — no fixed "every planet = N minecrafts":
  // radius rolls, and the surface tile-grid follows. Gas giants have no surface.
  const sizeKm = Math.round(gas ? 18000 + h(seed, 908) * 100000 : 1800 + h(seed, 908) * 11000);
  const grid = gas ? 0 : Math.max(4, Math.round(Math.sqrt(sizeKm) / 6));
  const facts = [
    `${type} · ${tempK} K${cloudy ? ' · heavy atmosphere' : ''}`,
    `${orbit.toFixed(1)} AU · ${moons} moon${moons === 1 ? '' : 's'}${rings ? ' · rings' : ''}`,
    gas ? `no surface — ${sizeKm.toLocaleString('en-US')} km of storm` : `surface ${grid}×${grid} regions · ${sizeKm.toLocaleString('en-US')} km`,
    `life: ${life}`,
  ].map((l) => `  ${l}`).join('\n');
  return { type, hue, sat, r, orbit, tempK, moons, rings, life, facts, sizeKm, grid, cloudy };
}

// BLACK HOLE — the wormhole network. Every hole's EXIT is part of its address:
// the same horizon always spits you out in the same universe, for everyone.
export function blackHoleOf(seed: number): { massM: number; exit: number; facts: string } {
  const massM = 3 + h(seed, 811) * 38;
  const exit = 100 + (mixJs(seed ^ 0x7f4a7c15) % 999900);
  return {
    massM, exit,
    facts: [
      `stellar black hole · ${massM.toFixed(1)} M☉`,
      `accretion ${f(seed, 812, 0.8, 9.9)}M K · spin ${f(seed, 813, 0.1, 0.99, 2)}`,
      `exit: unknown — cross it and find out`,
    ].map((l) => `  ${l}`).join('\n'),
  };
}
// same mix as the renderer uses — kept here so exits derive purely from facts-layer math
function mixJs(x: number): number {
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}

// the SUPERMASSIVE core of a galaxy — reuses SALT 703 on the galaxy's own seed, so
// the mass shown at the core is EXACTLY the "core hole" line in the galaxy's fact
// sheet. The sheet promised it; the center delivers it.
export function galaxyCoreOf(gseed: number): { massM: number; exit: number; facts: string } {
  const massM = 0.3 + h(gseed, 703) * (41.0 - 0.3);
  const exit = 100 + (mixJs(gseed ^ 0x7f4a7c15) % 999900);
  return {
    massM, exit,
    facts: [
      `supermassive black hole · ${massM.toFixed(1)}M M☉`,
      `the core the fact sheet promised`,
      `exit: unknown — cross it and find out`,
    ].map((l) => `  ${l}`).join('\n'),
  };
}
