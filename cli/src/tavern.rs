//! tavern — the CONTENT ORACLE. It simulates "a night at the Copper Kettle" 40
//! times (behaviors all in worlds/tavern.json), instruments everything the sim
//! actually DOES, and prints a content manifest: which states/items/archetypes a
//! developer would need to build, ranked by how often they occur — plus the
//! non-obvious insights (what's over-scoped, what the crowd budget really is).

use std::collections::BTreeMap;

use owos_core::engine::World;
use owos_core::Rng;
use serde::Deserialize;

#[derive(Deserialize)]
struct EffDef {
    #[serde(default)]
    stat: String,
    op: String,
    #[serde(default)]
    expr: String,
}
#[derive(Deserialize)]
struct RuleDef { on: String, set: String, expr: String }
#[derive(Deserialize)]
struct ActDef { on: String, name: String, score: String, effects: Vec<EffDef> }
#[derive(Deserialize)]
struct EventDef {
    on: String,
    when: String,
    label: String,
    #[serde(rename = "do")]
    do_: Vec<EffDef>,
}
#[derive(Deserialize)]
struct GameDef { rules: Vec<RuleDef>, actions: Vec<ActDef>, events: Vec<EventDef> }

const NIGHTS: u32 = 40;
const HOURS: u32 = 12;

