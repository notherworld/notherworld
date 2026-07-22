//! WASM bindings — the browser embedding of the otherworldOS **scope-tree** engine.
//!
//! This is the exact same core a native game embeds via the C ABI; here it's the
//! JS surface the web console runs on. The design follows the FFI recon's advice:
//! instead of chatty per-field getters, the boundary is a single batched
//! `snapshot_json()` — the whole observed world (entities + stats + fidelity +
//! edges + ledger + log) in one JSON dump the UI parses each frame. Construction
//! and the camera go the other way as small typed calls.

use std::collections::BTreeMap;

use owos_core::engine::{EntityId, Fidelity, World};
use serde::Serialize;
use wasm_bindgen::prelude::*;

/// An opaque handle to a live scope-tree world. JS holds this plus bare entity
/// ids (numbers) and re-resolves them each call — no Rust references cross over.
#[wasm_bindgen]
pub struct Scope {
    world: World,
    /// retained so `ensure_tile` can stamp new grid cells from the same template
    spec: owos_author::WorldSpec,
}

// ---- snapshot DTOs (hand-mapped from the engine's public fields) ----

#[derive(Serialize)]
struct EntityDto {
    id: usize,
    kind: String,
    name: String,
    parent: Option<usize>,
    fidelity: &'static str,
    revealed: bool,
    active: bool,
    /// engine-spawned circulation infrastructure (shores, bridges/ferries/…) —
    /// hosts exclude these from navigable sub-scope lists via THIS flag, not kind names
    infra: bool,
    stats: BTreeMap<String, f32>,
    facts: Vec<String>,
    last_action: Option<String>,
    children: Vec<usize>,
}
#[derive(Serialize)]
struct EdgeDto {
    from: usize,
    to: usize,
    kind: String,
    weight: f32,
}
#[derive(Serialize)]
struct NotableDto {
    tick: u64,
    message: String,
}
#[derive(Serialize)]
struct ClaimDto {
    subject: usize,
    predicate: String,
    object: Option<usize>,
    detail: String,
}
#[derive(Serialize)]
struct Snapshot {
    tick: u64,
    root: usize,
    entities: Vec<EntityDto>,
    edges: Vec<EdgeDto>,
    log: Vec<NotableDto>,
    ledger: Vec<ClaimDto>,
}

fn fidelity_str(f: Fidelity) -> &'static str {
    match f {
        Fidelity::Detailed => "detailed",
        Fidelity::Hazed => "hazed",
        Fidelity::Coarse => "coarse",
    }
}

#[wasm_bindgen]
impl Scope {
    /// Build a world from a self-bootstrapping JSON spec (see owos-author).
    #[wasm_bindgen(constructor)]
    pub fn new(spec_json: &str) -> Result<Scope, JsValue> {
        let (world, spec) = owos_author::build_with_spec(spec_json).map_err(|e| JsValue::from_str(&e))?;
        Ok(Scope { world, spec })
    }

    /// THE TILE WORLD: materialize the world tile at grid cell (tx, ty) — a fresh
    /// copy of the spec's primary seed whose patch is [tx..tx+1, ty..ty+1]. The
    /// global fields make adjacent tiles CONTINUOUS land; only the entity layer is
    /// per-tile. Idempotent. Returns the tile's entity id.
    pub fn ensure_tile(&mut self, tx: i32, ty: i32) -> i32 {
        owos_author::ensure_tile(&mut self.world, &self.spec, tx, ty).map(|id| id as i32).unwrap_or(-1)
    }

    /// Advance one tick.
    pub fn step(&mut self) {
        self.world.step();
    }
    /// Advance `n` ticks.
    pub fn steps(&mut self, n: u32) {
        for _ in 0..n {
            self.world.step();
        }
    }

