//! dragon — a deterministic goal (summon the love-dragon by making 65% of the
//! village's women happy) emerging from a whole STACK of interacting stressors:
//! yields, home upkeep, spreading happiness AND spreading sickness, seasonal
//! weather, drought, royal taxes, and burnout. Nothing here is "about" a dragon.

use owos_core::village::{Stressors, Village, VillageConfig};

const W: usize = 12;
const H: usize = 8;
const SEED: u64 = 7;
const DAYS: u32 = 90;

fn verdict(v: &Village) -> String {
    if v.dragon {
        format!("🐉 THE LOVE DRAGON AWAKENS  ({:.0}% women happy)", v.happy_fraction() * 100.0)
    } else {
        format!("…the spirit sleeps  (peaked below 65% — ended at {:.0}%)", v.happy_fraction() * 100.0)
    }
}

fn run(label: &str, mut v: Village) {
    for _ in 0..DAYS {
        v.step();
    }
    println!("\n=== {label} ===");
    print!("{}", v.happy_map());
    println!("{}", verdict(&v));
}

fn run_evolving(label: &str, mut v: Village, marks: &[u32]) {
    println!("\n=== {label} ===");
    for d in 0..=DAYS {
        if marks.contains(&d) {
            println!("-- day {d} · {:.0}% happy · [{}] --", v.happy_fraction() * 100.0, v.weather_note());
            print!("{}", v.happy_map());
        }
        if d < DAYS {
            v.step();
        }
    }
    println!("{}", verdict(&v));
}

fn main() {
    println!("otherworldOS · Dragon Festival — one goal, a whole stack of stressors");
    println!("(# thriving · + happy · : ok · . low · blank sad)   goal: 65% of women happy");
    println!("stressors: yields · upkeep · spreading illness · weather · drought · royal taxes · burnout");

    let selfish = VillageConfig { farm: 0.55, home: 0.45, volunteer: 0.0 };
    let communal = VillageConfig { farm: 0.44, home: 0.34, volunteer: 0.22 };

    let mut a = Village::new(W, H, SEED, selfish, Stressors::calm());
    a.set_poor_side(0.55);
    run("SELFISH village · calm season (no one helps the poor west side)", a);

    let mut b = Village::new(W, H, SEED, communal, Stressors::calm());
    b.set_poor_side(0.55);
    run("COMMUNAL village · calm season (men volunteer on the west side)", b);

    let mut c = Village::new(W, H, SEED, communal, Stressors::hard());
    c.set_poor_side(0.55);
    run_evolving(
        "COMMUNAL village · HARD year (illness + drought + taxes)",
        c,
        &[0, 20, 40, 65, 90],
    );
}
