// -- SURFACE TEMPLATES -- the data side of docs/PLANET_TEMPLATES.md, v3.
//
// The schema is organized by ABSTRACTION LEVEL, mirroring how Atlas resolves:
//   I    GEOLOGY      -- the ground itself (formula + sea/cap laws)
//   II   TRANSITIONS  -- where two regions MEET: ocean-to-land is a shore, but
//                       what KIND (sand/pebble/cliff/shard/shelf) and at which
//                       ZOOM BAND it materializes are this planet's laws
//   II.b FLORA        -- what grows, how thick (density law x color skin)
//   III  WEATHER      -- precipitation + cloud cover + what falls
//   IV   CIRCULATION  -- road character as COST-FIELD laws (grid vs grid+45 vs
//                       freeform = a lattice penalty formula; never a road type)
//   V    SOCIETY      -- the presence tier. 'none' GATES the levels above it out
//                       of the spec entirely: a dead planet has no roads to law.
//   VI   BUILDINGS & BEINGS -- construction-plan + body-plan + colors
//
// Base spec = the full Veranholm machinery; a template overlays it.

import atlasSpec from './base-world.json';
import { type Dists } from '../view/facts';

export interface GeologyLaws {
  seaLevel: number;      // below this elevation = the liquid (whatever it is here)
  snowLine: number;      // above this = the cap (snow, ash-frost, crystal rime...)
  glowSea: boolean;      // the liquid emits light (lava, plasma) vs reflects it
}
export type BeachKind = 'sand' | 'pebble' | 'cliff' | 'shard' | 'shelf';
export interface TransitionLaws {
  shoreWidth: number;    // how far inland the liquid's influence reaches (elev units)
  beachKind: BeachKind;  // WHAT the meeting of liquid and land produces here
  foam: number;          // 0..1 -- agitation at the waterline (foam / embers / rime)
  band: 'city' | 'district';   // the zoom band where this detail MATERIALIZES
}
export interface WeatherLaws {
  rain: number;          // 0..1 constant precipitation ("it ALWAYS rains" = 1)
  cloud: number;         // 0..1 cover -- drifting shadow over the land
}
export interface FloraLaws {
  density: number;       // 0..1 ground-cover abundance (follows moisture -- a real law)
}
// VI -- how this world BUILDS and WHO lives in it. `form` selects a body-plan /
// construction-plan the renderer owns a small set of; everything else is data.
// A spider-alien planet with web houses = { building: 'woven', being: 'arachnid' }
// plus two colors -- a preset, not a project.
export interface BuildingLaws {
  form: 'masonry' | 'organic' | 'woven' | 'grown' | 'carved';
  density: number;       // 0..1 how packed the lots build up
}
export interface BeingLaws {
  form: 'biped' | 'beast' | 'swarm' | 'arachnid' | 'amorph';
  size: number;          // 0.5..3 -- pawn scale vs the human reference
  pace: number;          // 0.3..3 -- how fast they move through their day
}
export interface RoadLaws {
  mode: 'free' | 'grid' | 'grid45';   // path angles: freeform, axis-locked, or +45deg
  lattice: number;       // 0..1 -- how HARD paths snap to the virtual lattice
  wander: number;        // 0..8 -- old-winding-road noise the pather negotiates
  terrain: number;       // 0..1 -- how much water/steep/rock still repel the road
  loops: number;         // 0..4 -- redundancy: tree -> organic loops -> mesh
}
export interface SurfaceSkin {
  sea: string; low: string; mid: string; high: string; snow: string;
  shore: string;         // the beach/transition material's color
  flora: string;         // what grows here -- green on Earth, violet two galaxies over
  rain: string;
  district: string; lot: string; road: string;
  building: string;      // what the settlements are MADE of (stone, web-silk, crystal...)
  being: string;         // who walks here (skin/carapace/glow tint for the pawns)
  seaLabel: string; capLabel: string; rainLabel: string; shoreLabel: string;
}
export interface SurfaceTemplate {
  key: string; label: string; blurb: string;
  society: 'none' | 'settled';        // V -- gates IV/VI (and settlement) out of the spec
  fields?: Record<string, string>;    // I overrides (rebuild)
  geology: GeologyLaws;               // I (instant)
  transitions: TransitionLaws;        // II (instant)
  flora: FloraLaws;                   // II.b (instant -- denser detail at deeper bands)
  weather: WeatherLaws;               // III (instant)
  roads: RoadLaws;                    // IV (rebuild -- the engine re-lays the network)
  buildings: BuildingLaws;            // VI (renders at the block band -- society-gated)
  beings: BeingLaws;                  // VI (renders wherever pawns walk -- society-gated)
  skin: SurfaceSkin;                  // looks at every level (instant)
}

