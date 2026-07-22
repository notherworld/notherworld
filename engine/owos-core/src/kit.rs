//! Kits — data-driven world definitions for the dynamics engine.
//!
//! A Kit is a "lego": a bundle of signals + flows + notable-event thresholds you
//! can run on its own or overlap with other Kits. The engine knows nothing about
//! ecology or economics — only *signals* and the *operators* that move them. New
//! operators are added by extending these types, never by hardcoding a domain.

/// A named number. Ids are bare inside a Kit ("grass"); the engine namespaces
/// them on load ("eco.grass") so Kits compose without collisions.
pub type SignalId = String;

#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[derive(Clone, Debug)]
pub struct SignalDef {
    pub id: SignalId,
    pub initial: f32,
    pub min: f32,
    pub max: f32,
    pub noise: f32,
}

/// One additive term of a flow: `coeff * product(factors)`. An empty `factors`
/// list is a constant. `[a, b]` is a coupling (a*b). `[a, a]` is a square (for
/// logistic caps). This handful covers decay, growth, and coupled feedback.
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[derive(Clone, Debug)]
pub struct Term {
    pub coeff: f32,
    pub factors: Vec<SignalId>,
}

/// A signal's rate of change, as a sum of terms. Several flows may target the
/// same signal — their contributions add. That's how a *bridge* couples an
/// outside signal into a Kit without touching the Kit's own rules.
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[derive(Clone, Debug)]
pub struct Flow {
    pub target: SignalId,
    pub terms: Vec<Term>,
}

#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Cmp {
    Above,
    Below,
}

/// When `signal` crosses `value`, the engine logs `label` once (on the edge).
/// This is the "notable event" primitive — the world narrating itself.
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[derive(Clone, Debug)]
pub struct Threshold {
    pub signal: SignalId,
    pub cmp: Cmp,
    pub value: f32,
    pub label: String,
}

#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[derive(Clone, Debug)]
pub struct Kit {
    pub name: String,  // short namespace, e.g. "eco"
    pub title: String, // human title
    pub signals: Vec<SignalDef>,
    pub flows: Vec<Flow>,
    pub thresholds: Vec<Threshold>,
}

/// A one-shot change injected into a signal — the atom of a catalyst.
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[derive(Clone, Debug)]
pub enum Impulse {
    Add { signal: SignalId, amount: f32 },
    Set { signal: SignalId, value: f32 },
    Scale { signal: SignalId, factor: f32 },
}

/// A catalyst — a named shock fired into a running world from *outside* the
/// physics: a player, god-mode, a schedule, a random roll, or later an LLM
/// agent. This is the engine's INPUT primitive. Flows evolve the world over
/// time; catalysts perturb it in an instant. Impulses use fully-qualified
/// signal ids ("eco.grass"), just like bridges.
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[derive(Clone, Debug)]
pub struct Catalyst {
    pub name: String,
    pub label: String,
    pub impulses: Vec<Impulse>,
}
