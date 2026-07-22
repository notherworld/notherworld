//! live — a GENERIC data-world driver. Its whole job: load ANY world JSON through
//! `owos_author::build`, step the engine N times, and report what emerged. There
//! is NO simulation logic here — every behavior comes from the data file. This is
//! the honest harness: if a world is interesting, it's the ENGINE + DATA doing it,
//! not a bespoke Rust host.
//!
//! Usage:  cargo run --release --bin live -- worlds/emberhold.json 200 [watch_kind]

use std::collections::BTreeMap;

use owos_core::engine::World;

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

/// Count live entities of a kind, and the mean of one of their stats.
fn head_and_mean(w: &World, kind: &str, stat: &str) -> (usize, f32) {
    let ids = w.by_kind(kind);
    if ids.is_empty() {
        return (0, 0.0);
    }
    let sum: f32 = ids.iter().map(|&i| w.stat(i, stat)).sum();
    (ids.len(), sum / ids.len() as f32)
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let path = args.get(1).cloned().unwrap_or_else(|| "worlds/emberhold.json".to_string());
    let ticks: usize = args.get(2).and_then(|s| s.parse().ok()).unwrap_or(200);
    let watch = args.get(3).cloned().unwrap_or_else(|| "colonist".to_string());

    let json = std::fs::read_to_string(&path).unwrap_or_else(|e| {
        eprintln!("cannot read {path}: {e}");
        std::process::exit(1);
    });

    let mut w = match owos_author::build(&json) {
        Ok(w) => w,
        Err(e) => {
            eprintln!("build error in {path}:\n  {e}");
            std::process::exit(1);
        }
    };

    // Turn the built-in content oracle on; watch the crowd kind's headcount.
    w.record(true);
    w.watch(&watch);

    // The root's first child is the "hold"/root scope of most worlds; find any
    // parent-scope kind to sample (whatever isn't the watched crowd).
    let mut pop_series: Vec<f32> = Vec::with_capacity(ticks);
    let mut food_series: Vec<f32> = Vec::with_capacity(ticks);
    let mut field_series: Vec<f32> = Vec::with_capacity(ticks);

    // Sample a parent-scope stat if present: try hold.field, else city.heat.
    let holds = w.by_kind("hold");
    let hold = holds.first().copied();
    let city = w.by_kind("city").first().copied();
    let field_stat = if hold.is_some() { "field" } else { "heat" };
    let field_src = hold.or(city);

    println!("otherworldOS · live driver — {path}  ({ticks} ticks, seed in data)\n");

    for _ in 0..ticks {
        w.step();
        let (pop, food) = head_and_mean(&w, &watch, "food");
        pop_series.push(pop as f32);
        food_series.push(food);
        if let Some(h) = field_src {
            field_series.push(w.stat(h, field_stat));
        }
    }

    let final_pop = *pop_series.last().unwrap_or(&0.0) as usize;
    let peak_pop = pop_series.iter().copied().fold(0.0f32, f32::max) as usize;
    let min_pop = pop_series.iter().copied().fold(f32::INFINITY, f32::min) as usize;

    println!("┌─ THE COLONY OVER TIME ─┐");
    println!("  population  {}  [{} .. {}]  now {}", sparkline(&pop_series, 56), min_pop, peak_pop, final_pop);
    println!("  mean food   {}", sparkline(&food_series, 56));
    if !field_series.is_empty() {
        let fmin = field_series.iter().copied().fold(f32::INFINITY, f32::min);
        let fmax = field_series.iter().copied().fold(f32::NEG_INFINITY, f32::max);
        println!("  {:<11} {}  [{:.2} .. {:.2}]", field_stat, sparkline(&field_series, 56), fmin, fmax);
    }

    // Count boom-bust reversals in the population curve (local minima/maxima) —
    // an emergent cycle shows up as multiple turning points, not a monotone line.
    let mut turns = 0;
    for i in 1..pop_series.len().saturating_sub(1) {
        let (a, b, c) = (pop_series[i - 1], pop_series[i], pop_series[i + 1]);
        if (b > a && b > c) || (b < a && b < c) {
            turns += 1;
        }
    }
    println!("\n  turning points in the population curve: {turns}  (a boom-bust cycle shows as many; a straight line, ~0)");

    // The built-in oracle: what content did this world actually exercise?
    println!("\n┌─ THE ORACLE (engine-recorded — what this world DID) ─┐");
    let acts: &BTreeMap<String, u64> = w.action_tally();
    let total: u64 = acts.values().sum();
    let mut sorted: Vec<_> = acts.iter().collect();
    sorted.sort_by(|a, b| b.1.cmp(a.1));
    println!("  choices made ({total} total):");
    for (name, n) in sorted {
        let pct = if total > 0 { 100 * *n / total } else { 0 };
        println!("    {:<24} {:>6}  ({:>2}%)", name, n, pct);
    }
    println!("  events fired:");
    for (label, n) in w.event_tally() {
        println!("    {:<40} {:>5}", label, n);
    }
    let (pk, av) = (w.peak(&watch), w.avg_count(&watch));
    println!("\n  {watch}: peak {pk} live, {av:.1} avg over the run");

    // The chronicle tail — the story in its own words.
    println!("\n┌─ THE CHRONICLE (last 16 notable moments) ─┐");
    for n in w.log.iter().rev().take(16).rev() {
        println!("  t{:<4} {}", n.tick, n.message);
    }
}
