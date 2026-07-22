//! village.rs — "stacked subsystems → one deterministic goal", with a real
//! stressor stack so the goal is earned, not free.
//!
//! A grid of households, each running coupled subsystems — the man's energy and
//! fatigue, his yields, the home's upkeep, the woman's happiness — with happiness,
//! upkeep, and *sickness* all SPREADING to neighbors. Pulling against you: a
//! seasonal weather cycle, drought, royal taxes, a spreading illness, burnout
//! from overwork, and a structurally poorer half of town. A town-wide ROLLUP
//! counts happy women; hold 65% happy long enough and the festival's love-dragon
//! stirs. Deterministic: same seed + same choices + same stressors => same run.

use crate::rng::Rng;
use std::f32::consts::PI;

/// How the village's men split their effort. Whatever isn't spent becomes rest,
/// which recovers fatigue — so over-committing burns everyone out.
#[derive(Clone, Copy)]
pub struct VillageConfig {
    pub farm: f32,
    pub home: f32,
    pub volunteer: f32,
}

impl VillageConfig {
    fn rest(&self) -> f32 {
        (1.0 - self.farm - self.home - self.volunteer).max(0.0)
    }
}

/// The obstacles a season can throw at the village.
#[derive(Clone)]
pub struct Stressors {
    pub outbreak_day: Option<u32>,
    pub drought: Option<(u32, u32)>,
    pub tax_days: Vec<u32>,
    pub base_tax: f32,
    pub weather_amp: f32,
}

impl Stressors {
    pub fn calm() -> Self {
        Self { outbreak_day: None, drought: None, tax_days: vec![], base_tax: 0.05, weather_amp: 0.12 }
    }
    pub fn hard() -> Self {
        Self { outbreak_day: Some(15), drought: Some((25, 60)), tax_days: vec![35, 70], base_tax: 0.12, weather_amp: 0.30 }
    }
}

pub struct Village {
    pub w: usize,
    pub h: usize,
    pub upkeep: Vec<f32>,
    pub provision: Vec<f32>,
    pub happy: Vec<f32>,
    pub energy: Vec<f32>,
    pub fatigue: Vec<f32>,
    pub sickness: Vec<f32>,
    pub field: Vec<f32>,
    pub day: u32,
    pub dragon: bool,
    days_above: u32,
    policy: VillageConfig,
    stress: Stressors,
    tax_pulse: f32,
    #[allow(dead_code)]
    rng: Rng,
}

impl Village {
    pub fn new(w: usize, h: usize, seed: u64, policy: VillageConfig, stress: Stressors) -> Self {
        let mut rng = Rng::new(seed);
        let n = w * h;
        let upkeep = (0..n).map(|_| 0.35 + rng.next_f32() * 0.3).collect();
        Self {
            w,
            h,
            upkeep,
            provision: vec![0.0; n],
            happy: vec![0.4; n],
            energy: vec![0.6; n],
            fatigue: vec![0.0; n],
            sickness: vec![0.0; n],
            field: vec![1.0; n],
            day: 0,
            dragon: false,
            days_above: 0,
            policy,
            stress,
            tax_pulse: 0.0,
            rng,
        }
    }

    /// The western half of town has poorer fields — a structural disadvantage
    /// that only communal effort can offset.
    pub fn set_poor_side(&mut self, productivity: f32) {
        for y in 0..self.h {
            for x in 0..(self.w / 2) {
                self.field[y * self.w + x] = productivity;
            }
        }
    }

    fn neigh_avg(&self, f: &[f32], x: usize, y: usize) -> f32 {
        let mut sum = 0.0;
        let mut n = 0.0;
        for (dx, dy) in [(-1i32, 0i32), (1, 0), (0, -1), (0, 1)] {
            let nx = x as i32 + dx;
            let ny = y as i32 + dy;
            if nx >= 0 && nx < self.w as i32 && ny >= 0 && ny < self.h as i32 {
                sum += f[(ny as usize) * self.w + nx as usize];
                n += 1.0;
            }
        }
        if n > 0.0 {
            sum / n
        } else {
            0.0
        }
    }

    pub fn happy_fraction(&self) -> f32 {
        let happy = self.happy.iter().filter(|&&v| v > 0.6).count();
        happy as f32 / self.happy.len() as f32
    }

    pub fn sick_fraction(&self) -> f32 {
        let sick = self.sickness.iter().filter(|&&v| v > 0.3).count();
        sick as f32 / self.sickness.len() as f32
    }

    pub fn weather_note(&self) -> String {
        let season = 40.0f32;
        let weather = (0.75 + self.stress.weather_amp * libm::sinf(2.0 * PI * self.day as f32 / season)).clamp(0.2, 1.1);
        let drought = self.stress.drought.map_or(false, |(a, b)| self.day >= a && self.day < b);
        let mut tags = Vec::new();
        if weather < 0.65 {
            tags.push("lean season".to_string());
        }
        if drought {
            tags.push("DROUGHT".to_string());
        }
        if self.tax_pulse > 0.05 {
            tags.push("royal tax".to_string());
        }
        if self.sick_fraction() > 0.1 {
            tags.push(format!("illness {:.0}%", self.sick_fraction() * 100.0));
        }
        if tags.is_empty() {
            "calm".to_string()
        } else {
            tags.join(", ")
        }
    }

