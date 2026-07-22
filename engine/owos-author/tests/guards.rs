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

/// count living grazers in the glade
fn herd(w: &World) -> usize {
    let glade = w.children(0)[0];
    w.children(glade).iter().filter(|&&c| w.kind(c) == "grazer" && w.stat(c, "alive") > 0.5).count()
}

#[test]
fn hunted_species_goes_extinct_and_stays_extinct() {
    // THE GAME-PITCH CLAIM AS AN ENGINE FACT: a hunted species dies out and
    // NOTHING respawns it — the world remembers. (probe_hunt.json: one hunter
    // felling the fattest grazer each strike vs real demography.)
    let json = load("worlds/probes/probe_hunt.json");
    let mut w = owos_author::build(&json).expect("build");
    let mut extinct_at = None;
    for t in 0..300 {
        w.step();
        if herd(&w) == 0 && extinct_at.is_none() {
            extinct_at = Some(t);
        }
    }
    let extinct_at = extinct_at.expect("the hunted herd must go extinct within 300 ticks");
    assert_eq!(herd(&w), 0, "species must STAY extinct — nothing respawns from nothing");
    assert!(
        w.log.iter().any(|e| e.message.contains("falls silent")),
        "the glade must record its own extinction"
    );
    // and it remains extinct arbitrarily far into the future
    for _ in 0..100 {
        w.step();
    }
    assert_eq!(herd(&w), 0, "still extinct 100 ticks later (extinct_at tick {extinct_at})");
}

#[test]
fn unhunted_species_thrives() {
    // the CONTROL: the same world with hunters=0 keeps a living, self-
    // regulating herd for the entire run — extinction above is CAUSED by the
    // hunter, not baked into the data.
    let json = load("worlds/probes/probe_hunt.json").replace("\"hunters\": 1", "\"hunters\": 0");
    let mut w = owos_author::build(&json).expect("build");
    for _ in 0..300 {
        w.step();
        assert!(herd(&w) > 0, "the unhunted herd must never die out");
    }
    assert!(herd(&w) >= 10, "the unhunted herd should be thriving, got {}", herd(&w));
    assert!(
        !w.log.iter().any(|e| e.message.contains("falls silent")),
        "no extinction without the hunter"
    );
}

#[test]
fn terra_fauna_ecosystem_lives() {
    // the fauna layer: species-as-stats wildlife in terra's districts. Fauna
    // generate on DISTRICT REVEAL (lazy, like everything) — so this test does
    // what a host does: reveal a wild district, then watch it live.
    let json = load("studio/src/terra/world.json");
    let mut w = owos_author::build(&json).expect("terra must build");
    let city = w
        .children(0)
        .into_iter()
        .find(|&c| w.kind(c) == "city")
        .expect("city exists");
    // reveal every district — the whole island becomes a nature reserve
    for d in w.children(city) {
        if w.kind(d) == "district" {
            w.reveal(d);
        }
    }
    let census = |w: &World| -> Vec<usize> {
        w.children(city)
            .iter()
            .filter(|&&d| w.kind(d) == "district")
            .map(|&d| {
                w.children(d)
                    .iter()
                    .filter(|&&c| w.kind(c) == "fauna" && w.stat(c, "alive") > 0.5)
                    .count()
            })
            .collect()
    };
    let start: usize = census(&w).iter().sum();
    assert!(start >= 10, "the island should teem after reveal, got {start}");

    // species share traits; different species differ (the gene-hash contract)
    let d0 = w.children(city).into_iter().find(|&d| w.kind(d) == "district").unwrap();
    let fauna: Vec<usize> = w.children(d0).into_iter().filter(|&c| w.kind(c) == "fauna").collect();
    let mut by_species: std::collections::BTreeMap<i64, Vec<f32>> = Default::default();
    for &f in &fauna {
        by_species.entry(w.stat(f, "species") as i64).or_default().push(w.stat(f, "size"));
    }
    for (sp, sizes) in &by_species {
        for s in sizes {
            assert_eq!(*s, sizes[0], "species {sp} members must share size");
        }
    }

    // run a season: the ecosystem persists (no collapse, no runaway)
    for _ in 0..400 {
        w.step();
    }
    let end: usize = census(&w).iter().sum();
    assert!(end >= 5, "the unhunted island must stay alive, got {end}");
    assert!(end <= 15 * 8, "population must stay capped, got {end}");
    // births happened (lineages are real, not a static tableau)
    assert!(
        w.log.iter().any(|e| e.message.contains("calf is born")),
        "a living season should see births"
    );
}

