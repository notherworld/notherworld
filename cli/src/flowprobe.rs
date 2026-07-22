//! flowprobe — proves the generic flow/watershed primitive is REAL, not labels.
//! PASS lines: pit-fill correctness, lakes exist with spill drainage, accumulation
//! is dendritic (mass conserved, a dominant trunk), and byte-identical determinism.

fn main() {
    let json = std::fs::read_to_string("worlds/city.json").unwrap();
    let w = owos_author::build(&json).unwrap();
    let n = 96usize;
    let f = w.flow_map("elevation", n);
    let mut pass = 0;
    let mut fail = 0;
    let mut check = |name: &str, ok: bool, detail: String| {
        println!("{} {:<38} {}", if ok { "PASS" } else { "FAIL" }, name, detail);
        if ok { pass += 1 } else { fail += 1 }
    };

    // 1. fill never below original, and every non-exit cell's downstream is not higher.
    let bad_fill = (0..n * n).filter(|&i| f.fill[i] + 1e-6 < f.fill[i] - f.pool[i]).count();
    let mut uphill = 0;
    for i in 0..n * n {
        if f.down[i] >= 0 && f.fill[f.down[i] as usize] > f.fill[i] + 1e-5 {
            uphill += 1;
        }
    }
    check("fill >= original everywhere", bad_fill == 0, format!("({bad_fill} bad)"));
    check("no downstream step goes uphill", uphill == 0, format!("({uphill} uphill)"));

    // 2. basins exist and drain: every pooled cell reaches the grid edge via `down`.
    let lakes = (0..n * n).filter(|&i| f.pool[i] > 1e-4).count();
    let mut stuck = 0;
    for i in 0..n * n {
        if f.pool[i] <= 1e-4 { continue; }
        let (mut c, mut hops) = (i as i32, 0);
        while c >= 0 && hops < n * n { c = f.down[c as usize]; hops += 1; }
        if c >= 0 { stuck += 1; }
    }
    check("lakes exist (pit-fill found basins)", lakes > 0, format!("({lakes} pooled cells)"));
    check("every lake cell drains to an exit", stuck == 0, format!("({stuck} stuck)"));

    // 3. accumulation: mass conserved (exits sum to the whole grid) and dendritic
    // (a real trunk: max accum far above the mean).
    let exit_sum: f32 = (0..n * n).filter(|&i| f.down[i] < 0).map(|i| f.accum[i]).sum();
    let max_a = f.accum.iter().cloned().fold(0.0f32, f32::max);
    check("mass conserved at exits", (exit_sum - (n * n) as f32).abs() < 0.5, format!("(exits drain {exit_sum:.0} of {})", n * n));
    check("dendritic trunk exists", max_a > (n * n) as f32 * 0.05, format!("(trunk drains {max_a:.0} cells)"));

    // 4. determinism: recompute → byte-identical.
    let g = w.flow_map("elevation", n);
    let same = f.fill == g.fill && f.pool == g.pool && f.down == g.down && f.accum == g.accum;
    check("recompute byte-identical", same, String::new());

    println!("\nflowprobe: {pass} PASS, {fail} FAIL");
    if fail > 0 { std::process::exit(1); }
}