    pub fn step(&mut self) {
        let (w, h) = (self.w, self.h);
        let n = w * h;
        let dayf = self.day as f32;
        let season = 40.0f32;

        let weather = (0.75 + self.stress.weather_amp * libm::sinf(2.0 * PI * dayf / season)).clamp(0.2, 1.1);
        let drought = self.stress.drought.map_or(false, |(a, b)| self.day >= a && self.day < b);
        let drought_mult = if drought { 0.5 } else { 1.0 };

        if self.stress.tax_days.contains(&self.day) {
            self.tax_pulse = 0.28;
        }
        self.tax_pulse = (self.tax_pulse - 0.02).max(0.0);
        let tax_rate = (self.stress.base_tax + self.tax_pulse).min(0.6);

        if Some(self.day) == self.stress.outbreak_day {
            let c = (h / 2) * w + w / 2;
            self.sickness[c] = 0.9;
            if c + 1 < n {
                self.sickness[c + 1] = 0.7;
            }
        }

        let up0 = self.upkeep.clone();
        let hp0 = self.happy.clone();
        let sk0 = self.sickness.clone();
        let rest = self.policy.rest();

        // Volunteering: spare effort goes to the neediest neighbor's upkeep.
        let mut vol_add = vec![0.0f32; n];
        if self.policy.volunteer > 0.0 {
            for y in 0..h {
                for x in 0..w {
                    let mut best: Option<usize> = None;
                    let mut best_up = f32::INFINITY;
                    for (dx, dy) in [(-1i32, 0i32), (1, 0), (0, -1), (0, 1)] {
                        let nx = x as i32 + dx;
                        let ny = y as i32 + dy;
                        if nx >= 0 && nx < w as i32 && ny >= 0 && ny < h as i32 {
                            let j = (ny as usize) * w + nx as usize;
                            if up0[j] < best_up {
                                best_up = up0[j];
                                best = Some(j);
                            }
                        }
                    }
                    if let Some(j) = best {
                        vol_add[j] += self.policy.volunteer * 0.30;
                    }
                }
            }
        }

        // Sickness spreads to neighbors and slowly recovers.
        for y in 0..h {
            for x in 0..w {
                let i = y * w + x;
                let ns = self.neigh_avg(&sk0, x, y);
                self.sickness[i] = (sk0[i] + 0.18 * (ns - sk0[i]) - 0.04).clamp(0.0, 1.0);
            }
        }

        // Fatigue, energy, provision (after tax), upkeep (drifts to a supported
        // level — NOT accumulating — so effort/help set the equilibrium).
        for y in 0..h {
            for x in 0..w {
                let i = y * w + x;
                let eff_field = (self.field[i] * weather * drought_mult).clamp(0.0, 1.2);
                self.fatigue[i] = (self.fatigue[i] + 0.12 * self.policy.farm * (1.25 - eff_field) - 0.15 * rest).clamp(0.0, 1.0);
                self.energy[i] = (0.42 + 0.50 * self.happy[i] - 0.30 * self.fatigue[i] - 0.45 * self.sickness[i]).clamp(0.0, 1.0);
                let raw = (self.energy[i] * self.policy.farm * eff_field * 1.9).clamp(0.0, 1.0);
                self.provision[i] = raw * (1.0 - tax_rate);

                let neigh_up = self.neigh_avg(&up0, x, y);
                let home_base = 0.30 + self.policy.home * 0.85;
                let target = (home_base + vol_add[i] * 4.0 + 0.12 * neigh_up).clamp(0.0, 1.0);
                self.upkeep[i] = (up0[i] + 0.14 * (target - up0[i])).clamp(0.0, 1.0);
            }
        }

        // Happiness spreads; sickness in the home drags it down.
        for y in 0..h {
            for x in 0..w {
                let i = y * w + x;
                let nh = self.neigh_avg(&hp0, x, y);
                self.happy[i] =
                    (0.32 * self.provision[i] + 0.44 * self.upkeep[i] + 0.24 * nh - 0.30 * self.sickness[i]).clamp(0.0, 1.0);
            }
        }

        self.day += 1;
        // A sustained blessing (not a lucky instant) summons the spirit.
        if self.happy_fraction() >= 0.65 {
            self.days_above += 1;
            if self.days_above >= 12 {
                self.dragon = true;
            }
        } else {
            self.days_above = 0;
        }
    }

    pub fn happy_map(&self) -> String {
        let mut s = String::new();
        for y in 0..self.h {
            for x in 0..self.w {
                let v = self.happy[y * self.w + x];
                let c = if v < 0.2 {
                    ' '
                } else if v < 0.4 {
                    '.'
                } else if v < 0.6 {
                    ':'
                } else if v < 0.78 {
                    '+'
                } else {
                    '#'
                };
                s.push(c);
                s.push(' ');
            }
            s.push('\n');
        }
        s
    }
}
