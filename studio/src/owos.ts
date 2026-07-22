// The scope-tree engine, running in the browser via WASM. Same core a native
// game embeds via the C ABI. The boundary is: construct from a JSON world spec,
// drive with small typed calls (step/reveal/fold/set), read back the whole
// observed world as one JSON `snapshot()` each frame.

import init, { Scope } from './owos/owos_wasm';

let readyPromise: Promise<void> | null = null;

/** Load + instantiate the wasm module exactly once. */
export function ensureReady(): Promise<void> {
  if (!readyPromise) readyPromise = init().then(() => undefined);
  return readyPromise;
}

export type Fidelity = 'detailed' | 'hazed' | 'coarse';

export interface EntityDto {
  id: number;
  kind: string;
  name: string;
  parent: number | null;
  fidelity: Fidelity;
  revealed: boolean;
  active: boolean;
  /** engine-spawned circulation infrastructure (shores, transition spans) — not a navigable sub-scope */
  infra: boolean;
  stats: Record<string, number>;
  facts: string[];
  last_action: string | null;
  children: number[];
}
export interface EdgeDto { from: number; to: number; kind: string; weight: number }
export interface NotableDto { tick: number; message: string }
export interface ClaimDto { subject: number; predicate: string; object: number | null; detail: string }
export interface Snapshot {
  tick: number;
  root: number;
  entities: EntityDto[];
  edges: EdgeDto[];
  log: NotableDto[];
  ledger: ClaimDto[];
}

/** A live world handle. Wraps the wasm `Scope`; the UI holds this in a ref. */
export class World {
  private scope: Scope;
  constructor(specJson: string) {
    this.scope = new Scope(specJson);
  }
  step() { this.scope.step(); }
  steps(n: number) { this.scope.steps(n); }
  reveal(id: number) { this.scope.reveal(id); }
  fold(id: number) { this.scope.fold(id); }
  /** STREAMING: reveal every `kind` scope intersecting a world rect (+ unfold
   *  returning ones). Feed the camera window + lookahead margin. → touched count. */
  revealRect(x0: number, y0: number, x1: number, y1: number, kind: string): number {
    return this.scope.reveal_rect(x0, y0, x1, y1, kind);
  }
  /** STREAMING: fold revealed `kind` scopes fully outside the rect (memory half). */
  foldOutside(x0: number, y0: number, x1: number, y1: number, kind: string): number {
    return this.scope.fold_outside(x0, y0, x1, y1, kind);
  }
  /** THE TILE WORLD: materialize the world tile at grid cell (tx,ty) — the land
   *  beyond the map edge. Global fields make it CONTINUOUS with its neighbours;
   *  its entity layer (districts, names, canon) is its own. Idempotent. */
  ensureTile(tx: number, ty: number): number { return this.scope.ensure_tile(tx, ty); }
  set(id: number, key: string, v: number) { this.scope.set(id, key, v); }
  setIntent(id: number, action: string) { this.scope.set_intent(id, action); }
  clearIntent(id: number) { this.scope.clear_intent(id); }
  record(on: boolean) { this.scope.record(on); }
  root(): number { return this.scope.root(); }
  /** Sample a named continuous field (e.g. "elevation") at a unit-space point. */
  sampleField(name: string, x: number, y: number): number { return this.scope.sample_field(name, x, y); }
  /** BATCH-sample a field over an nx×ny grid in ONE wasm crossing (row-major at
   *  x0+i·dx, y0+j·dy). Use for renderer lattices — per-call sampling pays a
   *  JS→WASM hop per point and is ~100× slower for grids. */
  sampleGrid(name: string, x0: number, y0: number, dx: number, dy: number, nx: number, ny: number): Float32Array {
    return this.scope.sample_field_grid(name, x0, y0, dx, dy, nx, ny);
  }
  /** Trace a river downhill through a field → flat [x0,y0,x1,y1,…] array. */
  river(field: string, steps: number): number[] { return JSON.parse(this.scope.river_json(field, steps)); }
  /** Generic flow/watershed grids over a field (n×n row-major, unit square):
   *  fill = pit-filled surface, pool = basin depth (lakes), down = downstream
   *  cell index (−1 exits), accum = upstream cells draining through. */
  flow(field: string, n: number): { n: number; fill: number[]; pool: number[]; down: number[]; accum: number[] } {
    return JSON.parse(this.scope.flow_json(field, n));
  }
  /** A laid route edge's pathfound curve → flat [x0,y0,…] local coords. [] if straight. */
  routePath(a: number, b: number): number[] { return JSON.parse(this.scope.route_path_json(a, b)); }
  /** A carved parcel's true shape: [cellSize, x0,y0,x1,y1,…] (parent-local). [] if none. */
  region(id: number): number[] { return JSON.parse(this.scope.region_json(id)); }
  /** Which child parcel of `parent` owns local point (x,y)? −1 = none (open ground/water). */
  regionAt(parent: number, x: number, y: number): number { return this.scope.region_at(parent, x, y); }
  snapshot(): Snapshot { return JSON.parse(this.scope.snapshot_json()); }
  /** WINDOWED snapshot — only entities whose TILE intersects the rect cross the
   *  wire. The long-walk memory law: distant countries stay in the engine
   *  (canon intact) but stop costing serialization. */
  snapshotRect(x0: number, y0: number, x1: number, y1: number): Snapshot {
    return JSON.parse(this.scope.snapshot_rect_json(x0, y0, x1, y1));
  }
  dispose() { this.scope.free(); }
}

/** Build a world from a JSON spec (waits for wasm init). Throws on a bad spec. */
export async function createWorld(spec: unknown): Promise<World> {
  await ensureReady();
  return new World(typeof spec === 'string' ? spec : JSON.stringify(spec));
}
