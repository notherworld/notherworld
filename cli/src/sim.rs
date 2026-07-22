//! sim — run a world whose ENTITIES, BEHAVIORS, and DECISIONS all come from a
//! data file. Rules are formulas the engine evaluates each tick; actions are a
//! utility formula + effect formulas the engine scores and applies. Change the
//! file → different world, no recompile. Behaviors are legos piping through Rust.
//!
//!   cargo run -p owos-cli --bin sim -- worlds/mood.json
//!   cargo run -p owos-cli --bin sim -- worlds/life.json

use std::collections::BTreeMap;

use owos_core::engine::World;
use serde::Deserialize;

#[derive(Deserialize)]
struct EntDef {
    kind: String,
    name: String,
    #[serde(default)]
    stats: BTreeMap<String, f32>,
}

#[derive(Deserialize)]
struct RuleDef {
    on: String,
    set: String,
    expr: String,
}

#[derive(Deserialize)]
struct EffDef {
    #[serde(default)]
    stat: String,
    op: String, // "set", "add", or "move"
    #[serde(default)]
    expr: String,
}

#[derive(Deserialize)]
struct ActDef {
    on: String,
    name: String,
    score: String,
    effects: Vec<EffDef>,
}

#[derive(Deserialize)]
struct SimDef {
    #[serde(default = "default_steps")]
    steps: u32,
    entities: Vec<EntDef>,
    #[serde(default)]
    rules: Vec<RuleDef>,
    #[serde(default)]
    actions: Vec<ActDef>,
}
fn default_steps() -> u32 {
    12
}

fn main() {
    let path = std::env::args().nth(1).unwrap_or_else(|| "worlds/mood.json".to_string());
    let text = std::fs::read_to_string(&path).unwrap_or_else(|e| {
        eprintln!("could not read '{path}': {e}");
        std::process::exit(1);
    });
    let def: SimDef = serde_json::from_str(&text).unwrap_or_else(|e| {
        eprintln!("invalid file '{path}': {e}");
        std::process::exit(1);
    });

    let mut w = World::new(1);
    let root = w.root;
    let mut ents = Vec::new();
    for e in &def.entities {
        let id = w.spawn(&e.kind, &e.name, root);
        for (k, v) in &e.stats {
            w.set(id, k, *v);
        }
        ents.push(id);
    }

    println!("loaded {path}  —  {} entities, {} rule(s), {} action(s), all from the file:", def.entities.len(), def.rules.len(), def.actions.len());
    for r in &def.rules {
        if let Err(m) = w.add_rule(&r.on, &r.set, &r.expr) {
            eprintln!("bad rule ({}): {m}", r.expr);
            std::process::exit(1);
        }
        println!("   rule:   {}.{} = {}", r.on, r.set, r.expr);
    }
    for a in &def.actions {
        let effects: Vec<(String, String, String)> = a.effects.iter().map(|e| (e.op.clone(), e.stat.clone(), e.expr.clone())).collect();
        if let Err(m) = w.add_data_action(&a.on, &a.name, &a.score, effects) {
            eprintln!("bad action '{}': {m}", a.name);
            std::process::exit(1);
        }
        println!("   action: {}.\"{}\"  when {}", a.on, a.name, a.score);
    }

    let every = if def.steps > 16 { 2 } else { 1 };
    println!();
    for t in 0..=def.steps {
        if t % every == 0 {
            println!("  t={t:>2}");
            for &e in &ents {
                let stats: Vec<String> = w.entities[e].stats.iter().map(|(k, v)| format!("{k}={v:.2}")).collect();
                let act = w.last_action(e).map(|a| format!("   -> {a}")).unwrap_or_default();
                println!("     {:<6} {}{}", w.name(e), stats.join("  "), act);
            }
        }
        if t < def.steps {
            w.step();
        }
    }
}
