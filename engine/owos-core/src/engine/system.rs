//! Systems — the rules that run each tick.
//!
//! A system is any rule that reads and writes entity stats. It's given the whole
//! world and works over entities of whatever kind it cares about. This is the
//! open extension point: a game adds behavior by adding systems, never by editing
//! the core. (Data-driven systems — rules authored as config rather than code —
//! are a planned layer on top of this same trait.)

use super::entity::EntityId;
use super::world::World;

pub trait System {
    fn name(&self) -> &str;
    fn tick(&self, world: &mut World);
}

/// An Unfolder lazily writes an entity's canon the first time it's revealed,
/// constrained by that entity's current aggregate state. This is "canon as an
/// unfolding": the WHY behind a coarse fact (a nation's unrest) is only written
/// when someone focuses the lens on it — and then it persists and can spread.
pub trait Unfolder {
    fn unfold(&self, world: &mut World, id: EntityId);
}
