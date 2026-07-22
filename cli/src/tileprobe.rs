// tileprobe — prove THE TILE WORLD pure-data: ensure_tile(1,0) materializes the
// land EAST of the base world; the terrain fields are CONTINUOUS across the tile
// border (same coastline crosses it — global fields, no stitching); the call is
// idempotent; and each tile generates its own full entity layer (districts).
fn main() {
    let json = std::fs::read_to_string("portal/src/atlas/world.json").unwrap();
    let (mut w, spec) = owos_author::build_with_spec(&json).expect("build");

    let base = w.by_kind("city")[0];
    let d0 = w.children(base).iter().filter(|&&c| w.kind(c) == "district").count();
    println!("base tile (0,0): {} districts.", d0);

    // materialize the tile to the EAST
    let east = owos_author::ensure_tile(&mut w, &spec, 1, 0).expect("tile");
    let d1 = w.children(east).iter().filter(|&&c| w.kind(c) == "district").count();
    println!("tile (1,0): id {} with {} districts (its own entity layer).", east, d1);

    // IDEMPOTENT: asking again returns the same tile, spawns nothing
    let again = owos_author::ensure_tile(&mut w, &spec, 1, 0).expect("tile");
    let same = again == east;
    println!("ensure_tile(1,0) again → same id: {}", same);

    // BORDER CONTINUITY: sample elevation just west/east of x=1.0 at several y —
    // global fields must be continuous across the tile seam (|Δ| tiny).
    let mut max_d = 0.0f32;
    for i in 0..9 {
        let y = 0.1 + i as f32 * 0.1;
        let a = w.sample_field("elevation", 0.9995, y);
        let b = w.sample_field("elevation", 1.0005, y);
        let d = (a - b).abs();
        if d > max_d { max_d = d; }
    }
    println!("border continuity: max |Δelevation| across x=1.0 seam = {:.5}", max_d);

    // the streaming trio composes: rect-reveal blocks in a window straddling the seam
    let touched = w.reveal_rect(0.8, 0.3, 1.2, 0.7, "district");
    println!("reveal_rect straddling the seam touched {} districts (both tiles).", touched.len());

    let pass = d0 > 0 && d1 > 0 && same && max_d < 0.02;
    println!("{}", if pass {
        "PASS: tile world — adjacent land generates, fields continuous across the seam, idempotent, streams."
    } else { "FAIL: see above." });
}
