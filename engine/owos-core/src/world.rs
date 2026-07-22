//! The world — the single container of all simulation state.
//!
//! Everything the simulation needs lives here so it can be snapshotted, saved,
//! and advanced as one unit. `relationships` uses a `BTreeMap` (not `HashMap`)
//! on purpose: deterministic iteration order is required for reproducibility.

use std::collections::BTreeMap;

use crate::agent::{Agent, AgentId};
use crate::event::EventLog;
use crate::rng::Rng;
use crate::time::Clock;

/// World-level tuning knobs — the shared rules of the world. These are exactly
/// the values the Configure panel edits; changing one changes how the whole
/// world behaves. Per-agent parameters (wage, sociability) live on the agents.
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[derive(Clone, Debug)]
pub struct Config {
    pub food_cost: i64,       // money to satisfy hunger once
    pub rent_per_day: i64,    // charged each morning to housed agents
    pub eviction_debt: i64,   // debt at which a housed agent loses their home
    pub rehouse_cost: i64,    // savings needed for a homeless agent to get back in
    pub work_start: u32,      // first work hour
    pub work_end: u32,        // last work hour (exclusive)
    pub hunger_rate: f32,     // hunger gained per hour
    pub fatigue_rate: f32,    // fatigue gained per hour
    pub loneliness_rate: f32, // base loneliness gained per hour
}

impl Default for Config {
    fn default() -> Self {
        Self {
            food_cost: 8,
            rent_per_day: 10,
            eviction_debt: 40,
            rehouse_cost: 35,
            work_start: 8,
            work_end: 18,
            hunger_rate: 0.03,
            fatigue_rate: 0.025,
            loneliness_rate: 0.02,
        }
    }
}

pub struct World {
    pub clock: Clock,
    pub agents: Vec<Agent>,
    /// Pairwise affinity, `0.0..1.0`. Keyed by an ordered `(low, high)` id pair.
    pub relationships: BTreeMap<(AgentId, AgentId), f32>,
    pub log: EventLog,
    pub rng: Rng,
    pub config: Config,
}

impl World {
    pub fn new(seed: u64, config: Config) -> Self {
        Self {
            clock: Clock::new(),
            agents: Vec::new(),
            relationships: BTreeMap::new(),
            log: EventLog::default(),
            rng: Rng::new(seed),
            config,
        }
    }

    /// Canonical, order-independent key for a relationship between two agents.
    pub fn rel_key(a: AgentId, b: AgentId) -> (AgentId, AgentId) {
        if a <= b {
            (a, b)
        } else {
            (b, a)
        }
    }

    /// Nudge the affinity between two agents, clamped to `0.0..1.0`.
    pub fn bump_rel(&mut self, a: AgentId, b: AgentId, delta: f32) {
        let key = Self::rel_key(a, b);
        let entry = self.relationships.entry(key).or_insert(0.0);
        *entry = (*entry + delta).clamp(0.0, 1.0);
    }
}
