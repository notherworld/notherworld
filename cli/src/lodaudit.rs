//! lodaudit — an HONEST audit of the Simulation-LOD system. Not a showcase: a
//! test that tries to catch the three-tier fidelity pipeline being fake. It builds
//! the SAME world two ways and checks the claims the design makes:
//!
//!   1. DETAILED (foreground): every entity simulated per-tick (is_active chain).
//!   2. COARSE (distant): a folded scope keeps DRIFTING via coarse_rules, but its
//!      SUBTREE goes DORMANT (children stop changing) — cheap aggregate motion.
//!   3. HAZED (midground): structure exists (children spawned, canon written) but
//!      the subtree is dormant — shape visible, individuals not live.
//!   4. FOLD → run → UNFOLD → CRYSTALLIZE: an unwatched scope moves on while
//!      folded, then re-materializes individuals consistent with the drift.
//!
//! Everything here drives the PUBLIC engine API only (fold/unfold/reveal/
//! set_node_fidelity/is_active/frontier/crystallize) — the same calls a host or
//! the WASM camera uses. If a claim is false, this prints FAIL, not prose.

use std::time::Instant;

use owos_core::engine::{Fidelity, World};

fn build() -> World {
    // A 3-scale world: region → town(×N) → person(×M). All data-authored so the
    // reveal/generator/rule path is exercised, not hand-built.
    let json = r#"{
      "rng_seed": 5,
      "seed": [{ "kind": "region", "name": "Vale", "reveal": true,
                 "stats": { "unrest": 0.0 } }],
      "generators": [
        { "on": "region", "spawn": "town", "count": "3", "cascade": true,
          "child_stats": { "unrest": "0.2 + 0.2*rand(1)", "drift": "0.01 + 0.01*rand(2)" } },
        { "on": "town", "spawn": "person", "count": "5",
          "child_stats": { "mood": "0.5 + 0.3*rand(1)" } }
      ],
      "rules": [
        { "on": "person", "set": "mood",   "expr": "clamp(mood + 0.02 - 0.05*parent.unrest, 0, 1)" },
        { "on": "town",   "set": "unrest", "expr": "clamp(unrest + 0.01 - 0.03*(1 - unrest)*0, 0, 1)" }
      ],
      "coarse_rules": [
        { "on": "town", "set": "unrest", "expr": "clamp(unrest + drift, 0, 1)" }
      ],
      "rollups": [
        { "parent": "region", "child_stat": "unrest", "parent_stat": "unrest", "reduce": "mean" }
      ]
    }"#;
    owos_author::build(json).expect("build")
}

fn towns(w: &World) -> Vec<usize> {
    w.by_kind("town")
}
fn persons_of(w: &World, town: usize) -> Vec<usize> {
    w.children(town)
}

