//! The World — the scope tree plus the tick that drives it, with Simulation-LOD.
//!
//! Holds every entity in a flat arena (id == index), the tree linking them, the
//! systems, and the cross-scale Rollup/Broadcast rules. One `step()` runs:
//!   1. detailed systems (over entities whose whole ancestor chain is Detailed)
//!   2. coarse systems   (over the coarse frontier — folded scopes run as cheap
//!                        aggregates, their subtrees dormant)
//!   3. rollups, bottom-up   (children → parents; skip Coarse parents so their
//!                            aggregate isn't clobbered by frozen children)
//!   4. broadcasts, top-down (parents → children; still reaches folded scopes,
//!                            so an offscreen city still feels its nation's war)
//! Deterministic. Actions enter through `act_*` at ANY scale. Zoom in/out with
//! `unfold`/`fold`; `crystallize` turns a folded aggregate back into individuals.

use std::collections::BTreeMap;

use crate::rng::Rng;

use super::action::Action;
use super::entity::{Entity, EntityId, Fidelity};
use super::scale::{Broadcast, Rollup};
use super::system::{System, Unfolder};

#[derive(Clone, Debug)]
pub struct Notable {
    pub tick: u64,
    pub message: String,
}

/// A data-authored event: when `when` becomes true for an entity of `on_kind`,
/// fire `effects` once (on the rising edge) and log `label`. This is how
/// thresholds turn into state transitions — an overthrow, a birth, a collapse.
struct Event {
    on_kind: String,
    when: super::expr::Expr,
    effects: Vec<super::action::Effect>,
    label: String,
    fired: BTreeMap<EntityId, bool>,
}

/// A data-driven generator: when an entity of `on_kind` is revealed, spawn
/// `count` (a formula over the parent's stats/aggregations) children of
/// `spawn_kind`, each initialized by `child_stats` formulas (which can read
/// `parent.X`, `index`, `rand()`). Generation as a function of the LIVING world.
struct Generator {
    on_kind: String,
    spawn_kind: String,
    count: super::expr::Expr,
    child_stats: Vec<(String, super::expr::Expr)>,
    /// Cascade: immediately reveal each spawned child, so ITS generators fire too.
    /// This is what lets lazy worldgen go deeper than one level from a single seed
    /// — a city reveal spawns districts, each district reveal spawns citizens, all
    /// in one pass. Without it, reveal stops at the first generated layer (children
    /// spawn unrevealed, so a grandchild generator never runs). Default false keeps
    /// the feathered camera behavior (spawn a layer, park it as coarse "ideas").
    cascade: bool,
    /// Chain: after spawning the children, wire consecutive ones with an edge of
    /// this kind — a route graph (a corridor of rooms joined by `door`s). Empty =
    /// no chaining. `chain_ring` closes the last→first so it's a loop, not a line.
    /// This is how TOPOLOGICAL SPACE is authored as data: places connected by
    /// routes an agent traverses with `move`.
    chain: String,
    chain_ring: bool,
    /// Partition: after spawning children, compute a PARTITION over them and wire
    /// adjacency edges (kind `partition.edge`) between neighbors. A partition is
    /// "how a set of things divides a space and who borders whom" — a general
    /// family, selected by `partition.style`:
    ///   "voronoi" — nearest-seed organic territory; neighbors share a cell border
    ///               (Gabriel-graph test over the children's `px`,`py` position
    ///               stats). Contiguous soft neighborhoods, biomes, influence zones.
    ///   (future: "grid"/"hex" lattice, "cluster" communities, "relational" a
    ///    pure who-connects-to-whom logic map with no geometry — same prim, new
    ///    style; the renderer draws whatever geometry matches, the ENGINE owns the
    ///    topology, which is the reusable, exportable part.)
    /// This makes contiguous territory (or any concept map) a REAL relationship —
    /// two regions that touch get an edge, so heat/wealth can bleed across the seam
    /// and any host can read who borders whom. Empty style = off.
    partition: Option<Partition>,
}

/// A declarative ROAD NETWORK, wired when a `parent_kind` scope is revealed: route
/// least-cost `out_edge` roads over the `via` adjacency among that scope's children
/// of `node_kind`, from the child satisfying `hub_when` (highest value), with hop
/// cost/bridge formulas over the hop midpoint. See `route_network`.
struct Route {
    parent_kind: String,
    node_kind: String,
    /// Include this scope's GATE children (crossing points a parent-level road
    /// left on it) as network nodes — the local net then CONNECTS to the artery
    /// where it enters, making circulation one system across scales.
    gates: bool,
    hub_when: super::expr::Expr,
    via: String,
    out_edge: String,
    x: String,
    y: String,
    cost: Option<super::expr::Expr>,
    /// TRANSITION (general — a bridge is just one use): a hop crossing a region where
    /// this formula holds needs a transition to be valid. If the longest contiguous
    /// crossed span ≤ `max_span`, spawn a `trans_kind` entity at the crossing and wire
    /// through it; if LONGER, the hop is REJECTED (unroutable — no fake mega-bridge).
    /// The engine never knows what a "bridge" is: dev says when a transition is needed
    /// (`transition`), how short it must be (`max_span`), and what to spawn (`trans_kind`).
    transition: Option<super::expr::Expr>,
    max_span: f32,
    trans_kind: String,
    style: String,       // "efficient" (tree) | "grid"/"redundant" (mesh) | "organic"
    redundancy: usize,   // k nearest candidates per node
}

/// A partition over a generator's spawned children — see `Generator::partition`.
struct Partition {
    style: String,   // "voronoi" | "grid" | "cluster" | "relational" | "subdivide"
    edge: String,    // edge kind wired between adjacent children
    x: String,       // child stat holding the x position (center); subdivide also writes it
    y: String,       // child stat holding the y position (center); subdivide also writes it
    weight: String,  // (subdivide) child stat for relative area weight; "" = equal
    /// Optional author WHERE-gate: a formula over `fx`,`fy` (reading any fields) that
    /// must hold (>0.5) for a position to be VALID for a seed. The engine relocates
    /// any child whose position fails the gate to the nearest valid spot. This is how
    /// a partition is SHAPED BY the world's fields — WITHOUT the engine knowing what
    /// the fields mean. The dev writes the rule: `field(elevation,fx,fy) > 0.4` for a
    /// coastal city, `field(acid,fx,fy) > 0.8` for an alien one. Empty = no gate.
    where_gate: Option<super::expr::Expr>,
    /// Optional CLIP mask: a formula over `fx`,`fy`. Each cell's TERRITORY is the part
    /// of its region where the mask holds (cell ∩ mask). The engine computes each
    /// child's clipped-area fraction into the `area` stat, and prunes adjacency edges
    /// whose shared border lies entirely in the masked-OUT region (two districts split
    /// by a river/sea are NOT neighbours). This is `cell ∩ mask` in the brain — so a
    /// district's land is real DATA (exports), and downstream generation (buildings)
    /// inherits the constraint for free. Empty = cells tessellate the whole plane.
    clip: Option<super::expr::Expr>,
    /// Optional per-cell field COVERAGE: named fields whose fraction-of-cell-area is
    /// measured and written as `<name>_frac` stats. This is how GEOGRAPHY SHAPES a
    /// zone's identity — a district learns "I'm 40% beach, 10% cliff", so its kind/
    /// character can be DERIVED from its land. Sampled on the same grid as clip.
    coverage: Vec<(String, super::expr::Expr)>,
}
// Note: fill mode (total vs gaps) is a RENDER property — carried in the world JSON
// and read by the host renderer. The engine's job is the topology (adjacency); the
// renderer decides whether cells tile every pixel or sit as discrete blobs.

pub struct World {
    pub entities: Vec<Entity>,
    pub root: EntityId,
    pub tick: u64,
    pub rng: Rng,
    pub log: Vec<Notable>,
    rollups: Vec<Rollup>,
    broadcasts: Vec<Broadcast>,
    systems: Vec<Box<dyn System>>,
    coarse_systems: Vec<Box<dyn System>>,
    unfolders: BTreeMap<String, Box<dyn Unfolder>>,
    ledger: Vec<super::canon::Claim>,
    actions: BTreeMap<String, Vec<Box<dyn Action>>>,
    intents: BTreeMap<EntityId, String>,
    last_place: BTreeMap<EntityId, EntityId>, // for through-door move: room an agent just left (anti-backtrack)
    /// Pathfound geometry per laid route edge (endpoint pair, id-ordered), in the
    /// routing scope's LOCAL coords. The road's actual curve — engine data, so
    /// renderers draw the decision, agents can walk it, gates read it.
    route_paths: BTreeMap<(EntityId, EntityId), Vec<(f32, f32)>>,
    /// EVERY laid road segment, converted to WORLD coords at lay time. Lets any
    /// scope ask "am I near a road?" through its patch — the DSL `road_near(width)`
    /// region samples this. Roads become subtractable land: a block carves its
    /// plots from `buildable − road_near(w)`, so nothing builds on an artery. The
    /// engine only reports proximity to a laid route; the dev decides it means
    /// "no building". Accumulated across every route_network call (all levels).
    world_roads: Vec<((f32, f32), (f32, f32))>,
    /// Carved region per parcel (mask-aware subdivide): (cell size, owned cell
    /// centres in the parent's LOCAL 0..1). The parcel's TRUE shape as engine
    /// data — boundary/ownership is world logic, not a render artifact.
    regions: BTreeMap<EntityId, (f32, Vec<(f32, f32)>)>,
    edges: Vec<super::graph::Edge>,
    adjacency: Vec<Vec<usize>>, // per-entity list of edge indices → neighbors() is O(degree), not O(all edges)
    rules: Vec<super::expr::Rule>,
    data_actions: BTreeMap<String, Vec<super::action::DataAction>>,
    last_actions: BTreeMap<EntityId, String>,
    events: Vec<Event>,
    generators: Vec<Generator>,
    coarse_rules: Vec<super::expr::Rule>,
    /// Named continuous FIELDS over the unit square — the substrate for layered
    /// worlds. Each is a formula in `fx`,`fy` (the sample point). Elevation, moisture,
    /// danger… A river flows down `elevation`; roads route around `water`. Sample any
    /// field at any point with `sample_field`, or in a formula via `field(name,x,y)`.
    fields: BTreeMap<String, super::expr::Expr>,
    /// Rules that run ONCE, at reveal, iterated to convergence over the newly
    /// materialized subtree — worldgen decisions, not per-tick sim. Land use, zoning
    /// saturation: things DECIDED as the world crystallizes on observation and then
    /// FROZEN (never touched by the per-tick loop, so they can't bounce). Same shape
    /// as a rule; the difference is WHEN it runs. Applied in scale order (parents
    /// before children) so cross-scale signals (a district's saturation) settle.
    settle_rules: Vec<super::expr::Rule>,
    /// How many convergence iterations a reveal-settle runs.
    settle_iters: usize,
    routes: Vec<Route>,
    depth: Vec<u32>,
    base_seed: u64,
    // ---- built-in instrumentation (the content oracle, as an engine prim) ----
    recording: bool,
    act_counts: BTreeMap<String, u64>,   // "kind:action" -> times chosen
    event_counts: BTreeMap<String, u64>, // event label -> times fired (0 = defined, never fired)
    watched: Vec<String>,                // kinds whose live headcount we sample each tick
    kind_peak: BTreeMap<String, u64>,
    kind_sum: BTreeMap<String, u64>,
    record_ticks: u64,
    // ---- perf: index by kind + cached traversal order (see step()) ----
    kind_index: BTreeMap<String, Vec<EntityId>>,
    order_cache: Vec<EntityId>, // entity ids, shallow→deep; rebuilt only when the tree changes
    order_dirty: bool,
}

impl World {
    pub fn new(seed: u64) -> Self {
        let root = Entity {
            id: 0,
            kind: "world".into(),
            name: "world".into(),
            stats: Default::default(),
            parent: None,
            children: Vec::new(),
            fidelity: Fidelity::Detailed, // the world is always "on"
            focus: 1.0,
            facts: Vec::new(),
            revealed: true,
            dead: false,
            infra: false,
        };
        World {
            entities: vec![root],
            root: 0,
            tick: 0,
            rng: Rng::new(seed),
            log: Vec::new(),
            rollups: Vec::new(),
            broadcasts: Vec::new(),
            systems: Vec::new(),
            coarse_systems: Vec::new(),
            unfolders: BTreeMap::new(),
            ledger: Vec::new(),
            actions: BTreeMap::new(),
            intents: BTreeMap::new(),
            last_place: BTreeMap::new(),
            regions: BTreeMap::new(),
            route_paths: BTreeMap::new(),
            world_roads: Vec::new(),
            edges: Vec::new(),
            adjacency: vec![Vec::new()], // root's (empty) adjacency list
            rules: Vec::new(),
            data_actions: BTreeMap::new(),
            last_actions: BTreeMap::new(),
            events: Vec::new(),
            generators: Vec::new(),
            coarse_rules: Vec::new(),
            fields: BTreeMap::new(),
            settle_rules: Vec::new(),
            settle_iters: 12,
            routes: Vec::new(),
            depth: vec![0],
            base_seed: seed,
            recording: false,
            act_counts: BTreeMap::new(),
            event_counts: BTreeMap::new(),
            watched: Vec::new(),
            kind_peak: BTreeMap::new(),
            kind_sum: BTreeMap::new(),
            record_ticks: 0,
            kind_index: {
                let mut m = BTreeMap::new();
                m.insert("world".to_string(), vec![0]);
                m
            },
            order_cache: Vec::new(),
            order_dirty: true,
        }
    }

    /// Add an entity as a child of `parent`, returning its id.
    pub fn spawn(&mut self, kind: &str, name: &str, parent: EntityId) -> EntityId {
        let id = self.entities.len();
        let d = self.depth[parent] + 1;
        self.entities.push(Entity {
            id,
            kind: kind.to_string(),
            name: name.to_string(),
            stats: Default::default(),
            parent: Some(parent),
            children: Vec::new(),
            fidelity: Fidelity::Detailed,
            focus: 0.0,
            facts: Vec::new(),
            revealed: false,
            dead: false,
            infra: false,
        });
        self.entities[parent].children.push(id);
        self.depth.push(d);
        self.kind_index.entry(kind.to_string()).or_default().push(id);
        self.adjacency.push(Vec::new());
        self.order_dirty = true;
        id
    }

    /// Move an entity to a new parent in the tree — real location change. Used by
    /// the `Move` action effect so people physically go places (home/work/beach).
    pub fn reparent(&mut self, entity: EntityId, new_parent: EntityId) {
        if let Some(old) = self.entities[entity].parent {
            if old == new_parent {
                return;
            }
            self.entities[old].children.retain(|&c| c != entity);
        }
        self.entities[entity].parent = Some(new_parent);
        self.entities[new_parent].children.push(entity);
        let d = self.depth[new_parent] + 1;
        self.set_depth_rec(entity, d);
        self.order_dirty = true; // depths changed → cached traversal order is stale
    }

    fn set_depth_rec(&mut self, id: EntityId, d: u32) {
        self.depth[id] = d;
        for c in self.children(id) {
            self.set_depth_rec(c, d + 1);
        }
    }

    // --- reads ---
    pub fn name(&self, id: EntityId) -> &str {
        &self.entities[id].name
    }
    pub fn kind(&self, id: EntityId) -> &str {
        &self.entities[id].kind
    }
    pub fn stat(&self, id: EntityId, key: &str) -> f32 {
        self.entities[id].stat(key)
    }
    pub fn children(&self, id: EntityId) -> Vec<EntityId> {
        self.entities[id].children.clone()
    }

