//! agency — NPCs deciding for themselves, and a player steering one of them.
//!
//! Twelve citizens each choose (via utility) whether to Comply, Protest, or
//! Flee based on their own discontent, fear, and hope — so they diverge. Their
//! choices roll up: if enough Protest, the city revolts. One citizen is YOURS.
//! Left to decide for himself, the city holds. But set his intent to RALLY —
//! spreading courage to his neighbours — and the same city, same people, tips
//! into revolt. Same decision system for NPC and player; only the chooser differs.

use owos_core::engine::{Action, EntityId, Reducer, Rollup, World};
use owos_core::Rng;

struct Comply;
impl Action for Comply {
    fn name(&self) -> &str {
        "Comply"
    }
    fn score(&self, w: &World, a: EntityId) -> f32 {
        0.15 + 0.35 * w.stat(a, "fear")
    }
    fn apply(&self, w: &mut World, a: EntityId) {
        w.set(a, "protesting", 0.0);
        w.set(a, "discontent", (w.stat(a, "discontent") - 0.02).max(0.0));
        w.set(a, "chose", 0.0);
    }
}

struct Protest;
impl Action for Protest {
    fn name(&self) -> &str {
        "Protest"
    }
    fn score(&self, w: &World, a: EntityId) -> f32 {
        let (d, f, h) = (w.stat(a, "discontent"), w.stat(a, "fear"), w.stat(a, "hope"));
        d * (1.0 - f) * (0.85 + 0.5 * h)
    }
    fn apply(&self, w: &mut World, a: EntityId) {
        w.set(a, "protesting", 1.0);
        w.set(a, "discontent", (w.stat(a, "discontent") + 0.03).min(1.0));
        w.set(a, "fear", (w.stat(a, "fear") + 0.03).min(1.0));
        w.set(a, "chose", 1.0);
    }
}

struct Flee;
impl Action for Flee {
    fn name(&self) -> &str {
        "Flee"
    }
    fn score(&self, w: &World, a: EntityId) -> f32 {
        w.stat(a, "fear") * (1.0 - w.stat(a, "hope")) * 0.85
    }
    fn apply(&self, w: &mut World, a: EntityId) {
        w.set(a, "protesting", 0.0);
        w.set(a, "chose", 2.0);
    }
}

struct Rally;
impl Action for Rally {
    fn name(&self) -> &str {
        "Rally"
    }
    fn score(&self, _w: &World, _a: EntityId) -> f32 {
        0.0 // an NPC never rallies on its own here — this is a player's move
    }
    fn apply(&self, w: &mut World, a: EntityId) {
        if let Some(city) = w.parent(a) {
            for c in w.children(city) {
                if c == a {
                    continue;
                }
                w.set(c, "hope", (w.stat(c, "hope") + 0.15).min(1.0));
                w.set(c, "fear", (w.stat(c, "fear") - 0.12).max(0.0));
            }
        }
        w.set(a, "protesting", 1.0);
        w.set(a, "chose", 3.0);
    }
}

fn build(seed: u64, player_rallies: bool) -> World {
    let mut w = World::new(seed);
    let city = w.spawn("city", "the city", w.root);
    let mut r = Rng::new(seed ^ 0xABC);
    for i in 0..12 {
        let c = w.spawn("citizen", &format!("Citizen {i}"), city);
        w.set(c, "discontent", 0.30 + 0.55 * r.next_f32());
        w.set(c, "fear", 0.25 + 0.50 * r.next_f32());
        w.set(c, "hope", 0.15 + 0.40 * r.next_f32());
    }
    let leader = w.children(city)[0];
    w.set(leader, "is_leader", 1.0);

    w.set_actions("citizen", vec![Box::new(Comply), Box::new(Protest), Box::new(Flee), Box::new(Rally)]);
    w.add_rollup(Rollup {
        parent_kind: "city".into(),
        child_stat: "protesting".into(),
        parent_stat: "protest_frac".into(),
        reducer: Reducer::FracAbove(0.5),
        drain: false,
    });
    if player_rallies {
        w.set_intent(leader, "Rally"); // YOU take the wheel of this one citizen
    }
    w
}

fn run(label: &str, mut w: World, ticks: u32) {
    for _ in 0..ticks {
        w.step();
    }
    let city = w.by_kind("city")[0];
    let pf = w.stat(city, "protest_frac");
    println!("\n=== {label} ===");
    for c in w.children(city) {
        let choice = ["complies", "PROTESTS", "flees", "RALLIES"][w.stat(c, "chose") as usize];
        let you = if w.stat(c, "is_leader") > 0.5 { "  <- you" } else { "" };
        println!("   {:<11} {choice}{you}", w.name(c));
    }
    println!("   → {:.0}% in the streets  =>  {}", pf * 100.0, if pf >= 0.5 { "🔥 THE CITY REVOLTS" } else { "the regime holds" });
}

fn main() {
    println!("otherworldOS · agency — the same city, decided two ways");
    run("Your citizen keeps his head down (decides for himself)", build(7, false), 12);
    run("YOU seize the moment and rally the people", build(7, true), 12);
    println!("\nSame seed, same twelve people. One player choice — and the regime falls.");
}
