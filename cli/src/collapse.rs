//! collapse — the regime-shift + probabilistic-disaster demo.
//!
//! Part 1: the same flood, different life choices → opposite fates (money is
//! worthless after; only matching prep saves you). Part 2: a weighted-random
//! disaster (60% flood / 25% volcano / 15% quake) — the same boatman prep, five
//! playthroughs, and the seed decides whether he prepared for the right thing.

use owos_core::dynamics::{Composition, World};
use owos_core::kit::Catalyst;
use owos_core::library::{
    collapse_survivor, disaster_deck, flood, role_banker, role_boatman, role_prepper, volcano,
};

fn outcome(w: &World) -> &'static str {
    if w.value("surv.influence") > 40.0 {
        "became a LEADER of survivors"
    } else if w.value("surv.safety") < 15.0 {
        "barely survives, a wandering NOMAD"
    } else {
        "scrapes by, day to day"
    }
}

fn run_fixed(role: &Catalyst, disaster: &Catalyst, seed: u64) -> World {
    let mut w = Composition::single(collapse_survivor()).build(seed);
    w.fire(role);
    for day in 1..=120 {
        w.step();
        if day == 30 {
            w.fire(disaster);
        }
    }
    w
}

fn main() {
    println!("otherworldOS · Collapse — one choice, a different world after\n");
    println!("-- same disaster, different life you chose to live --");

    let scenarios: [(&str, Catalyst, Catalyst); 4] = [
        ("Boatman  +  FLOOD", role_boatman(), flood()),
        ("Banker   +  FLOOD", role_banker(), flood()),
        ("Boatman  +  VOLCANO  (wrong prep!)", role_boatman(), volcano()),
        ("Prepper  +  VOLCANO", role_prepper(), volcano()),
    ];
    for (name, role, disaster) in &scenarios {
        let w = run_fixed(role, disaster, 7);
        println!("   {:<38} → {}", name, outcome(&w));
        println!(
            "        food {:>3.0} · safety {:>3.0} · influence {:>3.0}",
            w.value("surv.food"),
            w.value("surv.safety"),
            w.value("surv.influence"),
        );
    }

    println!("\n-- weighted-random disaster (60% flood / 25% volcano / 15% quake) --");
    println!("   same boatman prep, five playthroughs — the seed decides your fate:");
    for seed in [1u64, 2, 3, 4, 5] {
        let mut w = Composition::single(collapse_survivor()).build(seed);
        w.fire(&role_boatman());
        let mut struck = String::new();
        for day in 1..=120 {
            w.step();
            if day == 30 {
                struck = w.fire_weighted(&disaster_deck()).unwrap_or_default();
            }
        }
        println!("   seed {seed}: {:<45} → {}", struck, outcome(&w));
    }
}