#[test]
fn compaction_changes_nothing_but_the_log() {
    // docs/LEDGER.md acceptance guard: fold-for-facts may thin narrative detail,
    // but sim behavior must be bit-identical and per-label event totals EXACT.
    let json = load("worlds/probes/probe_hunt.json").replace("\"hunters\": 1", "\"hunters\": 0");
    let build = || owos_author::build(&json).expect("build");
    let mut a = build(); // compacts every 500 ticks
    let mut b = build(); // never
    for t in 1..=4000u64 {
        a.step();
        b.step();
        if t % 500 == 0 {
            a.compact_log(a.tick.saturating_sub(200), &[]);
        }
    }
    // sim untouched
    assert_eq!(fingerprint_entities(&a), fingerprint_entities(&b), "compaction touched sim state");
    // totals exact through summaries
    let label = |m: &str| m.rsplit(" — ").next().unwrap_or(m).to_string();
    let totals = |w: &World| -> std::collections::BTreeMap<String, u64> {
        let mut t = std::collections::BTreeMap::new();
        for e in &w.log {
            if let Some(rest) = e.message.strip_prefix("⟪×") {
                if let Some((n, tail)) = rest.split_once("⟫ ") {
                    let l = label(tail.rsplit_once(" (t").map(|x| x.0).unwrap_or(tail));
                    *t.entry(l).or_insert(0) += n.parse::<u64>().unwrap_or(0);
                    continue;
                }
            }
            *t.entry(label(&e.message)).or_insert(0) += 1;
        }
        t
    };
    assert_eq!(totals(&a), totals(&b), "compacted totals drifted from truth");
    // and the log is genuinely smaller
    assert!(a.log.len() < b.log.len(), "compaction should shrink the log ({} vs {})", a.log.len(), b.log.len());
}

/// entity-tree-only fingerprint (no log — compaction changes the log by design)
fn fingerprint_entities(w: &World) -> String {
    let mut out = String::new();
    let mut stack = vec![0usize];
    while let Some(id) = stack.pop() {
        let kids = w.children(id);
        out.push_str(&format!("{}:{}#{};", id, w.kind(id), kids.len()));
        stack.extend(kids);
    }
    out
}

#[test]
fn bestiary_planet_laws_shape_the_fauna() {
    // the bestiary claim: a planet's environment BENDS its creatures' body
    // plans. Statistically, across many addresses: thin-air planets breed
    // flyers, dense-air planets keep life grounded, cold planets breed fur.
    let base = load("worlds/bestiary.json");
    let mut thin_flyers = Vec::new();
    let mut dense_flyers = Vec::new();
    let mut cold_fur = Vec::new();
    let mut hot_fur = Vec::new();
    for seed in 1..=40u64 {
        let json = base.replace("\"rng_seed\": 79873", &format!("\"rng_seed\": {seed}"));
        let w = owos_author::build(&json).expect("build");
        let cosmos = w.children(0).into_iter().find(|&c| w.kind(c) == "cosmos").unwrap();
        let planet = w.children(cosmos).into_iter().find(|&c| w.kind(c) == "planet").unwrap();
        let species: Vec<usize> = w.children(planet).into_iter().filter(|&c| w.kind(c) == "species").collect();
        assert!(species.len() >= 7, "every planet has a real fauna set");
        let flyer_frac = species.iter().filter(|&&s| w.stat(s, "flyer") > 0.5).count() as f32 / species.len() as f32;
        let fur_mean = species.iter().map(|&s| w.stat(s, "fur")).sum::<f32>() / species.len() as f32;
        let air = w.stat(planet, "air");
        let heat = w.stat(planet, "heat");
        if air < 0.4 { thin_flyers.push(flyer_frac); }
        if air > 0.6 { dense_flyers.push(flyer_frac); }
        if heat < 0.35 { cold_fur.push(fur_mean); }
        if heat > 0.65 { hot_fur.push(fur_mean); }
    }
    let mean = |v: &[f32]| v.iter().sum::<f32>() / v.len().max(1) as f32;
    assert!(!thin_flyers.is_empty() && !dense_flyers.is_empty(), "seed scan must cover both regimes");
    assert!(
        mean(&thin_flyers) > mean(&dense_flyers) + 0.25,
        "thin air must breed flyers: thin={:.2} dense={:.2}",
        mean(&thin_flyers),
        mean(&dense_flyers)
    );
    assert!(
        mean(&cold_fur) > mean(&hot_fur) + 0.15,
        "cold must breed fur: cold={:.2} hot={:.2}",
        mean(&cold_fur),
        mean(&hot_fur)
    );
    // and the address is permanent: same seed, same genome, bit for bit
    let a = owos_author::build(&base).unwrap();
    let b = owos_author::build(&base).unwrap();
    let genome = |w: &World| -> String {
        let mut out = String::new();
        let mut stack = vec![0usize];
        while let Some(id) = stack.pop() {
            for k in ["species", "flyer", "size", "torso", "head", "hue", "fur"] {
                out.push_str(&format!("{:.6};", w.stat(id, k)));
            }
            stack.extend(w.children(id));
        }
        out
    };
    assert_eq!(genome(&a), genome(&b), "planet 79873's creatures must be permanent");
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
