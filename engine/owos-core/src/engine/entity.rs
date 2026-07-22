//! Entities — the one universal building block.
//!
//! A player, a household, a city, a nation, a weather front, the world itself —
//! all are just Entities: a bag of named stats, a place in the scope tree (a
//! parent and children), and a fidelity level (how finely it's being simulated).
//! Nothing here is human-specific. Scale is just depth in the tree.

use std::collections::HashMap;
use std::hash::{BuildHasherDefault, Hasher};

pub type EntityId = usize;

/// A tiny deterministic FNV-1a hasher for stat maps. Stats are looked up by name
/// millions of times per tick in formula eval; a hash map beats a `BTreeMap`'s
/// string-compare tree walk, and a FIXED hasher (unlike std's randomized one)
/// keeps runs bit-for-bit reproducible — determinism is non-negotiable here.
#[derive(Default)]
pub struct FnvHasher(u64);
impl Hasher for FnvHasher {
    fn finish(&self) -> u64 {
        self.0
    }
    fn write(&mut self, bytes: &[u8]) {
        let mut h = if self.0 == 0 { 0xcbf2_9ce4_8422_2325 } else { self.0 };
        for &b in bytes {
            h ^= b as u64;
            h = h.wrapping_mul(0x0000_0100_0000_01b3);
        }
        self.0 = h;
    }
}
/// A name→value map keyed by the deterministic FNV hasher.
pub type StatMap = HashMap<String, f32, BuildHasherDefault<FnvHasher>>;

/// How finely an entity is simulated right now — the hook for Simulation-LOD.
/// Three bands so a scope boundary can be *feathered*, not flipped:
///   Coarse   — just an idea: one aggregate node, no children simulated.
///   Hazed    — structure has resolved (children exist) but is still dormant;
///              the shape is visible, the individuals aren't live yet.
///   Detailed — fully rendered: this node's own game ticks every step.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Fidelity {
    Detailed,
    Hazed,
    Coarse,
}

#[derive(Clone, Debug)]
pub struct Entity {
    pub id: EntityId,
    pub kind: String, // archetype: "world", "nation", "city", "citizen", "weather", ...
    pub name: String,
    pub stats: StatMap,
    pub parent: Option<EntityId>,
    pub children: Vec<EntityId>,
    pub fidelity: Fidelity,
    /// Camera sharpness in [0,1] — how far this node has feathered from "an idea"
    /// (0) toward "fully rendered" (1). The lens ramps it; the display band and
    /// the reveal thresholds read it. Purely presentational drift, not sim state.
    pub focus: f32,
    /// Canon — persistent facts/lore written about this entity. Empty until the
    /// entity is revealed; then lazily generated to explain its aggregate state.
    pub facts: Vec<String>,
    /// Whether this entity has ever been revealed (its canon written).
    pub revealed: bool,
    /// Tombstone: despawned entities stay in the arena (ids are stable) but are
    /// filtered out of all iteration.
    pub dead: bool,
    /// Circulation infrastructure the ENGINE spawned while wiring routes (shore
    /// gates, bridges/ferries/portals — whatever `trans_kind` the dev named).
    /// Hosts filter on THIS flag when listing a scope's navigable sub-scopes,
    /// never on kind names — the engine knows what it spawned; the host doesn't
    /// have to know what the dev called it.
    pub infra: bool,
}

impl Entity {
    pub fn stat(&self, key: &str) -> f32 {
        self.stats.get(key).copied().unwrap_or(0.0)
    }
    pub fn set(&mut self, key: &str, v: f32) {
        self.stats.insert(key.to_string(), v);
    }
    pub fn add(&mut self, key: &str, delta: f32) {
        let v = self.stat(key) + delta;
        self.stats.insert(key.to_string(), v);
    }
}