export const TEMPLATES: SurfaceTemplate[] = [
  {
    key: 'verdant', label: 'verdant', blurb: 'the earthlike reference -- sand shores, freeform old roads, stone towns',
    society: 'settled',
    geology: { seaLevel: 0.4, snowLine: 0.86, glowSea: false },
    transitions: { shoreWidth: 0.02, beachKind: 'sand', foam: 0.5, band: 'city' },
    flora: { density: 0.6 },
    weather: { rain: 0.25, cloud: 0.35 },
    roads: { mode: 'free', lattice: 0, wander: 2, terrain: 1, loops: 2 },
    buildings: { form: 'masonry', density: 0.7 },
    beings: { form: 'biped', size: 1, pace: 1 },
    skin: {
      sea: '#1b4965', low: '#2e5e3f', mid: '#5d8a52', high: '#9aa08a', snow: '#e8ecf0',
      shore: '#d8c48f', flora: '#356e33', rain: '#9fc2dd', district: '#e8d9a8', lot: '#8a7f6a', road: '#c9b896',
      building: '#b0a188', being: '#d9a066',
      seaLabel: 'ocean', capLabel: 'snow', rainLabel: 'rain', shoreLabel: 'sand beaches',
    },
  },
  {
    key: 'lava', label: 'lava', blurb: 'molten sea behind basalt cliffs -- engineered grid roads, obsidian industry',
    society: 'settled',
    fields: {
      elevation: 'clamp(noise(fx,fy)*0.58 + 0.36 + (noise(fx*9.1+91.3,fy*9.1+91.3)-0.5)*0.24, 0, 1)',
    },
    geology: { seaLevel: 0.36, snowLine: 0.9, glowSea: true },
    transitions: { shoreWidth: 0.008, beachKind: 'cliff', foam: 0.8, band: 'city' },
    flora: { density: 0 },
    weather: { rain: 0, cloud: 0.08 },
    roads: { mode: 'grid', lattice: 0.8, wander: 0, terrain: 0.6, loops: 1 },
    buildings: { form: 'carved', density: 0.5 },
    beings: { form: 'biped', size: 1.1, pace: 0.8 },
    skin: {
      sea: '#e0491f', low: '#3a2a26', mid: '#5c4638', high: '#7d6a58', snow: '#2b2724',
      shore: '#1c1614', flora: '#4a3b30', rain: '#ffb347', district: '#ff9c5a', lot: '#241d1a', road: '#6e5a48',
      building: '#2f2622', being: '#c96f3a',
      seaLabel: 'lava sea', capLabel: 'basalt', rainLabel: 'embers', shoreLabel: 'scarp walls',
    },
  },
  {
    key: 'ice', label: 'ice', blurb: 'pack ice meeting tundra in frozen shelves -- always snowing, roads wander the drifts',
    society: 'settled',
    geology: { seaLevel: 0.44, snowLine: 0.68, glowSea: false },
    transitions: { shoreWidth: 0.035, beachKind: 'shelf', foam: 0.25, band: 'city' },
    flora: { density: 0.12 },
    weather: { rain: 0.85, cloud: 0.7 },
    roads: { mode: 'free', lattice: 0, wander: 5, terrain: 1, loops: 1 },
    buildings: { form: 'masonry', density: 0.4 },
    beings: { form: 'biped', size: 1, pace: 0.9 },
    skin: {
      sea: '#7fa8c9', low: '#a9c2cf', mid: '#c6d8de', high: '#dfe9ec', snow: '#ffffff',
      shore: '#e9f2f4', flora: '#7fa08e', rain: '#eef6ff', district: '#5b7f9e', lot: '#7d97a8', road: '#93aebd',
      building: '#9db4c0', being: '#c8d8e0',
      seaLabel: 'pack ice', capLabel: 'ice cap', rainLabel: 'snow', shoreLabel: 'frozen shelves',
    },
  },
  {
    key: 'crystal', label: 'crystal', blurb: 'shard beaches on a violet brine -- grown avenues locked to 45deg facets',
    society: 'settled',
    fields: {
      elevation: 'clamp(noise(fx,fy)*0.55 + 0.36 + abs(noise(fx*11+91.3,fy*11+91.3)-0.5)*0.34, 0, 1)',
    },
    geology: { seaLevel: 0.42, snowLine: 0.78, glowSea: true },
    transitions: { shoreWidth: 0.025, beachKind: 'shard', foam: 0.6, band: 'district' },
    flora: { density: 0.35 },
    weather: { rain: 0.12, cloud: 0.25 },
    roads: { mode: 'grid45', lattice: 0.7, wander: 0, terrain: 0.8, loops: 2 },
    buildings: { form: 'grown', density: 0.6 },
    beings: { form: 'amorph', size: 0.8, pace: 1.4 },
    skin: {
      sea: '#5e3f8f', low: '#4a4260', mid: '#7a6fa8', high: '#b4a8d6', snow: '#e6ddff',
      shore: '#cfa8ff', flora: '#c77fd9', rain: '#d9b8ff', district: '#d9b8ff', lot: '#3c3355', road: '#8f7fc0',
      building: '#7a5fae', being: '#e0c8ff',
      seaLabel: 'violet brine', capLabel: 'crystal rime', rainLabel: 'shardfall', shoreLabel: 'shard beaches',
    },
  },
  {
    key: 'barren', label: 'barren', blurb: 'no one lives here -- pure geology, pebble strands, weather and silence (level V gates the rest away)',
    society: 'none',
    geology: { seaLevel: 0.38, snowLine: 0.8, glowSea: false },
    transitions: { shoreWidth: 0.02, beachKind: 'pebble', foam: 0.3, band: 'city' },
    flora: { density: 0.06 },
    weather: { rain: 0.1, cloud: 0.3 },
    roads: { mode: 'free', lattice: 0, wander: 0, terrain: 1, loops: 0 },   // present, unused, ungated
    buildings: { form: 'masonry', density: 0 },
    beings: { form: 'biped', size: 1, pace: 1 },
    skin: {
      sea: '#3d4a52', low: '#5a5348', mid: '#7a6f5c', high: '#a29684', snow: '#d8d2c4',
      shore: '#8a8074', flora: '#6b6f52', rain: '#b8c4cc', district: '#000000', lot: '#000000', road: '#000000',
      building: '#000000', being: '#000000',
      seaLabel: 'grey sea', capLabel: 'dust cap', rainLabel: 'drizzle', shoreLabel: 'pebble strands',
    },
  },
];

