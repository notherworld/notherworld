//! Agents — the people who live in the world.
//!
//! An agent is just data. All behavior lives in `sim.rs` so the decision logic
//! is easy to find, tune, and eventually swap out. Needs are normalized to
//! `0.0` (fully satisfied) .. `1.0` (desperate).

pub type AgentId = u32;

/// Where an agent sleeps. Losing housing changes behavior (poor rest) and mood.
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Housing {
    Housed,
    Homeless,
}

/// What an agent chose to do this tick.
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Action {
    Idle,
    Sleep,
    Work,
    Eat,
    Socialize,
}

#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[derive(Clone, Debug)]
pub struct Agent {
    pub id: AgentId,
    pub name: String,

    // Needs: 0.0 satisfied .. 1.0 desperate.
    pub hunger: f32,
    pub fatigue: f32,
    pub loneliness: f32,

    // Resources.
    pub money: i64,
    pub debt: i64,

    // Traits / parameters (the knobs you "set up in the world-building engine").
    pub wage: i64,        // earned per hour worked
    pub sociability: f32, // 0..1: how fast loneliness grows, how much they seek company

    pub housing: Housing,
    pub last_action: Action,
}

impl Agent {
    /// A rough felt-sense of how life is going, `-1.0` .. `1.0`.
    /// Derived from needs plus life circumstances, so it moves on its own.
    pub fn mood(&self) -> f32 {
        let need_load = (self.hunger + self.fatigue + self.loneliness) / 3.0;
        let base = 1.0 - need_load;
        let homeless_pen = if self.housing == Housing::Homeless { 0.4 } else { 0.0 };
        let debt_pen = (self.debt as f32 / 100.0).min(0.4);
        (base - homeless_pen - debt_pen).clamp(-1.0, 1.0)
    }
}
