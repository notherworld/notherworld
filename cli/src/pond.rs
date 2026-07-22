//! pond — birth & death as data. Fish reproduce SOMETIMES (`chance`) and die
//! sometimes (more when crowded — `chance(0.03 + 0.006*parent.population)`) or of
//! old age. Population = `child_count()`. No carrying-capacity is coded anywhere;
//! it emerges where births ≈ deaths. Same spawn/despawn effects would work for
//! people, enemy waves, or anything — the engine doesn't know these are fish.

use owos_core::engine::World;
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
struct PondDef { start_fish: usize, steps: u32, rules: Vec<RuleDef>, actions: Vec<ActDef> }

fn main() {
    let text = std::fs::read_to_string("worlds/pond.json").expect("read worlds/pond.json");
    let def: PondDef = serde_json::from_str(&text).expect("parse pond.json");

    let mut w = World::new(1);
    let pond = w.spawn("pond", "the pond", w.root);
    for i in 0..def.start_fish {
        w.spawn("fish", &format!("fish {i}"), pond);
    }
    for r in &def.rules {
        w.add_rule(&r.on, &r.set, &r.expr).unwrap();
    }
    for a in &def.actions {
        let eff: Vec<(String, String, String)> = a.effects.iter().map(|e| (e.op.clone(), e.stat.clone(), e.expr.clone())).collect();
        w.add_data_action(&a.on, &a.name, &a.score, eff).unwrap();
    }

    println!("A pond, seeded with {} fish. Births and deaths are data. Watch it find its own level:\n", def.start_fish);
    for step in 0..=def.steps {
        if step % 3 == 0 {
            let pop = w.by_kind("fish").len();
            println!("  step {step:>2}:  {:>2}  {}", pop, "▓".repeat(pop));
        }
        if step < def.steps {
            w.step();
        }
    }
    println!("\nNo carrying capacity is written anywhere — it emerged where births ≈ deaths.");
}
