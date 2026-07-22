//! World time.
//!
//! Time is measured in discrete ticks. For now, 1 tick = 1 in-world hour, which
//! is coarse enough to fast-forward many days cheaply (the "time-skip" that lets
//! a world evolve while the player is away) yet fine enough for daily rhythms.

/// Ticks in one in-world day. One tick == one hour.
pub const TICKS_PER_DAY: u32 = 24;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub struct Clock {
    pub tick: u64,
}

impl Clock {
    pub fn new() -> Self {
        Self { tick: 0 }
    }

    /// Whole days elapsed.
    pub fn day(&self) -> u64 {
        self.tick / TICKS_PER_DAY as u64
    }

    /// Hour of the current day, `0..24`.
    pub fn hour(&self) -> u32 {
        (self.tick % TICKS_PER_DAY as u64) as u32
    }

    pub fn advance(&mut self) {
        self.tick += 1;
    }
}