    /// The entity's co-located peers: its parent's OTHER live children (everyone
    /// "here in the same room/scope", excluding itself). This is topological
    /// proximity — same scope = same place. Backs the `here_*` aggregators and the
    /// `co:` interaction target so an agent can sense and act on whoever shares its
    /// current location, without needing pre-wired edges to them.
    pub fn siblings(&self, id: EntityId) -> Vec<EntityId> {
        match self.entities[id].parent {
            Some(p) => self.entities[p].children.iter().copied()
                .filter(|&c| c != id && !self.entities[c].dead).collect(),
            None => Vec::new(),
        }
    }
    pub fn parent(&self, id: EntityId) -> Option<EntityId> {
        self.entities[id].parent
    }
    pub fn by_kind(&self, kind: &str) -> Vec<EntityId> {
        match self.kind_index.get(kind) {
            Some(ids) => ids.iter().copied().filter(|&i| !self.entities[i].dead).collect(),
            None => Vec::new(),
        }
    }

    /// Death: tombstone the entity and unlink it from its parent. Its id stays
    /// valid but it vanishes from every iteration and aggregation.
    pub fn despawn(&mut self, entity: EntityId) {
        self.entities[entity].dead = true;
        if let Some(p) = self.entities[entity].parent {
            self.entities[p].children.retain(|&c| c != entity);
        }
        self.order_dirty = true; // dead ids stay in kind_index but are filtered on read
    }

    // --- writes (systems use these) ---
    pub fn set(&mut self, id: EntityId, key: &str, v: f32) {
        self.entities[id].set(key, v);
    }
    pub fn add(&mut self, id: EntityId, key: &str, delta: f32) {
        self.entities[id].add(key, delta);
    }
    pub fn note(&mut self, message: impl Into<String>) {
        let tick = self.tick;
        self.log.push(Notable { tick, message: message.into() });
    }

    // --- the input channel: an action at any scale ---
    pub fn act_set(&mut self, id: EntityId, key: &str, v: f32) {
        self.entities[id].set(key, v);
    }
    pub fn act_add(&mut self, id: EntityId, key: &str, delta: f32) {
        self.entities[id].add(key, delta);
    }

    // --- wiring ---
    pub fn add_system(&mut self, s: Box<dyn System>) {
        self.systems.push(s);
    }
    pub fn add_coarse_system(&mut self, s: Box<dyn System>) {
        self.coarse_systems.push(s);
    }
    pub fn add_rollup(&mut self, r: Rollup) {
        self.rollups.push(r);
    }
    pub fn add_broadcast(&mut self, b: Broadcast) {
        self.broadcasts.push(b);
    }

    /// Add a behavior authored as data: `set` stat := `formula` each tick, for
    /// every entity of `on_kind`. The formula is parsed once; a bad one errors.
    pub fn add_rule(&mut self, on_kind: &str, set: &str, formula: &str) -> Result<(), String> {
        let expr = super::expr::parse(formula)?;
        self.rules.push(super::expr::Rule { on_kind: on_kind.to_string(), set_stat: set.to_string(), expr });
        Ok(())
    }

    /// Like `add_rule`, but runs on the *frontier* — the Coarse/Hazed nodes just
    /// outside the camera path. This is the cheap offscreen sim: a district you
    /// aren't standing in still drifts (tension creeps, rent ticks) as one
    /// aggregate node, so you zoom back out and the world has moved on.
    pub fn add_coarse_rule(&mut self, on_kind: &str, set: &str, formula: &str) -> Result<(), String> {
        let expr = super::expr::parse(formula)?;
        self.coarse_rules.push(super::expr::Rule { on_kind: on_kind.to_string(), set_stat: set.to_string(), expr });
        Ok(())
    }

    /// A SETTLE rule: runs ONCE at reveal (not per tick), iterated to convergence
    /// over the just-materialized subtree, then frozen. For worldgen decisions —
    /// land use, zoning saturation — that crystallize on observation and hold.
    pub fn add_settle_rule(&mut self, on_kind: &str, set: &str, formula: &str) -> Result<(), String> {
        let expr = super::expr::parse(formula)?;
        self.settle_rules.push(super::expr::Rule { on_kind: on_kind.to_string(), set_stat: set.to_string(), expr });
        Ok(())
    }

    /// Set how many convergence passes a reveal-settle runs (default 12).
    pub fn set_settle_iters(&mut self, n: usize) { self.settle_iters = n.max(1); }

    /// Run the settle rules over `root` and its whole subtree, `settle_iters` times,
    /// in scale order (root → leaves) each pass so cross-scale signals propagate.
    /// This is the crystallize-on-observation step: it converges the worldgen
    /// decisions ONCE, at reveal, so the per-tick loop never has to (and never
    /// bounces them). Rollups needed by settle rules are also run each pass, so a
    /// child's presence flag feeds the parent's saturation within the settle.
    fn settle_subtree(&mut self, root: EntityId) {
        if self.settle_rules.is_empty() { return; }
        // subtree in scale order (BFS from root — parents before children)
        let mut order: Vec<EntityId> = Vec::new();
        let mut queue = std::collections::VecDeque::new();
        queue.push_back(root);
        while let Some(n) = queue.pop_front() {
            order.push(n);
            for c in self.children(n) { queue.push_back(c); }
        }
        let rules = std::mem::take(&mut self.settle_rules);
        let rollups = std::mem::take(&mut self.rollups);
        for _ in 0..self.settle_iters {
            // rules top-down (parents first, so a child reads a fresh parent stat)
            for &id in &order {
                let kind = self.entities[id].kind.clone();
                for r in &rules {
                    if r.on_kind == kind {
                        let v = r.expr.eval(self, id);
                        self.set(id, &r.set_stat, v);
                    }
                }
            }
            // rollups bottom-up (children → parents), so presence flags set this pass
            // feed the ancestor saturations the NEXT pass — the feedback converges.
            for &id in order.iter().rev() {
                let kind = self.entities[id].kind.clone();
                for r in &rollups {
                    if r.parent_kind == kind {
                        let kids = self.entities[id].children.clone();
                        let vals: Vec<f32> = kids.iter().map(|&c| self.entities[c].stat(&r.child_stat)).collect();
                        let v = r.reducer.reduce(&vals);
                        self.entities[id].set(&r.parent_stat, v);
                    }
                }
            }
        }
        self.settle_rules = rules;
        self.rollups = rollups;
    }

    /// Add a data-authored action for `kind`: a `score` formula and effects
    /// (stat, formula, additive). Parsed once; a bad formula errors.
    pub fn add_data_action(&mut self, kind: &str, name: &str, score: &str, effects: Vec<(String, String, String)>) -> Result<(), String> {
        let score = super::expr::parse(score)?;
        let mut evs = Vec::new();
        for (op, target, formula) in effects {
            evs.push(Self::build_effect(&op, target, formula)?);
        }
        self.data_actions.entry(kind.to_string()).or_default().push(super::action::DataAction { name: name.to_string(), score, effects: evs });
        Ok(())
    }

    /// Add a data-authored event: when `when` (a formula) first becomes true for
    /// an entity of `on_kind`, apply `effects` and log `label`.
    pub fn add_event(&mut self, on_kind: &str, when: &str, effects: Vec<(String, String, String)>, label: &str) -> Result<(), String> {
        let when = super::expr::parse(when)?;
        let mut evs = Vec::new();
        for (op, target, formula) in effects {
            evs.push(Self::build_effect(&op, target, formula)?);
        }
        self.events.push(Event { on_kind: on_kind.to_string(), when, effects: evs, label: label.to_string(), fired: BTreeMap::new() });
        self.event_counts.entry(label.to_string()).or_insert(0); // so "defined but never fired" is visible
        Ok(())
    }

    /// Define a named continuous FIELD over the unit square: a formula in `fx`,`fy`
    /// (the sample point), e.g. elevation = `noise(fx,fy)*0.7 + (1 - abs(fx-0.5)*2)*0.3`.
    /// Fields are the substrate for LAYERED worlds — terrain the city reads.
    pub fn add_field(&mut self, name: &str, formula: &str) -> Result<(), String> {
        let expr = super::expr::parse(formula)?;
        self.fields.insert(name.to_string(), expr);
        Ok(())
    }

    /// Register a declarative road network (fires when a `parent_kind` scope reveals).
    #[allow(clippy::too_many_arguments)]
    #[allow(clippy::too_many_arguments)]
    pub fn add_route(&mut self, parent_kind: &str, node_kind: &str, hub_when: &str, via: &str, out_edge: &str, x: &str, y: &str, cost: &str, transition: &str, max_span: f32, trans_kind: &str, style: &str, redundancy: u32, gates: bool) -> Result<(), String> {
        let hub_when = super::expr::parse(hub_when)?;
        let cost = if cost.trim().is_empty() { None } else { Some(super::expr::parse(cost)?) };
        let transition = if transition.trim().is_empty() { None } else { Some(super::expr::parse(transition)?) };
        self.routes.push(Route {
            parent_kind: parent_kind.to_string(), node_kind: node_kind.to_string(), gates, hub_when, via: via.to_string(),
            out_edge: out_edge.to_string(), x: x.to_string(), y: y.to_string(), cost,
            transition, max_span: if max_span <= 0.0 { 0.25 } else { max_span }, trans_kind: trans_kind.to_string(),
            style: if style.is_empty() { "efficient".to_string() } else { style.to_string() },
            redundancy: redundancy.max(2) as usize,
        });
        Ok(())
    }

    /// Sample a named field at (x,y) in unit space. Unknown field → 0.
    pub fn sample_field(&self, name: &str, x: f32, y: f32) -> f32 {
        match self.fields.get(name) {
            Some(e) => e.sample(self, x, y),
            None => 0.0,
        }
    }
    /// Exposed for the field noise() function (deterministic per world).
    pub fn base_seed_pub(&self) -> u64 {
        self.base_seed
    }

    /// Trace a river: start at the highest of several seeded points and walk DOWNHILL
    /// on the `elevation` field, step by step, until it reaches the low edge or the
    /// sea. Returns the path as unit-space points — geography the city is built around.
    /// Deterministic. The renderer draws it; districts it passes become "riverside".
    pub fn river_trace(&self, elevation: &str, steps: usize) -> Vec<(f32, f32)> {
        // pick a source: sample a few candidates, start at the highest.
        let mut src = (0.5f32, 0.1f32);
        let mut best = -1.0f32;
        for i in 0..7 {
            let hx = super::expr::sample_hash(self.base_seed, i * 2) ;
            let hy = super::expr::sample_hash(self.base_seed, i * 2 + 1);
            let h = self.sample_field(elevation, hx, hy);
            if h > best { best = h; src = (hx, hy); }
        }
        let mut path = vec![src];
        let (mut x, mut y) = src;
        let step = 1.0 / steps as f32;
        for _ in 0..steps {
            // gradient descent: sample neighbours, move toward the lowest.
            let mut bx = x;
            let mut by = y;
            let mut bh = self.sample_field(elevation, x, y);
            let d = step;
            for (dx, dy) in [(-d, 0.0), (d, 0.0), (0.0, -d), (0.0, d), (-d, -d), (d, d), (-d, d), (d, -d)] {
                let (nx, ny) = ((x + dx).clamp(0.0, 1.0), (y + dy).clamp(0.0, 1.0));
                let nh = self.sample_field(elevation, nx, ny);
                if nh < bh { bh = nh; bx = nx; by = ny; }
            }
            if bx == x && by == y {
                // in a pit — nudge toward the nearest edge so the river reaches water
                by = (y + step).min(1.0);
                bx = x;
            }
            x = bx; y = by;
            path.push((x, y));
            if x <= 0.001 || x >= 0.999 || y <= 0.001 || y >= 0.999 { break; }
        }
        path
    }

    /// Compute the generic flow/watershed grids for a field: pit-filled surface,
    /// pool depth (basins = lakes), downstream direction, flow accumulation.
    /// The domain-agnostic sibling of `river_trace` — see [`super::flow::FlowMap`].
    pub fn flow_map(&self, field: &str, n: usize) -> super::flow::FlowMap {
        super::flow::FlowMap::compute(self, field, n)
    }

    /// Register a data-driven generator (runs when an `on_kind` entity is revealed).
    pub fn add_generator(&mut self, on_kind: &str, spawn_kind: &str, count: &str, child_stats: Vec<(String, String)>) -> Result<(), String> {
        self.add_generator_ex(on_kind, spawn_kind, count, child_stats, false, "", false, None)
    }

    /// As `add_generator`, plus `cascade` (reveal each child so its generators fire —
    /// multi-scale worldgen), `chain`/`chain_ring` (route graph — topological space),
    /// and `partition` (style, edge, x-stat, y-stat) — adjacency over the children.
    pub fn add_generator_ex(&mut self, on_kind: &str, spawn_kind: &str, count: &str, child_stats: Vec<(String, String)>, cascade: bool, chain: &str, chain_ring: bool, partition: Option<(String, String, String, String, String, String, String, Vec<(String, String)>)>) -> Result<(), String> {
        let count = super::expr::parse(count)?;
        let mut cs = Vec::new();
        for (stat, formula) in child_stats {
            cs.push((stat, super::expr::parse(&formula)?));
        }
        let partition = match partition {
            Some((style, edge, x, y, weight, where_src, clip_src, coverage_src)) => {
                let where_gate = if where_src.trim().is_empty() { None } else { Some(super::expr::parse(&where_src)?) };
                let clip = if clip_src.trim().is_empty() { None } else { Some(super::expr::parse(&clip_src)?) };
                let mut coverage = Vec::new();
                for (name, formula) in coverage_src {
                    coverage.push((name, super::expr::parse(&formula)?));
                }
                Some(Partition { style, edge, x, y, weight, where_gate, clip, coverage })
            }
            None => None,
        };
        self.generators.push(Generator { on_kind: on_kind.to_string(), spawn_kind: spawn_kind.to_string(), count, child_stats: cs, cascade, chain: chain.to_string(), chain_ring, partition });
        Ok(())
    }

    /// The name of the action an entity most recently took (data actions).
    pub fn last_action(&self, id: EntityId) -> Option<&str> {
        self.last_actions.get(&id).map(|s| s.as_str())
    }

    // ---- instrumentation: the content oracle, built in ----

    /// Turn recording on/off. While on, `step()` tallies every action chosen,
    /// every event fired, and the live headcount of any watched kind — all
    /// deterministically, at near-zero cost. This is what makes "sim it N times,
    /// tell me what content it needs" a property of the ENGINE, not each host.
    pub fn record(&mut self, on: bool) {
        self.recording = on;
    }
    /// Sample this kind's live headcount each tick (peak + average) — a crowd /
    /// spawn budget falls straight out.
    pub fn watch(&mut self, kind: &str) {
        self.watched.push(kind.to_string());
    }
    /// "kind:action" -> how many times it was chosen while recording.
    pub fn action_tally(&self) -> &BTreeMap<String, u64> {
        &self.act_counts
    }
    /// event label -> times fired (0 for events that were defined but never fired).
    pub fn event_tally(&self) -> &BTreeMap<String, u64> {
        &self.event_counts
    }
    /// Every data-action the world DEFINES, as (kind, name) — so a report can flag
    /// the ones the tally never exercised (dead / over-scoped content).
    pub fn action_names(&self) -> Vec<(String, String)> {
        let mut v = Vec::new();
        for (k, acts) in &self.data_actions {
            for a in acts {
                v.push((k.clone(), a.name.clone()));
            }
        }
        v
    }
    pub fn peak(&self, kind: &str) -> u64 {
        *self.kind_peak.get(kind).unwrap_or(&0)
    }
    pub fn avg_count(&self, kind: &str) -> f64 {
        let s = *self.kind_sum.get(kind).unwrap_or(&0);
        if self.record_ticks == 0 { 0.0 } else { s as f64 / self.record_ticks as f64 }
    }

