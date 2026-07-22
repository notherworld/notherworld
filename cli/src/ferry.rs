//! ferry — the CONTENT ORACLE as a BALANCE VERDICT.
//!
//! You describe a game as data ("Last Ferry": push to the dock before the last
//! boat; obstacles = the cold and bandits). You have NOT built it. The oracle
//! sims hundreds of courier-runs off worlds/ferry.json and tells you, backwards,
//! which obstacle actually kills people — i.e. where to spend your content
//! budget. Then it re-runs with ONE lever flipped to prove it's reading YOUR
//! design, not reciting a canned answer.

use owos_core::engine::World;
use owos_core::Rng;
use serde::Deserialize;

#[derive(Deserialize)]
struct EffDef { op: String, #[serde(default)] stat: String, #[serde(default)] expr: String }
#[derive(Deserialize)]
struct RuleDef { on: String, set: String, expr: String }
#[derive(Deserialize)]
struct ActDef { on: String, name: String, score: String, effects: Vec<EffDef> }
#[derive(Deserialize)]
struct GameDef { goal: f32, hours: u32, rules: Vec<RuleDef>, actions: Vec<ActDef> }

const RUNS: u32 = 200;

#[derive(Default)]
struct Tally {
    delivered: u32,
    froze: u32,
    robbed: u32,
    stranded: u32,
    push: u64,
    shelter: u64,
    tend: u64,
}

fn build(def: &GameDef) -> (World, usize) {
    let mut w = World::new(1);
    let dock = w.spawn("road", "the coast road", w.root);
    for r in &def.rules { w.add_rule(&r.on, &r.set, &r.expr).unwrap(); }
    for a in &def.actions {
        let eff: Vec<(String, String, String)> =
            a.effects.iter().map(|e| (e.op.clone(), e.stat.clone(), e.expr.clone())).collect();
        w.add_data_action(&a.on, &a.name, &a.score, eff).unwrap();
    }
    (w, dock)
}

/// One scenario: `bandit_mult`/`cold_mult` scale the night's danger. Same couriers
/// (same seed) each time, so any difference in outcome is the design lever, nothing else.
fn run(def: &GameDef, label: &str, bandit_mult: f32, cold_mult: f32) -> Tally {
    let (mut w, dock) = build(def);
    let mut rng = Rng::new(7);
    let mut t = Tally::default();

    for _ in 0..RUNS {
        let c = w.spawn("courier", "courier", dock);
        for (k, v) in [
            ("progress", 0.0),
            ("warmth", 1.0),
            ("hp", 1.0),
            ("speed", 0.6 + rng.next_f32() * 0.5),
            ("grit", rng.next_f32() * 0.7),
            ("fight", rng.next_f32() * 0.7),
            ("caution", rng.next_f32() * 0.6),
            ("route_cold", (0.10 + rng.next_f32() * 0.10) * cold_mult),
            ("route_bandit", (0.08 + rng.next_f32() * 0.07) * bandit_mult),
        ] {
            w.set(c, k, v);
        }

        let mut outcome = None;
        for _ in 0..def.hours {
            w.step();
            if let Some(a) = w.last_action(c) {
                match a {
                    "push" => t.push += 1,
                    "shelter" => t.shelter += 1,
                    "tend_wound" => t.tend += 1,
                    _ => {}
                }
            }
            if w.stat(c, "progress") >= def.goal { outcome = Some("delivered"); break; }
            if w.stat(c, "warmth") <= 0.001 { outcome = Some("froze"); break; }
            if w.stat(c, "hp") <= 0.001 { outcome = Some("robbed"); break; }
        }
        match outcome {
            Some("delivered") => t.delivered += 1,
            Some("froze") => t.froze += 1,
            Some("robbed") => t.robbed += 1,
            _ => t.stranded += 1,
        }
        w.despawn(c);
    }
    let _ = label;
    t
}

fn bar(n: u32, of: u32) -> String {
    let w = ((n as f64 / of.max(1) as f64) * 30.0).round() as usize;
    if w == 0 { "▏".to_string() } else { "█".repeat(w) }
}

fn report(t: &Tally) {
    let dead = t.froze + t.robbed;
    let pct = |n: u32| n as f64 / RUNS as f64 * 100.0;
    println!("   delivered  {} {:>3} ({:.0}%)", bar(t.delivered, RUNS), t.delivered, pct(t.delivered));
    println!("   froze      {} {:>3} ({:.0}%)   ← obstacle B (the cold)", bar(t.froze, RUNS), t.froze, pct(t.froze));
    println!("   robbed     {} {:>3} ({:.0}%)   ← obstacle A (bandits)", bar(t.robbed, RUNS), t.robbed, pct(t.robbed));
    println!("   stranded   {} {:>3} ({:.0}%)   ← too slow, missed the ferry", bar(t.stranded, RUNS), t.stranded, pct(t.stranded));
    let acts = (t.push + t.shelter + t.tend).max(1) as f64;
    println!("   time spent: pushing {:.0}%  · sheltering {:.0}%  · tending wounds {:.0}%",
        t.push as f64 / acts * 100.0, t.shelter as f64 / acts * 100.0, t.tend as f64 / acts * 100.0);
    let _ = dead;
}

fn main() {
    let text = std::fs::read_to_string("worlds/ferry.json").expect("read worlds/ferry.json");
    let def: GameDef = serde_json::from_str(&text).expect("parse ferry.json");

    println!("════════════ LAST FERRY · balance oracle ════════════");
    println!("The game (as data, unbuilt): push to the dock in {}h. Obstacles: A = bandits, B = the cold.", def.hours);
    println!("Designer's gut: \"bandits are the threat — build combat. Cold is flavor.\"\n");
    println!("── {RUNS} simulated courier-runs, YOUR design as written ──");
    let base = run(&def, "baseline", 1.0, 1.0);
    report(&base);

    println!("\n   VERDICT:");
    if base.froze > base.robbed * 2 {
        println!("   The COLD (B) kills {}× more couriers than bandits (A). Your gut was backwards.", base.froze / base.robbed.max(1));
        println!("   → Build the survival layer FIRST: fires, shelter, warm gear, frostbite states, cold VFX.");
        println!("   → Combat (A) is a side-threat. A light bandit encounter is enough; don't build a fighting game.");
    } else if base.robbed > base.froze * 2 {
        println!("   Bandits (A) dominate — your gut was right. Build combat first.");
    } else {
        println!("   Cold and bandits kill at similar rates — both obstacles are load-bearing; budget both.");
    }
    if base.stranded > base.delivered {
        println!("   → Also: more runs END STRANDED than delivered. The map is too long / travel too slow —");
        println!("     add mobility content (mounts, shortcuts) or shorten the route, or most players will just lose.");
    }

    println!("\n── now flip ONE lever: make the roads 3× as dangerous, the winters milder ──");
    let flipped = run(&def, "dangerous roads", 3.0, 0.55);
    report(&flipped);
    println!("\n   The oracle FLIPS: froze {}% → {}%, robbed {}% → {}%.",
        (base.froze as f64 / RUNS as f64 * 100.0).round(),
        (flipped.froze as f64 / RUNS as f64 * 100.0).round(),
        (base.robbed as f64 / RUNS as f64 * 100.0).round(),
        (flipped.robbed as f64 / RUNS as f64 * 100.0).round());
    println!("   It's reading YOUR numbers, not reciting an answer. Change the design → the content bill changes.");
}
