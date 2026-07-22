//! World specifications — data-driven world definitions.
//!
//! A `WorldSpec` is everything needed to build a fresh world: the seed, the
//! rules (`Config`), and the residents. This is the bridge to authoring — today
//! the portal edits a `WorldSpec` as JSON; tomorrow a full world-building tool
//! (or an LLM) emits one. Building a world from a spec is pure and deterministic.

use crate::agent::{Action, Agent, Housing};
use crate::world::{Config, World};

/// One resident's starting parameters. Divergent life outcomes emerge purely
/// from differences in these numbers — nothing else distinguishes people.
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[derive(Clone, Debug)]
pub struct ResidentSpec {
    pub name: String,
    pub wage: i64,
    pub money: i64,
    pub sociability: f32,
}

/// A complete, buildable description of a world.
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[derive(Clone, Debug)]
pub struct WorldSpec {
    pub seed: u64,
    pub config: Config,
    pub residents: Vec<ResidentSpec>,
}

impl WorldSpec {
    /// Build a fresh, ready-to-run world from this specification.
    pub fn build(&self) -> World {
        let mut world = World::new(self.seed, self.config.clone());
        for (i, r) in self.residents.iter().enumerate() {
            world.agents.push(Agent {
                id: i as u32,
                name: r.name.clone(),
                hunger: 0.2,
                fatigue: 0.2,
                loneliness: 0.3,
                money: r.money,
                debt: 0,
                wage: r.wage,
                sociability: r.sociability,
                housing: Housing::Housed,
                last_action: Action::Idle,
            });
        }
        world
    }
}
