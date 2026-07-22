//! The relationship graph — typed edges between any two entities.
//!
//! The scope tree gives *containment* (a city contains buildings). But worlds
//! also need *lateral* relations the tree can't express: which room has a door
//! to which, which cities a road connects, who is whose friend or rival. One
//! general primitive covers them all — a typed, weighted edge. Spatial adjacency
//! is just an edge of kind "door"; a friendship is an edge of kind "friend".

use super::entity::EntityId;

#[derive(Clone, Debug)]
pub struct Edge {
    pub from: EntityId,
    pub to: EntityId,
    pub kind: String,
    pub weight: f32,
    /// Tombstone — `unlink` marks edges dead rather than removing them, so the
    /// per-node adjacency index never has to fix up shifted indices.
    pub dead: bool,
}
