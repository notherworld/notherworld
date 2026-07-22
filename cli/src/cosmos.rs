//! cosmos — proof that even the LAWS of a world are a deterministic function of its
//! address. The universe coordinate selects a rule-set (rivers of fire you travel ON
//! vs. rivers of water that divide the land; how many suns), injected as data; the SAME
//! spec then behaves by different physics. Tell a friend the coordinate and they build
//! the identical laws. No engine change — it's spec data all the way down.
//!
//! Run:  cargo run --release --bin cosmos

use owos_author::build_at;

fn mix(mut x: u64) -> u64 {
    x = (x ^ (x >> 30)).wrapping_mul(0xbf58_476d_1ce4_e5b9);
    x = (x ^ (x >> 27)).wrapping_mul(0x94d0_49bb_1331_11eb);
    x ^ (x >> 31)
}
fn pick<'a, T>(seed: u64, salt: u64, opts: &'a [T]) -> &'a T {
    &opts[(mix(seed ^ salt) % opts.len() as u64) as usize]
}

struct Laws {
    river: &'static str,
    roads_are_rivers: bool,
    suns: f32,
    sky: &'static str,
    society: &'static str,
}
fn laws_of(universe: i64) -> Laws {
    let u = universe as u64;
    // a small authored PALETTE of laws; the universe seed composes one deterministic set
    let rivers: &[(&str, bool)] = &[
        ("water", false), ("liquid fire", true), ("molten glass", true),
        ("silver mist", true), ("black ice", true),
    ];
    let &(river, roads_are_rivers) = pick(u, 0xA17, rivers);
    let suns = (1 + mix(u ^ 0xB23) % 3) as f32;
    let sky = *pick(u, 0xC31, &["one pale sun", "twin suns", "a trinary dawn that never fully sets", "a ringed giant filling half the sky"]);
    let society = *pick(u, 0xD47, &["river-clans", "one vast hive-city", "guild-states", "nomads who never stop moving"]);
    Laws { river, roads_are_rivers, suns, sky, society }
}

/// Build a planet at `addr` under `laws`, run it a few ticks, read its derived shape.
fn world(addr: &[i64], laws: &Laws) -> (usize, f32, f32) {
    let json = std::fs::read_to_string("worlds/cosmos.json").expect("worlds/cosmos.json");
    let mut w = build_at(&json, addr).expect("build_at");
    let p = *w.by_kind("planet").first().unwrap();
    w.set(p, "river_road", if laws.roads_are_rivers { 1.0 } else { 0.0 });
    w.set(p, "suns", laws.suns);
    for _ in 0..3 {
        w.step();
    }
    (w.by_kind("region").len(), w.stat(p, "mobility"), w.stat(p, "prosperity"))
}

fn describe(u: i64) {
    let l = laws_of(u);
    println!("┌─ UNIVERSE {u} — its local laws (from the address) ─┐");
    if l.roads_are_rivers {
        println!("   the rivers run with {} — and the people travel ON them, instead of roads", l.river);
    } else {
        println!("   the rivers are {} — they divide the land; you travel by road", l.river);
    }
    println!("   sky: {} · society: {} · suns: {}", l.sky, l.society, l.suns);
    for (px, py) in [(0i64, 0i64), (1, 0)] {
        let (n, mob, pr) = world(&[u, 2, 3, px, py], &l);
        let note = if l.roads_are_rivers { "riverside towns THRIVE — the rivers are their highways" } else { "the rivers cut riverside towns off — lower mobility" };
        println!("   G(2,3)·P({px},{py}) → {n} regions · mobility {mob:.2} · prosperity {pr:.2}   ({note})");
    }
    println!();
}

fn main() {
    println!("otherworldOS · cosmos — even the LAWS are a coordinate\n");
    describe(389);
    describe(390);
    describe(7);

    // REPRODUCIBLE — the whole thing, laws included, is a pure function of the address.
    let l = laws_of(389);
    let a = world(&[389, 2, 3, 0, 0], &l);
    let b = world(&[389, 2, 3, 0, 0], &l);
    println!("┌─ REPRODUCIBLE ─┐");
    println!("   universe 389 · G(2,3)·P(0,0) built twice: {}   ({a:?} vs {b:?})",
        if a == b { "IDENTICAL laws + world ✓" } else { "DIFFERENT ✗" });
    println!("\n   tell a friend \"[389, 2,3, 0,0]\" — they build it and see the fire-rivers too.");
    println!("   the rulebook is a pure function of the address. no engine change — spec data all the way down.");
}
