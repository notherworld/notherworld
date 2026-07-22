//! PATHPROBE — the worked examples for the GENERAL pathfinding prim (per
//! SPEC_PATHFINDING_AND_INTERRELATION §1). Two demonstrations, both of the same
//! one capability: "least-cost path through a dev-composed cost field."
//!
//! 1. THE VALLEY vs THE RIDGE — a road between two towns with a steep ridge in
//!    between. The straight line goes OVER the ridge; the engine's path curves
//!    AROUND it, because around is cheaper. The curve is the terrain deciding.
//! 2. TWO SOULS, ONE ROAD — two travellers, same start, same goal, same cost
//!    FORMULA — but the formula reads the traveller's own `courage`. The timid
//!    one detours around the danger field; the brave one cuts through. Same
//!    primitive, different souls, different paths.
//!
//! Run: cargo run --release --bin pathprobe

fn main() {
    // a world whose fields carry a vertical RIDGE (x∈[0.45,0.55]) with a gap in
    // the south (y>0.8), and a DANGER blob in the middle of the map
    let json = r#"{
      "rng_seed": 4,
      "fields": {
        "ridge":  "gt(fx,0.45)*lt(fx,0.55)*lt(fy,0.8)",
        "danger": "lt(abs(fx-0.5),0.42)*lt(abs(fy-0.45),0.12)"
      },
      "seed": [ { "kind": "land", "name": "the March", "reveal": true } ],
      "generators": [
        { "on": "land", "spawn": "traveller", "count": "2",
          "child_stats": { "courage": "iff(eq(index,0), 0.05, 0.95)" } }
      ]
    }"#;
    let w = owos_author::build(json).expect("build");
    let full = (0.0, 0.0, 1.0, 1.0);
    let dist = |p: &[(f32, f32)]| -> f32 {
        p.windows(2).map(|s| ((s[0].0 - s[1].0).powi(2) + (s[0].1 - s[1].1).powi(2)).sqrt()).sum()
    };
    // sample ALONG the segments (waypoints alone miss everything between them)
    let touches = |p: &[(f32, f32)], f: &str| {
        p.windows(2).any(|s| {
            (0..=20).any(|k| {
                let t = k as f32 / 20.0;
                let (x, y) = (s[0].0 + (s[1].0 - s[0].0) * t, s[0].1 + (s[1].1 - s[0].1) * t);
                w.sample_field(f, x, y) > 0.5
            })
        })
    };

    println!("── 1. THE VALLEY vs THE RIDGE ─────────────────────────────");
    let cost = owos_core::engine::expr::parse("1 + 40*field(ridge,fx,fy)").unwrap();
    let (a, b) = ((0.15f32, 0.3f32), (0.85f32, 0.3f32));
    let straight = ((a.0 - b.0).powi(2) + (a.1 - b.1).powi(2)).sqrt();
    let path = w.pathfind(a, b, &cost, None, full, 48);
    let plen = dist(&path);
    println!("   straight line: {straight:.2} (over the ridge)   engine path: {plen:.2} ({} waypoints)", path.len());
    println!("   path crosses the ridge: {}", touches(&path, "ridge"));
    let ok1 = !path.is_empty() && plen > straight * 1.2 && !touches(&path, "ridge");
    println!("   → {}", if ok1 { "the road went AROUND — longer on the map, cheaper in the world. The terrain decided." } else { "FAIL: the road did not negotiate the ridge" });

    println!("── 2. TWO SOULS, ONE ROAD ─────────────────────────────────");
    // ONE formula; `courage` is the MOVER's stat. That's the whole trick.
    let pcost = owos_core::engine::expr::parse("1 + 30*field(danger,fx,fy)*(1-courage)").unwrap();
    let land = w.by_kind("land")[0];
    let (timid, brave) = {
        let t: Vec<_> = w.children(land).into_iter().filter(|&c| w.kind(c) == "traveller").collect();
        (t[0], t[1])
    };
    let (s, g) = ((0.5f32, 0.12f32), (0.5f32, 0.85f32));
    let p_timid = w.pathfind(s, g, &pcost, Some(timid), full, 48);
    let p_brave = w.pathfind(s, g, &pcost, Some(brave), full, 48);
    println!("   timid  (courage {:.2}): length {:.2}, enters danger: {}", w.stat(timid, "courage"), dist(&p_timid), touches(&p_timid, "danger"));
    println!("   brave  (courage {:.2}): length {:.2}, enters danger: {}", w.stat(brave, "courage"), dist(&p_brave), touches(&p_brave, "danger"));
    let ok2 = !p_timid.is_empty() && !p_brave.is_empty()
        && !touches(&p_timid, "danger") && touches(&p_brave, "danger")
        && dist(&p_brave) < dist(&p_timid);
    println!("   → {}", if ok2 { "same start, same goal, same FORMULA — the timid soul detours, the brave one cuts through. Personality routed them." } else { "FAIL: personalities did not diverge the paths" });

    if ok1 && ok2 {
        println!("\nPASS: pathfinding is a general decision over composed cost fields — roads and souls alike.");
    } else {
        println!("\nFAIL");
        std::process::exit(1);
    }
}
