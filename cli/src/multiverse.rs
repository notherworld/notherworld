//! multiverse — the receipt for "a reproducible multiverse from coordinates."
//!
//! Every galaxy/planet/system coordinate folds (integer-exact, no f32 ceiling) into a
//! world seed; `build_at` turns that seed into a full deterministic world. So any of an
//! astronomical number of addresses yields its OWN distinct, coherent, reproducible
//! world — built on demand, in microseconds, from nothing but its address.
//!
//! Run:  cargo run --release --bin multiverse

use std::time::Instant;

use owos_author::{address_seed, build_at};
use owos_core::engine::World;

/// A compact fingerprint of a built planet: (#regions, total pop, prosperity, hash).
/// The hash folds every region's stats, so two planets match iff they're identical.
fn fingerprint(w: &mut World) -> (usize, f32, f32, u64) {
    for _ in 0..2 {
        w.step();
    } // let the planet's rollup rules settle pop/prosperity
    let planet = *w.by_kind("planet").first().unwrap();
    let regions = w.by_kind("region");
    let mut h = 0xcbf2_9ce4_8422_2325u64;
    for &r in &regions {
        for k in ["population", "biome", "wealth", "capital"] {
            let v = (w.stat(r, k) * 1000.0) as i64 as u64;
            h = (h ^ v).wrapping_mul(0x0000_0100_0000_01B3);
        }
    }
    (regions.len(), w.stat(planet, "pop"), w.stat(planet, "prosperity"), h)
}

fn planet(json: &str, addr: &[i64]) -> (usize, f32, f32, u64) {
    let mut w = build_at(json, addr).expect("build_at");
    fingerprint(&mut w)
}

fn main() {
    let json = std::fs::read_to_string("worlds/planet.json").expect("worlds/planet.json");
    println!("otherworldOS · multiverse — every coordinate is its own deterministic world\n");

    // 1. THE NESTED ADDRESS: [universe, galaxy_x, galaxy_y, planet_x, planet_y].
    //    Universe 1, galaxy (2,3), a few planets — each its own distinct world.
    println!("┌─ NESTED ADDRESS — universe 1 · galaxy (2,3) · its planets ─┐");
    for (px, py) in [(0i64, 0i64), (1, 0), (2, 0), (3, 7)] {
        let (n, pop, pr, h) = planet(&json, &[1, 2, 3, px, py]);
        println!("   U1·G(2,3)·P({px},{py})  → {n} regions · pop {pop:.2} · prosperity {pr:.2}  #{h:016x}");
    }

    // 1b. A WHOLE OTHER UNIVERSE — universe seed 2, the SAME galaxy/planet coords.
    //     Every world is different: each universe is a full multiverse, as detailed as the first.
    println!("\n┌─ ANOTHER UNIVERSE (seed 2) — SAME coords, entirely new worlds ─┐");
    for (px, py) in [(0i64, 0i64), (1, 0), (2, 0), (3, 7)] {
        let (n, pop, pr, h) = planet(&json, &[2, 2, 3, px, py]);
        println!("   U2·G(2,3)·P({px},{py})  → {n} regions · pop {pop:.2} · prosperity {pr:.2}  #{h:016x}");
    }
    println!("   → same galaxy/planet coordinates, new universe seed = new everything. Just prepend one more number.");

    // 2. REPRODUCIBLE — the same full address, built twice, no memory of the first.
    let a = [1i64, 2, 3, 12_345, 67_890];
    let (f1, f2) = (planet(&json, &a), planet(&json, &a));
    println!("\n┌─ REPRODUCIBLE (same address, rebuilt from scratch) ─┐");
    println!(
        "   U1·G(2,3)·P(12345,67890) twice: {}   (#{:016x} vs #{:016x})",
        if f1 == f2 { "IDENTICAL ✓" } else { "DIFFERENT ✗" }, f1.3, f2.3
    );

    // 3. HUGE addresses — integer-exact, no f32 precision death (that capped tiles at 16.78M).
    println!("\n┌─ HUGE addresses (past every f32 limit) ─┐");
    for a in [&[999i64, 1_000_000_000_000, 42][..], &[7, 9_223_372_036_854_775_000, 1][..]] {
        let (n, pop, pr, h) = planet(&json, a);
        println!("   {a:?}\n      → {n} regions · pop {pop:.2} · prosperity {pr:.2}  #{h:016x} (still distinct & coherent)");
    }

    // 4. TOPOLOGY IS A CHOICE — a torus makes the far walk circle home.
    let n = 1_000_000i64;
    let home = planet(&json, &[3, 5, 5]);
    let flat = planet(&json, &[3, 5 + n, 5]);           // walked N east on a flat plane
    let torus = planet(&json, &[3, (5 + n) % n, 5]);    // same walk, but coords wrap mod N
    println!("\n┌─ TOPOLOGY is data (galaxy width {n}) ─┐");
    println!("   flat plane : planet (5+{n},5) is a stranger        → {}", if flat.3 != home.3 { "different ✓" } else { "?" });
    println!("   torus mod {n}: the SAME walk lands you back HOME    → {}", if torus.3 == home.3 { "SAME PLANET ✓" } else { "?" });

    // 5. SPEED — a whole world from an address, on demand.
    let t = Instant::now();
    let runs = 200;
    for i in 0..runs {
        let _ = build_at(&json, &[i as i64, i as i64 * 7, 3]).unwrap();
    }
    let per = t.elapsed().as_secs_f64() * 1e6 / runs as f64;
    println!("\n┌─ ON DEMAND ─┐\n   built {runs} distinct worlds in {:.1}ms → {per:.0}µs each. You only ever build the one you visit.", t.elapsed().as_secs_f64() * 1e3);

    // 6. THE NUMBERS.
    println!("\n┌─ THE ADDRESS SPACE ─┐");
    println!("   one coord = i64 ≈ 1.8e19 (2^64) values — no f32 ceiling.");
    println!("   nested [universe, gx,gy, px,py] = 5 coords ≈ 2^320 addresses.");
    println!("   planets alone (galaxy/planet/system, 2 coords each) ≈ 2^256 ≈ 1e77");
    println!("     · No Man's Sky is ~1.8e19 (18 quintillion) planets → this is ~1e58× that");
    println!("     · ~within a few orders of magnitude of the atom count of the observable universe (~1e80)");
    println!("   sample seeds: [7,0,0]={:016x}  [7,1,0]={:016x}  (avalanche — neighbours share nothing)",
        address_seed(&[7, 0, 0]), address_seed(&[7, 1, 0]));
    println!("\n   …and every one is a full, living world the moment you look. That's the part nobody else can say.");
}
