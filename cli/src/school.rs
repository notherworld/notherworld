//! school — generation as a formula over the living world (the user's example).
//! A school's size is `clamp(population/30, 1, 8)` classrooms; each room's
//! richness is `max(school.funding, its teacher's wealth)`. So a well-funded
//! school has fancy rooms everywhere — but a POOR school's rooms are plain,
//! EXCEPT the one that happens to have a rich teacher. All in worlds/school.json.

use std::collections::BTreeMap;

use owos_core::engine::World;
use serde::Deserialize;

#[derive(Deserialize)]
struct SchoolDef { name: String, funding: f32, population: f32 }
#[derive(Deserialize)]
struct RuleDef { on: String, set: String, expr: String }
#[derive(Deserialize)]
struct GenDef {
    on: String,
    spawn: String,
    count: String,
    #[serde(default)]
    child_stats: BTreeMap<String, String>,
}
#[derive(Deserialize)]
struct WorldDef { schools: Vec<SchoolDef>, rules: Vec<RuleDef>, generators: Vec<GenDef> }

fn main() {
    let text = std::fs::read_to_string("worlds/school.json").expect("read worlds/school.json");
    let def: WorldDef = serde_json::from_str(&text).expect("parse school.json");

    let mut w = World::new(1);
    let root = w.root;
    let mut schools = Vec::new();
    for s in &def.schools {
        let id = w.spawn("school", &s.name, root);
        w.set(id, "funding", s.funding);
        w.set(id, "population", s.population);
        w.fold(id); // not yet entered
        schools.push(id);
    }
    for r in &def.rules {
        w.add_rule(&r.on, &r.set, &r.expr).unwrap();
    }
    for g in &def.generators {
        let cs: Vec<(String, String)> = g.child_stats.iter().map(|(k, v)| (k.clone(), v.clone())).collect();
        w.add_generator(&g.on, &g.spawn, &g.count, cs).unwrap();
    }

    for &school in &schools {
        println!(
            "\nYou walk into {} (funding {:.2}, {} students) — it generates:",
            w.name(school), w.stat(school, "funding"), w.stat(school, "population") as u32
        );
        w.reveal(school); // classrooms spawn, count from population
        for c in w.children(school) {
            w.reveal(c); // each classroom's teacher spawns
        }
        w.step(); // the richness rule resolves (reads funding + the teacher)
        for c in w.children(school) {
            let rich = w.stat(c, "richness");
            let tw = w.children(c).iter().find(|&&t| w.kind(t) == "teacher").map(|&t| w.stat(t, "wealth")).unwrap_or(0.0);
            let tag = if rich > 0.6 { "✨ fancy" } else { "plain " };
            println!("   {} — {}  (richness {:.2}, teacher wealth {:.2})", w.name(c), tag, rich, tw);
        }
    }
    println!("\nNobody coded 'the poor school's rich-teacher room is fancy' — it fell out of a formula reading the living world.");
}
