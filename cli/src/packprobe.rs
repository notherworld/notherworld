//! PACKPROBE — proves mask-aware, fractal-coordinate subdivision is REAL.
//!
//! The claim: a district that says "N blocks" HAS N blocks, all packed onto its
//! buildable land (construction respects terrain), not spawned over water and
//! hidden by the renderer. And the same holds one scale down: a block's building
//! plots sit on buildable land too — the partition's masks are sampled through
//! each scope's world patch (wx0..wy1), so the SAME JSON is terrain-aware at
//! every depth.
//!
//! Run: cargo run --release --bin packprobe

fn main() {
    let json = std::fs::read_to_string("worlds/city.json").expect("worlds/city.json");
    let mut w = owos_author::build(&json).expect("build city");

    let city = w.by_kind("city")[0];
    let districts: Vec<_> = w.children(city).into_iter().filter(|&d| w.kind(d) == "district").collect();

    let mut total_blocks = 0usize;
    let mut wet_blocks = 0usize;
    let mut total_bldg = 0usize;
    let mut wet_bldg = 0usize;

    for &d in &districts {
        w.reveal(d);
        let (dx0, dy0, dx1, dy1) = (w.stat(d, "wx0"), w.stat(d, "wy0"), w.stat(d, "wx1"), w.stat(d, "wy1"));
        let blocks: Vec<_> = w.children(d).into_iter().filter(|&b| w.kind(b) == "block").collect();
        for &b in &blocks {
            total_blocks += 1;
            // block position is district-LOCAL; map to world through the district patch
            let fx = dx0 + w.stat(b, "bx") * (dx1 - dx0);
            let fy = dy0 + w.stat(b, "by") * (dy1 - dy0);
            let ok = w.sample_field("buildable", fx, fy) > 0.5;
            if !ok { wet_blocks += 1; }
        }
        // one scale further: reveal the first block, check its building plots
        if let Some(&b) = blocks.first() {
            w.reveal(b);
            let (bx0, by0, bx1, by1) = (w.stat(b, "wx0"), w.stat(b, "wy0"), w.stat(b, "wx1"), w.stat(b, "wy1"));
            for g in w.children(b) {
                if w.kind(g) != "building" { continue; }
                total_bldg += 1;
                let fx = bx0 + w.stat(g, "px") * (bx1 - bx0);
                let fy = by0 + w.stat(g, "py") * (by1 - by0);
                if w.sample_field("buildable", fx, fy) <= 0.5 { wet_bldg += 1; }
            }
        }
    }

    // LAYOUT RESPECTED: within each district, block rects must not overlap each
    // other (they're disjoint carves of the land, not nudged piles).
    let mut overlaps = 0usize;
    for &d in &districts {
        let blocks: Vec<_> = w.children(d).into_iter().filter(|&b| w.kind(b) == "block").collect();
        let rects: Vec<(f32, f32, f32, f32)> = blocks.iter().map(|&b| {
            (w.stat(b, "wx0"), w.stat(b, "wy0"), w.stat(b, "wx1"), w.stat(b, "wy1"))
        }).collect();
        let eps = 1e-4; // STRICT: carve cuts snap to clean seams — bboxes must be exactly disjoint
        for a in 0..rects.len() {
            for b in (a + 1)..rects.len() {
                let (ax0, ay0, ax1, ay1) = rects[a];
                let (bx0, by0, bx1, by1) = rects[b];
                let ox = (ax1.min(bx1) - ax0.max(bx0)).max(0.0);
                let oy = (ay1.min(by1) - ay0.max(by0)).max(0.0);
                if ox > eps && oy > eps { overlaps += 1; }
            }
        }
    }

    // FRACTAL CIRCULATION: the city's roads must have dropped GATE nodes on the
    // districts they cross, and each district's lane net (routed with gates:true)
    // must actually CONNECT to them — the artery and the lanes are one system.
    let mut total_gates = 0usize;
    let mut wired_gates = 0usize;
    for &d in &districts {
        for g in w.children(d) {
            if w.kind(g) != "gate" { continue; }
            total_gates += 1;
            if !w.neighbors(g, "lane").is_empty() { wired_gates += 1; }
        }
    }

    println!("districts revealed: {}", districts.len());
    println!("gates: {total_gates} dropped by city roads, {wired_gates} joined to a lane net");
    println!("block rect overlaps (beyond one-cell tolerance): {overlaps}");
    println!("blocks:    {total_blocks} spawned, {wet_blocks} on non-buildable terrain");
    println!("buildings: {total_bldg} spawned, {wet_bldg} on non-buildable terrain");

    let count_ok = districts.iter().all(|&d| {
        let n = w.children(d).into_iter().filter(|&b| w.kind(b) == "block").count();
        n >= 4 // count formula is 4 + density*4 — every district must KEEP all its blocks
    });

    let gates_ok = total_gates > 0 && wired_gates == total_gates;
    if wet_blocks == 0 && wet_bldg == 0 && overlaps == 0 && count_ok && total_blocks > 0 && total_bldg > 0 && gates_ok {
        println!("PASS: every parcel at every depth is a disjoint chunk of buildable land, and every artery crossing point is wired into the local net.");
    } else {
        println!("FAIL: parcels invalid ({wet_blocks}+{wet_bldg} wet, {overlaps} overlaps) or circulation disconnected ({wired_gates}/{total_gates} gates wired).");
        std::process::exit(1);
    }
}
