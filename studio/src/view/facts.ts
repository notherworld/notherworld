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
const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
// SCANNER FIDELITY — how truthful the player's life detector is. 1 = never lies;
// below it, the orbital life readout FLIPS (false "signs detected" / false "likely
// impossible") with probability (1 - fidelity), per address, deterministically.
// This is EQUIPMENT quality, not a world law — the planet's ground truth never
// changes; a better scanner just distorts less. Fixed base rate for now (~1.5%
// lies); the future upgrade layer will thread a per-player fidelity into planetOf
// and a scanner upgrade raises this number. Kept as one named dial for that swap.
//
// ⚠ LOAD-BEARING INVARIANT — the malfunction MUST stay a threshold on ONE fixed
// roll: `h(seed, 918) > fidelity`. The lying set is { world : h(world,918) > fid },
// so raising fidelity only RAISES THE BAR — it strictly SHRINKS the set, never
// reshuffles it. This makes upgrades MONOTONIC: a misread world stays consistently
// misread until your instrument clears its threshold, then snaps true and STAYS
// true — the "come back with a better scanner and re-confirm" promise. NEVER change
// this to re-roll per fidelity tier (e.g. h(seed, 918+tier) or reseeding): that
// would MINT NEW LIES on upgrade — a world you'd verified could start lying again —
// and break the re-check guarantee. When the upgrade layer lands, GUARD it:
// lies(better) ⊆ lies(worse), plus the ~1.5% base rate in BOTH directions.
const SCANNER_FIDELITY = 0.985;

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
  // ── THREE-QUANTITY LIFE MODEL (see planetOf). `life` + `type` are ORBIT-VISIBLE
  // (key on detection, safe to render). hasLife/density are ENGINE-ONLY GROUND
  // TRUTH — the surface reads them to spawn fauna. NEVER put them on a HUD: the
  // camouflage depends on a sparse-life world being indistinguishable from a dead
  // one from orbit, to the player AND to us.
  hasLife: boolean;               // is there ANY life to find on the surface
  density: number;                // 0..1 HOW MUCH — scales the fauna count; below the
                                  // detection threshold it hides from the orbital scan
  lifeRich: boolean;              // verdant (dense) vs microbial — magnitude-driven
  sizeKm: number; grid: number;   // SIZE IS THE LAW: surface = grid×grid regions —
                                  // a big planet is literally more world to explore
  cloudy: boolean;                // heavy atmosphere (charter-tiltable)
}
export function planetOf(seed: number, index: number, star: StarLaw): PlanetLaw {
  const orbit = (index + 1) * (0.55 + 0.5 * h(seed, 901));            // AU-ish
  const tempK = Math.round(star.tempK * 0.048 / Math.sqrt(orbit));    // Earth ≈ 277 K sanity
  const gas = index >= 2 && h(seed, 902) > 0.62;
  const habitable = tempK > 235 && tempK < 330;
  // ── GRADED LIFE SIGNS — the planet-scale readout is a DETECTOR, not a verdict.
  // A habitability SCORE (0..1) from temperature comfort × the star's own life
  // odds bands the readout into five signals; the ACTUAL presence of life is then
  // rolled with a probability tied to that band — high where detected, but NEVER
  // zero: even a "likely impossible" world hides an extremophile ~3% of the time
  // (the 500°C survivor), and a "signs detected" world is occasionally a false
  // positive. Decoupling the signal from the truth is what makes exploring worth
  // it — you only KNOW by landing. Odds are bumped up over the old tight gate so
  // the sky isn't mostly dead rock. A charter's lifeChance still tilts the whole
  // curve (a life-friendly universe reads greener everywhere).
  const starBonus = star.life === 'verdant worlds' ? 0.35 : star.life === 'microbial seas' ? 0.18 : 0;
  // temperature comfort: 1 at the ~285 K sweet spot, tapering to 0 by the extremes.
  // The 290 K span is WIDE on purpose — real star fields skew cold (most stars are
  // M-dwarfs), so a narrow comfort band buried ~⅓ of worlds in "impossible" and the
  // sky read mostly dead. A wider span + a higher floor (0.20) puts most cold-ish
  // worlds in "unlikely" (life still clings) rather than hopeless, landing ~76% of
  // rocky worlds alive without cheapening the genuine hellscapes.
  const tComfort = clamp01(1 - Math.abs(tempK - 285) / 290);
  const charterTilt = DISTS.lifeChance !== undefined ? (DISTS.lifeChance - 0.15) : 0;  // 0 at baseline
  const score = gas ? 0 : clamp01(0.20 + 0.7 * tComfort + starBonus + charterTilt + (h(seed, 905) - 0.5) * 0.35);
  // ── THREE-QUANTITY LIFE MODEL — latent state vs observable state, done right.
  // (1) CONDITIONS: the player-visible band (favorable→impossible), from habitability
  //     ALONE — never from ground truth. This is all the orbital scan honestly knows.
  // (2) hasLife: ENGINE-ONLY ground truth. Every band can bear life (extremophiles);
  //     odds are bumped so ~3/4 of rocky worlds are alive.
  // (3) density: ENGINE-ONLY magnitude (0..1) — HOW MUCH life. Favorable worlds skew
  //     dense; an impossible-band survivor is BY DEFINITION sparse (a 500°C creature
  //     is never a teeming world). Density is the axis that turns the binary into a
  //     spectrum, and it drives the fauna count on the surface.
  // THE CAMOUFLAGE (the whole system): the scan reads "signs detected" ONLY when
  // hasLife AND density clears a detection threshold. Below it, the world reads by
  // its CONDITIONS band alone — so a sparse-life world and a truly-empty world are
  // INDISTINGUISHABLE from orbit, by construction. The overlap zone is genuinely
  // uninformative — to the player AND to us. hasLife/density never touch a HUD.
  const conditions = gas ? 'impossible'
    : score > 0.62 ? 'favorable'
    : score > 0.45 ? 'possible'
    : score > 0.14 ? 'unlikely'
    : 'impossible';
  // PRESENCE ODDS PER BAND — decoupled from conditions in BOTH directions, so no
  // reading is ever a certainty. A "favorable" world is empty ~18% of the time (the
  // dead teaser: great conditions, nothing took hold — landing is a real bet, not a
  // formality), and an "unlikely" world clings to life ~35% of the time (the hidden
  // clinger). The spread still GUIDES (favorable ~8× the odds of unlikely, so you
  // can prioritize and skip efficiently) — it just never GUARANTEES. That symmetry
  // is the point: the scan saves you time statistically without ever letting you —
  // or us — write a world off as dead from orbit.
  const presenceP: Record<string, number> = { favorable: 0.82, possible: 0.62, unlikely: 0.35, impossible: 0.1 };
  const hasLife = !gas && h(seed, 906) < presenceP[conditions];
  // magnitude: centred per band with a WIDE spread, positioned so the detection
  // threshold (0.45) cuts THROUGH the has-life distribution in every band — that's
  // what makes the camouflage real: favorable life is usually (not always) dense
  // enough to detect, possible life is a coin-flip, unlikely life mostly hides, and
  // the impossible-band extremophile is ALWAYS below threshold (a 500°C survivor is
  // never a teeming world — capped hard). So a "none detected" of ANY band can be
  // secretly alive, and you only learn which by landing.
  const densCentre: Record<string, number> = { favorable: 0.62, possible: 0.44, unlikely: 0.30, impossible: 0.15 };
  const densCap: Record<string, number> = { favorable: 1, possible: 0.85, unlikely: 0.62, impossible: 0.42 };
  const density = hasLife
    ? Math.min(densCap[conditions], clamp01(densCentre[conditions] + (h(seed, 907) - 0.5) * 0.55))
    : 0;
  const DETECT = 0.45;                          // orbital detection threshold
  const lifeRich = hasLife && density > 0.6;    // verdant vs microbial, magnitude-driven
  const detected = hasLife && density > DETECT; // GROUND-TRUTH detectability (honest)
  // ── SCANNER MALFUNCTION — the instrument itself lies, rarely, with confidence.
  // Everything above is the honest camouflage (incomplete but never false). This is
  // categorically different: it corrupts the ONE reliable signal. `reported` is what
  // the scanner CLAIMS — normally `detected`, but with prob (1 - SCANNER_FIDELITY)
  // it FLIPS: a confident "signs detected" over a dead world, or a flat "likely
  // impossible" over a teeming one. Own salt (918) → deterministic per address, so
  // the same world lies the same way until you re-scan with a better instrument.
  // FIDELITY IS EQUIPMENT, NOT WORLD: the world's truth (hasLife/density) is fixed
  // forever; fidelity is the player's scanner quality. Today it's a fixed base rate;
  // when the upgrade layer lands, planetOf takes a fidelity arg and a better scanner
  // simply passes a higher number — fewer lies, same worlds. One-line swap, no rework.
  const malfunction = h(seed, 918) > SCANNER_FIDELITY;
  const reported = malfunction ? !detected : detected;
  // the readout STRING (player-facing) reflects what the scanner REPORTS. "signs
  // detected" only when reported; else the CONDITIONS band verbatim. Honest readings
  // are incomplete but never false; the rare malfunction is the exception that makes
  // even a confirmed detection less than certain. A dense living world and a sparse
  // hidden one look nothing alike; a sparse living world and a dead favorable one
  // look IDENTICAL; and once in a while the scanner is just plain wrong.
  const life = reported ? 'signs detected'
    : conditions === 'favorable' ? 'none detected · favorable'
    : conditions === 'possible' ? 'none detected · possible'
    : conditions === 'unlikely' ? 'none detected · unlikely'
    : 'likely impossible';
  const cloudy = !gas && h(seed, 909) < DISTS.cloudyChance;
  // TYPE (drives the label AND the color drawn) is ORBIT-VISIBLE, so it keys on
  // `reported` — what the scanner CLAIMS — never `hasLife` or even `detected`. This
  // keeps the label and the color consistent with the readout the player sees: a
  // malfunctioning false-positive world reads "living" AND renders green (the lie is
  // seamless, discovered only on landing), and a false-negative living world hides
  // as a plain rock. Any divergence here would leak the truth from orbit.
  const type = gas ? (tempK > 150 ? 'gas giant' : 'ice giant')
    : tempK > 600 ? 'lava world' : tempK > 330 ? 'desert world'
    : habitable ? (reported ? 'living world' : 'rocky world')
    : tempK > 150 ? 'tundra world' : 'ice world';
  const LOOK: Record<string, [number, number]> = {                    // hue, sat — type IS the color
    'lava world': [12, 0.85], 'desert world': [35, 0.6], 'rocky world': [28, 0.3],
    'living world': [140, 0.55], 'tundra world': [190, 0.35], 'ice world': [188, 0.2],
    'gas giant': [38, 0.5], 'ice giant': [210, 0.55],
  };
  const [hue, sat] = LOOK[type];
  const r = gas ? 3.6 + 2.2 * h(seed, 903) : 1.5 + 1.3 * h(seed, 903);
  const moons = gas ? 2 + Math.floor(h(seed, 904) * 8) : Math.floor(h(seed, 904) * 3);
  const rings = gas && h(seed, 913) > 0.5;   // salt 913: 906 now rolls hasLife
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
  return { type, hue, sat, r, orbit, tempK, moons, rings, life, hasLife, density, lifeRich, facts, sizeKm, grid, cloudy };
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
