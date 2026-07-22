//! # otherworldOS core
//!
//! A portable, deterministic living-world runtime. The simulation advances a
//! world of agents forward in time — they act on their needs, systems collide,
//! and history accumulates. You leave, time passes, you come back and the world
//! has genuinely changed.
//!
//! ## Design rules (do not break these — they are what make it universal)
//! - **No I/O, no rendering, no platform APIs.** The core only computes state.
//! - **Deterministic.** Same seed + same inputs => byte-identical world. No
//!   wall-clock, no `HashMap` iteration (use `BTreeMap`), all randomness flows
//!   through the seeded [`Rng`]. This buys us replay, debugging, and netcode.
//! - **Dependency-light.** So it compiles to native, WASM, and console targets.
//!   `serde` is behind an optional feature; the default build has zero deps.
//!
//! The public surface here IS the "API" — the contract every game binds to,
//! whether via WASM (web), a C ABI (Unity/Unreal/PS5), or natively (a server).

pub mod agent;
pub mod diff;
pub mod dynamics;
pub mod engine;
pub mod event;
pub mod kit;
pub mod library;
pub mod rng;
pub mod seed;
pub mod sim;
pub mod spec;
pub mod time;
pub mod village;
pub mod world;

pub use agent::{Action, Agent, AgentId, Housing};
pub use event::{Event, EventKind, EventLog};
pub use rng::Rng;
pub use spec::{ResidentSpec, WorldSpec};
pub use time::{Clock, TICKS_PER_DAY};
pub use world::{Config, World};