// road-character COST FORMULA from the knobs -- pure engine DSL, no new prims.
// The lattice term prices being OFF a virtual grid line, so paths snap to the
// grid (or the 45deg facets) exactly as hard as the slider says.
function roadCost(r: RoadLaws): string {
  const parts = [
    '1',
    `${(8 * r.terrain).toFixed(1)}*field(water, fx, fy)`,
    `${(6 * r.terrain).toFixed(1)}*field(steep, fx, fy)`,
    `${(12 * r.terrain).toFixed(1)}*field(rock, fx, fy)`,
  ];
  if (r.wander > 0) parts.push(`${r.wander.toFixed(1)}*noise(fx*3.1, fy*3.1)`);
  if (r.mode !== 'free' && r.lattice > 0) {
    const K = (r.lattice * 14).toFixed(1);
    const dl = (a: string) => `min(mod(${a}*14, 1), 1 - mod(${a}*14, 1))`;
    let off = `min(${dl('fx')}, ${dl('fy')})`;
    if (r.mode === 'grid45') off = `min(${off}, min(${dl('(fx+fy)*0.7071')}, ${dl('(fx-fy)*0.7071')}))`;
    parts.push(`${K}*${off}`);
  }
  return parts.join(' + ');
}

interface SpecShape {
  fields?: Record<string, string>;
  generators?: unknown[];
  routes?: { style?: string; redundancy?: number; cost?: string }[];
  rollups?: unknown[]; broadcasts?: unknown[]; rules?: unknown[]; actions?: unknown[]; events?: unknown[];
}