    /// Zoom IN: reveal `id` (materialize + write canon) and band its fresh
    /// children as Coarse "ideas" to zoom next — the feathered dive.
    pub fn reveal(&mut self, id: u32) {
        owos_author::reveal_and_park(&mut self.world, id as EntityId);
    }
    /// Zoom OUT: fold `id` back to a coarse aggregate.
    pub fn fold(&mut self, id: u32) {
        self.world.fold(id as EntityId);
    }

    /// STREAMING (rect API — the camera speaks world rects, not ids): reveal every
    /// `kind` scope intersecting the rect — first visits write canon, returning
    /// folded scopes unfold — and park each one's fresh children Coarse (same
    /// feathered-dive semantics as `reveal`). Feed it the camera window + a
    /// lookahead margin and the data arrives before the player does. Returns how
    /// many scopes were touched.
    pub fn reveal_rect(&mut self, x0: f32, y0: f32, x1: f32, y1: f32, kind: &str) -> u32 {
        let ids = self.world.reveal_rect(x0, y0, x1, y1, kind);
        for &id in &ids {
            for c in self.world.children(id) {
                if !self.world.is_revealed(c) {
                    self.world.set_node_fidelity(c, Fidelity::Coarse);
                }
            }
        }
        ids.len() as u32
    }
    /// STREAMING: fold every revealed `kind` scope fully OUTSIDE the rect back to
    /// a coarse aggregate — the memory half (canon stays written; simulation there
    /// goes cheap). Call with the camera window + margin as the player moves on.
    pub fn fold_outside(&mut self, x0: f32, y0: f32, x1: f32, y1: f32, kind: &str) -> u32 {
        self.world.fold_outside(x0, y0, x1, y1, kind) as u32
    }

    /// BATCH field sampling — one WASM crossing for a whole grid. Per-call
    /// `sample_field` pays a JS→WASM hop + field-name string encode PER SAMPLE;
    /// a renderer lattice is 50k+ samples, so the postage dwarfed the letters
    /// (this was the "slow as dirt" bake). Samples row-major at
    /// (x0 + i*dx, y0 + j*dy) for nx×ny points, looped natively. Returns the
    /// values as one Float32Array.
    pub fn sample_field_grid(
        &self, name: &str, x0: f32, y0: f32, dx: f32, dy: f32, nx: u32, ny: u32,
    ) -> Vec<f32> {
        let mut out = Vec::with_capacity((nx * ny) as usize);
        for j in 0..ny {
            for i in 0..nx {
                out.push(self.world.sample_field(name, x0 + i as f32 * dx, y0 + j as f32 * dy));
            }
        }
        out
    }

    /// Poke a stat (god-mode / player input at any scale).
    pub fn set(&mut self, id: u32, key: &str, v: f32) {
        self.world.set(id as EntityId, key, v);
    }
    /// Force an entity's next action (player intent override).
    pub fn set_intent(&mut self, id: u32, action: &str) {
        self.world.set_intent(id as EntityId, action);
    }
    pub fn clear_intent(&mut self, id: u32) {
        self.world.clear_intent(id as EntityId);
    }

    /// Turn the built-in recorder (content oracle) on/off.
    pub fn record(&mut self, on: bool) {
        self.world.record(on);
    }

    pub fn tick(&self) -> u64 {
        self.world.tick
    }
    pub fn root(&self) -> u32 {
        self.world.root as u32
    }

    /// Sample a named continuous field (e.g. "elevation") at a unit-space point.
    /// The terrain the layered world is built on — the renderer shades the map with it.
    pub fn sample_field(&self, name: &str, x: f32, y: f32) -> f32 {
        self.world.sample_field(name, x, y)
    }

