//! Actions & agency — how entities decide what to do.
//!
//! An `Action` is a choice an entity can make: how appealing it is right now
//! (`score`, utility AI) and what it does (`apply`). Each tick, an agent scores
//! its available actions and takes the best — UNLESS a player has set an intent
//! for that entity, in which case the player's choice wins. Same menu, same
//! effects; the only difference between an NPC and a player is *who chooses*.
//! That's how "how players interact" and "how NPCs behave" become one system.

use super::entity::EntityId;
use super::expr::Expr;
use super::world::World;

pub trait Action {
    fn name(&self) -> &str;
    /// How appealing is this action to `actor` right now? Higher wins; <= 0 = no.
    fn score(&self, world: &World, actor: EntityId) -> f32;
    /// Carry it out (may touch the actor and others).
    fn apply(&self, world: &mut World, actor: EntityId);
}

/// One effect of a data-authored action. Either change a stat, or MOVE — relocate
/// the actor in the tree to whatever its `via` edge points at (home/work/beach…),
/// so location is real presence, not a flag.
pub enum Effect {
    Stat { stat: String, value: Expr, additive: bool },
    Move { via: String },
    /// Birth: create a new sibling entity of `kind` (reproduction, enemy waves…).
    Spawn { kind: String, name: String },
    /// Death: remove the actor from the world.
    Despawn,
    /// Reach OUT and change another entity: apply `value` to `stat` on every
    /// entity linked to the actor by the `via` edge (attack, heal, pay, teach).
    /// This is the difference between agents that coexist and a society that acts.
    /// `pick` narrows the reach to THE one best target: `Some((max, rank))` ranks
    /// each candidate by the `rank` formula (with `target.X` = that candidate) and
    /// applies the value ONLY to the argmax (or argmin) — duel the #1 rival, mend
    /// the single sickest friend. Ties break to the earliest-linked neighbor
    /// (deterministic).
    Interact { via: String, stat: String, value: Expr, additive: bool, pick: Option<(bool, Expr)> },
    /// Form a relationship from data: link the actor (edge type `edge`) to a
    /// co-located peer of `kind` it isn't already linked to (befriend, recruit).
    /// `pick` = Some((max, rank)) selects the BEST candidate by the rank formula
    /// (candidate = `target`) instead of a random sample — award-to-highest-bidder,
    /// choose-your-true-rival. Ties → earliest in scan order, deterministic.
    Link { edge: String, kind: String, pick: Option<(bool, Expr)> },
    /// EXCLUSIVE acquisition: link the actor to a co-located peer of `kind` that
    /// currently has NO `edge` from anyone — and no one else can then take it. This
    /// is discrete ownership: a specific item held by exactly one owner (the key,
    /// a job slot, a parking spot, a throne, a monogamous mate). Because actions
    /// apply sequentially within a tick, the first claimant wins and the rest see
    /// it taken. Pair with `unlink` to release.
    /// `pick` ranks the FREE candidates (take the shiniest, the nearest, the
    /// cheapest) instead of first-in-id-order.
    Claim { edge: String, kind: String, pick: Option<(bool, Expr)> },
    /// Break relationships from data: drop all of the actor's `edge` edges.
    Unlink { edge: String },
}

/// An action authored entirely as DATA: a utility `score` formula and a list of
/// effect formulas. The same lego as rules, but for *decisions* — an NPC picks
/// its highest-scoring action each tick (or a player's intent overrides it).
pub struct DataAction {
    pub name: String,
    pub score: Expr,
    pub effects: Vec<Effect>,
}
