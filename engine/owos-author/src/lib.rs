//! owos-author — load a **self-bootstrapping** world from JSON into the scope-tree
//! engine. Every CLI host used to re-implement this loader; now it lives once,
//! and — crucially — a spec can describe its own SEED entities, so the web
//! console (or any host) can load an arbitrary world with zero per-world code.
//!
//! A spec is the union of everything the data layer can express:
//!   rules · coarse_rules · actions · events · generators · rollups · broadcasts
//!   · convo_moves (sugar for score-0 "convo" actions) · seed (root entities)
//!
//! The loader propagates `Result` (a bad formula surfaces as an error string
//! instead of a panic), so an editor can report it.

use std::collections::BTreeMap;

use owos_core::engine::{Broadcast, EntityId, Fidelity, Reducer, Rollup, World};
use serde::Deserialize;

#[derive(Deserialize)]
struct EffDef {
    op: String,
    #[serde(default)]
    stat: String,
    #[serde(default)]
    expr: String,
}
#[derive(Deserialize)]
struct RuleDef {
    on: String,
    set: String,
    expr: String,
}
#[derive(Deserialize)]
struct ActDef {
    on: String,
    name: String,
    score: String,
    #[serde(default)]
    effects: Vec<EffDef>,
}
#[derive(Deserialize)]
struct EventDef {
    on: String,
    when: String,
    label: String,
    #[serde(default, rename = "do")]
    do_: Vec<EffDef>,
}
/// A JSON object kept in DOCUMENT order (BTreeMap would alphabetize it). Order
/// matters for `child_stats`: stats evaluate top-to-bottom against the child, so
/// a later stat's formula can READ an earlier one by name ("radius" then
/// "cx": "0.5 + radius*cos(angle)") — no more copy-pasting sub-expressions.
#[derive(Default)]
struct OrderedStats(Vec<(String, String)>);
impl<'de> Deserialize<'de> for OrderedStats {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        struct V;
        impl<'de> serde::de::Visitor<'de> for V {
            type Value = OrderedStats;
            fn expecting(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
                f.write_str("a { stat: formula } object")
            }
            fn visit_map<M: serde::de::MapAccess<'de>>(self, mut m: M) -> Result<Self::Value, M::Error> {
                let mut v = Vec::new();
                while let Some((k, val)) = m.next_entry::<String, String>()? {
                    v.push((k, val));
                }
                Ok(OrderedStats(v))
            }
        }
        d.deserialize_map(V)
    }
}

#[derive(Deserialize)]
struct GenDef {
    on: String,
    spawn: String,
    count: String,
    #[serde(default)]
    child_stats: OrderedStats,
    #[serde(default)]
    cascade: bool,
    #[serde(default)]
    chain: String,
    #[serde(default)]
    chain_ring: bool,
    /// Partition adjacency over the spawned children: e.g.
    /// { "style": "voronoi", "edge": "border", "x": "cx", "y": "cy" }.
    #[serde(default)]
    partition: Option<PartitionDef>,
}
#[derive(Deserialize)]
struct PartitionDef {
    #[serde(default)]
    style: String,
    #[serde(default = "border_edge")]
    edge: String,
    x: String,
    y: String,
    #[serde(default)]
    weight: String,
    /// Author WHERE-gate: a formula over fx,fy (reading any fields) that a seed
    /// position must satisfy. e.g. "field(elevation,fx,fy) > 0.4" (dry land only).
    #[serde(default, rename = "where")]
    where_: String,
    /// CLIP mask: a formula over fx,fy; each cell's territory = cell ∩ mask. Sets the
    /// `area` stat (valid land fraction) and prunes adjacency across masked-out land.
    #[serde(default)]
    clip: String,
    /// COVERAGE: named fields whose fraction-of-cell is measured → `<name>_frac` stats
    /// per child. Geography shapes zone identity ("40% beach" → a harbour district).
    #[serde(default)]
    coverage: BTreeMap<String, String>,
}
fn border_edge() -> String {
    "border".to_string()
}
#[derive(Deserialize)]
struct RollDef {
    parent: String,
    child_stat: String,
    parent_stat: String,
    #[serde(default)]
    reduce: String,
    #[serde(default)]
    drain: bool,
}
#[derive(Deserialize)]
struct BcastDef {
    /// Only broadcast from parents of this kind ("" = every parent level —
    /// beware: that includes the root, whose unset stat reads 0).
    #[serde(default, alias = "on")]
    parent_kind: String,
    parent_stat: String,
    child_stat: String,
    gain: f32,
}
#[derive(Deserialize)]
struct MoveDef {
    name: String,
    #[serde(default)]
    effects: Vec<EffDef>,
}
/// A root entity to spawn once the rules are wired. `reveal` runs its generators
/// (materializing its structure); `park_children` then bands the freshly-made
/// children as Coarse "ideas" so the camera can zoom them one at a time.
#[derive(Deserialize)]
struct SeedDef {
    kind: String,
    #[serde(default)]
    name: String,
    #[serde(default)]
    stats: BTreeMap<String, f32>,
    #[serde(default = "one")]
    count: u32,
    #[serde(default)]
    reveal: bool,
    #[serde(default)]
    park_children: bool,
}
fn one() -> u32 {
    1
}

