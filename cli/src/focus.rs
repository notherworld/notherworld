//! focus — a Simulation-LOD demo. The SAME person (Mira) lives out two versions
//! of the same 180 days: one where you stay in the region (she's simulated at
//! high fidelity, in focus), one where you leave for weeks (the region resolves
//! her life on its own, low fidelity). Same Kit, same seed — only your presence
//! differs, and her fate diverges.

use owos_core::dynamics::{Composition, World};
use owos_core::kit::Catalyst;
use owos_core::library::{player_leaves, player_returns, riverside};

const SPARK: [char; 8] = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

fn sparkline(series: &[f32], width: usize) -> String {
    if series.is_empty() {
        return String::new();
    }
    let mut pts = Vec::with_capacity(width);
    for i in 0..width {
        let idx = i * (series.len() - 1) / width.max(2).saturating_sub(1).max(1);
        pts.push(series[idx.min(series.len() - 1)]);
    }
    let min = pts.iter().copied().fold(f32::INFINITY, f32::min);
    let max = pts.iter().copied().fold(f32::NEG_INFINITY, f32::max);
    if max - min < 1e-6 {
        return "▄".repeat(width); // constant signal — draw a flat line
    }
    let range = max - min;
    pts.iter().map(|v| SPARK[(((v - min) / range) * 7.0).round() as usize]).collect()
}

fn run_with(comp: Composition, days: u32, seed: u64, schedule: &[(u32, Catalyst)]) -> (World, Vec<(String, Vec<f32>)>) {
    let mut w = comp.build(seed);
    let ids: Vec<String> = w.signals().to_vec();
    let mut hist: Vec<Vec<f32>> = vec![Vec::with_capacity(days as usize); ids.len()];
    for day in 1..=days {
        w.step();
        for (d, c) in schedule {
            if *d == day {
                w.fire(c);
            }
        }
        for (k, id) in ids.iter().enumerate() {
            hist[k].push(w.value(id));
        }
    }
    (w, ids.into_iter().zip(hist).collect())
}

fn report(title: &str, w: &World, series: &[(String, Vec<f32>)]) {
    println!("\n=== {} ===", title);
    for (id, s) in series {
        let end = s.last().copied().unwrap_or(0.0);
        println!("   {:<14} {}  now {:.0}", id, sparkline(s, 50), end);
    }
    if w.log.is_empty() {
        println!("   · (nothing notable)");
    }
    for n in &w.log {
        println!("   · Day {:>3}  {}", n.day, n.label);
    }
}

fn main() {
    let days: u32 = 180;
    let seed: u64 = 7;

    println!("otherworldOS · Simulation-LOD demo");
    println!("the same person, the same 180 days — only your attention differs");

    let (a, sa) = run_with(Composition::single(riverside()), days, seed, &[]);
    report("SCENARIO A — you stay in Riverside (Mira in focus, high fidelity)", &a, &sa);

    let schedule = vec![(20u32, player_leaves()), (95, player_returns())];
    let (b, sb) = run_with(Composition::single(riverside()), days, seed, &schedule);
    report("SCENARIO B — you leave day 20, return day 95 (region resolves her offscreen)", &b, &sb);
}