    // ---- Simulation-LOD ----

    pub fn fidelity(&self, id: EntityId) -> Fidelity {
        self.entities[id].fidelity
    }
    pub fn is_coarse(&self, id: EntityId) -> bool {
        self.entities[id].fidelity == Fidelity::Coarse
    }

    // ---- the camera: focus + feathered fidelity ----

    pub fn focus(&self, id: EntityId) -> f32 {
        self.entities[id].focus
    }
    pub fn set_focus(&mut self, id: EntityId, f: f32) {
        self.entities[id].focus = f.clamp(0.0, 1.0);
    }
    /// Set one node's fidelity without touching its subtree (fold/unfold apply
    /// only to the node; the camera manages bands per level explicitly).
    pub fn set_node_fidelity(&mut self, id: EntityId, f: Fidelity) {
        self.entities[id].fidelity = f;
    }

    /// True if every ancestor above `id` is Detailed — i.e., `id` is simulated
    /// at full fidelity rather than folded into a coarse-or-hazed ancestor. A
    /// Hazed ancestor means the shape is drawn but the subtree is still dormant.
    /// Walks ancestors; short-circuits on the first non-Detailed one. (Measured:
    /// caching this bought nothing — the walk is never the hot path; the per-tick
    /// cost is Vec allocation + formula eval, so the cache was removed.)
    pub fn is_active(&self, id: EntityId) -> bool {
        let mut cur = self.entities[id].parent;
        while let Some(p) = cur {
            if self.entities[p].fidelity != Fidelity::Detailed {
                return false;
            }
            cur = self.entities[p].parent;
        }
        true
    }

    /// The ring of not-yet-live nodes just outside the Detailed camera path — a
    /// node that is Coarse/Hazed but whose parent is Detailed. These are the
    /// "ideas" you can see around where you're looking; coarse rules drift them
    /// cheaply so the offscreen world keeps moving without full simulation.
    pub fn frontier(&self) -> Vec<EntityId> {
        self.entities
            .iter()
            .filter(|e| {
                !e.dead
                    && e.fidelity != Fidelity::Detailed
                    && e.parent.map(|p| self.entities[p].fidelity == Fidelity::Detailed).unwrap_or(false)
            })
            .map(|e| e.id)
            .collect()
    }

    /// Entities of `kind` being fully detail-simulated right now.
    pub fn active_by_kind(&self, kind: &str) -> Vec<EntityId> {
        match self.kind_index.get(kind) {
            Some(ids) => ids.iter().copied().filter(|&i| !self.entities[i].dead && self.is_active(i)).collect(),
            None => Vec::new(),
        }
    }

    /// Coarse scopes at the boundary (reachable through Detailed ancestors but
    /// themselves Coarse) — they evolve as cheap aggregates, subtree dormant.
    pub fn coarse_frontier_by_kind(&self, kind: &str) -> Vec<EntityId> {
        match self.kind_index.get(kind) {
            Some(ids) => ids.iter().copied().filter(|&i| !self.entities[i].dead && self.entities[i].fidelity == Fidelity::Coarse && self.is_active(i)).collect(),
            None => Vec::new(),
        }
    }

    pub fn set_subtree_fidelity(&mut self, id: EntityId, f: Fidelity) {
        self.entities[id].fidelity = f;
        for c in self.children(id) {
            self.set_subtree_fidelity(c, f);
        }
    }

    /// Zoom out: fold a scope into a cheap aggregate (its children go dormant).
    pub fn fold(&mut self, id: EntityId) {
        self.entities[id].fidelity = Fidelity::Coarse;
    }

    /// Zoom in: re-detail a scope. Pair with `crystallize` to re-materialize its
    /// children consistent with the aggregate that drifted while it was coarse.
    pub fn unfold(&mut self, id: EntityId) {
        self.entities[id].fidelity = Fidelity::Detailed;
    }

    // ---- STREAMING HELPERS (observation-layer rect API) --------------------
    // A host camera speaks WORLD RECTS, not entity ids: "my window (+ lookahead
    // margin) is here — keep it warm." These are packaged with the engine so a
    // streaming/walkable game is first-class, not something every host reinvents
    // (an LOD world engine that only supports point-and-click would refute its
    // own pitch). NO new sim vocabulary — pure observation, exactly like
    // reveal/fold: reveal_rect materializes canon where the camera will be,
    // fold_outside drops what it left behind back to coarse aggregates.
    // Determinism: candidates scan in ascending id (spawn order), so the same
    // camera path always produces the same reveal sequence — and since canon is
    // observation-ordered BY DESIGN (cross-scope scarcity accumulates as you
    // explore), same path ⇒ same world, replayable.

    /// Reveal every entity of `kind` whose world patch (wx0..wy1 stats) intersects
    /// the rect (first visit → canon written; returning folded scope → unfolded).
    /// Returns the affected ids (ascending — deterministic) so hosts can post-
    /// process (e.g. park fresh children coarse). Entities without a patch
    /// (wx1 ≤ wx0 — never placed) are skipped.
    pub fn reveal_rect(&mut self, x0: f32, y0: f32, x1: f32, y1: f32, kind: &str) -> Vec<EntityId> {
        let ids = self.by_kind(kind);
        let mut touched = Vec::new();
        for id in ids {
            let (wx0, wy0) = (self.stat(id, "wx0"), self.stat(id, "wy0"));
            let (wx1, wy1) = (self.stat(id, "wx1"), self.stat(id, "wy1"));
            if wx1 <= wx0 || wy1 <= wy0 {
                continue;
            }
            if !(wx0 < x1 && wx1 > x0 && wy0 < y1 && wy1 > y0) {
                continue;
            }
            if !self.entities[id].revealed {
                self.reveal(id);           // first visit: write canon
                touched.push(id);
            } else if self.entities[id].fidelity == Fidelity::Coarse {
                self.unfold(id);           // returning: re-detail the folded scope
                touched.push(id);
            }
        }
        touched
    }

    /// Fold every REVEALED entity of `kind` whose patch lies fully OUTSIDE the
    /// rect back to a coarse aggregate (children stay materialized but dormant —
    /// canon is never un-written, this is the memory half of streaming). Returns
    /// how many were folded.
    pub fn fold_outside(&mut self, x0: f32, y0: f32, x1: f32, y1: f32, kind: &str) -> usize {
        let ids = self.by_kind(kind);
        let mut n = 0;
        for id in ids {
            if !self.entities[id].revealed || self.entities[id].fidelity == Fidelity::Coarse {
                continue;
            }
            let (wx0, wy0) = (self.stat(id, "wx0"), self.stat(id, "wy0"));
            let (wx1, wy1) = (self.stat(id, "wx1"), self.stat(id, "wy1"));
            if wx1 <= wx0 || wy1 <= wy0 {
                continue;
            }
            if wx1 <= x0 || wx0 >= x1 || wy1 <= y0 || wy0 >= y1 {
                self.fold(id);
                n += 1;
            }
        }
        n
    }

    /// Distribute a parent's aggregate stat down onto each child (with seeded
    /// jitter) — turning a statistic back into plausible individuals.
    pub fn crystallize(&mut self, parent: EntityId, parent_stat: &str, child_stat: &str, spread: f32) {
        let base = self.entities[parent].stat(parent_stat);
        for c in self.children(parent) {
            let jitter = (self.rng.next_f32() * 2.0 - 1.0) * spread;
            self.entities[c].set(child_stat, (base + jitter).clamp(0.0, 1.0));
        }
    }

    // ---- Canon (lazy, observation-driven) ----

    /// A stable per-entity seed: same entity always canonizes the same way,
    /// independent of when it's observed. (The aggregate STATE at reveal time
    /// still decides the WHAT; this seed only flavors the specifics.)
    pub fn entity_seed(&self, id: EntityId) -> u64 {
        self.base_seed ^ (id as u64).wrapping_mul(0x9E37_79B9_7F4A_7C15)
    }

    pub fn add_fact(&mut self, id: EntityId, fact: impl Into<String>) {
        self.entities[id].facts.push(fact.into());
    }
    pub fn facts(&self, id: EntityId) -> &[String] {
        &self.entities[id].facts
    }
    pub fn is_revealed(&self, id: EntityId) -> bool {
        self.entities[id].revealed
    }
    /// Was this entity spawned by the engine as circulation infrastructure
    /// (shore gates, transition spans)? Hosts filter navigable sub-scope lists
    /// on this, never on kind names.
    pub fn is_infra(&self, id: EntityId) -> bool {
        self.entities[id].infra
    }

    /// A carved parcel's TRUE shape: (cell size, owned cell centres) in the
    /// parent's local 0..1 space. Present for mask-aware `subdivide` parcels.
    /// Renderers draw this instead of the bounding box (a concave coastal parcel's
    /// bbox lies about it); logic can iterate it for occupancy/containment.
    pub fn region_cells(&self, id: EntityId) -> Option<(f32, &[(f32, f32)])> {
        self.regions.get(&id).map(|(c, v)| (*c, v.as_slice()))
    }

    /// TOPOLOGICAL COLLISION: which of `parent`'s carved parcels owns the local
    /// point (x, y)? None = unowned ground (water, unparcelled land). This is
    /// boundary data as world LOGIC — "the NPC crossed into block 4" is an engine
    /// fact a host or rule can react to, not a render-side guess. (Physics-grade
    /// collision stays the renderer's job; the engine owns ownership.)
    pub fn region_at(&self, parent: EntityId, x: f32, y: f32) -> Option<EntityId> {
        for &c in &self.entities[parent].children {
            if let Some((cell, cs)) = self.region_cells(c) {
                let half = cell / 2.0;
                if cs.iter().any(|&(px, py)| (px - x).abs() <= half && (py - y).abs() <= half) {
                    return Some(c);
                }
            }
        }
        None
    }

    /// Register the canon generator for a kind of entity.
    pub fn set_unfolder(&mut self, kind: &str, u: Box<dyn Unfolder>) {
        self.unfolders.insert(kind.to_string(), u);
    }

    /// Focus the lens all the way: `id` becomes Detailed (its own game ticks) and
    /// — the first time ever — its canon is written. Nothing existed here until
    /// observed; now it's canon, and it can spread.
    pub fn reveal(&mut self, id: EntityId) {
        self.entities[id].fidelity = Fidelity::Detailed;
        self.write_canon(id);
    }

    /// The feather: resolve `id`'s *structure* (spawn its children, write its
    /// canon) but leave it Hazed — the shape is visible, the individuals dormant.
    /// Freshly generated children are parked as Coarse "ideas" of the next level.
    pub fn reveal_structure(&mut self, id: EntityId) {
        if self.entities[id].fidelity != Fidelity::Detailed {
            self.entities[id].fidelity = Fidelity::Hazed;
        }
        self.write_canon(id);
        for c in self.children(id) {
            if !self.entities[c].revealed {
                self.entities[c].fidelity = Fidelity::Coarse;
            }
        }
    }

    /// Write persistent canon for `id` the first time it is observed: run its
    /// kind's Unfolder, then its data generators (formula-counted, formula-inited
    /// children). Idempotent — the `revealed` flag guards it, so revisiting a
    /// place never rewrites or duplicates what's already true about it.
    fn write_canon(&mut self, id: EntityId) {
        if self.entities[id].revealed {
            return;
        }
        self.entities[id].revealed = true;
        let kind = self.entities[id].kind.clone();
        if let Some(u) = self.unfolders.remove(&kind) {
            u.unfold(self, id);
            self.unfolders.insert(kind.clone(), u);
        }
        // Data-driven generators: spawn formula-counted children, formula-inited.
        let gens = std::mem::take(&mut self.generators);
        let mut cascade_kids: Vec<EntityId> = Vec::new();
        for g in &gens {
            if g.on_kind != kind {
                continue;
            }
            let n = g.count.eval(self, id).round().max(0.0) as usize;
            let mut spawned: Vec<EntityId> = Vec::with_capacity(n);
            for i in 0..n {
                let name = format!("{} {}", g.spawn_kind, i + 1);
                let child = self.spawn(&g.spawn_kind, &name, id);
                self.set(child, "index", i as f32);
                // Evaluated in AUTHOR order against the child itself, so a later
                // stat's formula can read an earlier one by name ("radius", then
                // "cx": "0.5 + radius*cos(angle)"). A not-yet-set stat reads 0.
                for (stat, formula) in &g.child_stats {
                    let v = formula.eval(self, child);
                    self.set(child, stat, v);
                }
                spawned.push(child);
                if g.cascade {
                    cascade_kids.push(child);
                }
            }
            // Chain: wire consecutive spawned siblings into a route graph (a corridor
            // of rooms joined by `door`s) so agents can `move` along it. `chain_ring`
            // closes the loop. This is topological space authored as data.
            if !g.chain.is_empty() && spawned.len() > 1 {
                for w in spawned.windows(2) {
                    self.link(w[0], w[1], &g.chain, 1.0);
                }
                if g.chain_ring {
                    self.link(spawned[spawned.len() - 1], spawned[0], &g.chain, 1.0);
                }
            }
            // Partition: wire adjacency (who-borders-whom) among the spawned children.
            if let Some(part) = &g.partition {
                if spawned.len() > 1 {
                    self.wire_partition(&spawned, part);
                }
            }
        }
        self.generators = gens; // restore BEFORE cascading, so children's generators are found

        // ROUTES: wire road networks over this scope's now-adjacent children. Runs
        // after generators/partition so the adjacency graph exists. Circulation reads
        // the territory + terrain the earlier layers built.
        let routes = std::mem::take(&mut self.routes);
        for r in &routes {
            if r.parent_kind != kind { continue; }
            let mut net: Vec<EntityId> = self.children(id).into_iter().filter(|&c| self.kind(c) == r.node_kind).collect();
            // GATES: the crossing points a parent-level road left on THIS scope
            // (spawned by spawn_gates when the parent routed). Including them makes
            // the local network CONNECT to the artery where it actually enters —
            // circulation refines fractally instead of overlaying blindly.
            if r.gates {
                net.extend(self.children(id).into_iter().filter(|&c| self.kind(c) == "gate"));
            }
            if net.len() < 2 { continue; }
            // hub = the node with the highest `hub_when` value
            let hub = *net.iter().max_by(|&&a, &&b| {
                r.hub_when.eval(self, a).partial_cmp(&r.hub_when.eval(self, b)).unwrap_or(std::cmp::Ordering::Equal)
            }).unwrap();
            // this scope's world patch — so route cost/transition sampling reads THIS
            // scope's slice of the terrain fields (fractal remap), same as partitions.
            let (px0, py0, px1, py1) = (self.stat(id, "wx0"), self.stat(id, "wy0"), self.stat(id, "wx1"), self.stat(id, "wy1"));
            let patch = if px1 > px0 && py1 > py0 { (px0, py0, px1 - px0, py1 - py0) } else { (0.0, 0.0, 1.0, 1.0) };
            self.route_network(&net, hub, &r.via, &r.out_edge, &r.x, &r.y, r.cost.as_ref(), r.transition.as_ref(), r.max_span, &r.trans_kind, &r.style, r.redundancy, patch);
        }
        self.routes = routes;

        // SETTLE: crystallize the worldgen decisions for the just-materialized
        // subtree ONCE, now, at reveal — land use, zoning saturation — then freeze.
        // The per-tick loop never touches these (they're settle_rules, not rules), so
        // buildings can't bounce as the sim runs. Observation collapses the possibility
        // into canon. We settle from `id` (this scope + its new children), then push
        // the new civic counts UP the ancestor chain so cross-block/district scarcity
        // accumulates as you dive further (block 2's clinic suppresses block 5's).
        if !self.settle_rules.is_empty() {
            self.settle_subtree(id);
            self.settle_ancestors(id);
        }

        // Cascade: reveal each flagged child now, recursively materializing the next
        // scale down (city → districts → citizens) in one pass from a single seed.
        for child in cascade_kids {
            self.write_canon(child);
        }
    }