// compose: template UNDER the full Atlas spec. Level V gates hard: a 'none'
// society planet ships with NO settlement generators and NO routes -- the engine
// never lays what the world's tier says shouldn't exist.
export function composeSpec(t: SurfaceTemplate, seed: number): object {
  const base = atlasSpec as SpecShape;
  const spec: SpecShape & { rng_seed: number } = {
    ...base,
    rng_seed: seed,
    fields: { ...(base.fields ?? {}), ...(t.fields ?? {}) },
  };
  if (t.society === 'none') {
    spec.generators = []; spec.routes = [];
    spec.rules = []; spec.actions = []; spec.events = []; spec.rollups = []; spec.broadcasts = [];
  } else if (base.routes?.length) {
    const routes = JSON.parse(JSON.stringify(base.routes)) as NonNullable<SpecShape['routes']>;
    routes[0] = {
      ...routes[0],
      style: t.roads.loops >= 3 ? 'redundant' : t.roads.loops >= 1 ? 'organic' : 'efficient',
      redundancy: Math.max(1, t.roads.loops + 1),
      cost: roadCost(t.roads),
    };
    spec.routes = routes;
  }
  return spec;
}

// ── THE UNIVERSE CHARTER — "set as my universe" (PLANET_TEMPLATES.md §7, v1).
// The saved template becomes the DEFAULT LAWS of your universe: explored bodies
// mostly land on it, tilted by a three-rung variance chain so the cosmos stays
// alive: some GALAXIES run contrarian (flip the tilt), every SYSTEM re-ratios
// it, and each BODY still rolls — so most worlds are yours, and some are alien.
// Deterministic end to end: charter + address → the same world for everyone.
const mixT = (x: number) => { x = Math.imul(x ^ (x >>> 16), 0x7feb352d); x = Math.imul(x ^ (x >>> 15), 0x846ca68b); return (x ^= x >>> 16) >>> 0; };
const rndT = (s: number, k: number) => (mixT((s | 0) ^ Math.imul(k, 0x9e3779b1)) % 100000) / 100000;

export const CHARTER_KEY = 'nother_charter';
// the whole universe in one object: default surface laws + how hard they apply +
// the DISTRIBUTION dials. `Dists` is imported from the facts layer — the charter
// edits the SAME constants the derivation formulas read. One system, one truth.
export interface Charter { tpl: SurfaceTemplate; strength: number; dists: Dists }
export function saveCharter(tpl: SurfaceTemplate, dists: Dists, strength = 0.85): void {
  localStorage.setItem(CHARTER_KEY, JSON.stringify({ tpl, strength, dists }));
}
export function loadCharter(): Charter | null {
  try { const raw = localStorage.getItem(CHARTER_KEY); return raw ? JSON.parse(raw) as Charter : null; }
  catch { return null; }
}
export function clearCharter(): void { localStorage.removeItem(CHARTER_KEY); }