    /// A carved parcel's TRUE shape: `[cellSize, x0,y0, x1,y1, …]` (owned cell
    /// centres, parent-local 0..1). Empty array if the entity has no carved region.
    /// Renderers draw THIS, not the bbox — a coastal parcel's bbox lies about it.
    pub fn region_json(&self, id: u32) -> String {
        match self.world.region_cells(id as EntityId) {
            Some((cell, cs)) => {
                let mut flat = Vec::with_capacity(cs.len() * 2 + 1);
                flat.push(cell);
                for &(x, y) in cs { flat.push(x); flat.push(y); }
                serde_json::to_string(&flat).unwrap_or_else(|_| "[]".into())
            }
            None => "[]".into(),
        }
    }

    /// Which child parcel of `parent` owns the local point (x,y)? −1 = none.
    /// Topological collision as an engine query.
    pub fn region_at(&self, parent: u32, x: f32, y: f32) -> i32 {
        self.world.region_at(parent as EntityId, x, y).map(|id| id as i32).unwrap_or(-1)
    }

    /// The pathfound curve of a laid route edge, flat [x0,y0,x1,y1,…] in the
    /// routing scope's local coords. Empty if the edge was laid straight.
    pub fn route_path_json(&self, a: u32, b: u32) -> String {
        match self.world.route_path(a as EntityId, b as EntityId) {
            Some(pts) => {
                let flat: Vec<f32> = pts.iter().flat_map(|&(x, y)| [x, y]).collect();
                serde_json::to_string(&flat).unwrap_or_else(|_| "[]".into())
            }
            None => "[]".into(),
        }
    }

    /// Trace a river downhill through a field, as a flat [x0,y0,x1,y1,…] point array.
    pub fn river_json(&self, field: &str, steps: u32) -> String {
        let path = self.world.river_trace(field, steps as usize);
        let flat: Vec<f32> = path.into_iter().flat_map(|(x, y)| [x, y]).collect();
        serde_json::to_string(&flat).unwrap_or_else(|_| "[]".into())
    }

    /// The generic flow/watershed grids for a field, as one JSON object:
    /// `{n, fill:[…], pool:[…], down:[…], accum:[…]}`, all n×n row-major over the
    /// unit square. `pool > 0` = a filled basin (lake); `accum` = upstream cells
    /// draining through (a renderer reads high accum as a river, and follows
    /// `down` to animate flow). Domain-agnostic: works on ANY field.
    pub fn flow_json(&self, field: &str, n: u32) -> String {
        let f = self.world.flow_map(field, n as usize);
        #[derive(Serialize)]
        struct FlowDto {
            n: u32,
            fill: Vec<f32>,
            pool: Vec<f32>,
            down: Vec<i32>,
            accum: Vec<f32>,
        }
        serde_json::to_string(&FlowDto { n: f.n as u32, fill: f.fill, pool: f.pool, down: f.down, accum: f.accum })
            .unwrap_or_else(|_| "{}".into())
    }

    /// The whole observed world as JSON — the one call the UI polls each frame.
    pub fn snapshot_json(&self) -> String {
        let w = &self.world;
        let entities: Vec<EntityDto> = w
            .entities
            .iter()
            .filter(|e| !e.dead)
            .map(|e| EntityDto {
                id: e.id,
                kind: e.kind.clone(),
                name: e.name.clone(),
                parent: e.parent,
                fidelity: fidelity_str(e.fidelity),
                revealed: e.revealed,
                active: w.is_active(e.id),
                infra: e.infra,
                stats: e.stats.iter().map(|(k, v)| (k.clone(), *v)).collect(),
                facts: e.facts.clone(),
                last_action: w.last_action(e.id).map(|s| s.to_string()),
                children: e.children.iter().copied().filter(|&c| !w.entities[c].dead).collect(),
            })
            .collect();
        let edges: Vec<EdgeDto> = w
            .edges()
            .iter()
            .filter(|e| !e.dead)
            .map(|e| EdgeDto { from: e.from, to: e.to, kind: e.kind.clone(), weight: e.weight })
            .collect();
        let log: Vec<NotableDto> = w.log.iter().map(|n| NotableDto { tick: n.tick, message: n.message.clone() }).collect();
        let ledger: Vec<ClaimDto> = w
            .ledger()
            .iter()
            .map(|c| ClaimDto { subject: c.subject, predicate: c.predicate.clone(), object: c.object, detail: c.detail.clone() })
            .collect();
        let snap = Snapshot { tick: w.tick, root: w.root, entities, edges, log, ledger };
        serde_json::to_string(&snap).unwrap_or_else(|_| "{}".into())
    }