    /// After a scope settles, refresh its ANCESTORS' rollups + settle rules so a
    /// newly-revealed block's civic counts flow up to the district (whose saturation
    /// then suppresses the next block you dive into). Walks id → root once.
    fn settle_ancestors(&mut self, id: EntityId) {
        let rules = std::mem::take(&mut self.settle_rules);
        let rollups = std::mem::take(&mut self.rollups);
        let mut cur = self.entities[id].parent;
        while let Some(p) = cur {
            let kind = self.entities[p].kind.clone();
            // roll children → this ancestor
            for r in &rollups {
                if r.parent_kind == kind {
                    let kids = self.entities[p].children.clone();
                    let vals: Vec<f32> = kids.iter().map(|&c| self.entities[c].stat(&r.child_stat)).collect();
                    let v = r.reducer.reduce(&vals);
                    self.entities[p].set(&r.parent_stat, v);
                }
            }
            // recompute this ancestor's settle stats (e.g. its saturation)
            for r in &rules {
                if r.on_kind == kind {
                    let v = r.expr.eval(self, p);
                    self.set(p, &r.set_stat, v);
                }
            }
            cur = self.entities[p].parent;
        }
        self.settle_rules = rules;
        self.rollups = rollups;
    }

    /// Wire adjacency edges among `nodes` per a Partition style. Deterministic,
    /// pure arithmetic. The engine owns the TOPOLOGY (who borders whom); the host
    /// renders whatever geometry matches the style.
    ///
    /// FRACTAL COORDINATES: a partition's positions live in the PARENT's local
    /// 0..1 space, but fields live in world space. If the parent carries a world
    /// patch (`wx0..wy1` stats — written by a clip pass one level up), every
    /// where/clip/coverage sample is REMAPPED local→world through that patch, and
    /// the cells' own `wx0..wy1` are written back in world coords. So the SAME
    /// partition JSON works at every depth: a district's blocks see the district's
    /// stretch of the city's coastline, a block's plots see the block's corner of
    /// it — terrain stays continuous all the way down, by construction. A parent
    /// with no patch (the city itself) gets the identity remap.
    fn wire_partition(&mut self, nodes: &[EntityId], part: &Partition) {
        let patch = nodes
            .first()
            .and_then(|&n| self.entities[n].parent)
            .map(|p| {
                let (x0, y0, x1, y1) = (self.stat(p, "wx0"), self.stat(p, "wy0"), self.stat(p, "wx1"), self.stat(p, "wy1"));
                if x1 > x0 && y1 > y0 { (x0, y0, x1 - x0, y1 - y0) } else { (0.0, 0.0, 1.0, 1.0) }
            })
            .unwrap_or((0.0, 0.0, 1.0, 1.0));
        // WHERE-gate: relocate any seed whose position fails the author's rule to the
        // nearest VALID spot (deterministic outward search). The partition is thus
        // shaped by whatever fields the rule reads — engine stays meaning-agnostic.
        if let Some(gate) = &part.where_gate {
            for &n in nodes {
                let (x, y) = (self.stat(n, &part.x), self.stat(n, &part.y));
                if self.sample_patch(gate, patch, x, y) <= 0.5 {
                    if let Some((vx, vy)) = self.nearest_valid_patch(gate, patch, x, y) {
                        self.set(n, &part.x, vx);
                        self.set(n, &part.y, vy);
                    }
                }
            }
        }
        let pts: Vec<(f32, f32)> = nodes.iter().map(|&n| (self.stat(n, &part.x), self.stat(n, &part.y))).collect();
        match part.style.as_str() {
            // Voronoi adjacency via the GABRIEL GRAPH: A and B are neighbors iff no
            // other site C lies inside the circle whose diameter is A–B. This is a
            // subgraph of the Delaunay/Voronoi adjacency — it yields clean, natural
            // "these two territories share a border" links with no geometry library.
            "voronoi" | "gabriel" | "" => {
                for a in 0..nodes.len() {
                    for b in (a + 1)..nodes.len() {
                        let (ax, ay) = pts[a];
                        let (bx, by) = pts[b];
                        let (mx, my) = ((ax + bx) / 2.0, (ay + by) / 2.0);
                        let rad2 = ((ax - bx).powi(2) + (ay - by).powi(2)) / 4.0;
                        let mut adjacent = true;
                        for (c, &(cx, cy)) in pts.iter().enumerate() {
                            if c == a || c == b { continue; }
                            if (cx - mx).powi(2) + (cy - my).powi(2) < rad2 {
                                adjacent = false; // C sits between A and B → not a shared border
                                break;
                            }
                        }
                        if adjacent {
                            self.link(nodes[a], nodes[b], &part.edge, 1.0);
                        }
                    }
                }
            }
            // GRID: snap the children to a square lattice (writing their x,y stats)
            // and wire 4-neighbour adjacency. Tile worlds, boardgames, city blocks.
            "grid" => {
                let n = nodes.len();
                let cols = (n as f32).sqrt().ceil().max(1.0) as usize;
                let rows = (n + cols - 1) / cols;
                for (i, &node) in nodes.iter().enumerate() {
                    let (c, r) = (i % cols, i / cols);
                    // normalized cell centre in 0..1 (renderer scales it)
                    let px = (c as f32 + 0.5) / cols as f32;
                    let py = (r as f32 + 0.5) / rows as f32;
                    self.set(node, &part.x, px);
                    self.set(node, &part.y, py);
                }
                for i in 0..n {
                    let (c, r) = (i % cols, i / cols);
                    // right + down neighbours (undirected edge covers left/up too)
                    if c + 1 < cols && i + 1 < n {
                        self.link(nodes[i], nodes[i + 1], &part.edge, 1.0);
                    }
                    if r + 1 < rows && i + cols < n {
                        self.link(nodes[i], nodes[i + cols], &part.edge, 1.0);
                    }
                }
            }
            // CLUSTER: group children into k communities by their x,y position
            // (deterministic Lloyd/k-means from seeded starts), link everyone in the
            // same cluster, and link clusters whose members are nearest across the
            // gap. Communities, tribes, mingled neighbourhoods.
            "cluster" => {
                let k = ((nodes.len() as f32).sqrt().round().max(1.0) as usize).min(nodes.len());
                let assign = self.kmeans(&pts, k);
                // intra-cluster: link members to their cluster's first member (a star,
                // so a whole community is one connected group without O(n²) edges)
                let mut reps: Vec<Option<usize>> = vec![None; k];
                for (i, &cl) in assign.iter().enumerate() {
                    match reps[cl] {
                        None => reps[cl] = Some(i),
                        Some(rep) => self.link(nodes[i], nodes[rep], &part.edge, 1.0),
                    }
                }
                // inter-cluster: connect each pair of cluster reps (community graph)
                for a in 0..k {
                    for b in (a + 1)..k {
                        if let (Some(ra), Some(rb)) = (reps[a], reps[b]) {
                            self.link(nodes[ra], nodes[rb], &part.edge, 0.5);
                        }
                    }
                }
            }
            // RELATIONAL: no geometry at all — wire a connected who-links-to-whom
            // graph (each node to the next few by index, seeded). A LOGIC MAP: a
            // skill tree, a tech web, a faction network. Same prim, zero pixels.
            "relational" => {
                let n = nodes.len();
                for i in 0..n {
                    if i + 1 < n {
                        self.link(nodes[i], nodes[i + 1], &part.edge, 1.0); // spine keeps it connected
                    }
                    // one seeded cross-link → a branching web (skip if it duplicates
                    // the spine or self-loops)
                    let stride = 2 + (self.entity_seed(nodes[i]) % 3) as usize;
                    let j = (i + stride) % n;
                    if j != i && !self.linked(nodes[i], nodes[j], &part.edge) {
                        self.link(nodes[i], nodes[j], &part.edge, 1.0);
                    }
                }
            }
            // SUBDIVIDE: pack the children into VARIABLE-SIZED rectangles that
            // PERFECTLY TILE the unit square (zero wasted space — masonry). Each
            // child's area ∝ its `weight` stat, so "many small + a few big" falls
            // out. Writes each child's rect as `x`,`y` (centre) + `w`,`h` stats, and
            // wires `edge` adjacency between rects that share a boundary. This is the
            // no-gap / political-map / city-block-lots partition.
            "subdivide" => {
                let n = nodes.len();
                let weights: Vec<f32> = nodes.iter().map(|&nd| {
                    if part.weight.is_empty() { 1.0 } else { self.stat(nd, &part.weight).max(0.01) }
                }).collect();
                // MASK-AWARE: with a `clip` mask, subdivide TILES THE VALID LAND
                // ITSELF — a weighted axis-aligned split of the mask's actual grid
                // cells (a KD carve-up), not a bbox + nudge. Every parcel is a
                // disjoint chunk of real land whose area ∝ its weight; parcels hug
                // the coastline and NEVER overlap or cover water, by construction.
                let masked = part.clip.as_ref().and_then(|m| {
                    let g = 48usize;
                    let cells: Vec<(f32, f32)> = (0..g * g)
                        .map(|k| (((k % g) as f32 + 0.5) / g as f32, ((k / g) as f32 + 0.5) / g as f32))
                        .filter(|&(px, py)| self.sample_patch(m, patch, px, py) > 0.5)
                        .collect();
                    // need at least one cell per parcel to carve; else fall back
                    if cells.len() >= n { Some((cells, 1.0 / g as f32)) } else { None }
                });
                if let Some((cells, cell)) = masked {
                    let groups = carve_cells(&weights, cells);
                    let (ox, oy, sw, sh) = patch;
                    // KEEP the carved region — the parcel's true shape is engine
                    // DATA, not a rendering byproduct. It powers region_cells()
                    // (draw the real coastline-hugging shape) and region_at()
                    // ("which parcel owns this point" — topological collision).
                    for (i, &nd) in nodes.iter().enumerate() {
                        self.regions.insert(nd, (cell, groups[i].clone()));
                    }
                    for (i, &nd) in nodes.iter().enumerate() {
                        let cs = &groups[i];
                        let (mut x0, mut y0, mut x1, mut y1) = (1.0f32, 1.0f32, 0.0f32, 0.0f32);
                        for &(px, py) in cs {
                            x0 = x0.min(px - cell / 2.0); y0 = y0.min(py - cell / 2.0);
                            x1 = x1.max(px + cell / 2.0); y1 = y1.max(py + cell / 2.0);
                        }
                        // position = the parcel's OWN land cell nearest its bbox
                        // centre — always on real land (a concave coastal parcel's
                        // centroid/bbox-centre can sit in the bay). This is where
                        // labels sit, lanes terminate, and agents stand.
                        let (bcx, bcy) = ((x0 + x1) / 2.0, (y0 + y1) / 2.0);
                        let &(ax, ay) = cs
                            .iter()
                            .min_by(|a, b| {
                                let da = (a.0 - bcx).powi(2) + (a.1 - bcy).powi(2);
                                let db = (b.0 - bcx).powi(2) + (b.1 - bcy).powi(2);
                                da.partial_cmp(&db).unwrap_or(std::cmp::Ordering::Equal)
                            })
                            .unwrap_or(&(bcx, bcy));
                        self.set(nd, &part.x, ax);
                        self.set(nd, &part.y, ay);
                        self.set(nd, "w", (x1 - x0).max(cell));
                        self.set(nd, "h", (y1 - y0).max(cell));
                        self.set(nd, "area", cs.len() as f32 / (48.0 * 48.0));
                        // this parcel's patch of the WORLD — its own sub-partition
                        // sees exactly its stretch of terrain (the fractal step)
                        self.set(nd, "wx0", ox + x0 * sw); self.set(nd, "wy0", oy + y0 * sh);
                        self.set(nd, "wx1", ox + x1 * sw); self.set(nd, "wy1", oy + y1 * sh);
                    }
                    // adjacency from the CELLS: two parcels neighbour iff any of
                    // their land cells touch (4-adjacency) — real shared frontage,
                    // never a link across the water between them.
                    let mut owner: std::collections::BTreeMap<(i32, i32), usize> = std::collections::BTreeMap::new();
                    for (i, cs) in groups.iter().enumerate() {
                        for &(px, py) in cs {
                            owner.insert(((px / cell) as i32, (py / cell) as i32), i);
                        }
                    }
                    for (&(gx, gy), &a) in &owner {
                        for (nx, ny) in [(gx + 1, gy), (gx, gy + 1)] {
                            if let Some(&b) = owner.get(&(nx, ny)) {
                                if a != b && !self.linked(nodes[a], nodes[b], &part.edge) {
                                    self.link(nodes[a.min(b)], nodes[a.max(b)], &part.edge, 1.0);
                                }
                            }
                        }
                    }
                } else {
                    // no mask (or mask found no land): classic masonry over the unit square
                    let rects = squarify(&weights, 0.0, 0.0, 1.0, 1.0);
                    let (ox, oy, sw, sh) = patch;
                    for (i, &nd) in nodes.iter().enumerate() {
                        let r = rects[i];
                        self.set(nd, &part.x, r.0 + r.2 / 2.0);
                        self.set(nd, &part.y, r.1 + r.3 / 2.0);
                        self.set(nd, "w", r.2);
                        self.set(nd, "h", r.3);
                        self.set(nd, "wx0", ox + r.0 * sw); self.set(nd, "wy0", oy + r.1 * sh);
                        self.set(nd, "wx1", ox + (r.0 + r.2) * sw); self.set(nd, "wy1", oy + (r.1 + r.3) * sh);
                    }
                    for a in 0..n {
                        for b in (a + 1)..n {
                            if rects_adjacent(rects[a], rects[b]) {
                                self.link(nodes[a], nodes[b], &part.edge, 1.0);
                            }
                        }
                    }
                }
            }
            _ => {}
        }

        // CLIP: intersect each cell with the mask (cell ∩ mask). Sample a fine grid;
        // assign each point to its nearest seed (its Voronoi cell); count mask-valid
        // points per cell → the `area` stat (buildable land the district actually
        // owns). Then PRUNE adjacency edges whose two cells never touch across VALID
        // land (split by water) — so districts across a river aren't neighbours.
        // (Skipped for `subdivide` — it carves the mask's cells EXACTLY, so its own
        // area/patch/adjacency data is already precise; the nearest-seed pass here
        // would overwrite it with an approximation.)
        if (part.clip.is_some() || !part.coverage.is_empty()) && part.style != "subdivide" {
            let mask = &part.clip;
            let g = 48usize;
            let mut valid_count = vec![0u32; nodes.len()];
            let mut total_count = vec![0u32; nodes.len()];
            // per-cell coverage tallies: one counter per (node, coverage-field)
            let mut cover = vec![vec![0u32; part.coverage.len()]; nodes.len()];
            // per-cell world-space bounding box (its extent in the parent's field space)
            // → children can map their local view back to this patch of the world, so a
            // dive stays continuous (a waterfront district still SHOWS its coastline).
            let mut bb = vec![(1e9f32, 1e9f32, -1e9f32, -1e9f32); nodes.len()];
            // for each ordered pair, does a valid sample sit near their shared border?
            let mut border_valid: std::collections::BTreeMap<(usize, usize), bool> = std::collections::BTreeMap::new();
            for gy in 0..g {
                for gx in 0..g {
                    let (px, py) = ((gx as f32 + 0.5) / g as f32, (gy as f32 + 0.5) / g as f32);
                    // nearest + second-nearest seed
                    let (mut n1, mut d1) = (0usize, f32::INFINITY);
                    let (mut n2, mut d2) = (0usize, f32::INFINITY);
                    for (i, &(sx, sy)) in pts.iter().enumerate() {
                        let d = (px - sx).powi(2) + (py - sy).powi(2);
                        if d < d1 { d2 = d1; n2 = n1; d1 = d; n1 = i; }
                        else if d < d2 { d2 = d; n2 = i; }
                    }
                    total_count[n1] += 1;
                    let b = &mut bb[n1];
                    b.0 = b.0.min(px); b.1 = b.1.min(py); b.2 = b.2.max(px); b.3 = b.3.max(py);
                    let ok = mask.as_ref().map(|m| self.sample_patch(m, patch, px, py) > 0.5).unwrap_or(true);
                    if ok { valid_count[n1] += 1; }
                    // per-cell coverage of each named field (fraction of the cell that
                    // is beach/cliff/forest/…) → geography that shapes the zone's kind.
                    for (ci, (_, expr)) in part.coverage.iter().enumerate() {
                        if self.sample_patch(expr, patch, px, py) > 0.5 {
                            cover[n1][ci] += 1;
                        }
                    }
                    // near the border between n1 and n2 if their distances are close
                    if pts.len() > 1 && (d2 - d1) < (1.5 / g as f32).powi(2) {
                        let key = if n1 < n2 { (n1, n2) } else { (n2, n1) };
                        let e = border_valid.entry(key).or_insert(false);
                        if ok { *e = true; }
                    }
                }
            }
            for (i, &nd) in nodes.iter().enumerate() {
                if part.clip.is_some() {
                    let frac = if total_count[i] > 0 { valid_count[i] as f32 / total_count[i] as f32 } else { 0.0 };
                    self.set(nd, "area", frac); // the district's real land fraction (data!)
                }
                // write each coverage field as `<name>_frac` — the zone's terrain makeup
                let tot = total_count[i].max(1) as f32;
                for (ci, (name, _)) in part.coverage.iter().enumerate() {
                    self.set(nd, &format!("{name}_frac"), cover[i][ci] as f32 / tot);
                }
                // world-space bounds of this cell — the patch of the world it
                // occupies. bb is in the parent's LOCAL coords; remap through the
                // parent's own patch so wx0..wy1 are TRUE world coords at every
                // depth (which is what makes the recursion fractal: a block's own
                // sub-partition remaps through these directly).
                if total_count[i] > 0 {
                    let (x0, y0, x1, y1) = bb[i];
                    let (ox, oy, sw, sh) = patch;
                    self.set(nd, "wx0", ox + x0 * sw); self.set(nd, "wy0", oy + y0 * sh);
                    self.set(nd, "wx1", ox + x1 * sw); self.set(nd, "wy1", oy + y1 * sh);
                }
            }
            // prune border edges that never touch across valid land (only when a clip
            // mask is defining "valid" — coverage-only partitions keep all borders).
            if part.clip.is_some() {
                for a in 0..nodes.len() {
                    for b in (a + 1)..nodes.len() {
                        if self.linked(nodes[a], nodes[b], &part.edge) {
                            let touches = *border_valid.get(&(a, b)).unwrap_or(&false);
                            if !touches {
                                self.unlink_pair(nodes[a], nodes[b], &part.edge);
                            }
                        }
                    }
                }
            }
        }
    }