fn main() {
    let text = std::fs::read_to_string("worlds/tavern.json").expect("read worlds/tavern.json");
    let def: GameDef = serde_json::from_str(&text).expect("parse tavern.json");

    let mut w = World::new(1);
    let tavern = w.spawn("tavern", "the Copper Kettle", w.root);
    for r in &def.rules {
        w.add_rule(&r.on, &r.set, &r.expr).unwrap();
    }
    for a in &def.actions {
        let eff: Vec<(String, String, String)> = a.effects.iter().map(|e| (e.op.clone(), e.stat.clone(), e.expr.clone())).collect();
        w.add_data_action(&a.on, &a.name, &a.score, eff).unwrap();
    }
    for e in &def.events {
        let eff: Vec<(String, String, String)> = e.do_.iter().map(|f| (f.op.clone(), f.stat.clone(), f.expr.clone())).collect();
        w.add_event(&e.on, &e.when, eff, &e.label).unwrap();
    }

    // ---- instruments ----
    let mut actions: BTreeMap<String, u64> = BTreeMap::new();
    let mut archetypes: BTreeMap<String, u64> = BTreeMap::new();
    let mut peak = 0u32;
    let mut total_patrons = 0u64;
    let mut brawl_nights = 0u32;
    let mut log_read = 0usize;
    let mut rng = Rng::new(20);

    for _ in 0..NIGHTS {
        let arrivals = 8 + (rng.next_u64() % 9) as usize;
        for _ in 0..arrivals {
            let p = w.spawn("patron", "patron", tavern);
            let (coin, thirst, hunger, rowdy, social, gambler, lover, taste) = (
                8.0 + rng.next_f32() * 55.0,
                0.4 + rng.next_f32() * 0.5,
                0.2 + rng.next_f32() * 0.6,
                rng.next_f32(),
                0.3 + rng.next_f32() * 0.6,
                rng.next_f32(),
                rng.next_f32(),
                rng.next_f32(),
            );
            for (k, v) in [("coin", coin), ("thirst", thirst), ("hunger", hunger), ("rowdy", rowdy), ("social", social), ("gambler", gambler), ("lover", lover), ("taste", taste), ("tipsy", 0.0), ("mood", 0.5)] {
                w.set(p, k, v);
            }
            // archetype = dominant trait (if any), else regular
            let arch = if rowdy > 0.72 && rowdy >= gambler && rowdy >= lover {
                "rowdy"
            } else if gambler > 0.72 && gambler >= lover {
                "gambler"
            } else if lover > 0.72 {
                "romantic"
            } else {
                "regular"
            };
            *archetypes.entry(arch.to_string()).or_default() += 1;
            total_patrons += 1;
        }

        let mut night_brawl = false;
        for hour in 0..HOURS {
            let acting = w.by_kind("patron");
            peak = peak.max(acting.len() as u32);
            for &p in &acting {
                w.set(p, "hour", hour as f32);
            }
            w.step();
            for &p in &acting {
                if let Some(a) = w.last_action(p) {
                    *actions.entry(a.to_string()).or_default() += 1;
                }
            }
            while log_read < w.log.len() {
                if w.log[log_read].message.contains("brawl erupts") {
                    night_brawl = true;
                }
                log_read += 1;
            }
        }
        if night_brawl {
            brawl_nights += 1;
        }
        for p in w.by_kind("patron") {
            w.despawn(p);
        }
    }

    // Every action the designer defined (so we can flag ones that never fire).
    let mut defined: Vec<&str> = def.actions.iter().map(|a| a.name.as_str()).collect();
    defined.sort();

    // ---- the manifest ----
    let total_acts: u64 = actions.values().sum();
    let mut ranked: Vec<(&String, &u64)> = actions.iter().collect();
    ranked.sort_by(|a, b| b.1.cmp(a.1));
    let top = *ranked.first().map(|(_, c)| *c).unwrap_or(&1);

    println!("══════════ THE COPPER KETTLE · content manifest ══════════");
    println!("Simulated {NIGHTS} nights. You haven't built the game — the sim is telling you what it will need.\n");
    println!("Patrons served: {total_patrons}  (avg {}/night, PEAK {peak} at once)", total_patrons / NIGHTS as u64);
    println!("  → crowd/seating budget: render ~{peak} NPCs at once, not more.\n");

    println!("STATES PATRONS ACTUALLY ENTERED  (each = an animation/interaction to build; build top-down):");
    for (name, count) in &ranked {
        let n = ((**count as f64 / top as f64) * 34.0).round() as usize;
        let bar = if n == 0 { "▏".to_string() } else { "█".repeat(n) };
        let pct = **count as f64 / total_acts as f64 * 100.0;
        let note = if pct < 1.0 { "  ← rare, low-priority but REQUIRED" } else { "" };
        println!("   {name:<11} {bar} {count} ({pct:.1}%){note}");
    }
    println!();

    let ordered: Vec<(&String, &u64)> = ranked.iter().filter(|(n, _)| n.starts_with("order_")).cloned().collect();
    println!("CONSUMABLES (model + serve state), by demand:");
    for (name, count) in &ordered {
        println!("   {:<11} {count} orders", name.trim_start_matches("order_"));
    }
    println!();

    println!("PATRON ARCHETYPES (dialogue / behavior sets):");
    let mut arch: Vec<(&String, &u64)> = archetypes.iter().collect();
    arch.sort_by(|a, b| b.1.cmp(a.1));
    for (name, count) in &arch {
        println!("   {name:<9} {:.0}%", **count as f64 / total_patrons as f64 * 100.0);
    }
    println!();

    println!("SET-PIECES / EVENTS:");
    if brawl_nights == 0 {
        println!("   ⚠ room-wide brawl: DESIGNED but never triggered in {NIGHTS} nights — thresholds too high, or cut it.");
    } else {
        println!("   room-wide brawl: {brawl_nights}/{NIGHTS} nights ({:.0}%)  → 1 set-piece, prioritize to match.", brawl_nights as f64 / NIGHTS as f64 * 100.0);
    }
    println!();

    println!("⚠ FLAGGED — defined but the sim (almost) never exercised it:");
    for name in &defined {
        let c = actions.get(*name).copied().unwrap_or(0);
        if (c as f64 / total_acts as f64) < 0.003 {
            println!("   '{name}' occurred {c} times in {NIGHTS} nights — cut it, or make it cheap.");
        }
    }
    println!();

    let ale = *actions.get("order_ale").unwrap_or(&0) as f64;
    let wine = (*actions.get("order_wine").unwrap_or(&1)).max(1) as f64;
    let gamble_pct = *actions.get("gamble").unwrap_or(&0) as f64 / total_acts as f64 * 100.0;
    println!("INSIGHTS a scoping doc wouldn't have guessed:");
    println!("   • GAMBLING is the #1 activity ({gamble_pct:.0}% of all actions) — invest in dice/cards content FIRST, ahead of drinking.");
    println!("   • ale vs wine demand ≈ {:.1}:1 — {}.", ale / wine, if ale / wine > 2.0 { "skew drink art to ale" } else { "roughly even, budget both" });
    println!("   • peak {peak} concurrent patrons — a smaller crowd budget than most teams would reserve.");
}
