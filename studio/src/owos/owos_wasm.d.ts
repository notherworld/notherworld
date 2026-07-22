/* tslint:disable */
/* eslint-disable */

/**
 * An opaque handle to a live scope-tree world. JS holds this plus bare entity
 * ids (numbers) and re-resolves them each call — no Rust references cross over.
 */
export class Scope {
    free(): void;
    [Symbol.dispose](): void;
    clear_intent(id: number): void;
    /**
     * Compact the event log (fold-for-facts — docs/LEDGER.md): entries older
     * than `before_tick` collapse into exact per-label count summaries; each
     * label's first-ever moment and anything matching a comma-separated `keep`
     * pattern survive verbatim. Long-session hosts call this when the log
     * crosses their budget. Returns entries removed. Never touches sim state.
     */
    compact_log(before_tick: bigint, keep_csv: string): number;
    /**
     * THE TILE WORLD: materialize the world tile at grid cell (tx, ty) — a fresh
     * copy of the spec's primary seed whose patch is [tx..tx+1, ty..ty+1]. The
     * global fields make adjacent tiles CONTINUOUS land; only the entity layer is
     * per-tile. Idempotent. Returns the tile's entity id.
     */
    ensure_tile(tx: number, ty: number): number;
    /**
     * The generic flow/watershed grids for a field, as one JSON object:
     * `{n, fill:[…], pool:[…], down:[…], accum:[…]}`, all n×n row-major over the
     * unit square. `pool > 0` = a filled basin (lake); `accum` = upstream cells
     * draining through (a renderer reads high accum as a river, and follows
     * `down` to animate flow). Domain-agnostic: works on ANY field.
     */
    flow_json(field: string, n: number): string;
    /**
     * Zoom OUT: fold `id` back to a coarse aggregate.
     */
    fold(id: number): void;
    /**
     * STREAMING: fold every revealed `kind` scope fully OUTSIDE the rect back to
     * a coarse aggregate — the memory half (canon stays written; simulation there
     * goes cheap). Call with the camera window + margin as the player moves on.
     */
    fold_outside(x0: number, y0: number, x1: number, y1: number, kind: string): number;
    /**
     * Build a world from a self-bootstrapping JSON spec (see owos-author).
     */
    constructor(spec_json: string);
    /**
     * Turn the built-in recorder (content oracle) on/off.
     */
    record(on: boolean): void;
    /**
     * Which child parcel of `parent` owns the local point (x,y)? −1 = none.
     * Topological collision as an engine query.
     */
    region_at(parent: number, x: number, y: number): number;
    /**
     * A carved parcel's TRUE shape: `[cellSize, x0,y0, x1,y1, …]` (owned cell
     * centres, parent-local 0..1). Empty array if the entity has no carved region.
     * Renderers draw THIS, not the bbox — a coastal parcel's bbox lies about it.
     */
    region_json(id: number): string;
    /**
     * Zoom IN: reveal `id` (materialize + write canon) and band its fresh
     * children as Coarse "ideas" to zoom next — the feathered dive.
     */
    reveal(id: number): void;
    /**
     * STREAMING (rect API — the camera speaks world rects, not ids): reveal every
     * `kind` scope intersecting the rect — first visits write canon, returning
     * folded scopes unfold — and park each one's fresh children Coarse (same
     * feathered-dive semantics as `reveal`). Feed it the camera window + a
     * lookahead margin and the data arrives before the player does. Returns how
     * many scopes were touched.
     */
    reveal_rect(x0: number, y0: number, x1: number, y1: number, kind: string): number;
    /**
     * Trace a river downhill through a field, as a flat [x0,y0,x1,y1,…] point array.
     */
    river_json(field: string, steps: number): string;
    root(): number;
    /**
     * The pathfound curve of a laid route edge, flat [x0,y0,x1,y1,…] in the
     * routing scope's local coords. Empty if the edge was laid straight.
     */
    route_path_json(a: number, b: number): string;
    /**
     * Sample a named continuous field (e.g. "elevation") at a unit-space point.
     * The terrain the layered world is built on — the renderer shades the map with it.
     */
    sample_field(name: string, x: number, y: number): number;
    /**
     * BATCH field sampling — one WASM crossing for a whole grid. Per-call
     * `sample_field` pays a JS→WASM hop + field-name string encode PER SAMPLE;
     * a renderer lattice is 50k+ samples, so the postage dwarfed the letters
     * (this was the "slow as dirt" bake). Samples row-major at
     * (x0 + i*dx, y0 + j*dy) for nx×ny points, looped natively. Returns the
     * values as one Float32Array.
     */
    sample_field_grid(name: string, x0: number, y0: number, dx: number, dy: number, nx: number, ny: number): Float32Array;
    /**
     * Poke a stat (god-mode / player input at any scale).
     */
    set(id: number, key: string, v: number): void;
    /**
     * Force an entity's next action (player intent override).
     */
    set_intent(id: number, action: string): void;
    /**
     * The whole observed world as JSON — the one call the UI polls each frame.
     */
    snapshot_json(): string;
    /**
     * WINDOWED snapshot — the TILE WORLD's memory law for the HOST side. The full
     * snapshot grows with every tile ever visited (serialize + parse cost grows
     * forever → the long-walk freeze). This variant ships ONLY entities whose
     * TILE (root-child ancestor) intersects the rect — the camera window + a
     * margin. Distant countries stay materialized in the ENGINE (canon intact,
     * folded dormant) but stop crossing the wire. Edges ship when both ends do.
     */
    snapshot_rect_json(x0: number, y0: number, x1: number, y1: number): string;
    /**
     * Advance one tick.
     */
    step(): void;
    /**
     * Advance `n` ticks.
     */
    steps(n: number): void;
    tick(): bigint;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_scope_free: (a: number, b: number) => void;
    readonly scope_clear_intent: (a: number, b: number) => void;
    readonly scope_compact_log: (a: number, b: bigint, c: number, d: number) => number;
    readonly scope_ensure_tile: (a: number, b: number, c: number) => number;
    readonly scope_flow_json: (a: number, b: number, c: number, d: number) => [number, number];
    readonly scope_fold: (a: number, b: number) => void;
    readonly scope_fold_outside: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => number;
    readonly scope_new: (a: number, b: number) => [number, number, number];
    readonly scope_record: (a: number, b: number) => void;
    readonly scope_region_at: (a: number, b: number, c: number, d: number) => number;
    readonly scope_region_json: (a: number, b: number) => [number, number];
    readonly scope_reveal: (a: number, b: number) => void;
    readonly scope_reveal_rect: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => number;
    readonly scope_river_json: (a: number, b: number, c: number, d: number) => [number, number];
    readonly scope_root: (a: number) => number;
    readonly scope_route_path_json: (a: number, b: number, c: number) => [number, number];
    readonly scope_sample_field: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly scope_sample_field_grid: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => [number, number];
    readonly scope_set: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly scope_set_intent: (a: number, b: number, c: number, d: number) => void;
    readonly scope_snapshot_json: (a: number) => [number, number];
    readonly scope_snapshot_rect_json: (a: number, b: number, c: number, d: number, e: number) => [number, number];
    readonly scope_step: (a: number) => void;
    readonly scope_steps: (a: number, b: number) => void;
    readonly scope_tick: (a: number) => bigint;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
