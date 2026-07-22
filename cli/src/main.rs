//! owos — a headless driver for the otherworldOS core.
//!
//! Seeds a town, prints who's who, fast-forwards time, and reports what changed.
//! This is the fastest possible feedback loop: no engine, no rendering, just the
//! simulation proving it produces coherent, emergent change over time.

use owos_core::{diff, seed, sim};

fn main() {
    let world_seed = 42;
    let days = 20;

    let mut world = seed::small_town(world_seed);
    println!(
        "otherworldOS — {} residents, seed {}\n",
        world.agents.len(),
        world_seed
    );

    println!("Day 0 — the town as you leave it:");
    for a in &world.agents {
        println!("   {:<22} ${:<4} mood {:+.2}", a.name, a.money, a.mood());
    }
    println!();

    let before = diff::snapshot(&world);
    sim::advance_days(&mut world, days);

    print!("{}", diff::report(&before, &world));
}
