//! The dynamics engine — a tiny, general systems simulator.
//!
//! Everything is a *signal* (a named number). A *flow* defines a signal's rate
//! of change as a sum of terms (coeff × product of signals) — enough to express
//! decay, growth, logistic caps, and the coupled feedback loops behind
//! predator/prey, markets, and social contagion. Kits are namespaced and merged;
//! *bridges* couple signals across Kits. Composition is where cross-world
//! emergence blooms — a meadow collapse in one Kit can trigger a riot in another.
//!
//! Integration is fixed-step Euler with substeps, computed from a per-step
//! snapshot so update order never matters. Deterministic: same seed, same world.

use std::collections::BTreeMap;

use crate::kit::{Catalyst, Cmp, Flow, Impulse, Kit, SignalId, Term, Threshold};
use crate::rng::Rng;

#[derive(Clone, Debug)]
pub struct Notable {
    pub day: u32,
    pub label: String,
}

/// One or more Kits, optionally wired together with bridge flows/thresholds.
/// A single Kit and a full overlap are the same type — that's the point.
pub struct Composition {
    pub kits: Vec<Kit>,
    pub bridges: Vec<Flow>,
    pub bridge_events: Vec<Threshold>,
}

impl Composition {
    pub fn single(kit: Kit) -> Self {
        Self { kits: vec![kit], bridges: vec![], bridge_events: vec![] }
    }

    /// Merge every Kit (namespacing its signals) plus the bridges into a World.
    pub fn build(&self, seed: u64) -> World {
        let mut order: Vec<SignalId> = Vec::new();
        let mut values = BTreeMap::new();
        let mut bounds = BTreeMap::new();
        let mut noise = BTreeMap::new();
        let mut flows: Vec<Flow> = Vec::new();
        let mut thresholds: Vec<Threshold> = Vec::new();

        for kit in &self.kits {
            let ns = |raw: &str| format!("{}.{}", kit.name, raw);
            for s in &kit.signals {
                let id = ns(&s.id);
                order.push(id.clone());
                values.insert(id.clone(), s.initial);
                bounds.insert(id.clone(), (s.min, s.max));
                noise.insert(id, s.noise);
            }
            for f in &kit.flows {
                flows.push(Flow {
                    target: ns(&f.target),
                    terms: f
                        .terms
                        .iter()
                        .map(|t| Term { coeff: t.coeff, factors: t.factors.iter().map(|x| ns(x)).collect() })
                        .collect(),
                });
            }
            for t in &kit.thresholds {
                thresholds.push(Threshold { signal: ns(&t.signal), cmp: t.cmp, value: t.value, label: t.label.clone() });
            }
        }

        // Bridges are authored with fully-qualified ids ("eco.grass") already.
        flows.extend(self.bridges.iter().cloned());
        thresholds.extend(self.bridge_events.iter().cloned());

        let fired = vec![false; thresholds.len()];
        World { order, values, bounds, noise, flows, thresholds, fired, log: Vec::new(), day: 0, rng: Rng::new(seed) }
    }
}

pub struct World {
    order: Vec<SignalId>,
    values: BTreeMap<SignalId, f32>,
    bounds: BTreeMap<SignalId, (f32, f32)>,
    noise: BTreeMap<SignalId, f32>,
    flows: Vec<Flow>,
    thresholds: Vec<Threshold>,
    fired: Vec<bool>,
    pub log: Vec<Notable>,
    day: u32,
    rng: Rng,
}

impl World {
    pub fn day(&self) -> u32 {
        self.day
    }
    pub fn value(&self, id: &str) -> f32 {
        self.values.get(id).copied().unwrap_or(0.0)
    }
    pub fn signals(&self) -> &[SignalId] {
        &self.order
    }

    /// Advance one in-world day (several integration substeps for stability).
    pub fn step(&mut self) {
        const SUBSTEPS: usize = 10;
        const DT: f32 = 0.1;

        for _ in 0..SUBSTEPS {
            let snap = self.values.clone();
            let mut delta: BTreeMap<SignalId, f32> = BTreeMap::new();
            for flow in &self.flows {
                let mut d = 0.0f32;
                for term in &flow.terms {
                    let mut p = term.coeff;
                    for f in &term.factors {
                        p *= snap.get(f).copied().unwrap_or(0.0);
                    }
                    d += p;
                }
                *delta.entry(flow.target.clone()).or_insert(0.0) += d * DT;
            }
            for id in &self.order {
                let dv = delta.get(id).copied().unwrap_or(0.0);
                let amp = self.noise.get(id).copied().unwrap_or(0.0);
                let jitter = if amp > 0.0 { (self.rng.next_f32() * 2.0 - 1.0) * amp * DT } else { 0.0 };
                let (lo, hi) = self.bounds.get(id).copied().unwrap_or((f32::MIN, f32::MAX));
                if let Some(v) = self.values.get_mut(id) {
                    *v = (*v + dv + jitter).clamp(lo, hi);
                }
            }
        }

        self.day += 1;

        // Edge-triggered notable events (log once when a threshold is crossed).
        for i in 0..self.thresholds.len() {
            let (signal, cmp, value, label) = {
                let t = &self.thresholds[i];
                (t.signal.clone(), t.cmp, t.value, t.label.clone())
            };
            let val = self.values.get(&signal).copied().unwrap_or(0.0);
            let active = match cmp {
                Cmp::Above => val > value,
                Cmp::Below => val < value,
            };
            if active && !self.fired[i] {
                self.log.push(Notable { day: self.day, label });
            }
            self.fired[i] = active;
        }
    }

    /// Fire a catalyst into the world right now — the external input channel.
    /// Player actions, god-mode, scheduled beats, random shocks, and (later)
    /// LLM-agent actions all enter through here.
    pub fn fire(&mut self, catalyst: &Catalyst) {
        for imp in &catalyst.impulses {
            match imp {
                Impulse::Add { signal, amount } => self.nudge(signal, |v| v + *amount),
                Impulse::Set { signal, value } => self.nudge(signal, |_| *value),
                Impulse::Scale { signal, factor } => self.nudge(signal, |v| v * *factor),
            }
        }
        self.log.push(Notable { day: self.day, label: format!("⚡ {}", catalyst.label) });
    }

    fn nudge(&mut self, id: &str, f: impl Fn(f32) -> f32) {
        let (lo, hi) = self.bounds.get(id).copied().unwrap_or((f32::MIN, f32::MAX));
        if let Some(v) = self.values.get_mut(id) {
            *v = f(*v).clamp(lo, hi);
        }
    }

    /// Fire ONE catalyst chosen by weighted random (deterministic per seed).
    /// Returns the label of whatever struck. This is how "60% flood / 25%
    /// volcano" disasters work — you can only loosely prepare across replays.
    pub fn fire_weighted(&mut self, choices: &[(f32, Catalyst)]) -> Option<String> {
        if choices.is_empty() {
            return None;
        }
        let total: f32 = choices.iter().map(|(w, _)| *w).sum();
        let mut roll = self.rng.next_f32() * total;
        for (w, c) in choices {
            if roll < *w {
                self.fire(c);
                return Some(c.label.clone());
            }
            roll -= *w;
        }
        let (_, c) = &choices[choices.len() - 1];
        self.fire(c);
        Some(c.label.clone())
    }
}
