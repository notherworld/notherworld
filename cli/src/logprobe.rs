//! logprobe — measure the ledger/event-log's REAL growth limits.
//!
//! The log and facts are append-only and serialize into every snapshot, so a
//! long-running world's observation payload grows without bound. This probe
//! answers: how fast, for which kind of world, and when does it actually hurt?
//! (The compaction primitive gets built when THIS curve says so — same
//! discipline as expr bytecode: measured trigger, not vibes.)

use std::time::Instant;

fn run(label: &str, path: &str, ticks: u64) {
    run_with(label, path, ticks, false)
}

fn run_with(label: &str, path: &str, ticks: u64, reveal_districts: bool) {
    let json = std::fs::read_to_string(path).unwrap_or_else(|e| panic!("read {path}: {e}"));
    let mut w = owos_author::build(&json).unwrap_or_else(|e| panic!("build {path}:\n{e}"));
    if reveal_districts {
        // observe the world like a host would — district ecosystems come alive
        let city = w.children(0).into_iter().find(|&c| w.kind(c) == "city");
        if let Some(city) = city {
            for d in w.children(city) {
                if w.kind(d) == "district" {
                    w.reveal(d);
                }
            }
        }
    }
    println!("\n── {label} ({path}) ──");
    println!("{:>8} {:>10} {:>12} {:>12} {:>10} {:>12}", "tick", "log", "log bytes", "facts", "ser ms", "tick µs");
    let checkpoints = [1_000u64, 5_000, 10_000, 25_000, 50_000];
    let mut done = 0u64;
    for &cp in &checkpoints {
        if cp > ticks {
            break;
        }
        let t0 = Instant::now();
        for _ in done..cp {
            w.step();
        }
        let tick_us = t0.elapsed().as_micros() as f64 / (cp - done) as f64;
        done = cp;
        // log size + a serialize-cost proxy (format every message, as a snapshot would)
        let log_n = w.log.len();
        let log_bytes: usize = w.log.iter().map(|e| e.message.len() + 24).sum();
        let s0 = Instant::now();
        let mut ser = String::with_capacity(log_bytes + 1024);
        for e in &w.log {
            ser.push_str(&format!("[{}]{};", e.tick, e.message));
        }
        let ser_ms = s0.elapsed().as_secs_f64() * 1000.0;
        // facts across all entities (canon strings written on observation)
        let mut facts = 0usize;
        let mut stack = vec![0usize];
        while let Some(id) = stack.pop() {
            facts += w.facts(id).len();
            stack.extend(w.children(id));
        }
        println!("{:>8} {:>10} {:>12} {:>12} {:>10.2} {:>12.1}", cp, log_n, log_bytes, facts, ser_ms, tick_us);
        std::mem::drop(ser);
    }
    let per_1k = w.log.len() as f64 / (done as f64 / 1000.0);
    let bytes_1k = w.log.iter().map(|e| e.message.len() + 24).sum::<usize>() as f64 / (done as f64 / 1000.0);
    println!(
        "  growth: {:.1} entries / {:.0} bytes per 1k ticks → at 1M ticks ≈ {:.1} MB of log",
        per_1k,
        bytes_1k,
        bytes_1k * 1000.0 / 1_048_576.0
    );
}

fn main() {
    // an ARC world: events are story beats (a star, a gala) — mostly one-shot
    run("arc world (hotel)", "worlds/hotel.json", 50_000);
    // a CHURN world: births/deaths/starvation fire forever — worst case
    run("churn world (emberhold)", "worlds/emberhold.json", 50_000);
    // a PERSISTENT ecosystem: terra's fauna layer — stable, never stops cycling.
    // The honest long-lived-game case.
    run_with("persistent ecosystem (terra + fauna)", "studio/src/terra/world.json", 50_000, true);
    println!("\nverdict: compare the two growth rates. The compaction primitive is");
    println!("needed when a shipped world's rate × its intended lifetime crosses");
    println!("snapshot budgets — not before. (Deterministic replay means compaction");
    println!("can always be aggressive later: seed + inputs re-derive anything.)");
}