#[derive(Deserialize)]
pub struct WorldSpec {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub rng_seed: Option<u64>,
    #[serde(default)]
    rules: Vec<RuleDef>,
    #[serde(default)]
    coarse_rules: Vec<RuleDef>,
    /// Rules that run ONCE at reveal (worldgen decisions: land use, zoning), not
    /// per tick — crystallize on observation, then frozen. Same shape as `rules`.
    #[serde(default)]
    settle_rules: Vec<RuleDef>,
    #[serde(default)]
    settle_iters: Option<usize>,
    #[serde(default)]
    actions: Vec<ActDef>,
    #[serde(default)]
    events: Vec<EventDef>,
    #[serde(default)]
    generators: Vec<GenDef>,
    #[serde(default)]
    rollups: Vec<RollDef>,
    #[serde(default)]
    broadcasts: Vec<BcastDef>,
    #[serde(default)]
    convo_moves: Vec<MoveDef>,
    #[serde(default)]
    seed: Vec<SeedDef>,
    /// Named continuous fields over the unit square (elevation, moisture…): the
    /// terrain substrate a layered world reads. { "elevation": "noise(fx,fy)" }.
    #[serde(default)]
    fields: BTreeMap<String, String>,
    /// Declarative ROAD NETWORKS (circulation over adjacency, terrain-aware).
    #[serde(default)]
    routes: Vec<RouteDef>,
}
#[derive(Deserialize)]
struct RouteDef {
    on: String,          // parent scope kind (fires on its reveal)
    node: String,        // which children to route among
    hub: String,         // formula; hub = the child with the max value
    #[serde(default)]
    via: String,         // (legacy, unused — routing builds its own candidate graph)
    route: String,       // edge kind to wire for the roads
    #[serde(default = "cx_default")]
    x: String,
    #[serde(default = "cy_default")]
    y: String,
    #[serde(default)]
    cost: String,        // hop cost formula over mx,my + fields ("" = distance only)
    #[serde(default)]
    transition: String,  // formula over fx,fy; a crossed region needing a transition
    #[serde(default)]
    max_span: f32,       // longest crossable span (unit space); 0 → 0.25. Wider = rejected.
    #[serde(default)]
    trans_kind: String,  // entity kind to spawn at a valid transition (bridge/ferry/…)
    #[serde(default)]
    style: String,       // "efficient" | "grid"/"redundant" | "organic"
    #[serde(default)]
    redundancy: u32,     // k nearest candidates per node (min 2)
    /// Include this scope's `gate` children (crossing points a PARENT-level road
    /// left on it) as network nodes — local streets connect to the artery where
    /// it actually enters. The fractal-circulation switch.
    #[serde(default)]
    gates: bool,
}
fn cx_default() -> String { "cx".to_string() }
fn cy_default() -> String { "cy".to_string() }

fn effs(v: &[EffDef]) -> Vec<(String, String, String)> {
    v.iter().map(|e| (e.op.clone(), e.stat.clone(), e.expr.clone())).collect()
}
fn reducer(s: &str) -> Reducer {
    match s {
        "sum" => Reducer::Sum,
        "max" => Reducer::Max,
        "min" => Reducer::Min,
        "frac_above" => Reducer::FracAbove(0.5),
        _ => Reducer::Mean,
    }
}

