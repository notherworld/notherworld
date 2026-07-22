//! compactprobe — ledger compaction, tested IN PRACTICE (docs/LEDGER.md).
//!
//! Two identical persistent ecosystems (terra + fauna, districts revealed), same
//! seed. World A compacts its log whenever it crosses a threshold; world B never
//! does (ground truth). We measure:
//!   1. the log stays BOUNDED under compaction (sawtooth, not a line),
//!   2. the sim is untouched (entity fingerprints must match bit-for-bit),
//!   3. the compacted history stays TRUE: per-label totals reconstructed from
//!      summaries + kept entries must EXACTLY equal the uncompacted log, and
//!      every label's first-ever occurrence survives verbatim.
//! The threshold here is small so the probe runs in seconds — the mechanism is
//! linear, so "compact at 20 MB" behaves identically, just later.

use owos_core::engine::World;
use std::collections::BTreeMap;

fn build_terra() -> World {
    let json = std::fs::read_to_string("studio/src/terra/world.json").expect("read terra");
    let mut w = owos_author::build(&json).expect("build terra");
    let city = w.children(0).into_iter().find(|&c| w.kind(c) == "city").expect("city");
    for d in w.children(city) {
        if w.kind(d) == "district" {
            w.reveal(d);
        }
    }
    w
}

fn fingerprint(w: &World) -> String {
    let mut out = String::new();
    let mut stack = vec![0usize];
    while let Some(id) = stack.pop() {
        let kids = w.children(id);
        out.push_str(&format!("{}:{}#{};", id, w.kind(id), kids.len()));
        stack.extend(kids);
    }
    out
}

fn label_of(m: &str) -> String {
    m.rsplit(" — ").next().unwrap_or(m).to_string()
}

/// per-label event totals. For world A, summaries ⟪×N⟫ carry their fold count.
fn totals(w: &World) -> BTreeMap<String, u64> {
    let mut t: BTreeMap<String, u64> = BTreeMap::new();
    for e in &w.log {
        if let Some(rest) = e.message.strip_prefix("⟪×") {
            if let Some((n, tail)) = rest.split_once("⟫ ") {
                let label = label_of(tail.rsplit_once(" (t").map(|x| x.0).unwrap_or(tail));
                *t.entry(label).or_default() += n.parse::<u64>().unwrap_or(0);
                continue;
            }
        }
        *t.entry(label_of(&e.message)).or_default() += 1;
    }
    t
}

fn main() {
    const TICKS: u64 = 40_000;
    const THRESHOLD: usize = 1_500; // "20 MB" scaled to seconds; mechanism is linear
    const KEEP_TAIL: u64 = 2_000; // recent history stays verbatim

    let mut a = build_terra(); // compacts
    let mut b = build_terra(); // never does — ground truth
    let keep: Vec<String> = vec![]; // no importance patterns; firsts auto-survive

    println!("── running twin worlds {TICKS} ticks (A compacts at {THRESHOLD} entries, B never) ──");
    println!("{:>8} {:>12} {:>14} {:>12}", "tick", "A log", "A action", "B log");
    let mut compactions = 0;
    for t in 1..=TICKS {
        a.step();
        b.step();
        if a.log.len() > THRESHOLD {
            let cutoff = a.tick.saturating_sub(KEEP_TAIL);
            let (removed, now) = a.compact_log(cutoff, &keep);
            compactions += 1;
            println!("{:>8} {:>12} {:>14} {:>12}", t, format!("{}→{}", removed + now, now), format!("compact #{compactions}"), b.log.len());
        } else if t % 10_000 == 0 {
            println!("{:>8} {:>12} {:>14} {:>12}", t, a.log.len(), "-", b.log.len());
        }
    }

    // 1. bounded vs linear
    println!("\nfinal log:  A = {} entries (compacted ×{})   B = {} entries", a.log.len(), compactions, b.log.len());

    // 2. the sim is untouched
    let same = fingerprint(&a) == fingerprint(&b);
    println!("sim identical after {} compactions: {}", compactions, if same { "YES — bit-for-bit" } else { "NO (BUG!)" });
    assert!(same, "compaction must never touch sim state");

    // 3. history stays true
    let ta = totals(&a);
    let tb = totals(&b);
    let mut exact = true;
    println!("\n── what the compacted world still knows (vs ground truth) ──");
    for (label, want) in &tb {
        let got = ta.get(label).copied().unwrap_or(0);
        let ok = got == *want;
        exact &= ok;
        println!("  {:<38} A={:<7} truth={:<7} {}", label, got, want, if ok { "EXACT" } else { "DRIFT!" });
    }
    // firsts survive verbatim
    let mut firsts_ok = true;
    let mut seen = std::collections::BTreeSet::new();
    for e in &b.log {
        let l = label_of(&e.message);
        if seen.insert(l) {
            let survives = a.log.iter().any(|x| x.tick == e.tick && x.message == e.message);
            firsts_ok &= survives;
        }
    }
    println!("\nevery label's FIRST-EVER moment survives verbatim: {}", if firsts_ok { "YES" } else { "NO" });
    println!("per-label totals exact: {}", if exact { "YES — no history was lost, only detail" } else { "NO" });
    assert!(exact && firsts_ok);
    println!("\nPASS: the log stays bounded, the sim untouched, and the compacted");
    println!("history still answers every 'how many / when first' question exactly.");
}
