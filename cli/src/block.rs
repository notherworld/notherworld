//! block — a mixed-use city block + a beach, living a month, then zoomed.
//!
//! Now the company economics AND the beach's emptiness are DATA aggregations
//! (`edge_mean(works_at, output)`, `edge_sum(visits, at_beach)`) — the host no
//! longer computes them. All behavior lives in worlds/block.json. The host only
//! builds the structure, ticks the clock, sets time-of-day, and writes canon on
//! zoom. Coarse you just know the beach empties at night; zoom and you catch the
//! one stressed soul who lingered — a detail that only exists because you looked.

use std::collections::{BTreeMap, HashMap};

use owos_core::engine::{EntityId, World};
use serde::Deserialize;

#[derive(Deserialize)]
struct CompDef { name: String, health: f32, wage: f32 }
#[derive(Deserialize)]
struct PersDef { name: String, company: String, money: f32, rent: f32 }
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
struct BlockDef {
    person_stats: BTreeMap<String, f32>,
    companies: Vec<CompDef>,
    people: Vec<PersDef>,
    rules: Vec<RuleDef>,
    actions: Vec<ActDef>,
}

fn set_time(w: &mut World, people: &[EntityId], hour: u32) {
    let is_night = if !(7..22).contains(&hour) { 1.0 } else { 0.0 };
    let is_work = if (8..18).contains(&hour) { 1.0 } else { 0.0 };
    let is_leisure = if (18..22).contains(&hour) { 1.0 } else { 0.0 };
    for &p in people {
        w.set(p, "hour", hour as f32);
        w.set(p, "is_night", is_night);
        w.set(p, "is_work", is_work);
        w.set(p, "is_leisure", is_leisure);
    }
}

fn checkin(w: &World, label: &str, people: &[EntityId], companies: &[EntityId]) {
    println!("\n== {label} ==");
    for &p in people {
        println!(
            "   {:<5} money {:>4.0}  mood {:.2}  stress {:.2}  satis {:.2}",
            w.name(p), w.stat(p, "money"), w.stat(p, "mood"), w.stat(p, "stress"), w.stat(p, "satisfaction")
        );
    }
    print!("   companies:");
    for &c in companies {
        print!("  {} {:.2}", w.name(c), w.stat(c, "health"));
    }
    println!();
}

fn flavor(action: &str) -> &str {
    match action {
        "beach" => "walked down to the beach and sat with the waves a while",
        "shop" => "browsed the market and treated themselves to something new",
        "eat" => "sat down for a proper hot meal",
        "sleep" => "gave up on the evening and turned in early",
        "work" => "was still at the office, grinding",
        _ => "lingered, unsure what to do",
    }
}

fn main() {
    let text = std::fs::read_to_string("worlds/block.json").expect("read worlds/block.json");
    let def: BlockDef = serde_json::from_str(&text).expect("parse block.json");

    let mut w = World::new(1);
    let root = w.root;
    let block = w.spawn("block", "Harbor Block", root);
    let building = w.spawn("building", "Pier 7", block);
    let workfloor = w.spawn("floor", "work floors", building);
    let livefloor = w.spawn("floor", "living floors", building);
    let beach = w.spawn("beach", "the harbor beach", block);

    let mut comp_id = HashMap::new();
    let mut companies = Vec::new();
    for c in &def.companies {
        let id = w.spawn("company", &c.name, workfloor);
        w.set(id, "health", c.health);
        w.set(id, "wage", c.wage);
        comp_id.insert(c.name.clone(), id);
        companies.push(id);
    }
    let mut people = Vec::new();
    let mut rent = HashMap::new();
    for p in &def.people {
        let unit = w.spawn("unit", &format!("{}'s flat", p.name), livefloor);
        let per = w.spawn("person", &p.name, unit);
        for (k, v) in &def.person_stats {
            w.set(per, k, *v);
        }
        w.set(per, "money", p.money);
        if let Some(&c) = comp_id.get(&p.company) {
            w.link(per, c, "works_at", 1.0);
        }
        // Destination pointers for movement: home / work / leisure.
        w.link(per, unit, "home", 1.0);
        w.link(per, beach, "leisure", 1.0);
        rent.insert(per, p.rent);
        people.push(per);
    }

    for r in &def.rules {
        w.add_rule(&r.on, &r.set, &r.expr).unwrap();
    }
    for a in &def.actions {
        let eff: Vec<(String, String, String)> = a.effects.iter().map(|e| (e.op.clone(), e.stat.clone(), e.expr.clone())).collect();
        w.add_data_action(&a.on, &a.name, &a.score, eff).unwrap();
    }

    println!("Harbor Block — 6 residents, 3 companies, a beach. A month on data-defined behavior.");

    for day in 0..30 {
        for hour in 0..24 {
            set_time(&mut w, &people, hour);
            w.step();
        }
        if day % 7 == 0 {
            for &p in &people {
                let m = (w.stat(p, "money") - rent[&p]).max(0.0);
                w.set(p, "money", m);
            }
        }
        if [6, 29].contains(&day) {
            checkin(&w, &format!("day {}", day + 1), &people, &companies);
        }
    }

    // The beach through one more day — occupancy is edge_sum(visits, at_beach), pure data.
    println!("\nThe harbor beach over a day  (occupancy = a data formula counting who's on it):");
    for hour in 0..24 {
        set_time(&mut w, &people, hour);
        w.step();
        let occ = w.stat(beach, "occupancy") as usize;
        println!("   {hour:>2}:00  {}{}", "▓".repeat(occ), if occ == 0 { " empty" } else { "" });
    }

    // Zoom two very different people through the same evening -> canon.
    let mara = people[0]; // Tidewater, comfortable
    let gil = people[5]; // Dockside, stressed
    println!("\n────────── ZOOM · the same evening, two lives (this becomes canon) ──────────");
    for &(who, tag) in &[(mara, "Mara (Tidewater Co)"), (gil, "Gil (Dockside Forge)")] {
        println!("\n▶ {tag} — money {:.0}, stress {:.2}", w.stat(who, "money"), w.stat(who, "stress"));
        for hour in 18..22 {
            set_time(&mut w, &people, hour);
            w.step();
            let act = w.last_action(who).unwrap_or("idle").to_string();
            let line = format!("{hour}:00 — {}", flavor(&act));
            w.add_fact(who, line.clone());
            println!("     {line}");
        }
    }
    println!("\nEveryone else lived that evening too — unwatched, so none of it is written down.");
}