/// Wire a spec's rules/behaviors into an existing world (does NOT spawn seed
/// entities — see `seed_entities`). Propagates the first bad-formula error.
pub fn wire(w: &mut World, spec: &WorldSpec) -> Result<(), String> {
    // Every formula error is wrapped with WHERE it lives (section · kind · stat
    // · the formula text) — "unexpected char ':'" alone is useless in a large
    // world file; this is the difference between a fix and an excavation.
    let ctx = |section: &str, on: &str, name: &str, formula: &str, e: String| {
        format!("{e}\n  in {section} on '{on}' → \"{name}\"\n  formula: {formula}")
    };
    for r in &spec.rules {
        w.add_rule(&r.on, &r.set, &r.expr)
            .map_err(|e| ctx("rules", &r.on, &r.set, &r.expr, e))?;
    }
    for r in &spec.coarse_rules {
        w.add_coarse_rule(&r.on, &r.set, &r.expr)
            .map_err(|e| ctx("coarse_rules", &r.on, &r.set, &r.expr, e))?;
    }
    for r in &spec.settle_rules {
        w.add_settle_rule(&r.on, &r.set, &r.expr)
            .map_err(|e| ctx("settle_rules", &r.on, &r.set, &r.expr, e))?;
    }
    if let Some(n) = spec.settle_iters {
        w.set_settle_iters(n);
    }
    for a in &spec.actions {
        w.add_data_action(&a.on, &a.name, &a.score, effs(&a.effects))
            .map_err(|e| ctx("actions", &a.on, &a.name, &a.score, e))?;
    }
    for e in &spec.events {
        w.add_event(&e.on, &e.when, effs(&e.do_), &e.label)
            .map_err(|err| ctx("events", &e.on, &e.label, &e.when, err))?;
    }
    for g in &spec.generators {
        let cs: Vec<(String, String)> = g.child_stats.0.clone();
        let part = g.partition.as_ref().map(|p| {
            let cov: Vec<(String, String)> = p.coverage.iter().map(|(k, v)| (k.clone(), v.clone())).collect();
            (p.style.clone(), p.edge.clone(), p.x.clone(), p.y.clone(), p.weight.clone(), p.where_.clone(), p.clip.clone(), cov)
        });
        w.add_generator_ex(&g.on, &g.spawn, &g.count, cs, g.cascade, &g.chain, g.chain_ring, part)
            .map_err(|e| format!("{e}\n  in generators: on '{}' spawning '{}'", g.on, g.spawn))?;
    }
    for r in &spec.rollups {
        w.add_rollup(Rollup {
            parent_kind: r.parent.clone(),
            child_stat: r.child_stat.clone(),
            parent_stat: r.parent_stat.clone(),
            reducer: reducer(&r.reduce),
            drain: r.drain,
        });
    }
    for b in &spec.broadcasts {
        w.add_broadcast(Broadcast { parent_kind: b.parent_kind.clone(), parent_stat: b.parent_stat.clone(), child_stat: b.child_stat.clone(), gain: b.gain });
    }
    for m in &spec.convo_moves {
        w.add_data_action("convo", &m.name, "0", effs(&m.effects))
            .map_err(|e| ctx("convo_moves", "convo", &m.name, "", e))?;
    }
    for (name, formula) in &spec.fields {
        w.add_field(name, formula)
            .map_err(|e| ctx("fields", "-", name, formula, e))?;
    }
    for r in &spec.routes {
        w.add_route(&r.on, &r.node, &r.hub, &r.via, &r.route, &r.x, &r.y, &r.cost, &r.transition, r.max_span, &r.trans_kind, &r.style, r.redundancy, r.gates)
            .map_err(|e| ctx("routes", &r.on, &r.route, &r.cost, e))?;
    }
    Ok(())
}

