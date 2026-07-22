//! Determinism guards as tests — the same numbers the CLI proof bins print,
//! enforced by `cargo test` so a change that shifts engine behavior cannot land
//! quietly. These run PURE-DATA worlds through `build(json)` + `step()` — the
//! exact path a stranger's world takes. (Host-driven guards — metro, saga,
//! regime — remain CLI bins; see CLAUDE.md "verify determinism".)

use owos_core::engine::World;

fn load(rel: &str) -> String {
    let path = format!("{}/../../{}", env!("CARGO_MANIFEST_DIR"), rel);
    std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("read {path}: {e}"))
}

fn run(rel: &str, ticks: usize) -> World {
    let mut w = owos_author::build(&load(rel)).expect("world must build");
    for _ in 0..ticks {
        w.step();
    }
    w
}

/// A cheap whole-world fingerprint: every entity's kind, child count, and the
/// full event log. Two identical runs must produce identical fingerprints.
fn fingerprint(w: &World) -> String {
    let mut out = String::new();
    let mut stack = vec![0usize];
    while let Some(id) = stack.pop() {
        let kids = w.children(id);
        out.push_str(&format!("{}:{}#{};", id, w.kind(id), kids.len()));
        stack.extend(kids);
    }
    for e in &w.log {
        out.push_str(&format!("[{}]{};", e.tick, e.message));
    }
    out
}

#[test]
fn same_seed_same_world_bit_for_bit() {
    // the core contract: identical builds + identical stepping = identical
    // history, down to every entity and every logged event.
    let a = fingerprint(&run("worlds/hotel.json", 220));
    let b = fingerprint(&run("worlds/hotel.json", 220));
    assert_eq!(a, b, "hotel diverged between two identical runs");

    // city.json exercises the geometry stack: fields, partitions (voronoi +
    // subdivide carve), routes/bridges/gates, settle rules, libm trig.
    let a = fingerprint(&run("worlds/city.json", 30));
    let b = fingerprint(&run("worlds/city.json", 30));
    assert_eq!(a, b, "city diverged between two identical runs");
}

#[test]
fn hotel_chronicle_holds() {
    // canonical: first star ~tick 73, gala booked ~tick 213 (memory + CLAUDE.md)
    let w = run("worlds/hotel.json", 220);
    let star = w.log.iter().find(|e| e.message.contains("first star"));
    let gala = w.log.iter().find(|e| e.message.to_lowercase().contains("gala"));
    assert_eq!(star.expect("the hotel must earn its star").tick, 73);
    assert_eq!(gala.expect("the gala must be booked").tick, 213);
}

#[test]
fn craft_tech_tree_completes() {
    // canonical: the ENGINE assembles at tick 94 — the full gather→smelt→forge
    // →assemble chain, purely from data.
    let w = run("worlds/craft.json", 140);
    let done = w.log.iter().find(|e| e.message.contains("ENGINE"));
    assert_eq!(done.expect("the tech tree must complete").tick, 94);
}

#[test]
fn emberhold_boom_busts() {
    // canonical: the population curve has 3 turning points (a real cycle, not
    // a flat line or a single crash).
    let json = load("worlds/emberhold.json");
    let mut w = owos_author::build(&json).expect("build");
    let hold = w.children(0)[0];
    let mut pop = Vec::new();
    for _ in 0..300 {
        w.step();
        pop.push(w.children(hold).iter().filter(|&&c| w.stat(c, "alive") > 0.5).count() as i64);
    }
    // count direction changes of the (coarse) population trend
    let smooth: Vec<i64> = pop.chunks(10).map(|c| c.iter().sum::<i64>() / c.len() as i64).collect();
    let mut turns = 0;
    let mut dir = 0i64;
    for w2 in smooth.windows(2) {
        let d = (w2[1] - w2[0]).signum();
        if d != 0 && dir != 0 && d != dir {
            turns += 1;
        }
        if d != 0 {
            dir = d;
        }
    }
    // live.rs's coarser smoothing reports 3; the invariant this enforces is a
    // genuine CYCLE (boom AND bust, more than once directional) with real
    // amplitude — not a flat line, not a single crash.
    let (max, min) = (*pop.iter().max().unwrap(), *pop.iter().min().unwrap());
    assert!(turns >= 2, "population curve should cycle (≥2 turns), got {turns}");
    assert!(max - min >= 10, "cycle amplitude too small: max {max}, min {min}");
}

#[test]
fn bad_formula_reports_where() {
    // the loader must say WHICH formula broke, not just "unexpected char"
    let json = load("worlds/emberhold.json").replace("0.55 + 0.25*rand(1)", "0.55 + : 0.25*rand(1)");
    let err = match owos_author::build(&json) {
        Err(e) => e,
        Ok(_) => panic!("broken formula must fail the build"),
    };
    assert!(err.contains("child_stat \"food\""), "error lacks stat context: {err}");
    assert!(err.contains("generators"), "error lacks section context: {err}");
}
