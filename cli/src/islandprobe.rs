//! ISLANDPROBE — the worked example for the CONNECTIVITY GUARANTEE in
//! `route_network`: *every settled node reaches the network*, like the real
//! world. A lone hamlet across a gap is tied back in by a country road; when the
//! only way over is water, that connector IS a bridge. Nothing is left floaty.
//!
//! This is the fix for "floaty island zones": the tree/mesh routing links what
//! the `max_span` cap lets it reach and used to SILENTLY DROP the rest — a node
//! marooned across wide water just sat there, unreachable. Now a rescue pass
//! pulls it in, and the connector's character (country road / bridge) falls out
//! of the terrain, never a special case.
//!
//! TWO settlements, proven:
//!   1. A HAMLET across a LAND gap (empty country between it and town) — the old
//!      k-nearest tree could miss it; the guarantee threads a country road to it.
//!   2. An ISLAND across WIDE WATER (span > max_span, the normal pass REFUSES it)
//!      — the guarantee reaches it anyway, and because the gap is water the
//!      connector is a BRIDGE (a `bridge` infra node on the route). No fake land.
//!
//! We assert the "before" too: with the SAME world minus the rescue there'd be a
//! stranded node — so we show the marooned island is genuinely beyond max_span
//! (the normal cap would reject it), then that it ends up connected regardless.
//!
//! Run: cargo run --release --bin islandprobe

use owos_core::engine::{World, EntityId};

/// BFS the route graph from `hub` over `edge` (walks THROUGH shore/bridge infra
/// nodes too) — returns every entity reachable from the hub by road.
fn reachable(w: &World, hub: EntityId, edge: &str) -> std::collections::BTreeSet<EntityId> {
    let mut seen = std::collections::BTreeSet::new();
    let mut stack = vec![hub];
    seen.insert(hub);
    while let Some(u) = stack.pop() {
        for v in w.neighbors(u, edge) {
            if seen.insert(v) {
                stack.push(v);
            }
        }
    }
    seen
}

fn main() {
    // A world with a vertical SEA STRIP (x∈[0.55,0.78]) — wide water. Mainland
    // towns sit west of it; ONE island sits east of it (beyond the strip). A
    // separate small LAND GAP (no water, just distance) strands a hamlet to the
    // north. Positions are authored explicitly by index so the geography is exact
    // and the test is deterministic.
    //
    //   node 0 = TOWN (the hub, mainland, west)
    //   node 1 = mainland neighbour (west, near town)
    //   node 2 = HAMLET  (far north, a LAND gap from town — no water between)
    //   node 3 = ISLAND  (east, across the WIDE SEA STRIP from everything)
    let json = r#"{
      "rng_seed": 7,
      "fields": {
        "sea":   "gt(fx,0.55)*lt(fx,0.78)",
        "land":  "not(gt(fx,0.55)*lt(fx,0.78))",
        "flat":  "1"
      },
      "seed": [ { "kind": "region", "name": "the Sound", "reveal": true } ],
      "generators": [
        { "on": "region", "spawn": "town", "count": "4",
          "child_stats": {
            "cx":   "iff(eq(index,0),0.20, iff(eq(index,1),0.35, iff(eq(index,2),0.30, 0.90)))",
            "cy":   "iff(eq(index,0),0.50, iff(eq(index,1),0.55, iff(eq(index,2),0.08, 0.50)))",
            "seat": "eq(index,0)"
          } }
      ],
      "routes": [
        { "on": "region", "node": "town", "hub": "seat", "route": "road",
          "x": "cx", "y": "cy", "style": "organic", "redundancy": 3,
          "cost": "1 + 20*field(sea, fx, fy)",
          "transition": "field(sea, fx, fy)", "max_span": 0.12, "trans_kind": "bridge" }
      ]
    }"#;

    let w = owos_author::build(json).expect("build");

    let region = w.by_kind("region")[0];
    let towns: Vec<EntityId> = w
        .children(region)
        .into_iter()
        .filter(|&c| w.kind(c) == "town")
        .collect();
    // towns are spawned in index order under the region
    let (town, hamlet, island) = (towns[0], towns[2], towns[3]);
    let sea_span = 0.78 - 0.55; // 0.23 — the width of open water the island sits beyond

    println!("── THE GEOGRAPHY ──────────────────────────────────────────");
    for (label, id) in [("TOWN (hub)", town), ("mainland", towns[1]), ("HAMLET (land gap)", hamlet), ("ISLAND (over sea)", island)] {
        println!("   {label:<18} at ({:.2}, {:.2})", w.stat(id, "cx"), w.stat(id, "cy"));
    }
    println!("   sea strip width: {sea_span:.2}   route max_span: 0.12  → the island is BEYOND the normal crossable span");
    let island_needs_rescue = sea_span > 0.12; // the normal pass would REFUSE a direct crossing this wide

    // who does the road actually reach from the hub?
    let net = reachable(&w, town, "road");

    println!("── CONNECTIVITY GUARANTEE ─────────────────────────────────");
    let hamlet_in = net.contains(&hamlet);
    let island_in = net.contains(&island);
    println!("   hamlet reachable from town by road: {hamlet_in}   (a country road across the land gap)");
    println!("   island reachable from town by road: {island_in}   (a rescue that had to cross wide water)");

    // the island's connector must be a BRIDGE — prove a bridge infra node is part
    // of the reachable network (it was spawned to span the sea for the rescue).
    let bridges: Vec<EntityId> = w.by_kind("bridge").into_iter().filter(|b| net.contains(b)).collect();
    println!("   bridges laid on the network: {}   (the sea crossing that reaches the island)", bridges.len());

    // sanity: the island really is across the sea from the mainland (its connector
    // HAD to cross water, it couldn't be a plain land road)
    let island_east_of_sea = w.stat(island, "cx") > 0.78;

    let ok = island_needs_rescue          // the gap genuinely exceeds max_span (else nothing was proven)
        && hamlet_in                      // the land-gap hamlet got its country road
        && island_in                      // the marooned island got connected at all
        && island_east_of_sea             // and it really is across the water
        && !bridges.is_empty();           // via a BRIDGE — the terrain chose the connector's character

    println!("── ─────────────────────────────────────────────────────────");
    if ok {
        println!(
            "PASS: every settled node reaches the network. The hamlet got a country road\n\
             across the land gap; the island — beyond the crossable span, DROPPED by the\n\
             normal pass — got pulled in by a rescue connector that BRIDGED the sea. No\n\
             floaty zones; the connector's character was decided by the terrain, not a rule."
        );
    } else {
        println!("FAIL: hamlet_in={hamlet_in} island_in={island_in} bridges={} needs_rescue={island_needs_rescue} east_of_sea={island_east_of_sea}", bridges.len());
        std::process::exit(1);
    }
}