// ── BODY LAWS — the core the founder asked for: a landed body derives ITS OWN
// world-laws from its address, inside type-shaped ranges. Liquid coverage is a
// stat (a 15%-molten lava world and an 80%-molten one both exist); the ice line
// is a stat (icy = frost starts just off the shore, not only on peaks);
// ELEVATION DIVERSITY is a stat (flatlands vs shattered ranges). Deterministic,
// so the same moon lands the same for everyone — but no two moons land alike.
export interface BodyLaws {
  seaLevel: number; iceLine: number; relief: number; freq: number; liquid: string;
  blend: number;   // TYPE PURITY: 1 = fully its type, lower = shades toward temperate
                   // (a 52%-asteroid world and an 80%-asteroidy asteroid both exist)
  dark: number;    // within-type character: dark rocks ↔ pale / crystal-flecked
  warm: number;    // within-type hue tilt: −1 cool blue-grey … +1 warm rust —
                   // two FULL-purity asteroids still look nothing alike
  // ── FAUNA LAWS (bestiary vocabulary, worlds/bestiary.json) — the body plan of
  // this address's life descends from these. Names + directions match bestiary
  // EXACTLY so one address = one planet across every page. Type-shaped ranges:
  // an ice world is cold (→ fur), a verdant world lush (→ big herds), a thin
  // barren rock breeds flyers. Rolled from the seed → deterministic per address.
  air: number;     // atmosphere thickness — thin (low) breeds flyers
  gravity: number; // caps size, low-slungs the striders
  heat: number;    // PLANET BASELINE temperature — cold (low) grows fur everywhere
  lush: number;    // biomass — sets herd size
}
export function bodyLaws(seed: number, nk: string): BodyLaws {
  const r = (k: number) => rndT(seed, k);
  const cov = nk === 'lava' ? 0.15 + r(61) * 0.65        // 15–80% molten
    : nk === 'ice' ? 0.2 + r(61) * 0.5
    : nk === 'verdant' ? 0.25 + r(61) * 0.45
    : 0.05 + r(61) * 0.35;                               // barren: dry to modest seas
  const seaLevel = 0.3 + cov * 0.45;
  const iceLine = nk === 'ice' ? Math.min(0.95, seaLevel + 0.04 + r(62) * 0.16)  // frozen near the shore
    : nk === 'lava' ? 0.93 + r(62) * 0.05                // ash-frost only at the peaks
    : 0.78 + r(62) * 0.14;
  const relief = 0.5 + r(63) * 1.1;                      // elevation diversity
  const freq = 5 + r(64) * 9;                            // roughness frequency
  // FAUNA LAWS — type-shaped centre + a per-address roll, so an ice world is
  // reliably cold (yet no two ice worlds identical) and a verdant world reliably
  // lush. Each is centre ± spread, clamped to the bestiary's 0..1 law range.
  const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
  const heatCentre = nk === 'lava' ? 0.9 : nk === 'ice' ? 0.12 : nk === 'verdant' ? 0.55 : 0.5;
  const lushCentre = nk === 'verdant' ? 0.85 : nk === 'ice' ? 0.25 : nk === 'lava' ? 0.15 : 0.4;
  const airCentre  = nk === 'verdant' ? 0.7 : nk === 'barren' ? 0.4 : 0.55; // barren = thinner → more flyers
  const heat    = clamp01(heatCentre + (r(70) - 0.5) * 0.3);
  const lush    = clamp01(lushCentre + (r(71) - 0.5) * 0.3);
  const air     = clamp01(airCentre + (r(72) - 0.5) * 0.5);   // wide spread — aviary vs grounded is the variance
  const gravity = clamp01(0.2 + r(73) * 0.7);                 // 0.2–0.9, uncorrelated to type
  return {
    seaLevel, iceLine, relief, freq, liquid: nk === 'lava' ? 'lava' : 'water',
    blend: 0.55 + r(65) * 0.45,                          // 55–100% its type
    dark: r(67), warm: (r(68) - 0.5) * 2,
    air, gravity, heat, lush,
  };
}
// compose the body's OWN spec: its laws rewrite the field chain (elevation
// amplitude/centre from relief, water from ITS sea level, snow from ITS ice
// line) and `settled` comes from the body's LIFE fact — an unexplored icy moon
// gets NO districts, NO roads, NO bridges, because nobody is there to build them.
export function composeSpecFor(t: SurfaceTemplate, seed: number, laws: BodyLaws, settled: boolean, density = 1): object {
  const A = (0.62 * laws.relief).toFixed(3);
  const B = (0.65 - 0.31 * laws.relief).toFixed(3);      // keep the mean; scale the spread
  const D = (0.16 * laws.relief).toFixed(3);
  const F = laws.freq.toFixed(1);
  const t2: SurfaceTemplate = {
    ...t,
    society: 'settled',                                  // gating handled below, not by stripping
    fields: {
      ...(t.fields ?? {}),
      elevation: `clamp(noise(fx,fy)*${A} + ${B} + (noise(fx*${F}+91.3,fy*${F}+91.3)-0.5)*${D}, 0, 1)`,
      water: `lt(field(elevation,fx,fy), ${laws.seaLevel.toFixed(2)})`,
      land_elev: `max(field(elevation,fx,fy), ${laws.seaLevel.toFixed(2)})`,
      snow: `and(field(land,fx,fy), gt(field(elevation,fx,fy), ${laws.iceLine.toFixed(2)}))`,
    },
  };
  const spec = composeSpec(t2, seed) as SpecShape & { rng_seed: number; templates?: unknown;
    seed?: { kind?: string; stats?: Record<string, number> }[] };

  // ── FAUNA LAWS PER ADDRESS — overwrite the base world's fallback constants on
  // the seeded city with THIS body's rolled laws (bodyLaws), so the fauna genome
  // (which reads parent.air/heat/gravity/lush) describes THIS planet. Same names
  // as worlds/bestiary.json → one address is one planet across every page. If the
  // base spec's top seed isn't the city, this is a no-op (safe).
  if (Array.isArray(spec.seed) && spec.seed.length) {
    const top = spec.seed.find((s) => s.kind === 'city') ?? spec.seed[0];
    // life_density (engine-only MAGNITUDE from the orbital fact sheet) scales the
    // fauna count on the surface: a sparse hidden-life world spawns a handful of
    // critters across many districts (finding one is the game), a teeming world
    // swarms. Base Veranholm keeps 1 (its own fallback). 0 → no fauna at all.
    top.stats = { ...(top.stats ?? {}), air: laws.air, gravity: laws.gravity, heat: laws.heat, lush: laws.lush, life_density: density };
  }

  if (!settled) {
    // NATURAL REGIONS — an uninhabited world still CARVES (you can dive region →
    // expanse at the same depth as any districted world), but the carve is keyed
    // on LAND, not buildability, and NOTHING is built there: no buildings, no
    // routes, no behaviors. Weather RULES stay — rain is physics, not people.
    const swap = (o: unknown) => JSON.parse(JSON.stringify(o).split('field(buildable, fx, fy)').join('field(land, fx, fy)').split('buildable').join('land'));
    const gens = (spec.generators ?? []) as unknown[];
    spec.generators = gens.slice(0, 2).map(swap);        // region + expanse carves only
    if (spec.templates) spec.templates = swap(spec.templates);
    spec.routes = [];                                    // nobody laid roads
    spec.actions = []; spec.events = [];                 // no one to act
  }
  return spec;
}