    /// Sample a mask/field formula at a LOCAL point, remapped through a world
    /// `patch` (origin + size). Identity patch = plain sample. This is what lets
    /// the same partition JSON read the right slice of world terrain at any depth.
    fn sample_patch(&self, m: &super::expr::Expr, patch: (f32, f32, f32, f32), px: f32, py: f32) -> f32 {
        let (ox, oy, sw, sh) = patch;
        m.sample(self, ox + px * sw, oy + py * sh)
    }

    /// `nearest_valid`, but the gate samples through a world `patch` (positions
    /// stay LOCAL). Same ring search as `nearest_valid` — one algorithm, so the
    /// identity patch gives bit-identical results.
    fn nearest_valid_patch(&self, gate: &super::expr::Expr, patch: (f32, f32, f32, f32), x: f32, y: f32) -> Option<(f32, f32)> {
        for ring in 1..=24 {
            let r = ring as f32 * 0.04;
            let samples = (ring * 6).max(8);
            for s in 0..samples {
                let a = (s as f32 / samples as f32) * std::f32::consts::TAU;
                let (nx, ny) = ((x + r * a.cos()).clamp(0.0, 1.0), (y + r * a.sin()).clamp(0.0, 1.0));
                if self.sample_patch(gate, patch, nx, ny) > 0.5 {
                    return Some((nx, ny));
                }
            }
        }
        None
    }

    /// Find the nearest point to (x,y) where `gate` holds (>0.5), by an outward
    /// ring search over the unit square. Deterministic. Returns None if nowhere in
    /// range satisfies the gate (caller keeps the original position).
    fn nearest_valid(&self, gate: &super::expr::Expr, x: f32, y: f32) -> Option<(f32, f32)> {
        for ring in 1..=24 {
            let r = ring as f32 * 0.04;
            let samples = (ring * 6).max(8);
            let mut best: Option<(f32, f32)> = None;
            for s in 0..samples {
                let a = (s as f32 / samples as f32) * std::f32::consts::TAU;
                let (nx, ny) = ((x + r * a.cos()).clamp(0.0, 1.0), (y + r * a.sin()).clamp(0.0, 1.0));
                if gate.sample(self, nx, ny) > 0.5 {
                    // prefer the closest sample on this ring (they're ~equal; take first)
                    best = Some((nx, ny));
                    break;
                }
            }
            if best.is_some() {
                return best;
            }
        }
        None
    }

