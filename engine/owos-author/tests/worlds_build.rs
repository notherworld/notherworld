//! Every shipped pure-data world builds and runs. This is the rot-proofing for
//! the template library: a change to the engine or a careless edit to a world
//! file cannot silently break something we tell strangers to copy.
//!
//! Add every new pure-data world to this list when you ship it.

fn check(rel: &str, ticks: usize) {
    let path = format!("{}/../../{}", env!("CARGO_MANIFEST_DIR"), rel);
    let json = std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("read {rel}: {e}"));
    let mut w = owos_author::build(&json).unwrap_or_else(|e| panic!("{rel} failed to build:\n{e}"));
    for _ in 0..ticks {
        w.step();
    }
}

#[test]
fn showcase_worlds_build_and_run() {
    // the worlds/README "showcase" table — the ones we tell people to steal
    for rel in [
        "worlds/hotel.json",
        "worlds/emberhold.json",
        "worlds/craft.json",
        "worlds/guild.json",
        "worlds/duel.json",
        "worlds/market.json",
        "worlds/kitchen.json",
        "worlds/trade.json",
        "worlds/citylife.json",
        "worlds/verang.json",
        "worlds/hunt.json",
        "worlds/hunt2.json",
        "worlds/shore.json",
    ] {
        check(rel, 25);
    }
}

#[test]
fn geometry_worlds_build_and_run() {
    // the heavy worldgen stack: fields, partitions, carve, routes, settle
    check("worlds/city.json", 10);
}

#[test]
fn probe_worlds_build_and_run() {
    // the engine break-tests stay runnable — they're the smallest readable
    // examples of single primitives
    for rel in [
        "worlds/probes/probe_time.json",
        "worlds/probes/probe_item.json",
        "worlds/probes/probe_target.json",
        "worlds/probes/probe_space.json",
        "worlds/probes/probe_pick.json",
        "worlds/probes/probe_hunt.json",
        "worlds/bestiary.json",
    ] {
        check(rel, 25);
    }
}
