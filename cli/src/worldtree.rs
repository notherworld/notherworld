//! worldtree — exercising the universal scope-tree engine across scales.
//!
//! Builds world → nations → cities → citizens, wires one system plus the
//! cross-scale Rollup/Broadcast rules, then fires ACTIONS at different scales
//! and watches effects ripple: a nation declaring war propagates DOWN to
//! individual citizens' fear; a single citizen's hardship rolls UP to world
//! tension. Same machinery at every scale — that's the point of the engine.

use owos_core::engine::{Broadcast, Reducer, Rollup, System, World};

/// A citizen's discontent drifts toward what their hardship + fear demand.
/// `fear` is set by a broadcast from their city (which got it from their nation).
struct Discontent;
impl System for Discontent {
    fn name(&self) -> &str {
        "discontent"
    }
    fn tick(&self, w: &mut World) {
        for id in w.by_kind("citizen") {
            let hardship = w.stat(id, "hardship");
            let fear = w.stat(id, "fear");
            let target = (0.35 * hardship + 0.60 * fear).clamp(0.0, 1.0);
            let cur = w.stat(id, "discontent");
            w.set(id, "discontent", (cur + 0.30 * (target - cur)).clamp(0.0, 1.0));
        }
    }
}

fn report(w: &World, title: &str) {
    println!("\n=== {title}  (tick {}) ===", w.tick);
    println!("  WORLD · tension {:.2}", w.stat(w.root, "tension"));
    for n in w.by_kind("nation") {
        println!("    {} · instability {:.2}  (at_war {:.0})", w.name(n), w.stat(n, "instability"), w.stat(n, "at_war"));
        for c in w.children(n) {
            let cits = w.children(c);
            let avg = cits.iter().map(|&x| w.stat(x, "discontent")).sum::<f32>() / cits.len().max(1) as f32;
            println!("        {} · unrest {:.2}  (citizen discontent ~{:.2})", w.name(c), w.stat(c, "unrest"), avg);
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

    // Build the scope tree: 2 nations, 2 cities each, 3 citizens each.
    for n in 0..2 {
        let nation = w.spawn("nation", &format!("Nation {n}"), world);
        w.set(nation, "at_war", 0.0);
        for c in 0..2 {
            let city = w.spawn("city", &format!("City {n}.{c}"), nation);
            for p in 0..3 {
                let cit = w.spawn("citizen", &format!("Citizen {n}.{c}.{p}"), city);
                // Heterogeneous starting hardship.
                w.set(cit, "hardship", 0.15 + 0.12 * ((n + c + p) % 3) as f32);
                w.set(cit, "discontent", 0.2);
            }
        }
    }

    // One system + the cross-scale wiring.
    w.add_system(Box::new(Discontent));
    // DOWN: a nation at war → danger in its cities → fear in its citizens.
    w.add_broadcast(Broadcast { parent_kind: String::new(), parent_stat: "at_war".into(), child_stat: "war_danger".into(), gain: 1.0 });
    w.add_broadcast(Broadcast { parent_kind: String::new(), parent_stat: "war_danger".into(), child_stat: "fear".into(), gain: 1.0 });
    // UP: citizen discontent → city unrest → nation instability → world tension.
    w.add_rollup(Rollup { parent_kind: "city".into(), child_stat: "discontent".into(), parent_stat: "unrest".into(), reducer: Reducer::Mean, drain: false });
    w.add_rollup(Rollup { parent_kind: "nation".into(), child_stat: "unrest".into(), parent_stat: "instability".into(), reducer: Reducer::Mean, drain: false });
    w.add_rollup(Rollup { parent_kind: "world".into(), child_stat: "instability".into(), parent_stat: "tension".into(), reducer: Reducer::Mean, drain: false });

    settle(&mut w, 8);
    report(&w, "PEACE — the world at rest");

    // ACTION at the NATION scale — a player/AI declares war.
    let nation0 = w.by_kind("nation")[0];
    w.act_set(nation0, "at_war", 1.0);
    println!("\n>>> ACTION: {} declares war.", w.name(nation0));
    settle(&mut w, 14);
    report(&w, "War declared — watch it propagate DOWN to citizens, and UP to world tension");

    // ACTION at the CITIZEN scale — one person's life falls apart.
    let nation1 = w.by_kind("nation")[1];
    let a_city = w.children(nation1)[0];
    let a_citizen = w.children(a_city)[0];
    w.act_set(a_citizen, "hardship", 1.0);
    println!("\n>>> ACTION: {} falls into deep hardship.", w.name(a_citizen));
    settle(&mut w, 14);
    report(&w, "One citizen's hardship rolls UP through city → nation → world");
}