    /// WINDOWED snapshot — the TILE WORLD's memory law for the HOST side. The full
    /// snapshot grows with every tile ever visited (serialize + parse cost grows
    /// forever → the long-walk freeze). This variant ships ONLY entities whose
    /// TILE (root-child ancestor) intersects the rect — the camera window + a
    /// margin. Distant countries stay materialized in the ENGINE (canon intact,
    /// folded dormant) but stop crossing the wire. Edges ship when both ends do.
    pub fn snapshot_rect_json(&self, x0: f32, y0: f32, x1: f32, y1: f32) -> String {
        let w = &self.world;
        // which root-children (tiles) intersect the window?
        let mut tile_in: BTreeMap<usize, bool> = BTreeMap::new();
        for &t in &w.entities[w.root].children {
            if w.entities[t].dead { continue; }
            let (tx0, ty0) = (w.stat(t, "wx0"), w.stat(t, "wy0"));
            let (tx1, ty1) = (w.stat(t, "wx1"), w.stat(t, "wy1"));
            // patchless root-children always ship (small, non-tile entities)
            let hit = tx1 <= tx0 || (tx0 < x1 && tx1 > x0 && ty0 < y1 && ty1 > y0);
            tile_in.insert(t, hit);
        }
        // an entity ships if its tile does (walk to the root-child once; memoized
        // per tile above, the walk itself is cheap: depth ≤ scope-tree height)
        let keeps = |mut id: usize| -> bool {
            if id == w.root { return true; }
            loop {
                match w.entities[id].parent {
                    None => return true,
                    Some(p) if p == w.root => return *tile_in.get(&id).unwrap_or(&true),
                    Some(p) => id = p,
                }
            }
        };
        let mut kept = vec![false; w.entities.len()];
        for e in &w.entities {
            if !e.dead && keeps(e.id) { kept[e.id] = true; }
        }
        let entities: Vec<EntityDto> = w
            .entities
            .iter()
            .filter(|e| !e.dead && kept[e.id])
            .map(|e| EntityDto {
                id: e.id,
                kind: e.kind.clone(),
                name: e.name.clone(),
                parent: e.parent,
                fidelity: fidelity_str(e.fidelity),
                revealed: e.revealed,
                active: w.is_active(e.id),
                infra: e.infra,
                stats: e.stats.iter().map(|(k, v)| (k.clone(), *v)).collect(),
                facts: e.facts.clone(),
                last_action: w.last_action(e.id).map(|s| s.to_string()),
                children: e.children.iter().copied().filter(|&c| !w.entities[c].dead && kept[c]).collect(),
            })
            .collect();
        let edges: Vec<EdgeDto> = w
            .edges()
            .iter()
            .filter(|e| !e.dead && kept[e.from] && kept[e.to])
            .map(|e| EdgeDto { from: e.from, to: e.to, kind: e.kind.clone(), weight: e.weight })
            .collect();
        let log: Vec<NotableDto> = w.log.iter().map(|n| NotableDto { tick: n.tick, message: n.message.clone() }).collect();
        let ledger: Vec<ClaimDto> = w
            .ledger()
            .iter()
            .map(|c| ClaimDto { subject: c.subject, predicate: c.predicate.clone(), object: c.object, detail: c.detail.clone() })
            .collect();
        let snap = Snapshot { tick: w.tick, root: w.root, entities, edges, log, ledger };
        serde_json::to_string(&snap).unwrap_or_else(|_| "{}".into())
    }
}