fn main() {
    println!("otherworldOS · LOD AUDIT — trying to catch the fidelity pipeline being fake\n");

    // ---- Setup: build, confirm the cascade materialized all 3 scales ----
    let mut w = build();
    let ts = towns(&w);
    println!("scales materialized from ONE seed (cascade): region → {} towns → {} people/town",
             ts.len(), persons_of(&w, ts[0]).len());
    assert!(ts.len() == 3 && persons_of(&w, ts[0]).len() == 5, "cascade generation failed");

    // Fold town[2] into a COARSE aggregate; leave town[0] and town[1] Detailed.
    let (near, mid, far) = (ts[0], ts[1], ts[2]);
    w.fold(far);
    // Make town[1] HAZED (midground: structure present, subtree dormant).
    w.set_node_fidelity(mid, Fidelity::Hazed);

    println!("\nfidelity set:  town0=Detailed(near)  town1=Hazed(mid)  town2=Coarse(far)\n");

    // ---- CLAIM: is_active reflects the ancestor chain ----
    let p_near = persons_of(&w, near)[0];
    let p_mid = persons_of(&w, mid)[0];
    let p_far = persons_of(&w, far)[0];
    let check = |label: &str, cond: bool| println!("  [{}] {}", if cond { "PASS" } else { "FAIL" }, label);
    println!("CLAIM 1 — dormancy follows the fidelity chain (is_active):");
    check("a person under Detailed town IS active", w.is_active(p_near));
    check("a person under Hazed town is NOT active", !w.is_active(p_mid));
    check("a person under Coarse town is NOT active", !w.is_active(p_far));
    check("the Coarse town itself is on the frontier", w.frontier().contains(&far));

    // ---- Snapshot every person's mood, run 60 ticks, compare motion by band ----
    let snap = |w: &World| -> Vec<(usize, f32)> {
        let mut v = Vec::new();
        for &t in &towns(w) {
            for p in persons_of(w, t) {
                v.push((p, w.stat(p, "mood")));
            }
        }
        v
    };
    let before: std::collections::BTreeMap<usize, f32> = snap(&w).into_iter().collect();
    let far_unrest_before = w.stat(far, "unrest");

    for _ in 0..60 {
        w.step();
    }

    // Motion per band: how much did people MOVE in each town?
    let moved = |w: &World, town: usize| -> f32 {
        persons_of(w, town).iter()
            .map(|&p| (w.stat(p, "mood") - before.get(&p).copied().unwrap_or(0.0)).abs())
            .sum::<f32>()
    };
    println!("\nCLAIM 2 — foreground moves, midground+distant subtrees are frozen:");
    let (mn, mm, mf) = (moved(&w, near), moved(&w, mid), moved(&w, far));
    println!("    total |Δmood| over 60 ticks:  near(Detailed)={:.3}  mid(Hazed)={:.3}  far(Coarse)={:.3}", mn, mm, mf);
    check("near (Detailed) people MOVED", mn > 0.01);
    check("mid (Hazed) people are FROZEN (dormant subtree)", mm < 1e-6);
    check("far (Coarse) people are FROZEN (dormant subtree)", mf < 1e-6);

    // ---- CLAIM 3 — the Coarse aggregate DRIFTED while its subtree slept ----
    let far_unrest_after = w.stat(far, "unrest");
    println!("\nCLAIM 3 — a folded (distant) scope keeps drifting cheaply as ONE aggregate:");
    println!("    far town unrest:  {:.3} → {:.3}  (coarse_rule drift, subtree never simulated)",
             far_unrest_before, far_unrest_after);
    check("the Coarse aggregate MOVED (offscreen world kept turning)", (far_unrest_after - far_unrest_before).abs() > 0.01);

    // ---- CLAIM 4 — UNFOLD + CRYSTALLIZE re-materializes individuals from the drift ----
    println!("\nCLAIM 4 — travel to the distant town: unfold + crystallize from the drifted aggregate:");
    let kids_before: Vec<f32> = persons_of(&w, far).iter().map(|&p| w.stat(p, "mood")).collect();
    w.unfold(far);
    w.crystallize(far, "unrest", "mood", 0.1);
    let kids_after: Vec<f32> = persons_of(&w, far).iter().map(|&p| w.stat(p, "mood")).collect();
    let changed = kids_before.iter().zip(&kids_after).filter(|(a, b)| (*a - *b).abs() > 1e-6).count();
    check("crystallize redistributed the aggregate onto individuals", changed > 0);
    check("the unfolded town is now active again", w.is_active(persons_of(&w, far)[0]));
    println!("    {} of {} people re-materialized around the drifted aggregate {:.3}",
             changed, kids_after.len(), far_unrest_after);

    // ---- COST: the whole point — folded must be dramatically cheaper ----
    println!("\nCLAIM 5 — LOD is a COST lever, not just labels: fully-detailed vs mostly-folded:");
    let cost = |all_detailed: bool| -> u128 {
        let mut w = grow_big();
        if !all_detailed {
            // Fold every town but one — the LOD case: 1 town live, rest coarse.
            let ts = towns(&w);
            for &t in ts.iter().skip(1) {
                w.fold(t);
            }
        }
        let t0 = Instant::now();
        for _ in 0..200 {
            w.step();
        }
        t0.elapsed().as_micros()
    };
    let detailed_us = cost(true);
    let lod_us = cost(false);
    println!("    200 ticks, big world:  ALL Detailed = {} µs   vs   LOD (1 live, rest folded) = {} µs",
             detailed_us, lod_us);
    let speedup = detailed_us as f64 / lod_us.max(1) as f64;
    println!("    → LOD is {:.1}× cheaper", speedup);
    check("folding the unwatched world is materially cheaper", lod_us < detailed_us);

    println!("\naudit complete.");
}

/// A bigger version for the cost test: 40 towns × 40 people = 1600 people.
fn grow_big() -> World {
    let json = r#"{
      "rng_seed": 5,
      "seed": [{ "kind": "region", "name": "Vale", "reveal": true, "stats": { "unrest": 0.0 } }],
      "generators": [
        { "on": "region", "spawn": "town", "count": "40", "cascade": true,
          "child_stats": { "unrest": "0.3", "drift": "0.001" } },
        { "on": "town", "spawn": "person", "count": "40",
          "child_stats": { "mood": "0.5 + 0.3*rand(1)" } }
      ],
      "rules": [
        { "on": "person", "set": "mood", "expr": "clamp(mood + 0.02 - 0.05*parent.unrest, 0, 1)" }
      ],
      "coarse_rules": [
        { "on": "town", "set": "unrest", "expr": "clamp(unrest + drift, 0, 1)" }
      ]
    }"#;
    owos_author::build(json).expect("build big")
}