/// Spawn the spec's seed entities under root (after `wire`, so generators exist).
pub fn seed_entities(w: &mut World, spec: &WorldSpec) {
    let root = w.root;
    for s in &spec.seed {
        for i in 0..s.count {
            let base = if s.name.is_empty() { s.kind.clone() } else { s.name.clone() };
            let name = if s.count > 1 { format!("{base} {}", i + 1) } else { base };
            let id = w.spawn(&s.kind, &name, root);
            for (k, v) in &s.stats {
                w.set(id, k, *v);
            }
            if s.reveal && w.stat(id, "wx1") <= w.stat(id, "wx0") {
                // stamp the primary seed as TILE (0,0) — the explicit form of the
                // 0..1 default the engine already assumed. Makes the base world a
                // grid cell like any other, so ensure_tile can find/extend it.
                w.set(id, "wx0", 0.0);
                w.set(id, "wy0", 0.0);
                w.set(id, "wx1", 1.0);
                w.set(id, "wy1", 1.0);
            }
            if s.reveal {
                w.reveal(id); // runs generators → materializes this seed's structure
            }
            if s.park_children {
                for c in w.children(id) {
                    w.set_node_fidelity(c, Fidelity::Coarse); // band as "ideas" to zoom later
                }
            }
        }
    }
}

/// THE TILE WORLD (streaming worldgen — seeds as ADDRESSES, not universes).
/// `ensure_tile(w, spec, tx, ty)` materializes the world tile at grid cell
/// (tx, ty): a fresh copy of the spec's primary seed entity whose world patch is
/// [tx..tx+1, ty..ty+1]. Because the terrain FIELDS are global formulas over
/// world coordinates, adjacent tiles are continuous BY CONSTRUCTION — the same
/// coastline crosses the border; only the entity layer (districts, canon, names)
/// is per-tile. Idempotent: an existing tile is returned (and re-revealed if it
/// was folded), never duplicated. This is the observation layer's "the camera
/// approached land that doesn't exist yet" — the infinite-world primitive; a
/// walk needs only its tile + neighbours, and lazy canon means nothing else is
/// ever written down.
pub fn ensure_tile(w: &mut World, spec: &WorldSpec, tx: i32, ty: i32) -> Option<EntityId> {
    let s = spec.seed.iter().find(|s| s.reveal)?;   // the primary (revealed) seed = the tile template
    let root = w.root;
    // existing tile? (kind matches + patch origin matches the grid cell)
    for c in w.children(root) {
        if w.kind(c) == s.kind
            && (w.stat(c, "wx0") - tx as f32).abs() < 1e-6
            && (w.stat(c, "wy0") - ty as f32).abs() < 1e-6
        {
            if !w.is_revealed(c) {
                reveal_and_park(w, c);
            }
            return Some(c);
        }
    }
    let name = format!("{} ({},{})", if s.name.is_empty() { &s.kind } else { &s.name }, tx, ty);
    let id = w.spawn(&s.kind, &name, root);
    for (k, v) in &s.stats {
        w.set(id, k, *v);
    }
    // the tile's world patch — the fractal remap threads it through every
    // generator/route/partition below, so the SAME spec reads ITS slice of the
    // global fields (this is why tiles connect instead of repeating).
    w.set(id, "wx0", tx as f32);
    w.set(id, "wy0", ty as f32);
    w.set(id, "wx1", tx as f32 + 1.0);
    w.set(id, "wy1", ty as f32 + 1.0);
    reveal_and_park(w, id);
    Some(id)
}

/// TEMPLATES — the composition layer ON TOP of the prims, as a pure JSON macro.
/// A spec may carry `"templates": { "<name>": { …generator fragment… } }`, and any
/// generator may say `"template": "<name>"`: the fragment is DEEP-MERGED underneath
/// it (the generator's own keys always WIN; nested objects merge recursively). The
/// engine never sees a template — by the time WorldSpec deserializes, only prims
/// remain. A template is captured know-how ("parcelled ground = voronoi + where +
/// clip on buildable"), not meaning: `urban_block` and `alien_hive` are the same
/// machinery to this code.
fn expand_templates(v: &mut serde_json::Value) -> Result<(), String> {
    let templates = v.get("templates").cloned();
    let Some(gens) = v.get_mut("generators").and_then(|g| g.as_array_mut()) else { return Ok(()) };
    for g in gens {
        let Some(name) = g.get("template").and_then(|t| t.as_str()).map(String::from) else { continue };
        let frag = templates
            .as_ref()
            .and_then(|t| t.get(&name))
            .cloned()
            .ok_or_else(|| format!("generator uses unknown template \"{name}\" (no templates.{name} in the spec)"))?;
        merge_under(g, &frag);
    }
    Ok(())
}
/// Fill `target`'s missing keys from `frag`; recurse into objects both sides have.
/// Existing non-object values in `target` are never touched — the world overrides.
fn merge_under(target: &mut serde_json::Value, frag: &serde_json::Value) {
    if let (Some(t), Some(f)) = (target.as_object_mut(), frag.as_object()) {
        for (k, fv) in f {
            match t.get_mut(k) {
                None => { t.insert(k.clone(), fv.clone()); }
                Some(tv) if tv.is_object() && fv.is_object() => merge_under(tv, fv),
                Some(_) => {}
            }
        }
    }
}

