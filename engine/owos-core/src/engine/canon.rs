//! The canon ledger — structured, contradiction-avoiding facts.
//!
//! Prose canon ("President Zhao stole the grain") is for humans; it can't be
//! reasoned over. The ledger stores canon as structured `subject —predicate→
//! object` triples (a tiny knowledge graph) so a generator can CONSULT what's
//! already true before writing more — reuse the leader that already exists,
//! respect a war already declared — instead of inventing a contradiction.
//!
//! The engine provides the store + queries; the *policy* (one leader per nation,
//! wars are symmetric, …) lives in the generator that reads it. A declarative
//! constraint layer on top is a future build.

use super::entity::EntityId;

#[derive(Clone, Debug)]
pub struct Claim {
    pub subject: EntityId,
    pub predicate: String,
    pub object: Option<EntityId>,
    pub detail: String,
}