    /// Build a ROAD NETWORK over an existing adjacency graph: least-cost paths from a
    /// hub to every reachable node, wiring `out_edge` edges along the shortest-path
    /// tree. Hop cost = base distance × a per-hop COST formula that samples fields at
    /// the hop's midpoint (`mx`,`my`) — so a road prefers cheap land and avoids/limits
    /// crossing water or cliffs. Where a hop's midpoint satisfies `bridge` (a masked
    /// region — a river), a `bridge` entity is spawned at the crossing: routing that
    /// CONSUMES terrain and PRODUCES structure. Deterministic (Dijkstra, tie-break by
    /// id). This is circulation — the layer that ties territory + terrain together.
    ///
    /// `nodes`: the routable entities. `hub`: start node. `via`: adjacency edge kind to
    /// traverse. `out_edge`: edge kind to wire for the road network. `xk`,`yk`: position
    /// stat names. `cost`/`bridge`: optional formulas over `mx`,`my` (hop midpoint) plus
    /// any fields. `bridge_kind`: kind to spawn at a bridged crossing (parented to hub).
    #[allow(clippy::too_many_arguments)]
    #[allow(clippy::too_many_arguments)]
    pub fn route_network(
        &mut self, nodes: &[EntityId], hub: EntityId, _via: &str, out_edge: &str,
        xk: &str, yk: &str, cost: Option<&super::expr::Expr>, transition: Option<&super::expr::Expr>,
        max_span: f32, trans_kind: &str, style: &str, redundancy: usize, patch: (f32, f32, f32, f32),
    ) {
        use std::collections::BTreeMap;
        // GATE nodes carry their position as gx/gy (engine convention — they were
        // dropped by a PARENT-level routing pass, which couldn't know this level's
        // position stat names). Everything else reads the author's xk/yk.
        let pos: BTreeMap<EntityId, (f32, f32)> = nodes
            .iter()
            .map(|&n| {
                let p = if self.kind(n) == "gate" { (self.stat(n, "gx"), self.stat(n, "gy")) } else { (self.stat(n, xk), self.stat(n, yk)) };
                (n, p)
            })
            .collect();

        // The LONGEST contiguous crossing of a hop where `transition` holds — the water
        // (or lava, void…) the road must span. Returns (span_length, entry_shore,
        // exit_shore): the transition GATES onto the crossing at `entry`, spans it, and
        // gates back off at `exit`. Two boundary points, not one midpoint — a bridge
        // has a shore on each side. Universal: the dev's formula decides what a crossing is.
        let crossing = |w: &World, a: EntityId, b: EntityId| -> (f32, (f32, f32), (f32, f32)) {
            let (ax, ay) = pos[&a]; let (bx, by) = pos[&b];
            let Some(t) = transition else { return (0.0, (0.0, 0.0), (0.0, 0.0)); };
            let hop_len = ((ax - bx).powi(2) + (ay - by).powi(2)).sqrt();
            let steps = 32;
            let at = |f: f32| (ax + (bx - ax) * f, ay + (by - ay) * f);
            let (mut run, mut best) = (0.0f32, 0.0f32);
            let (mut run_start_f, mut best_entry, mut best_exit) = (0.0f32, (ax, ay), (bx, by));
            for k in 0..=steps {
                let f = k as f32 / steps as f32;
                let (px, py) = at(f);
                if w.sample_patch(t, patch, px, py) > 0.5 {
                    if run == 0.0 { run_start_f = (k as f32 - 0.5).max(0.0) / steps as f32; }
                    run += hop_len / steps as f32;
                    if run > best {
                        best = run;
                        best_entry = at(run_start_f);
                        best_exit = at(((k as f32) + 0.5).min(steps as f32) / steps as f32);
                    }
                } else { run = 0.0; }
            }
            (best, best_entry, best_exit)
        };

        // Hop cost: base × surface cost. INFEASIBLE (∞) if it must cross a span longer
        // than `max_span` (no valid transition possible) — so a hop across open water
        // is simply rejected, not fake-bridged. A short crossing (≤ max_span) is fine.
        let hop_cost = |w: &World, a: EntityId, b: EntityId| -> f32 {
            let (span, _, _) = crossing(w, a, b);
            if transition.is_some() && span > max_span { return f32::INFINITY; }
            let (ax, ay) = pos[&a];
            let (bx, by) = pos[&b];
            let base = ((ax - bx).powi(2) + (ay - by).powi(2)).sqrt().max(1e-4);
            let mut surf = 1.0f32;
            if let Some(c) = cost {
                let mut s = 0.0; let steps = 5;
                for k in 0..=steps {
                    let t = k as f32 / steps as f32;
                    s += w.sample_patch(c, patch, ax + (bx - ax) * t, ay + (by - ay) * t);
                }
                surf = (s / (steps as f32 + 1.0)).max(0.01);
            }
            base * surf
        };

        // The CANDIDATE graph: routing is NOT limited to who-borders-whom (that graph
        // can be starved by masking). Each node's candidates are its k NEAREST peers —
        // so roads can connect districts that don't share a border, across a gap/bridge.
        let k = redundancy.max(2).min(nodes.len().saturating_sub(1)).max(1);
        let candidates = |a: EntityId| -> Vec<EntityId> {
            let (ax, ay) = pos[&a];
            let mut others: Vec<(f32, EntityId)> = nodes.iter().filter(|&&n| n != a)
                .map(|&n| { let (nx, ny) = pos[&n]; ((ax - nx).powi(2) + (ay - ny).powi(2), n) }).collect();
            others.sort_by(|p, q| p.0.partial_cmp(&q.0).unwrap_or(std::cmp::Ordering::Equal).then(p.1.cmp(&q.1)));
            others.into_iter().take(k).map(|(_, n)| n).collect()
        };

        // Which edges to wire, by connection STYLE (a route sub-law):
        //   "efficient" — a shortest-path TREE from the hub (minimal roads, all linked)
        //   "grid"/"redundant" — every node to its k nearest reachable (a mesh)
        //   "organic" — the tree, plus a few extra shortcuts (loops, character)
        let mut wire: Vec<(EntityId, EntityId)> = Vec::new();
        if style == "grid" || style == "redundant" {
            for &a in nodes {
                for b in candidates(a) {
                    // skip infeasible hops (must cross too wide a forbidden span)
                    if a < b && hop_cost(self, a, b).is_finite() { wire.push((a, b)); }
                }
            }
        } else {
            // Dijkstra shortest-path tree from hub over the candidate graph.
            let mut dist: BTreeMap<EntityId, f32> = BTreeMap::new();
            let mut prev: BTreeMap<EntityId, EntityId> = BTreeMap::new();
            let mut done: std::collections::BTreeSet<EntityId> = Default::default();
            dist.insert(hub, 0.0);
            loop {
                let mut cur = None; let mut best = f32::INFINITY;
                for (&n, &d) in &dist { if !done.contains(&n) && d < best { best = d; cur = Some(n); } }
                let Some(u) = cur else { break };
                done.insert(u);
                for v in candidates(u) {
                    if done.contains(&v) { continue; }
                    let nd = best + hop_cost(self, u, v);
                    if nd < *dist.get(&v).unwrap_or(&f32::INFINITY) { dist.insert(v, nd); prev.insert(v, u); }
                }
            }
            for (&v, &u) in &prev { wire.push((u, v)); }
            if style == "organic" {
                // add each node's single cheapest FEASIBLE non-tree candidate → loops
                for &a in nodes {
                    if let Some(&b) = candidates(a).iter().find(|&&b| a < b && hop_cost(self, a, b).is_finite() && !wire.contains(&(a, b)) && !wire.contains(&(b, a))) {
                        wire.push((a, b));
                    }
                }
            }
        }

        // CONNECTIVITY GUARANTEE — every settled node reaches the network, like the
        // real world: a lone hamlet across a gap is tied back in by a country road,
        // and if the only way over is water, that connector IS a bridge/ferry. The
        // tree/mesh above links what the `max_span` cap lets it reach and SILENTLY
        // DROPS the rest — that dropped node is the "floaty island zone". This pass
        // pulls every one back in. No new machinery: it's the same nearest-peer
        // `hop_cost`, and the rescued edge lays as a curved road / split bridge just
        // like any other. The connector's CHARACTER (short street · long country
        // road · bridge · ferry) falls out of the cost field + crossing, never a
        // special case. The only thing lifted for a rescue: the span cap — reaching a
        // truly-stranded pocket is allowed to make a wide crossing the normal pass
        // refused. Meaning-agnostic; deterministic (nearest by cost, tie-break by id).
        let mut rescue: std::collections::BTreeSet<(EntityId, EntityId)> = Default::default();
        {
            // adjacency of what's wired so far, both directions
            let mut adj: BTreeMap<EntityId, Vec<EntityId>> = BTreeMap::new();
            for &(a, b) in &wire { adj.entry(a).or_default().push(b); adj.entry(b).or_default().push(a); }
            // connected component of the hub (BFS over `wire`)
            let mut connected: std::collections::BTreeSet<EntityId> = Default::default();
            let mut frontier = vec![hub];
            connected.insert(hub);
            while let Some(u) = frontier.pop() {
                if let Some(ns) = adj.get(&u) {
                    for &v in ns { if connected.insert(v) { frontier.push(v); } }
                }
            }
            // a rescue's cost ignores the span cap: a long/wide crossing is expensive,
            // not infeasible — so the cheapest way to reach a stranded pocket wins,
            // whatever its character. (base distance × mean surface cost; ∞ only if a
            // node has no position, never for terrain.)
            let rescue_cost = |w: &World, a: EntityId, b: EntityId| -> f32 {
                let (ax, ay) = pos[&a]; let (bx, by) = pos[&b];
                let base = ((ax - bx).powi(2) + (ay - by).powi(2)).sqrt().max(1e-4);
                let mut surf = 1.0f32;
                if let Some(c) = cost {
                    let mut s = 0.0; let steps = 8;
                    for k in 0..=steps {
                        let t = k as f32 / steps as f32;
                        s += w.sample_patch(c, patch, ax + (bx - ax) * t, ay + (by - ay) * t);
                    }
                    surf = (s / (steps as f32 + 1.0)).max(0.01);
                }
                base * surf
            };
            // grow the component one cheapest connector at a time until everyone's in
            // (Prim-style: each pass adds the single cheapest stranded→connected link,
            // so a CHAIN of islands is threaded, not just the ones adjacent to shore).
            loop {
                // stranded settled nodes (skip infra + gates — only real places must connect)
                let stranded: Vec<EntityId> = nodes.iter().copied()
                    .filter(|&n| !connected.contains(&n) && self.kind(n) != "gate" && !self.entities[n].infra)
                    .collect();
                if stranded.is_empty() { break; }
                // cheapest (stranded, connected) pair; deterministic tie-break by ids
                let mut best: Option<(f32, EntityId, EntityId)> = None;
                for &s in &stranded {
                    for &c in &connected {
                        let d = rescue_cost(self, s, c);
                        let better = match best { None => true, Some((bd, bs, bc)) => d < bd || (d == bd && (s, c) < (bs, bc)) };
                        if d.is_finite() && better { best = Some((d, s, c)); }
                    }
                }
                let Some((_, s, c)) = best else { break }; // no connected anchor at all → give up
                let (a, b) = (s.min(c), s.max(c));
                rescue.insert((a, b));
                wire.push((a, b));
                // s joins the network — and anything it was already wired to comes with it
                let mut frontier = vec![s];
                connected.insert(s);
                while let Some(u) = frontier.pop() {
                    if let Some(ns) = adj.get(&u) {
                        for &v in ns { if connected.insert(v) { frontier.push(v); } }
                    }
                }
            }
        }

        // Lay the roads. A hop that crosses a `transition` region is split into THREE
        // pieces: ROAD (u → entry shore) · TRANSITION (entry shore → exit shore, the
        // water span ONLY) · ROAD (exit shore → v). The bridge is ONLY the water — the
        // approaches on land are road. A bridge never runs over dry land. Two shore
        // nodes gate onto and off the crossing. Clean land hops are one road edge.
        let parent = self.entities[hub].parent.unwrap_or(self.root);
        // every laid piece of road, as (endpoint, endpoint) in this scope's local
        // coords — the geometry the gate pass below reads to find where roads
        // cross the child scopes' territory
        let mut laid: Vec<((f32, f32), (f32, f32))> = Vec::new();
        for (u, v) in wire {
            if self.linked(u, v, out_edge) { continue; }
            let (span, entry, exit) = crossing(self, u, v);
            let crosses = transition.is_some() && !trans_kind.is_empty() && span > 1e-4;
            // a RESCUE connector may bridge a span the normal cap refuses — that's how
            // a stranded pocket gets its crossing. Everything else respects `max_span`.
            let is_rescue = rescue.contains(&(u.min(v), u.max(v)));
            if crosses && (span <= max_span || is_rescue) {
                // shore node at each water boundary (where road meets the crossing)
                let s1 = self.spawn("shore", &format!("shore {}", self.entities.len()), parent);
                self.set(s1, xk, entry.0); self.set(s1, yk, entry.1);
                let s2 = self.spawn("shore", &format!("shore {}", self.entities.len()), parent);
                self.set(s2, xk, exit.0); self.set(s2, yk, exit.1);
                // the bridge spans ONLY entry↔exit (the water)
                let t = self.spawn(trans_kind, &format!("{trans_kind} {}", self.entities.len()), parent);
                self.set(t, xk, (entry.0 + exit.0) / 2.0); self.set(t, yk, (entry.1 + exit.1) / 2.0);
                // engine-spawned circulation nodes, not authored places — flagged so
                // hosts can filter mechanically instead of knowing kind names
                self.entities[s1].infra = true;
                self.entities[s2].infra = true;
                self.entities[t].infra = true;
                self.link(u, s1, out_edge, 1.0);   // road: u → entry shore
                self.link(s1, t, out_edge, 1.0);   // onto the bridge
                self.link(t, s2, out_edge, 1.0);   // off the bridge at exit shore
                self.link(s2, v, out_edge, 1.0);   // road: exit shore → v
                laid.push((pos[&u], entry));
                laid.push((exit, pos[&v]));
                laid.push((entry, exit)); // the span itself (a road crossing water)
            } else if !crosses {
                self.link(u, v, out_edge, 1.0);    // clean land hop = one road
                // ROUTE the hop, don't draw it: a road is a DECISION computed from
                // the terrain. Pathfind the cost field between the anchors — going
                // AROUND the valley is cheaper than over, so the road curves; a
                // near-flat cost field yields a near-straight road. The curve is
                // stored as engine data (route_paths) for renderers/agents/gates.
                // the ROUTING SCOPE is the mover: bare idents in the cost formula
                // resolve to the scope's own stats — a district with scenic_love
                // 0.9 discounts shoreline cells and its roads hug the water; its
                // inland neighbour (scenic_love 0.1) pays full price and cuts
                // straight. Road CHARACTER as a composed law, not a road type.
                let path = match cost {
                    Some(c) => self.pathfind(pos[&u], pos[&v], c, Some(parent), patch, 48),
                    None => Vec::new(),
                };
                if path.len() > 2 {
                    for w2 in path.windows(2) {
                        laid.push((w2[0], w2[1]));
                    }
                    self.route_paths.insert((u.min(v), u.max(v)), path);
                } else {
                    laid.push((pos[&u], pos[&v]));
                }
            } else if is_rescue {
                // a rescue that crosses but has no `trans_kind` to build with (author
                // gave no bridge/ferry): still LINK the pocket so it's reachable, and
                // draw the straight connector. The guarantee wins over prettiness —
                // an unbridged-but-linked hamlet beats a stranded one.
                self.link(u, v, out_edge, 1.0);
                laid.push((pos[&u], pos[&v]));
            }
            // non-rescue crosses && span > max_span: too wide to bridge → left
            // unconnected on this hop (some OTHER hop, or the rescue pass, reaches it).
        }

        // GATES — the down-flow of circulation. For every child scope a laid road
        // CROSSES (its world patch, converted into this routing space), drop a
        // flagged `gate` child at each boundary crossing point, position stored in
        // THAT scope's local 0..1 (`gx`,`gy`). When the scope later routes its own
        // network with `"gates": true`, these are nodes — so its streets meet the
        // artery exactly where it really enters. Recursive for free: a district's
        // lanes gate its blocks the same way the city's roads gated the districts.
        let (ox, oy, sw, sh) = patch;
        let mut seen_gates: std::collections::BTreeSet<(EntityId, i32, i32)> = std::collections::BTreeSet::new();
        for &n in nodes {
            if self.kind(n) == "gate" || self.entities[n].infra { continue; }
            let (wx0, wy0, wx1, wy1) = (self.stat(n, "wx0"), self.stat(n, "wy0"), self.stat(n, "wx1"), self.stat(n, "wy1"));
            if !(wx1 > wx0 && wy1 > wy0) { continue; }
            // the scope's patch rect in THIS routing space (parent-local)
            let (rx0, ry0) = ((wx0 - ox) / sw, (wy0 - oy) / sh);
            let (rx1, ry1) = ((wx1 - ox) / sw, (wy1 - oy) / sh);
            for &(a, b) in &laid {
                // Liang–Barsky: the segment's parameter range inside the rect
                let (dx, dy) = (b.0 - a.0, b.1 - a.1);
                let (mut t0, mut t1) = (0.0f32, 1.0f32);
                let mut ok = true;
                for (p, q) in [(-dx, a.0 - rx0), (dx, rx1 - a.0), (-dy, a.1 - ry0), (dy, ry1 - a.1)] {
                    if p.abs() < 1e-9 {
                        if q < 0.0 { ok = false; break; }
                    } else {
                        let r = q / p;
                        if p < 0.0 { if r > t1 { ok = false; break; } if r > t0 { t0 = r; } }
                        else { if r < t0 { ok = false; break; } if r < t1 { t1 = r; } }
                    }
                }
                if !ok || t1 <= t0 { continue; }
                for t in [t0, t1] {
                    if !(t > 1e-4 && t < 1.0 - 1e-4) { continue; } // endpoint inside = the anchor, not a crossing
                    let (px, py) = (a.0 + dx * t, a.1 + dy * t);
                    let (lx, ly) = (((px - rx0) / (rx1 - rx0)).clamp(0.0, 1.0), ((py - ry0) / (ry1 - ry0)).clamp(0.0, 1.0));
                    let key = (n, (lx * 64.0).round() as i32, (ly * 64.0).round() as i32);
                    if !seen_gates.insert(key) { continue; }
                    let g = self.spawn("gate", &format!("gate {}", self.entities.len()), n);
                    self.set(g, "gx", lx);
                    self.set(g, "gy", ly);
                    self.entities[g].infra = true;
                }
            }
        }

        // ROADS AS SUBTRACTABLE LAND — record every laid segment in WORLD coords so
        // any scope can sample `road_near(width)` through its patch. `patch` is this
        // routing scope's world rect (ox,oy,sw,sh); a local segment maps to world by
        // (ox + lx*sw, oy + ly*sh). Now a block's plot land = buildable − the
        // district arteries running through it (they're in this list once the district
        // routed). Bridges/rescue approaches included — you don't build on those either.
        for &(a, b) in &laid {
            let wa = (ox + a.0 * sw, oy + a.1 * sh);
            let wb = (ox + b.0 * sw, oy + b.1 * sh);
            self.world_roads.push((wa, wb));
        }
    }

    /// Min distance (world coords) from a point to any laid road segment — the
    /// substrate for `road_near(width)`. O(segments); roads are few. Returns a big
    /// number if no roads laid yet (so `road_near` is 0 = "not near a road").
    pub fn road_dist_world(&self, x: f32, y: f32) -> f32 {
        let mut best = f32::MAX;
        for &((ax, ay), (bx, by)) in &self.world_roads {
            // point→segment distance
            let (dx, dy) = (bx - ax, by - ay);
            let len2 = dx * dx + dy * dy;
            let t = if len2 < 1e-12 { 0.0 } else { (((x - ax) * dx + (y - ay) * dy) / len2).clamp(0.0, 1.0) };
            let (px, py) = (ax + t * dx, ay + t * dy);
            let d2 = (x - px) * (x - px) + (y - py) * (y - py);
            if d2 < best { best = d2; }
        }
        if best == f32::MAX { 1e9 } else { best.sqrt() }
    }

