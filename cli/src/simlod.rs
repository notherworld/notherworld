//! simlod — Simulation-LOD on the scope-tree engine.
//!
//! The player lives in ONE city (Detailed — every citizen simulated). Every
//! other city is Coarse: its citizens are dormant and it evolves as a cheap
//! aggregate. A nation goes to war; the detailed city works it out citizen by
//! citizen, while the offscreen cities drift up in the background for almost no
//! cost. Then the player TRAVELS to a coarse city — we unfold it and crystallize
//! its citizens from the aggregate that changed while no one was watching.

use owos_core::engine::{Broadcast, Reducer, Rollup, System, World};

/// Detailed rule: each active citizen's discontent chases hardship + fear.
struct Discontent;
impl System for Discontent {
    fn name(&self) -> &str {
        "discontent"
    }
    fn tick(&self, w: &mut World) {
        for id in w.active_by_kind("citizen") {
            let hardship = w.stat(id, "hardship");
            let fear = w.stat(id, "fear");
            let target = (0.35 * hardship + 0.60 * fear).clamp(0.0, 1.0);
            let cur = w.stat(id, "discontent");
            w.set(id, "discontent", (cur + 0.30 * (target - cur)).clamp(0.0, 1.0));
        }
    }
}

/// Coarse rule: a folded city's unrest drifts toward what the war demands —
/// without touching a single citizen.
struct CoarseCity;
impl System for CoarseCity {
    fn name(&self) -> &str {
        "coarse-city"
    }
    fn tick(&self, w: &mut World) {
        for id in w.coarse_frontier_by_kind("city") {
            let war = w.stat(id, "war_danger");
            let target = (0.15 + 0.60 * war).clamp(0.0, 1.0);
            let cur = w.stat(id, "unrest");
            w.set(id, "unrest", (cur + 0.15 * (target - cur)).clamp(0.0, 1.0));
        }
    }
}

fn report(w: &World, title: &str) {
    let total = w.by_kind("citizen").len();
    let active = w.active_by_kind("citizen").len();
    println!("\n=== {title} (tick {}) — {active}/{total} citizens simulated in detail ===", w.tick);
    println!("  WORLD · tension {:.2}", w.stat(w.root, "tension"));
    for n in w.by_kind("nation") {
        println!("  {} (war {:.0}) · instability {:.2}", w.name(n), w.stat(n, "at_war"), w.stat(n, "instability"));
        for c in w.children(n) {
            if w.is_coarse(c) {
                println!("      [coarse] {} · unrest {:.2}   (subtree dormant)", w.name(c), w.stat(c, "unrest"));
            } else {
                let faces: String = w.children(c).iter().map(|&x| format!(" {:.2}", w.stat(x, "discontent"))).collect();
                println!("      [DETAIL] {} · unrest {:.2}   citizens:{faces}", w.name(c), w.stat(c, "unrest"));
            }
        }
    }
}

fn settle(w: &mut World, n: u32) {
    for _ in 0..n {
        w.step();
    }
}

fn main() {
    let mut w = World::new(1);
    let world = w.root;

    for n in 0..2 {
        let nation = w.spawn("nation", &format!("Nation {n}"), world);
        w.set(nation, "at_war", 0.0);
        for c in 0..3 {
            let city = w.spawn("city", &format!("City {n}.{c}"), nation);
            for p in 0..4 {
                let cit = w.spawn("citizen", &format!("Citizen {n}.{c}.{p}"), city);
                w.set(cit, "hardship", 0.15 + 0.10 * ((n + c + p) % 3) as f32);
                w.set(cit, "discontent", 0.15);
            }
        }
    }

    w.add_system(Box::new(Discontent));
    w.add_coarse_system(Box::new(CoarseCity));
    w.add_broadcast(Broadcast { parent_kind: String::new(), parent_stat: "at_war".into(), child_stat: "war_danger".into(), gain: 1.0 });
    w.add_broadcast(Broadcast { parent_kind: String::new(), parent_stat: "war_danger".into(), child_stat: "fear".into(), gain: 1.0 });
    w.add_rollup(Rollup { parent_kind: "city".into(), child_stat: "discontent".into(), parent_stat: "unrest".into(), reducer: Reducer::Mean, drain: false });
    w.add_rollup(Rollup { parent_kind: "nation".into(), child_stat: "unrest".into(), parent_stat: "instability".into(), reducer: Reducer::Mean, drain: false });
    w.add_rollup(Rollup { parent_kind: "world".into(), child_stat: "instability".into(), parent_stat: "tension".into(), reducer: Reducer::Mean, drain: false });

    // The player lives in City 0.0. Fold every other city (offscreen = coarse).
    let nation0 = w.by_kind("nation")[0];
    let home = w.children(nation0)[0];
    for c in w.by_kind("city") {
        if c != home {
            w.fold(c);
        }
    }

    settle(&mut w, 6);
    report(&w, "You live in City 0.0. The rest of the world runs coarse, offscreen");

    // War — the detailed city AND the offscreen ones react, but only one pays
    // the full per-citizen cost.
    w.act_set(nation0, "at_war", 1.0);
    println!("\n>>> {} goes to war. You stay home in City 0.0.", w.name(nation0));
    settle(&mut w, 16);
    report(&w, "War: your city worked out citizen-by-citizen; the others drifted up for free");

    // Travel: fold home, unfold the destination, and crystallize its people from
    // the aggregate that changed while you weren't looking.
    let dest = w.children(nation0)[1]; // City 0.1 — coarse, at war, unvisited
    w.fold(home);
    w.unfold(dest);
    w.crystallize(dest, "unrest", "discontent", 0.08);
    println!("\n>>> You travel to {} — a city you've never seen, already at war.", w.name(dest));
    report(&w, "On arrival its citizens crystallize from the aggregate — turmoil, made individual");
    settle(&mut w, 6);
    report(&w, "…and detailed simulation resumes from there");
}
