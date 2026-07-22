//! worlds — the dynamics engine demo.
//!
//! Runs the three Kits alone (headline counts), then the overlapped world twice:
//! once left to its own devices, and once with CATALYSTS fired in (god mode).
//! Compare the two logs to see how an outside shock reshapes the whole system.

use owos_core::dynamics::{Composition, World};
use owos_core::kit::Catalyst;
use owos_core::library::{bridges, drought, ecology, economy, market_panic, scandal, society};

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
    let range = (max - min).max(1e-6);
    pts.iter().map(|v| SPARK[(((v - min) / range) * 7.0).round() as usize]).collect()
}

/// Run a composition, firing any scheduled catalysts, capturing daily history.
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
    println!("\n=== {}  —  {} notable events over {} days ===", title, w.log.len(), w.day());
    for (id, s) in series {
        let end = s.last().copied().unwrap_or(0.0);
        let min = s.iter().copied().fold(f32::INFINITY, f32::min);
        let max = s.iter().copied().fold(f32::NEG_INFINITY, f32::max);
        println!("   {:<12} {}  [{:>6.1} .. {:>6.1}]  now {:.1}", id, sparkline(s, 50), min, max, end);
    }
    for n in &w.log {
        println!("   · Day {:>3}  {}", n.day, n.label);
    }
}

fn overlapped() -> Composition {
    Composition {
        kits: vec![ecology(), economy(), society()],
        bridges: bridges(),
        bridge_events: vec![],
    }
}

fn main() {
    let days: u32 = 180;
    let seed: u64 = 7;

    println!("otherworldOS · dynamics engine (seed {seed}, {days} days)");
    println!("\n-- each Kit alone --");
    for kit in [ecology(), economy(), society()] {
        let title = kit.title.clone();
        let (w, _) = run_with(Composition::single(kit), days, seed, &[]);
        println!("   {:<16} {} notable events", title, w.log.len());
    }

    let (w0, s0) = run_with(overlapped(), days, seed, &[]);
    report("OVERLAPPED — left alone", &w0, &s0);

    let schedule = vec![(40u32, drought()), (80, market_panic()), (120, scandal())];
    let (w1, s1) = run_with(overlapped(), days, seed, &schedule);
    report("OVERLAPPED + CATALYSTS — drought d40, market panic d80, scandal d120", &w1, &s1);

    println!(
        "\nsummary: {} events when left alone  vs  {} once catalysts were fired in",
        w0.log.len(),
        w1.log.len()
    );
}