/// Parse a JSON spec and build a ready world (creates `World::new`, wires
/// behaviors, spawns + reveals seed entities). The single entry point a host
/// needs: `let world = owos_author::build(json)?;`
pub fn build(json: &str) -> Result<World, String> {
    build_with_spec(json).map(|(w, _)| w)
}

/// Like `build`, but also returns the parsed spec — hosts that stream TILES keep
/// it around so `ensure_tile` can stamp new grid cells from the same template.
pub fn build_with_spec(json: &str) -> Result<(World, WorldSpec), String> {
    let mut value: serde_json::Value = serde_json::from_str(json).map_err(|e| format!("spec parse error: {e}"))?;
    expand_templates(&mut value)?;
    let spec: WorldSpec = serde_json::from_value(value).map_err(|e| format!("spec parse error: {e}"))?;
    let mut w = World::new(spec.rng_seed.unwrap_or(1));
    wire(&mut w, &spec)?;
    seed_entities(&mut w, &spec);
    Ok((w, spec))
}

/// ★ THE MULTIVERSE ADDRESS → SEED. Fold a nested integer address (e.g.
/// [universe, galaxy_x, galaxy_y, planet_x, planet_y]) into one world seed with a
/// splitmix-style avalanche. INTEGER-exact — no f32 precision ceiling — so the
/// address space is ~2^64 per coordinate, nested to astronomical size, and the same
/// address ALWAYS folds to the same seed (reproducible). A `build_at` on that seed is
/// a deterministic, distinct, coherent world. This is "seeds ARE addresses," honestly.
fn mix64(mut x: u64) -> u64 {
    x = (x ^ (x >> 30)).wrapping_mul(0xbf58_476d_1ce4_e5b9);
    x = (x ^ (x >> 27)).wrapping_mul(0x94d0_49bb_1331_11eb);
    x ^ (x >> 31)
}
pub fn address_seed(address: &[i64]) -> u64 {
    let mut h = 0x9E37_79B9_7F4A_7C15u64;
    for &c in address {
        h = mix64(h ^ (c as u64).wrapping_mul(0xD1B5_4A32_D192_ED03));
    }
    mix64(h)
}

/// Build a whole world at a MULTIVERSE ADDRESS — same spec, but seeded by the
/// address instead of the spec's `rng_seed`. Every galaxy/planet/universe coordinate
/// yields its own deterministic, reproducible world; nothing in owos-core changes.
pub fn build_at(json: &str, address: &[i64]) -> Result<World, String> {
    let mut value: serde_json::Value = serde_json::from_str(json).map_err(|e| format!("spec parse error: {e}"))?;
    expand_templates(&mut value)?;
    let spec: WorldSpec = serde_json::from_value(value).map_err(|e| format!("spec parse error: {e}"))?;
    let mut w = World::new(address_seed(address));
    wire(&mut w, &spec)?;
    seed_entities(&mut w, &spec);
    Ok(w)
}

/// The camera helper the console leans on: reveal `id`, then band its freshly
/// materialized (unrevealed) children as Coarse ideas — one click, feathered zoom.
pub fn reveal_and_park(w: &mut World, id: EntityId) {
    w.reveal(id);
    for c in w.children(id) {
        if !w.is_revealed(c) {
            w.set_node_fidelity(c, Fidelity::Coarse);
        }
    }
}
