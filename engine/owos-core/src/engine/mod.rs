//! # otherworldOS engine — the universal scope-tree runtime.
//!
//! One model for every scale. Everything is an [`Entity`] with stats, placed in
//! a tree (world → nations → cities → citizens → …). [`System`]s run rules each
//! tick; [`Rollup`]s aggregate children into parents (bottom-up); [`Broadcast`]s
//! push parent state down onto children (top-down). Actions from a player, an
//! NPC, or god-mode enter at ANY scale. Domain-agnostic by construction — the
//! engine never mentions humans, cities, or dragons; a game supplies those as
//! entity kinds, stats, and systems.

pub mod action;
pub mod canon;
pub mod entity;
pub mod expr;
pub mod flow;
pub mod graph;
pub mod scale;
pub mod system;
pub mod world;

pub use action::Action;
pub use canon::Claim;
pub use entity::{Entity, EntityId, Fidelity};
pub use expr::{Expr, Rule};
pub use flow::FlowMap;
pub use graph::Edge;
pub use scale::{Broadcast, Reducer, Rollup};
pub use system::{System, Unfolder};
pub use world::{Notable, World};
