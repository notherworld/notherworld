//! Deterministic pseudo-random number generator.
//!
//! Hand-rolled xorshift64* — no external crate, so it behaves identically on
//! every platform (native, WASM, console). Determinism is a core contract:
//! all randomness in the simulation must flow through one seeded `Rng`.

#[derive(Clone, Debug)]
pub struct Rng {
    state: u64,
}

impl Rng {
    pub fn new(seed: u64) -> Self {
        // Avoid the all-zero state, which would get stuck.
        Self { state: seed ^ 0x9E37_79B9_7F4A_7C15 | 1 }
    }

    /// Next raw 64-bit value.
    pub fn next_u64(&mut self) -> u64 {
        let mut x = self.state;
        x ^= x >> 12;
        x ^= x << 25;
        x ^= x >> 27;
        self.state = x;
        x.wrapping_mul(0x2545_F491_4F6C_DD1D)
    }

    /// Uniform float in `[0.0, 1.0)`.
    pub fn next_f32(&mut self) -> f32 {
        // Use the top 24 bits for a clean mantissa.
        (self.next_u64() >> 40) as f32 / (1u64 << 24) as f32
    }

    /// `true` with probability `p`.
    pub fn chance(&mut self, p: f32) -> bool {
        self.next_f32() < p
    }

    /// Uniform integer in `[lo, hi)`.
    pub fn range(&mut self, lo: i64, hi: i64) -> i64 {
        if hi <= lo {
            return lo;
        }
        lo + (self.next_u64() % (hi - lo) as u64) as i64
    }
}
