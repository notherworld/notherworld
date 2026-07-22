//! Events — the world's memory.
//!
//! Every meaningful thing that happens is logged as an `Event`. For now the log
//! is append-only history, which is what powers the "here's what changed while
//! you were away" report. Later this becomes a true publish/subscribe bus so
//! systems can react to each other's events within a tick.

use crate::agent::AgentId;

#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[derive(Clone, Debug, PartialEq)]
pub enum EventKind {
    Worked { earned: i64 },
    Ate,
    Socialized { with: AgentId },
    WentHungry,
    RentPaid { amount: i64 },
    RentMissed { amount: i64 },
    Evicted,
    RegainedHousing,
}

#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[derive(Clone, Debug)]
pub struct Event {
    pub day: u64,
    pub hour: u32,
    pub actor: AgentId,
    pub kind: EventKind,
}

#[derive(Clone, Debug, Default)]
pub struct EventLog {
    pub events: Vec<Event>,
}

impl EventLog {
    pub fn push(&mut self, e: Event) {
        self.events.push(e);
    }

    /// How many logged events for `actor` match `pred`.
    pub fn count_kind(&self, actor: AgentId, pred: impl Fn(&EventKind) -> bool) -> usize {
        self.events
            .iter()
            .filter(|e| e.actor == actor && pred(&e.kind))
            .count()
    }
}
