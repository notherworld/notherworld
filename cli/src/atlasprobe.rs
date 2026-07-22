// atlasprobe — prove the PLOT-LIFECYCLE (work / decay / reclamation) pure-data.
// Reveal city→district→block(→building), settle, then STEP and watch `work` decay
// and `standing` fall for neglected plots (reclamation by nature), while occupied /
// alive plots hold. No engine change — this reads the rules/rollups authored in JSON.
fn main() {
    let json = std::fs::read_to_string("portal/src/atlas/world.json").unwrap();
    let mut w = owos_author::build(&json).unwrap();
    let names = ["resi", "shop", "cafe", "clinic", "school", "office"];
    let city = w.by_kind("city")[0];
    for &d in &w.children(city) {
        if w.kind(d) == "district" {
            w.reveal(d);
            for &b in &w.children(d) {
                if w.kind(b) == "block" { w.reveal(b); }
            }
        }
    }

    let buildings: Vec<usize> = w.by_kind("building");
    let built0 = buildings.iter().filter(|&&b| w.stat(b, "built") > 0.5).count();
    println!("revealed {} buildings ({} eligible/built).", buildings.len(), built0);

    // helper: snapshot mean work + how many currently STAND, split kept vs neglected
    let report = |w: &owos_core::engine::World, tick: usize| {
        let bs: Vec<usize> = w.by_kind("building");
        let mut sum_work = 0.0f32; let mut standing = 0; let mut occ = 0; let mut occ_work = 0.0f32; let mut vac = 0; let mut vac_work = 0.0f32;
        for &b in &bs {
            let wk = w.stat(b, "work"); sum_work += wk;
            if w.stat(b, "standing") > 0.5 { standing += 1; }
            if w.stat(b, "souls") > 0.5 || w.stat(b, "upkeep") > 0.5 { occ += 1; occ_work += wk; } else { vac += 1; vac_work += wk; }
        }
        let n = bs.len().max(1) as f32;
        println!("  t={:>3}: mean work {:.3}  standing {:>3}   | kept({}) work {:.3}   neglected({}) work {:.3}",
            tick, sum_work / n, standing, occ, occ_work / occ.max(1) as f32, vac, vac_work / vac.max(1) as f32);
    };

    println!("\nwork over time (kept plots hold + build out; neglected plots DECAY -> reclaim):");
    report(&w, 0);
    for t in 1..=60 { w.step(); if t % 10 == 0 { report(&w, t); } }

    // initial work by use (the settle seed from meaning)
    let mut byuse: [(f32, i32); 6] = [(0.0, 0); 6];
    for &b in &buildings { if w.stat(b, "built") > 0.5 { let u = (w.stat(b, "use") as usize).min(5); byuse[u].0 += w.stat(b, "work_seed"); byuse[u].1 += 1; } }
    println!("\ninitial work_seed by use (meaning-driven):");
    for i in 0..6 { if byuse[i].1 > 0 { println!("  {:<7} seed {:.3}  (n={})", names[i], byuse[i].0 / byuse[i].1 as f32, byuse[i].1); } }

    // surface distribution (decay resistance)
    let mut surf = [0; 3];
    for &b in &buildings { let s = (w.stat(b, "surface") as usize).min(2); surf[s] += 1; }
    println!("\nsurface: {} dirt / {} lawn / {} paved", surf[0], surf[1], surf[2]);

    // INTERIOR CHAIN — building → floor → room (door-chained) → decor-at-reveal
    // (lazy canon: decor exists only once its room is observed). Dive one built
    // multistory building if there is one.
    if let Some(&bd) = buildings.iter().find(|&&x| w.stat(x, "built") > 0.5 && w.stat(x, "floors") >= 2.0) {
        w.reveal(bd);
        let floors: Vec<usize> = w.children(bd).into_iter().filter(|&c| w.kind(c) == "floor").collect();
        let f0 = floors[0];
        w.reveal(f0);
        let rooms: Vec<usize> = w.children(f0).into_iter().filter(|&c| w.kind(c) == "room").collect();
        let pre_decor: usize = rooms.iter().map(|&r| w.children(r).len()).sum();
        for &r in &rooms { w.reveal(r); }
        let post_decor: usize = rooms.iter()
            .map(|&r| w.children(r).iter().filter(|&&c| w.kind(c) == "decor").count()).sum();
        let doors = w.edges().iter().filter(|e| !e.dead && e.kind == "door"
            && rooms.contains(&e.from) && rooms.contains(&e.to)).count();
        println!("\ninterior: building {} → {} floors; floor 0 → {} rooms, {} door edges; decor {} before reveal → {} after (lazy canon)",
            bd, floors.len(), rooms.len(), doors, pre_decor, post_decor);
    }

    // ROAD HIERARCHY — do `path` edges RIDE existing roads (highway/lane)? For each
    // path polyline, measure what fraction of its length runs within a road-corridor of
    // an EARLIER-laid road. High fraction = paths use the artery as a connector (the
    // ramp/exit read), low = they cut their own parallel lines. Also count path edges
    // per built plot (redundancy: ~1 = clean, ≫1 = 50%-overlap duplicates).
    let edges: Vec<(usize, usize, String)> = w.edges().iter().filter(|e| !e.dead).map(|e| (e.from, e.to, e.kind.clone())).collect();
    let n_path = edges.iter().filter(|(_, _, k)| k == "path").count();
    let n_lane = edges.iter().filter(|(_, _, k)| k == "lane").count();
    let n_road = edges.iter().filter(|(_, _, k)| k == "road").count();
    // sample each path edge's polyline; a sample "on road" if within 0.02 world of a road
    let mut on_road = 0usize; let mut total = 0usize;
    for (a, b, k) in &edges {
        if k != "path" { continue; }
        if let Some(poly) = w.route_path(*a, *b) {
            for &(x, y) in poly { total += 1; if w.road_dist_world(x, y) < 0.02 { on_road += 1; } }
        }
    }
    let built = buildings.iter().filter(|&&b| w.stat(b, "built") > 0.5).count().max(1);
    println!("\nroad hierarchy: {} highway + {} lane + {} path edges ({:.2} paths/built-plot)", n_road, n_lane, n_path, n_path as f32 / built as f32);
    if total > 0 {
        println!("  path length running ALONG an existing road: {:.0}% ({}/{} samples) — high = paths use the artery as a connector, not duplicate it",
            100.0 * on_road as f32 / total as f32, on_road, total);
    }
}