// resolve which template an explored body ACTUALLY gets
export function templeFor(
  path: { u: number; g: number; s: number; b: number },   // addresses down the ladder
  naturalKey: string,                                     // what the body's physics say it is
): { tpl: SurfaceTemplate; note: string } {
  const natural = TEMPLATES.find((t) => t.key === naturalKey) ?? TEMPLATES[TEMPLATES.length - 1];
  const ch = loadCharter();
  if (!ch) return { tpl: natural, note: 'natural laws (no charter set)' };
  let strength = Math.max(0, Math.min(1, ch.strength));
  let note = 'your universe’s laws';
  if (rndT(mixT(path.u ^ Math.imul(path.g, 0x9e3779b1)), 41) < 0.07) {
    strength = 1 - strength;                              // a contrarian galaxy
    note = 'a contrarian galaxy — the charter runs inverted here';
  }
  strength *= 0.7 + 0.6 * rndT(mixT(path.g ^ Math.imul(path.s, 0x85ebca6b)), 42);   // system re-ratio
  if (rndT(mixT(path.s ^ Math.imul(path.b, 0xc2b2ae35)), 43) < strength) {
    return { tpl: JSON.parse(JSON.stringify(ch.tpl)) as SurfaceTemplate, note };
  }
  return { tpl: natural, note: 'an alien pocket — this one kept its own laws' };
}
