//! mega — the STRESS TEST. Same city data (worlds/metropolis.json), but instead
//! of a lazy camera walk we (1) FORCE the whole city live at a crankable scale —
//! the worst case LOD exists to avoid — and time it, and (2) survey how much
//! diversity actually emerges across thousands of people and conversations.
//!
//!   cargo run --release --bin mega -- <scale>       (scale multiplies every
//!   generator's child count; scale 2 ≈ 16× the people, scale 3 ≈ 81×, …)

use std::time::Instant;

use owos_core::engine::{Broadcast, EntityId, Reducer, Rollup, World};
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
struct GenDef { on: String, spawn: String, count: String, #[serde(default)] child_stats: std::collections::BTreeMap<String, String> }
#[derive(Deserialize)]
struct RollDef { parent: String, child_stat: String, parent_stat: String, reduce: String }
#[derive(Deserialize)]
struct BcastDef { parent_stat: String, child_stat: String, gain: f32 }
#[derive(Deserialize)]
struct Def {
    rules: Vec<RuleDef>,
    #[serde(default)] coarse_rules: Vec<RuleDef>,
    actions: Vec<ActDef>,
    events: Vec<EventDef>,
    generators: Vec<GenDef>,
    rollups: Vec<RollDef>,
    broadcasts: Vec<BcastDef>,
}

fn effs(v: &[EffDef]) -> Vec<(String, String, String)> {
    v.iter().map(|e| (e.op.clone(), e.stat.clone(), e.expr.clone())).collect()
}
fn reducer(s: &str) -> Reducer {
    match s { "sum" => Reducer::Sum, "max" => Reducer::Max, "min" => Reducer::Min, "frac_above" => Reducer::FracAbove(0.5), _ => Reducer::Mean }
}
fn wire(w: &mut World, def: &Def, scale: f32) {
    for r in &def.rules { w.add_rule(&r.on, &r.set, &r.expr).unwrap(); }
    for r in &def.coarse_rules { w.add_coarse_rule(&r.on, &r.set, &r.expr).unwrap(); }
    for a in &def.actions { w.add_data_action(&a.on, &a.name, &a.score, effs(&a.effects)).unwrap(); }
    for e in &def.events { w.add_event(&e.on, &e.when, effs(&e.do_), &e.label).unwrap(); }
    for g in &def.generators {
        // scale multiplies the AUTHORED count formula — data unchanged, world bigger.
        let count = format!("({}) * {}", g.count, scale);
        let cs: Vec<(String, String)> = g.child_stats.iter().map(|(k, v)| (k.clone(), v.clone())).collect();
        w.add_generator(&g.on, &g.spawn, &count, cs).unwrap();
    }
    for r in &def.rollups {
        w.add_rollup(Rollup { parent_kind: r.parent.clone(), child_stat: r.child_stat.clone(), parent_stat: r.parent_stat.clone(), reducer: reducer(&r.reduce), drain: false });
    }
    for b in &def.broadcasts {
        w.add_broadcast(Broadcast { parent_kind: String::new(), parent_stat: b.parent_stat.clone(), child_stat: b.child_stat.clone(), gain: b.gain });
    }
}

fn s(w: &World, id: EntityId, k: &str) -> f32 { w.stat(id, k) }

/// Reveal the WHOLE subtree — every district, block, office, person, convo —
/// so the entire city is Detailed at once. The worst case, on purpose.
fn reveal_all(w: &mut World, id: EntityId, cap: usize) {
    if w.entities.len() > cap { return; }
    w.reveal(id);
    for c in w.children(id) {
        reveal_all(w, c, cap);
    }
}

fn comma(n: usize) -> String {
    let s = n.to_string();
    let mut out = String::new();
    for (i, ch) in s.chars().enumerate() {
        if i > 0 && (s.len() - i) % 3 == 0 { out.push(','); }
        out.push(ch);
    }
    out
}

fn main() {
    let scale: f32 = std::env::args().nth(1).and_then(|a| a.parse().ok()).unwrap_or(2.0);
    let ticks: u32 = 30;
    let cap: usize = 3_000_000;

    let text = std::fs::read_to_string("worlds/metropolis.json").expect("read worlds/metropolis.json");
    let def: Def = serde_json::from_str(&text).expect("parse metropolis.json");

    let mut w = World::new(42);
    wire(&mut w, &def, scale);
    let metro = w.spawn("metro", "MERIDIAN", w.root);
    for (k, v) in [("population", 1.0), ("rent_index", 1.0), ("wealth", 0.5), ("opportunity", 0.6), ("unrest", 0.4), ("crime", 0.3)] {
        w.set(metro, k, v);
    }

    println!("════════════ MEGA · forcing the whole city live (scale ×{scale}) ════════════");

    // ---- BUILD: generate + reveal the entire tree ----
    let tb = Instant::now();
    reveal_all(&mut w, metro, cap);
    let build = tb.elapsed();

    let count_kind = |k: &str| w.by_kind(k).len();
    let nodes = w.entities.iter().filter(|e| !e.dead).count();
    let (nd, nb, nw, np, nc) = (count_kind("district"), count_kind("block"), count_kind("workplace"), count_kind("person"), count_kind("convo"));
    let stat_cells: usize = w.entities.iter().filter(|e| !e.dead).map(|e| e.stats.len()).sum();

    println!("\n  STRUCTURE (all Detailed — no LOD):");
    println!("   {} districts · {} blocks · {} workplaces · {} people · {} conversations",
        comma(nd), comma(nb), comma(nw), comma(np), comma(nc));
    println!("   {} total live nodes, {} stat-cells. Built (generated + revealed) in {:.0} ms.",
        comma(nodes), comma(stat_cells), build.as_secs_f64() * 1000.0);
    println!("   (the interactive demo only ever touched ~24 of these — LOD is what buys that.)");

    // ---- SIM: tick the whole thing at full fidelity, timed ----
    let ts = Instant::now();
    for _ in 0..ticks { w.step(); }
    let sim = ts.elapsed();
    let secs = sim.as_secs_f64();
    let ent_steps = nodes as f64 * ticks as f64;
    println!("\n  THROUGHPUT (every node simulated every tick):");
    println!("   {ticks} ticks in {:.0} ms  →  {:.1} ms/tick", secs * 1000.0, secs * 1000.0 / ticks as f64);
    println!("   {} entity-steps  →  {} entity-steps/sec", comma(ent_steps as usize), comma((ent_steps / secs) as usize));

    // ---- DIVERSITY: how many genuinely different lives are playing out? ----
    let people = w.by_kind("person");
    // personality archetype = which traits clear 0.5 (32 possible profiles)
    use std::collections::BTreeMap;
    let mut profiles: BTreeMap<String, u32> = BTreeMap::new();
    let mut content = 0u32;
    let mut miserable = 0u32;
    for &p in &people {
        let prof = format!("{}{}{}{}{}",
            if s(&w,p,"ambition")>0.5 {"A"} else {"·"},
            if s(&w,p,"diligence")>0.5 {"D"} else {"·"},
            if s(&w,p,"social")>0.5 {"S"} else {"·"},
            if s(&w,p,"guarded")>0.5 {"G"} else {"·"},
            if s(&w,p,"humor")>0.5 {"H"} else {"·"});
        *profiles.entry(prof).or_default() += 1;
        let m = s(&w, p, "mood");
        if m > 0.65 { content += 1; }
        if m < 0.35 { miserable += 1; }
    }
    println!("\n  DIVERSITY · PEOPLE ({} of them):", comma(people.len()));
    println!("   {} of 32 possible personality profiles are represented", profiles.len());
    println!("   mood spread right now: {} content, {} miserable, {} in between",
        comma(content as usize), comma(miserable as usize), comma(people.len() - content as usize - miserable as usize));

    // conversations, in lockstep: set the SAME 6-move script on a big sample and
    // step the world once per beat. Thousands of conversations for 6 ticks total.
    let sample: Vec<EntityId> = people.iter().cloned().take(5000).collect();
    let convos: Vec<EntityId> = sample.iter().filter_map(|&p| w.children(p).into_iter().find(|&c| w.kind(c) == "convo")).collect();
    let script = ["small_talk", "joke", "open_up", "open_up", "probe", "ask_secret"];
    let mut pre_trust: Vec<f32> = vec![0.0; convos.len()];
    for &mv in &script {
        if mv == "ask_secret" {
            for (i, &cv) in convos.iter().enumerate() { pre_trust[i] = s(&w, cv, "trust"); }
        }
        for &cv in &convos { w.set_intent(cv, mv); }
        w.step();
    }
    for &cv in &convos { w.clear_intent(cv); }

    let (mut bonded, mut warmed, mut neutral, mut soured, mut secrets) = (0u32, 0u32, 0u32, 0u32, 0u32);
    for (i, &cv) in convos.iter().enumerate() {
        let (warmth, trust, tension, depth) = (s(&w,cv,"warmth"), s(&w,cv,"trust"), s(&w,cv,"tension"), s(&w,cv,"depth"));
        if pre_trust[i] > 0.7 && tension < 0.55 { secrets += 1; }
        let d = 0.5*warmth + 0.5*trust + 0.35*depth - 0.5*tension - 0.35;
        if d > 0.3 { bonded += 1; } else if d > 0.05 { warmed += 1; } else if d > -0.05 { neutral += 1; } else { soured += 1; }
    }
    let n = convos.len().max(1);
    println!("\n  DIVERSITY · CONVERSATIONS (same 6 moves, {} people, outcomes by their traits):", comma(convos.len()));
    println!("   {:>5} bonded   ({:.0}%)   — probe landed, relationship deepened", comma(bonded as usize), bonded as f64/n as f64*100.0);
    println!("   {:>5} warmed   ({:.0}%)", comma(warmed as usize), warmed as f64/n as f64*100.0);
    println!("   {:>5} neutral  ({:.0}%)", comma(neutral as usize), neutral as f64/n as f64*100.0);
    println!("   {:>5} soured   ({:.0}%)   — same script, but they bristled and pulled away", comma(soured as usize), soured as f64/n as f64*100.0);
    println!("   {:>5} SECRETS uncovered — trust cleared the gate; a private fact went to canon", comma(secrets as usize));

    // district fates — read out of the event log
    let boils = w.log.iter().filter(|e| e.message.contains("boils over")).count();
    let crunches = w.log.iter().filter(|e| e.message.contains("crunch")).count();
    println!("\n  DIVERSITY · THE MACRO (emergent, logged during the run):");
    println!("   {} districts boiled over into unrest · {} offices hit deadline crunch", comma(boils), comma(crunches));
    println!("   city now: rent {:.2}, unrest {:.2}, crime {:.2}", s(&w,metro,"rent_index"), s(&w,metro,"unrest"), s(&w,metro,"crime"));

    println!("\n  Same engine, same JSON, {} lives — no LLM, no graphics. The cost is linear in", comma(np));
    println!("  what you make live; LOD is the choice to make almost none of it live at once.");
}