    /// THE GENERAL PATHFINDING PRIM — least-cost path through a COST FIELD.
    /// Not a roads feature: the same call routes a road around a valley, an NPC to
    /// work by their personality, a supply line, a fleeing crowd. A* over an n×n
    /// grid of the cost expression, sampled through `patch` (fractal coords) and —
    /// the personality hook — with an optional `mover` whose stats the formula
    /// reads (`1 + 9*field(danger,fx,fy)*(1-courage)`). The ENGINE decides the
    /// path; the dev's formula decides what "best" means. Returns local (x,y)
    /// waypoints start→goal (collinear points pruned), or empty if unreachable.
    /// Deterministic: integer-scaled costs, fixed tie-break by cell index.
    pub fn pathfind(
        &self, start: (f32, f32), goal: (f32, f32), cost: &super::expr::Expr,
        mover: Option<EntityId>, patch: (f32, f32, f32, f32), n: usize,
    ) -> Vec<(f32, f32)> {
        use std::cmp::Reverse;
        use std::collections::BinaryHeap;
        let n = n.clamp(8, 128);
        let (ox, oy, sw, sh) = patch;
        // cell cost, precomputed once (the field the path negotiates)
        let cell_cost: Vec<f32> = (0..n * n)
            .map(|k| {
                let (px, py) = (((k % n) as f32 + 0.5) / n as f32, ((k / n) as f32 + 0.5) / n as f32);
                cost.sample_for(self, mover, ox + px * sw, oy + py * sh).max(0.05)
            })
            .collect();
        let cmin = cell_cost.iter().copied().fold(f32::INFINITY, f32::min).max(0.05);
        let cell_of = |p: (f32, f32)| -> usize {
            let i = ((p.0 * n as f32) as usize).min(n - 1);
            let j = ((p.1 * n as f32) as usize).min(n - 1);
            j * n + i
        };
        let centre = |k: usize| (((k % n) as f32 + 0.5) / n as f32, ((k / n) as f32 + 0.5) / n as f32);
        let (s, g) = (cell_of(start), cell_of(goal));
        // A*: dist in fixed-point so ordering is exact; heuristic = euclid × cmin (admissible)
        let scale = 1e6f32;
        let h = |k: usize| {
            let (ax, ay) = centre(k);
            let (gx, gy) = centre(g);
            (((ax - gx).powi(2) + (ay - gy).powi(2)).sqrt() * cmin * scale) as u64
        };
        let mut dist: Vec<u64> = vec![u64::MAX; n * n];
        let mut prev: Vec<usize> = vec![usize::MAX; n * n];
        let mut heap: BinaryHeap<Reverse<(u64, usize)>> = BinaryHeap::new();
        dist[s] = 0;
        heap.push(Reverse((h(s), s)));
        while let Some(Reverse((_, u))) = heap.pop() {
            if u == g { break; }
            let du = dist[u];
            let (ui, uj) = ((u % n) as i32, (u / n) as i32);
            for (di, dj) in [(-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (1, -1), (-1, 1), (1, 1)] {
                let (vi, vj) = (ui + di, uj + dj);
                if vi < 0 || vj < 0 || vi >= n as i32 || vj >= n as i32 { continue; }
                let v = (vj as usize) * n + vi as usize;
                let diagonal = di != 0 && dj != 0;
                let step = if diagonal { std::f32::consts::SQRT_2 } else { 1.0 } / n as f32;
                // a diagonal move passes BETWEEN two orthogonal cells — price them
                // in, or the path corner-cuts through expensive terrain untaxed
                let c = if diagonal {
                    let s1 = ((uj as usize) * n) + (ui + di) as usize;
                    let s2 = ((uj + dj) as usize * n) + ui as usize;
                    cell_cost[v].max((cell_cost[s1] + cell_cost[s2]) * 0.5)
                } else {
                    cell_cost[v]
                };
                let w = du.saturating_add((step * c * scale) as u64);
                if w < dist[v] {
                    dist[v] = w;
                    prev[v] = u;
                    heap.push(Reverse((w.saturating_add(h(v)), v)));
                }
            }
        }
        if dist[g] == u64::MAX { return Vec::new(); }
        // walk back, then prune collinear runs so the polyline is clean
        let mut cells = vec![g];
        let mut cur = g;
        while cur != s {
            cur = prev[cur];
            if cur == usize::MAX { return Vec::new(); }
            cells.push(cur);
        }
        cells.reverse();
        let mut pts: Vec<(f32, f32)> = vec![start];
        for w in cells.windows(3) {
            let d1 = (w[1] % n).wrapping_sub(w[0] % n) as i32 == (w[2] % n).wrapping_sub(w[1] % n) as i32
                && (w[1] / n).wrapping_sub(w[0] / n) as i32 == (w[2] / n).wrapping_sub(w[1] / n) as i32;
            if !d1 { pts.push(centre(w[1])); }
        }
        pts.push(goal);
        pts
    }

    /// The pathfound curve of a laid route edge (local coords), if routing chose one.
    pub fn route_path(&self, a: EntityId, b: EntityId) -> Option<&[(f32, f32)]> {
        self.route_paths.get(&(a.min(b), a.max(b))).map(|v| v.as_slice())
    }

    /// Deterministic k-means (Lloyd's) over 2D points → cluster index per point.
    /// Seeded initial centres (evenly-strided) and fixed iterations, so replays
    /// match. Used by the "cluster" partition style.
    fn kmeans(&self, pts: &[(f32, f32)], k: usize) -> Vec<usize> {
        let n = pts.len();
        if k == 0 || n == 0 {
            return vec![0; n];
        }
        let mut centres: Vec<(f32, f32)> = (0..k).map(|i| pts[(i * n / k).min(n - 1)]).collect();
        let mut assign = vec![0usize; n];
        for _ in 0..8 {
            for (i, p) in pts.iter().enumerate() {
                let mut best = 0;
                let mut bd = f32::INFINITY;
                for (c, ctr) in centres.iter().enumerate() {
                    let d = (p.0 - ctr.0).powi(2) + (p.1 - ctr.1).powi(2);
                    if d < bd { bd = d; best = c; }
                }
                assign[i] = best;
            }
            let mut sum = vec![(0.0f32, 0.0f32, 0u32); k];
            for (i, p) in pts.iter().enumerate() {
                let s = &mut sum[assign[i]];
                s.0 += p.0; s.1 += p.1; s.2 += 1;
            }
            for (c, s) in sum.iter().enumerate() {
                if s.2 > 0 { centres[c] = (s.0 / s.2 as f32, s.1 / s.2 as f32); }
            }
        }
        assign
    }

    // ---- Canon ledger (the consistency store a generator must consult) ----

    /// Commit a structured fact: `subject —predicate→ object` (+ freeform detail).
    pub fn record_claim(&mut self, subject: EntityId, predicate: &str, object: Option<EntityId>, detail: &str) {
        self.ledger.push(super::canon::Claim {
            subject,
            predicate: predicate.to_string(),
            object: object,
            detail: detail.to_string(),
        });
    }

    /// The object of the first `subject —predicate→ ?` claim, if any. (Used to
    /// reuse an existing fact instead of inventing a contradictory one.)
    pub fn object_of(&self, subject: EntityId, predicate: &str) -> Option<EntityId> {
        self.ledger.iter().find(|c| c.subject == subject && c.predicate == predicate).and_then(|c| c.object)
    }

    /// Is `subject —predicate→ object` already committed?
    pub fn has_claim(&self, subject: EntityId, predicate: &str, object: EntityId) -> bool {
        self.ledger.iter().any(|c| c.subject == subject && c.predicate == predicate && c.object == Some(object))
    }

    pub fn ledger(&self) -> &[super::canon::Claim] {
        &self.ledger
    }

    // ---- Agency (utility decisions + player intent) ----

    /// Give every entity of `kind` a menu of actions to choose from each tick.
    pub fn set_actions(&mut self, kind: &str, actions: Vec<Box<dyn Action>>) {
        self.actions.insert(kind.to_string(), actions);
    }

    /// Player override: force `id` to take `action` (by name) instead of letting
    /// its utility scorer decide. This is the player-input channel for agency.
    pub fn set_intent(&mut self, id: EntityId, action: &str) {
        self.intents.insert(id, action.to_string());
    }
    pub fn clear_intent(&mut self, id: EntityId) {
        self.intents.remove(&id);
    }

    /// Pick an entity's action: a player intent if set, else the top-scoring one.
    fn choose_action<'a>(&self, id: EntityId, acts: &'a [Box<dyn Action>]) -> Option<&'a dyn Action> {
        if let Some(name) = self.intents.get(&id) {
            return acts.iter().find(|a| a.name() == name).map(|b| b.as_ref());
        }
        let mut best: Option<&dyn Action> = None;
        let mut best_score = 0.0_f32;
        for a in acts {
            let s = a.score(self, id);
            if s > best_score {
                best_score = s;
                best = Some(a.as_ref());
            }
        }
        best
    }

    // ---- Relationship graph (typed edges between any entities) ----

    /// Link two entities with a typed, weighted edge (undirected for queries).
    /// Recorded in both endpoints' adjacency lists so lookups are O(degree).
    pub fn link(&mut self, a: EntityId, b: EntityId, kind: &str, weight: f32) {
        let i = self.edges.len();
        self.edges.push(super::graph::Edge { from: a, to: b, kind: kind.to_string(), weight, dead: false });
        self.adjacency[a].push(i);
        self.adjacency[b].push(i);
    }

    /// Entities linked to `a` by an edge of `kind` (either direction). O(degree)
    /// via the adjacency index — scans only `a`'s own edges, never the whole graph.
    pub fn neighbors(&self, a: EntityId, kind: &str) -> Vec<EntityId> {
        self.adjacency[a]
            .iter()
            .filter_map(|&i| {
                let e = &self.edges[i];
                if e.dead || e.kind != kind {
                    return None;
                }
                let other = if e.from == a { e.to } else { e.from };
                if self.entities[other].dead { None } else { Some(other) }
            })
            .collect()
    }

    /// How many live neighbors `a` has via `kind` — O(degree), no allocation.
    /// (`edge_count(...)` in formulas routes here, so it's cheap in hot scores.)
    pub fn neighbor_count(&self, a: EntityId, kind: &str) -> usize {
        self.adjacency[a]
            .iter()
            .filter(|&&i| {
                let e = &self.edges[i];
                !e.dead && e.kind == kind && !self.entities[if e.from == a { e.to } else { e.from }].dead
            })
            .count()
    }

    pub fn linked(&self, a: EntityId, b: EntityId, kind: &str) -> bool {
        self.adjacency[a].iter().any(|&i| {
            let e = &self.edges[i];
            !e.dead && e.kind == kind && (e.to == b || e.from == b)
        })
    }

    /// Does `a` have ANY live edge of `kind` (to anyone)? Used by `claim` to test
    /// whether a discrete resource is already owned — O(degree), no allocation.
    pub fn has_edge_of_kind(&self, a: EntityId, kind: &str) -> bool {
        self.adjacency[a].iter().any(|&i| {
            let e = &self.edges[i];
            !e.dead && e.kind == kind && !self.entities[if e.from == a { e.to } else { e.from }].dead
        })
    }

    pub fn edges(&self) -> &[super::graph::Edge] {
        &self.edges
    }

    /// Drop every `kind` edge touching `a` (data-driven relationship break).
    /// Tombstones (keeps indices stable for the adjacency lists); O(a's degree).
    pub fn unlink_all(&mut self, a: EntityId, kind: &str) {
        for &i in &self.adjacency[a] {
            if self.edges[i].kind == kind {
                self.edges[i].dead = true;
            }
        }
    }

    /// Drop the `kind` edge(s) specifically between `a` and `b` (tombstone). Used by
    /// the clip partition to prune adjacency across masked-out territory (a river).
    pub fn unlink_pair(&mut self, a: EntityId, b: EntityId, kind: &str) {
        for &i in &self.adjacency[a] {
            let e = &self.edges[i];
            if e.kind == kind && (e.to == b || e.from == b) {
                self.edges[i].dead = true;
            }
        }
    }

    /// Parse one authored effect `(op, target, formula)` into an `Effect`. Shared
    /// by data-actions and events so both speak the exact same effect vocabulary.
    fn build_effect(op: &str, target: String, formula: String) -> Result<super::action::Effect, String> {
        use super::action::Effect;
        Ok(match op {
            "move" => Effect::Move { via: target },
            "spawn" => Effect::Spawn { kind: target, name: formula },
            "despawn" => Effect::Despawn,
            "add" => Effect::Stat { stat: target, value: super::expr::parse(&formula)?, additive: true },
            // reach another entity: "affect" adds, "affect_set" sets; target = "edge:stat".
            // Optional PICK selector: "edge:stat@max:<rank formula>" (or @min:) hits ONLY
            // the single neighbor with the best rank (rank reads target.X per candidate).
            "affect" | "affect_set" => {
                let (spec, pick_spec) = match target.split_once('@') {
                    Some((s, p)) => (s, Some(p)),
                    None => (target.as_str(), None),
                };
                let (via, stat) = spec.split_once(':').ok_or_else(|| "affect target must be \"edge:stat\"".to_string())?;
                let pick = match pick_spec {
                    None => None,
                    Some(p) => {
                        let (dir, rank) = p.split_once(':').ok_or_else(|| "affect pick must be \"@max:<formula>\" or \"@min:<formula>\"".to_string())?;
                        let max = match dir {
                            "max" => true,
                            "min" => false,
                            _ => return Err(format!("affect pick direction must be max or min, got \"{dir}\"")),
                        };
                        Some((max, super::expr::parse(rank)?))
                    }
                };
                Effect::Interact { via: via.to_string(), stat: stat.to_string(), value: super::expr::parse(&formula)?, additive: op == "affect", pick }
            }
            // form/acquire a relationship; optional "@max:<rank>"/"@min:<rank>" pick
            // selects the BEST co-located candidate (rank reads target.X) instead of
            // link's random sample / claim's first-in-id-order — the fair-auction /
            // choose-your-rival / take-the-shiniest primitive.
            "link" => {
                let (spec, pick_spec) = match target.split_once('@') {
                    Some((s, p)) => (s, Some(p)),
                    None => (target.as_str(), None),
                };
                let (edge, kind) = spec.split_once(':').ok_or_else(|| "link target must be \"edge:kind\"".to_string())?;
                Effect::Link { edge: edge.to_string(), kind: kind.to_string(), pick: Self::parse_pick(pick_spec)? }
            }
            "claim" => {
                let (spec, pick_spec) = match target.split_once('@') {
                    Some((s, p)) => (s, Some(p)),
                    None => (target.as_str(), None),
                };
                let (edge, kind) = spec.split_once(':').ok_or_else(|| "claim target must be \"edge:kind\"".to_string())?;
                Effect::Claim { edge: edge.to_string(), kind: kind.to_string(), pick: Self::parse_pick(pick_spec)? }
            }
            "unlink" => Effect::Unlink { edge: target },
            _ => Effect::Stat { stat: target, value: super::expr::parse(&formula)?, additive: false },
        })
    }

    /// Parse an optional "@max:<formula>" / "@min:<formula>" pick suffix.
    fn parse_pick(pick_spec: Option<&str>) -> Result<Option<(bool, super::expr::Expr)>, String> {
        match pick_spec {
            None => Ok(None),
            Some(p) => {
                let (dir, rank) = p.split_once(':').ok_or_else(|| "pick must be \"@max:<formula>\" or \"@min:<formula>\"".to_string())?;
                let max = match dir {
                    "max" => true,
                    "min" => false,
                    _ => return Err(format!("pick direction must be max or min, got \"{dir}\"")),
                };
                Ok(Some((max, super::expr::parse(rank)?)))
            }
        }
    }

    /// Among `cands`, the one with the best `rank` (target-context). Exact ties →
    /// the earliest candidate in scan order. None if empty.
    fn pick_best(&self, actor: EntityId, cands: &[EntityId], want_max: bool, rank: &super::expr::Expr) -> Option<EntityId> {
        cands
            .iter()
            .map(|&t| (t, rank.eval_with(self, actor, Some(t))))
            .reduce(|best, cand| {
                let better = if want_max { cand.1 > best.1 } else { cand.1 < best.1 };
                if better { cand } else { best }
            })
            .map(|(t, _)| t)
    }

    /// Carry out one effect for `actor`. Shared by the data-action phase and the
    /// event phase — one place that knows how every effect touches the world.
    fn apply_effect(&mut self, actor: EntityId, e: &super::action::Effect) {
        use super::action::Effect;
        match e {
            Effect::Stat { stat, value, additive } => {
                let v = value.eval(self, actor);
                if *additive { self.add(actor, stat, v) } else { self.set(actor, stat, v) }
            }
            Effect::Move { via } => {
                // Move along a `via` edge. First try the actor's OWN edge (private
                // route: go home/to work). If it has none, follow its CURRENT
                // PARENT's edge — walk out of this room through a `door` into the
                // connected room. This is topological movement and it composes up
                // the tiers: leave a room by a door, a building by a street — same
                // prim, deeper or shallower node. The destination is a place (the
                // connected scope), so the actor reparents INTO it.
                let own = self.neighbors(actor, via);
                let dest = if let Some(&t) = own.first() {
                    Some(t)
                } else if let Some(here) = self.entities[actor].parent {
                    // Through-door: pick a connected room, PREFERRING not to immediately
                    // backtrack to where we just came from — so a corridor is traversed,
                    // not oscillated. (Anti-backtrack is a property every place-graph
                    // walker needs, so it lives in the prim, not every world's data.)
                    let last = self.last_place.get(&actor).copied();
                    let rooms: Vec<EntityId> = self.neighbors(here, via).into_iter().filter(|&r| r != actor).collect();
                    rooms.iter().copied().find(|&r| Some(r) != last).or_else(|| rooms.first().copied())
                } else {
                    None
                };
                if let Some(t) = dest {
                    if own.is_empty() {
                        // remember the room we're leaving, so next move won't turn back
                        if let Some(here) = self.entities[actor].parent {
                            self.last_place.insert(actor, here);
                        }
                    }
                    self.reparent(actor, t);
                }
            }
            Effect::Spawn { kind, name } => {
                let parent = self.entities[actor].parent.unwrap_or(self.root);
                let nm = format!("{name} {}", self.entities.len());
                let child = self.spawn(kind, &nm, parent);
                // Inheritance: a spawned entity (a birth) carries its parent's stats,
                // then starts life fresh — age 0. Without this a newborn has empty
                // stats and dies on the next tick's needs check; inheritance is what
                // a "birth" effect actually means, and it's the same lineage-carrying
                // behavior generators give to revealed children. `age` is reset so a
                // child isn't born as old as its parent (the one near-universal case).
                if self.entities[actor].kind == *kind {
                    let inherited = self.entities[actor].stats.clone();
                    for (k, v) in inherited {
                        self.entities[child].set(&k, v);
                    }
                    self.entities[child].set("age", 0.0);
                }
            }
            Effect::Despawn => self.despawn(actor),
            Effect::Interact { via, stat, value, additive, pick } => {
                // eval per-target so the value can read `target.X` (the entity being
                // acted on) alongside the actor's own stats and `parent.X`.
                // Special target `co` = every CO-LOCATED peer (same scope/room), so
                // an agent can act on "everyone here" without pre-wired edges — the
                // spatial counterpart to edge-based reach.
                let mut targets = if via == "co" { self.siblings(actor) } else { self.neighbors(actor, via) };
                // pick = act on THE one best candidate: rank each (target in context),
                // keep only the argmax/argmin. Exact ties resolve to the earliest-
                // linked neighbor — deterministic even at 0.71 vs 0.70 vs 0.70.
                if let Some((want_max, rank)) = pick {
                    targets = targets
                        .into_iter()
                        .map(|t| (t, rank.eval_with(self, actor, Some(t))))
                        .reduce(|best, cand| {
                            let better = if *want_max { cand.1 > best.1 } else { cand.1 < best.1 };
                            if better { cand } else { best }
                        })
                        .map(|(t, _)| vec![t])
                        .unwrap_or_default();
                }
                for t in targets {
                    let v = value.eval_with(self, actor, Some(t));
                    if *additive { self.add(t, stat, v) } else { self.set(t, stat, v) }
                }
            }
            Effect::Link { edge, kind, pick } => {
                if let Some((want_max, rank)) = pick {
                    // SELECTED link: scan co-located peers of `kind` and link the
                    // best-ranked one (rank reads target.X). O(siblings-of-kind) —
                    // opt-in; the default random sample below stays O(1). This is
                    // the award-to-highest-bidder / choose-THE-rival primitive.
                    if let Some(pool) = self.kind_index.get(kind).cloned() {
                        let parent = self.entities[actor].parent;
                        let cands: Vec<EntityId> = pool
                            .into_iter()
                            .filter(|&c| c != actor
                                && !self.entities[c].dead
                                && self.entities[c].parent == parent
                                && !self.linked(actor, c, edge))
                            .collect();
                        if let Some(best) = self.pick_best(actor, &cands, *want_max, rank) {
                            self.link(actor, best, edge, 1.0);
                        }
                    }
                } else {
                    // Sample ONE random peer of `kind` (O(1) via the kind index) and
                    // link if it's a valid, co-located, not-already-linked partner.
                    // Probabilistic — no full sibling scan, so this stays O(degree)
                    // even in a flat crowd of a million. Misses just retry next tick.
                    if let Some(pool) = self.kind_index.get(kind) {
                        if !pool.is_empty() {
                            let h = (self.entity_seed(actor) ^ self.tick).wrapping_mul(0x2545_F491_4F6C_DD1D);
                            let cand = pool[(h >> 33) as usize % pool.len()];
                            if cand != actor
                                && !self.entities[cand].dead
                                && self.entities[cand].parent == self.entities[actor].parent
                                && !self.linked(actor, cand, edge)
                            {
                                self.link(actor, cand, edge, 1.0);
                            }
                        }
                    }
                }
            }
            Effect::Claim { edge, kind, pick } => {
                // Exclusive acquisition: take a co-located peer of `kind` that no one
                // owns (has no `edge` from anyone). Without a pick: deterministic scan
                // in id order — first unowned peer wins. With `@max:`/`@min:`: rank
                // the free candidates and take the best (the shiniest, the nearest).
                // Because actions run sequentially in a tick, a later actor sees the
                // earlier claim and finds the resource taken — single-holder holds.
                if !self.has_edge_of_kind(actor, edge) {
                    if let Some(pool) = self.kind_index.get(kind).cloned() {
                        let parent = self.entities[actor].parent;
                        let cands: Vec<EntityId> = pool
                            .into_iter()
                            .filter(|&c| c != actor
                                && !self.entities[c].dead
                                && self.entities[c].parent == parent
                                && !self.has_edge_of_kind(c, edge))
                            .collect();
                        let chosen = match pick {
                            Some((want_max, rank)) => self.pick_best(actor, &cands, *want_max, rank),
                            None => cands.first().copied(),
                        };
                        if let Some(best) = chosen {
                            self.link(actor, best, edge, 1.0);
                        }
                    }
                }
            }
            Effect::Unlink { edge } => self.unlink_all(actor, edge),
        }
    }

    pub fn step(&mut self) {
        // 0. Agency: each active agent chooses and acts. A player's intent
        //    overrides the utility pick — same actions, whoever is at the wheel.
        let action_sets = std::mem::take(&mut self.actions);
        for (kind, acts) in &action_sets {
            for id in self.active_by_kind(kind) {
                if let Some(a) = self.choose_action(id, acts) {
                    if self.recording {
                        *self.act_counts.entry(format!("{kind}:{}", a.name())).or_default() += 1;
                    }
                    a.apply(self, id);
                }
            }
        }
        self.actions = action_sets;

        // 0b. Data-driven agency: actions authored as formulas (score + effects).
        //     Same choice logic — player intent, else the top-scoring action.
        if !self.data_actions.is_empty() {
            let sets = std::mem::take(&mut self.data_actions);
            for (kind, actions) in &sets {
                for id in self.active_by_kind(kind) {
                    let chosen = match self.intents.get(&id) {
                        Some(name) => actions.iter().find(|a| a.name == *name),
                        None => {
                            let mut best = None;
                            let mut best_score = 0.0_f32;
                            for a in actions {
                                let s = a.score.eval(self, id);
                                if s > best_score {
                                    best_score = s;
                                    best = Some(a);
                                }
                            }
                            best
                        }
                    };
                    if let Some(a) = chosen {
                        self.last_actions.insert(id, a.name.clone());
                        if self.recording {
                            *self.act_counts.entry(format!("{kind}:{}", a.name)).or_default() += 1;
                        }
                        for e in &a.effects {
                            self.apply_effect(id, e);
                        }
                    }
                }
            }
            self.data_actions = sets;
        }

        // 1. Detailed systems (they iterate `active_by_kind`, so only entities
        //    under a fully-Detailed chain get simulated individually).
        let systems = std::mem::take(&mut self.systems);
        for s in &systems {
            s.tick(self);
        }
        self.systems = systems;

        // 2. Coarse systems (folded scopes evolve as aggregates — cheap).
        let coarse = std::mem::take(&mut self.coarse_systems);
        for s in &coarse {
            s.tick(self);
        }
        self.coarse_systems = coarse;

        // 2b. Data-driven rules — behaviors authored as formulas, not code.
        if !self.rules.is_empty() {
            let rules = std::mem::take(&mut self.rules);
            for rule in &rules {
                for id in self.active_by_kind(&rule.on_kind) {
                    let v = rule.expr.eval(self, id);
                    self.set(id, &rule.set_stat, v);
                }
            }
            self.rules = rules;
        }

        // 2c. Events — data-authored state transitions on a rising-edge condition.
        if !self.events.is_empty() {
            let mut events = std::mem::take(&mut self.events);
            for ev in &mut events {
                for id in self.active_by_kind(&ev.on_kind) {
                    let active = ev.when.eval(self, id) > 0.5;
                    let was = *ev.fired.get(&id).unwrap_or(&false);
                    if active && !was {
                        for e in &ev.effects {
                            self.apply_effect(id, e);
                        }
                        let msg = format!("{} — {}", self.name(id), ev.label);
                        self.note(msg);
                        if self.recording {
                            *self.event_counts.entry(ev.label.clone()).or_default() += 1;
                        }
                    }
                    ev.fired.insert(id, active);
                }
            }
            self.events = events;
        }

        // 2d. Coarse drift — the offscreen world keeps moving. Frontier nodes
        //     (Coarse/Hazed, just outside the Detailed camera path) evolve as
        //     single aggregate nodes, no subtree simulated. Cheap; this is the
        //     whole LOD bargain — an unwatched district still changes.
        if !self.coarse_rules.is_empty() {
            let rules = std::mem::take(&mut self.coarse_rules);
            let frontier = self.frontier();
            for rule in &rules {
                for &id in &frontier {
                    if self.entities[id].kind == rule.on_kind {
                        let v = rule.expr.eval(self, id);
                        self.set(id, &rule.set_stat, v);
                    }
                }
            }
            self.coarse_rules = rules;
        }

        // Rebuild the shallow→deep traversal order ONLY if the tree changed since
        // last tick (spawn/despawn/reparent set order_dirty). In a steady sim this
        // sort happens ~never instead of twice per tick.
        if self.order_dirty {
            let mut o: Vec<EntityId> = (0..self.entities.len()).collect();
            o.sort_by_key(|&i| self.depth[i]);
            self.order_cache = o;
            self.order_dirty = false;
        }
        let order = std::mem::take(&mut self.order_cache);

        // 3. Rollups: deepest parents first (iterate the shallow→deep cache in
        //    reverse). Skip non-Detailed parents — their aggregate is authoritative.
        for &pid in order.iter().rev() {
            if self.entities[pid].fidelity != Fidelity::Detailed {
                continue; // Coarse/Hazed aggregate is authoritative; dormant kids can't clobber it
            }
            for r in &self.rollups {
                if self.entities[pid].kind != r.parent_kind {
                    continue;
                }
                let kids = self.entities[pid].children.clone();
                let vals: Vec<f32> = kids.iter().map(|&c| self.entities[c].stat(&r.child_stat)).collect();
                let v = r.reducer.reduce(&vals);
                self.entities[pid].set(&r.parent_stat, v);
                // Flow drain: harvest the per-tick accumulation, then clear it so
                // the next tick starts from zero (see Rollup::drain).
                if r.drain {
                    for &c in &kids {
                        self.entities[c].set(&r.child_stat, 0.0);
                    }
                }
            }
        }

        // 4. Broadcasts: root first, down to the leaves (the cache is already
        //    shallow→deep). Reaches folded scopes.
        for &id in &order {
            let Some(p) = self.entities[id].parent else {
                continue;
            };
            for b in &self.broadcasts {
                if !b.parent_kind.is_empty() && self.entities[p].kind != b.parent_kind {
                    continue;
                }
                let pv = self.entities[p].stat(&b.parent_stat);
                self.entities[id].set(&b.child_stat, b.gain * pv);
            }
        }
        self.order_cache = order; // put the cache back for next tick

        // instrumentation: sample watched headcounts (peak + running average)
        if self.recording && !self.watched.is_empty() {
            self.record_ticks += 1;
            for k in self.watched.clone() {
                let c = self.by_kind(&k).len() as u64;
                let peak = self.kind_peak.entry(k.clone()).or_default();
                if c > *peak { *peak = c; }
                *self.kind_sum.entry(k).or_default() += c;
            }
        }

        self.tick += 1;
    }
}

