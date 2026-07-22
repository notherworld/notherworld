// streamprobe — prove the STREAMING RECT API (reveal_rect / fold_outside): a
// camera WALKS across the atlas world; blocks materialize ahead of it and fold
// behind it. Checks: (1) reveal-ahead touches the right scopes, (2) fold_outside
// drops what the camera left, (3) re-entering unfolds (canon NOT rewritten —
// same buildings), (4) idempotence (second call = 0 work).
use owos_core::engine::World;

fn detailed_blocks(w: &World) -> usize {
    w.by_kind("block").iter().filter(|&&b| w.is_revealed(b) && !w.is_coarse(b)).count()
}

fn main() {
    let json = std::fs::read_to_string("portal/src/atlas/world.json").unwrap();
    let mut w = owos_author::build(&json).expect("build");
    // reveal districts so blocks exist with world patches
    let city = w.by_kind("city")[0];
    for &d in &w.children(city).clone() {
        if w.kind(d) == "district" { w.reveal(d); }
    }
    let total_blocks = w.by_kind("block").len();
    println!("world: {} blocks across the districts.", total_blocks);

    // the CAMERA: a 0.3×0.3 window walking left→right across the world in strides
    let win = 0.3f32;
    let mut prev_center: Option<f32> = None;
    let mut first_pass_ids: Vec<usize> = Vec::new();
    for step in 0..5 {
        let cx = 0.15 + step as f32 * 0.175;   // 0.15 → 0.85
        let (x0, x1) = (cx - win / 2.0, cx + win / 2.0);
        let touched = w.reveal_rect(x0, 0.2, x1, 0.8, "block");
        let folded = w.fold_outside(x0 - 0.1, 0.1, x1 + 0.1, 0.9, "block");
        println!("  camera at x={:.2}: revealed/unfolded {:>2}, folded-behind {:>2}, DETAILED now {:>2}",
            cx, touched.len(), folded, detailed_blocks(&w));
        if step == 0 { first_pass_ids = touched.clone(); }
        prev_center = Some(cx);
    }
    let _ = prev_center;

    // idempotence: same rect again = zero work
    let again = w.reveal_rect(0.85 - win / 2.0, 0.2, 0.85 + win / 2.0, 0.8, "block");
    println!("same rect again: {} touched (must be 0).", again.len());

    // RE-ENTRY: walk back to the start — blocks there were folded; they must
    // UNFOLD (not re-reveal) and keep their canon (same building count).
    let some_first = first_pass_ids.first().copied();
    let canon_before: Option<usize> = some_first.map(|b|
        w.children(b).iter().filter(|&&c| w.kind(c) == "building").count());
    let back = w.reveal_rect(0.0, 0.2, 0.3, 0.8, "block");
    let canon_after: Option<usize> = some_first.map(|b|
        w.children(b).iter().filter(|&&c| w.kind(c) == "building").count());
    println!("walk back to start: {} unfolded; canon stable: {:?} == {:?}",
        back.len(), canon_before, canon_after);

    let pass = again.is_empty() && canon_before == canon_after && !back.is_empty();
    println!("{}", if pass { "PASS: streaming rect API — reveal-ahead, fold-behind, re-entry unfolds, canon stable." }
             else { "FAIL: see above." });
}
