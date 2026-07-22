// The world-spec model the studio edits. This IS the thing a dev builds — the
// full data vocabulary of the engine, as an editable object. Everything here
// round-trips 1:1 with the JSON owos-author loads.

export type Eff = { op: string; stat?: string; expr?: string };
export type Rule = { on: string; set: string; expr: string };
export type Act = { on: string; name: string; score: string; effects: Eff[] };
export type Evt = { on: string; when: string; label: string; do: Eff[] };
export type Gen = { on: string; spawn: string; count: string; child_stats: Record<string, string> };
export type Roll = { parent: string; child_stat: string; parent_stat: string; reduce: string };
export type Bcast = { parent_stat: string; child_stat: string; gain: number };
export type Seed = { kind: string; name: string; stats: Record<string, number>; count?: number; reveal: boolean; park_children: boolean };

export interface Spec {
  name: string;
  rng_seed: number;
  seed: Seed[];
  rules: Rule[];
  coarse_rules: Rule[];
  actions: Act[];
  events: Evt[];
  generators: Gen[];
  rollups: Roll[];
  broadcasts: Bcast[];
}

export const EFFECT_OPS = ['set', 'add', 'affect', 'affect_set', 'link', 'unlink', 'move', 'spawn', 'despawn'];
export const REDUCERS = ['mean', 'sum', 'max', 'min', 'frac_above'];

/** A fresh, minimal but ALIVE world — cells that grow and divide. Shows the
 * whole authoring loop the instant you press play, and is a readable template. */
export function blankSpec(): Spec {
  return {
    name: 'New universe',
    rng_seed: 1,
    seed: [{ kind: 'cell', name: 'seed cell', stats: { energy: 0.6, size: 0.2 }, reveal: false, park_children: false }],
    rules: [
      { on: 'cell', set: 'energy', expr: 'clamp(energy + 0.03 - 0.04*size, 0, 1)' },
      { on: 'cell', set: 'size', expr: 'clamp(size + 0.03*energy, 0, 1)' },
    ],
    coarse_rules: [],
    actions: [
      { on: 'cell', name: 'divide', score: 'gt(size,0.8)*energy', effects: [
        { op: 'spawn', stat: 'cell', expr: 'cell' },
        { op: 'set', stat: 'size', expr: '0.2' },
        { op: 'add', stat: 'energy', expr: '-0.4' },
      ] },
    ],
    events: [
      { on: 'cell', when: 'lt(energy,0.05)', label: 'a cell starves', do: [{ op: 'despawn' }] },
    ],
    generators: [],
    rollups: [],
    broadcasts: [],
  };
}

/** Normalize an imported/parsed object into a full Spec (fills missing arrays). */
export function normalizeSpec(o: any): Spec {
  return {
    name: o?.name ?? 'Imported world',
    rng_seed: typeof o?.rng_seed === 'number' ? o.rng_seed : 1,
    seed: Array.isArray(o?.seed) ? o.seed.map(normSeed) : [],
    rules: arr(o?.rules),
    coarse_rules: arr(o?.coarse_rules),
    actions: Array.isArray(o?.actions) ? o.actions.map((a: any) => ({ on: a.on ?? '', name: a.name ?? '', score: a.score ?? '', effects: arr(a.effects) })) : [],
    events: Array.isArray(o?.events) ? o.events.map((e: any) => ({ on: e.on ?? '', when: e.when ?? '', label: e.label ?? '', do: arr(e.do) })) : [],
    generators: Array.isArray(o?.generators) ? o.generators.map((g: any) => ({ on: g.on ?? '', spawn: g.spawn ?? '', count: g.count ?? '1', child_stats: g.child_stats ?? {} })) : [],
    rollups: arr(o?.rollups),
    broadcasts: arr(o?.broadcasts),
  };
}
function arr(x: any) { return Array.isArray(x) ? x : []; }
function normSeed(s: any): Seed {
  return { kind: s.kind ?? '', name: s.name ?? '', stats: s.stats ?? {}, count: s.count, reveal: !!s.reveal, park_children: !!s.park_children };
}

/** The spec as the exact JSON owos-author consumes (drops empty optional arrays). */
export function toJson(spec: Spec): string {
  const out: any = { name: spec.name, rng_seed: spec.rng_seed, seed: spec.seed };
  for (const k of ['rules', 'coarse_rules', 'actions', 'events', 'generators', 'rollups', 'broadcasts'] as const) {
    if (spec[k].length) out[k] = spec[k];
  }
  return JSON.stringify(out, null, 2);
}
