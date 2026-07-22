//! lifetime — LOD over TIME. A whole human life simulated as ~60 coarse yearly
//! ticks; drop in at 38 and at 54 and one full human day UNFOLDS in detail,
//! textured by the coarse life-state at that age; fold it back and it's a point
//! on the aggregate. This is the Library-of-Babel lesson applied to time: you
//! can't address a life by coordinate (it's path-dependent), so you run it
//! coarse and unfold the moment you look at. It's also the real speed story —
//! a lifetime costs dozens of ticks, not tens of thousands.

use owos_core::engine::{EntityId, World};
use serde::Deserialize;

#[derive(Deserialize)]
struct EffDef { op: String, #[serde(default)] stat: String, #[serde(default)] expr: String }
#[derive(Deserialize)]
struct RuleDef { on: String, set: String, expr: String }
#[derive(Deserialize)]
struct ActDef { on: String, name: String, score: String, effects: Vec<EffDef> }
#[derive(Deserialize)]
struct EventDef { on: String, when: String, label: String, #[serde(rename = "do")] do_: Vec<EffDef> }
#[derive(Deserialize)]
struct Def { rules: Vec<RuleDef>, events: Vec<EventDef>, actions: Vec<ActDef> }

fn effs(v: &[EffDef]) -> Vec<(String, String, String)> {
    v.iter().map(|e| (e.op.clone(), e.stat.clone(), e.expr.clone())).collect()
}
fn s(w: &World, id: EntityId, k: &str) -> f32 { w.stat(id, k) }
fn band(x: f32) -> &'static str {
    if x < 0.2 { "very low" } else if x < 0.4 { "low" } else if x < 0.6 { "middling" } else if x < 0.8 { "high" } else { "very high" }
}

/// One detailed day, unfolded from the coarse life. Returns the ticks it cost.
fn checkin(w: &mut World, you: EntityId, spouse_names: &[&str]) -> u32 {
    let age = s(w, you, "age") as i32;
    println!("\n┌─ AGE {age}: you stop the clock and drop into a single day ─┐");
    println!("   the life so far: health {}, wealth {}, career {}, bonds {}, contentment {}",
        band(s(w,you,"health")), band(s(w,you,"wealth")), band(s(w,you,"career")), band(s(w,you,"bonds")), band(s(w,you,"contentment")));

    // who's in the life right now (spawned by events over the years)
    let spouses = w.by_kind("spouse");
    let kids = w.by_kind("child");
    if let Some(&sp) = spouses.first() {
        let yrs = (age - 27).max(0);
        let nm = spouse_names[sp % spouse_names.len()];
        w.entities[sp].name = nm.to_string();
        println!("   in your life: {nm}, married ~{yrs} years");
    }
    if !kids.is_empty() {
        let home = s(w, you, "kids_home") as i32;
        let ages: Vec<String> = kids.iter().enumerate().map(|(i, _)| format!("~{}", (age - 30 - (i as i32)*2).max(0))).collect();
        println!("   {} child(ren), ages {} — {} still at home", kids.len(), ages.join(", "), home);
    }

    // UNFOLD the day: mode 1, four time-of-day slots. life-rules freeze; the
    // activity chosen at each slot is scored off the coarse life-state.
    w.set(you, "mode", 1.0);
    let labels = ["morning", "midday ", "evening", "night  "];
    let mut cost = 0;
    for tod in 0..4 {
        w.set(you, "tod", tod as f32);
        w.step();
        cost += 1;
        println!("     {} · {}", labels[tod as usize], w.last_action(you).unwrap_or("—"));
    }
    w.set(you, "mode", 0.0); // fold back to the aggregate; nothing about the life changed
    println!("   → day folds back up. the aggregate never moved — you only paid for the day you watched.");
    cost
}

fn main() {
    let text = std::fs::read_to_string("worlds/lifetime.json").expect("read worlds/lifetime.json");
    let def: Def = serde_json::from_str(&text).expect("parse lifetime.json");

    let mut w = World::new(42);
    for r in &def.rules { w.add_rule(&r.on, &r.set, &r.expr).unwrap(); }
    for e in &def.events { w.add_event(&e.on, &e.when, effs(&e.do_), &e.label).unwrap(); }
    for a in &def.actions { w.add_data_action(&a.on, &a.name, &a.score, effs(&a.effects)).unwrap(); }

    let you = w.spawn("person", "you", w.root);
    for (k, v) in [("age",21.0),("health",0.8),("wealth",0.1),("career",0.0),("bonds",0.5),("contentment",0.5),
                   ("married",0.0),("kids",0.0),("kids_home",0.0),("mode",0.0),("tod",0.0)] {
        w.set(you, k, v);
    }

    println!("╔══════════════════════════════════════════════════════════════════╗");
    println!("║  A LIFETIME — sixty years at a glance, any day at full resolution. ║");
    println!("╚══════════════════════════════════════════════════════════════════╝");
    println!("\n┌─ the coarse life (one tick = one year) ─┐");

    let spouse_names = ["Jordan", "Sam", "Riley", "Alex", "Morgan"];
    let mut timeline: Vec<(i32, String)> = Vec::new();
    let mut log_read = 0usize;
    let mut year_ticks = 0u32;
    let mut day_ticks = 0u32;
    let mut done_38 = false;
    let mut done_54 = false;

    loop {
        w.set(you, "mode", 0.0);
        w.step();
        year_ticks += 1;
        let age = s(&w, you, "age") as i32;
        while log_read < w.log.len() {
            let msg = w.log[log_read].message.replace("you — ", "");
            timeline.push((age, msg));
            log_read += 1;
        }
        if age == 38 && !done_38 { done_38 = true; day_ticks += checkin(&mut w, you, &spouse_names); }
        if age == 54 && !done_54 { done_54 = true; day_ticks += checkin(&mut w, you, &spouse_names); }
        if age >= 80 { break; }
    }

    // the life story — the events that fired, stamped with age
    println!("\n┌─ the life that emerged (every line fired from a data threshold, not a script) ─┐");
    for (age, ev) in &timeline {
        println!("   age {:>2} · {}", age, ev);
    }
    println!("   age 80 · final: health {}, wealth {}, contentment {}",
        band(s(&w,you,"health")), band(s(&w,you,"wealth")), band(s(&w,you,"contentment")));

    // the platinum-tier point: what did a whole life cost?
    let total = year_ticks + day_ticks;
    let full_detail = year_ticks * 365 * 4; // if you'd simulated every hour-block of every day
    println!("\n┌─ the cost of a lifetime ─┐");
    println!("   simulated {} coarse years + 2 unfolded days = {} total ticks.", year_ticks, total);
    println!("   living every day at the detail of those check-ins would be ~{} ticks.", full_detail);
    println!("   That's ~{}× less work — and the ONLY difference in what you SAW was the two days you", full_detail / total.max(1));
    println!("   chose to look at. The real speedup was never a faster tick; it's not ticking what you");
    println!("   don't watch. LOD over time. (Library of Babel: the life's default trajectory is f(seed);");
    println!("   you materialized only the moments you observed — everything else stayed a cheap aggregate.)");
}