// ---- treemap subdivision (the "subdivide" partition style) ----

type Rect = (f32, f32, f32, f32); // x, y, w, h in unit space

/// Weighted KD carve of an ARBITRARY region: split `cells` (the valid region's
/// grid-cell centres) among parcels so each gets a disjoint chunk with cell-count
/// ∝ its weight. Recursively halves the parcel list by cumulative weight and the
/// cell list along its bounding box's longer axis at the matching area fraction —
/// the treemap idea, carved over real land instead of a rectangle. Every parcel
/// gets ≥1 cell (caller guarantees cells.len() ≥ parcels). Deterministic: stable
/// sorts on (coord, coord), fixed tie-breaks, no RNG.
fn carve_cells(weights: &[f32], cells: Vec<(f32, f32)>) -> Vec<Vec<(f32, f32)>> {
    fn rec(idx: &[usize], weights: &[f32], mut cells: Vec<(f32, f32)>, out: &mut Vec<Vec<(f32, f32)>>) {
        if idx.len() == 1 {
            out[idx[0]] = cells;
            return;
        }
        // split the parcel list into two halves of ~equal cumulative weight
        let total: f32 = idx.iter().map(|&i| weights[i]).sum();
        let mut acc = 0.0;
        let mut k = 1;
        for (j, &i) in idx.iter().enumerate() {
            acc += weights[i];
            if acc >= total / 2.0 {
                k = (j + 1).clamp(1, idx.len() - 1);
                break;
            }
        }
        let (la, lb) = idx.split_at(k);
        let wa: f32 = la.iter().map(|&i| weights[i]).sum();
        // split the cells along the region's LONGER axis, at the weight fraction
        let (mut x0, mut y0, mut x1, mut y1) = (1.0f32, 1.0f32, 0.0f32, 0.0f32);
        for &(px, py) in &cells {
            x0 = x0.min(px); y0 = y0.min(py); x1 = x1.max(px); y1 = y1.max(py);
        }
        let horiz = (x1 - x0) >= (y1 - y0);
        cells.sort_by(|a, b| {
            let (p, q) = if horiz { ((a.0, a.1), (b.0, b.1)) } else { ((a.1, a.0), (b.1, b.0)) };
            p.partial_cmp(&q).unwrap_or(std::cmp::Ordering::Equal)
        });
        let mut cut = ((cells.len() as f32 * wa / total.max(1e-6)).round() as usize)
            .clamp(la.len(), cells.len() - lb.len());
        // SNAP the cut to a clean coordinate boundary: if the cells on either side
        // of the cut share the same primary coordinate, the two groups would share
        // a grid column/row and their bounding boxes would overlap by one cell.
        // Move the cut to the nearest legal index where the coordinate CHANGES —
        // then the split is a true straight seam and parcels are exactly disjoint.
        let key = |c: &(f32, f32)| if horiz { c.0 } else { c.1 };
        if cut > 0 && cut < cells.len() && key(&cells[cut - 1]) == key(&cells[cut]) {
            let (lo, hi) = (la.len(), cells.len() - lb.len());
            let mut fwd = cut;
            while fwd < hi && key(&cells[fwd - 1]) == key(&cells[fwd]) { fwd += 1; }
            let mut back = cut;
            while back > lo && key(&cells[back - 1]) == key(&cells[back]) { back -= 1; }
            let fwd_ok = fwd <= hi && (fwd == cells.len() || key(&cells[fwd - 1]) != key(&cells[fwd]));
            let back_ok = back >= lo && (back == 0 || key(&cells[back - 1]) != key(&cells[back]));
            cut = match (fwd_ok, back_ok) {
                (true, true) => if fwd - cut <= cut - back { fwd } else { back },
                (true, false) => fwd,
                (false, true) => back,
                _ => cut, // single-column region: no clean seam exists — accept the tie
            };
        }
        let rest = cells.split_off(cut);
        rec(la, weights, cells, out);
        rec(lb, weights, rest, out);
    }
    let mut out = vec![Vec::new(); weights.len()];
    let idx: Vec<usize> = (0..weights.len()).collect();
    rec(&idx, weights, cells, &mut out);
    out
}

/// Slice-and-dice treemap: pack `weights` into rects tiling [x,y,w,h]. Splits the
/// longest axis proportionally, recursing — variable-size cells, zero gaps.
/// Deterministic (pure arithmetic, weight-ordered).
fn squarify(weights: &[f32], x: f32, y: f32, w: f32, h: f32) -> Vec<Rect> {
    let n = weights.len();
    if n == 0 {
        return Vec::new();
    }
    if n == 1 {
        return vec![(x, y, w, h)];
    }
    // split weights into two halves of roughly equal weight (balanced → squarer cells)
    let total: f32 = weights.iter().sum();
    let mut acc = 0.0;
    let mut split = 1;
    for (i, &wt) in weights.iter().enumerate() {
        acc += wt;
        if acc >= total / 2.0 {
            split = (i + 1).max(1).min(n - 1);
            break;
        }
    }
    let (left, right) = weights.split_at(split);
    let lw: f32 = left.iter().sum();
    let frac = lw / total;
    // cut along the longer axis so cells stay chunky, not slivers
    let mut out;
    if w >= h {
        let lwid = w * frac;
        out = squarify(left, x, y, lwid, h);
        out.extend(squarify(right, x + lwid, y, w - lwid, h));
    } else {
        let lht = h * frac;
        out = squarify(left, x, y, w, lht);
        out.extend(squarify(right, x, y + lht, w, h - lht));
    }
    out
}

/// Do two unit-space rects share a boundary segment (touch on an edge)?
fn rects_adjacent(a: Rect, b: Rect) -> bool {
    let e = 1e-4;
    let (ax0, ay0, ax1, ay1) = (a.0, a.1, a.0 + a.2, a.1 + a.3);
    let (bx0, by0, bx1, by1) = (b.0, b.1, b.0 + b.2, b.1 + b.3);
    // vertical shared edge: a's right == b's left (or vice-versa) AND y-ranges overlap
    let x_touch = (ax1 - bx0).abs() < e || (bx1 - ax0).abs() < e;
    let y_overlap = ay0 < by1 - e && by0 < ay1 - e;
    // horizontal shared edge: a's bottom == b's top (or vice-versa) AND x-ranges overlap
    let y_touch = (ay1 - by0).abs() < e || (by1 - ay0).abs() < e;
    let x_overlap = ax0 < bx1 - e && bx0 < ax1 - e;
    (x_touch && y_overlap) || (y_touch && x_overlap)
}
