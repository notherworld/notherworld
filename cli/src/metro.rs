//! metro — THE BIG TEST. One city (worlds/metropolis.json) with six nested
//! games: metro > district > block > workplace > person > conversation. Nothing
//! below the city is simulated until the camera looks at it; the lens FEATHERS
//! each scope in (idea -> hazing -> live) and collapses it back to a single fact
//! on the way out. Every rule, dynamic, reaction, and generator lives in the
//! JSON — this host is just a camera and a renderer. "Rendering" here IS the
//! fidelity: out of view is an idea, in view resolves to a whole world.

use std::collections::BTreeMap;

use owos_core::engine::{Broadcast, EntityId, Fidelity, Reducer, Rollup, World};
use owos_core::Rng;
use serde::Deserialize;

// ---------- the game, as data ----------
#[derive(Deserialize)]
struct EffDef { op: String, #[serde(default)] stat: String, #[serde(default)] expr: String }
#[derive(Deserialize)]
struct RuleDef { on: String, set: String, expr: String }
#[derive(Deserialize)]
struct ActDef { on: String, name: String, score: String, effects: Vec<EffDef> }
#[derive(Deserialize)]
struct EventDef { on: String, when: String, label: String, #[serde(rename = "do")] do_: Vec<EffDef> }
#[derive(Deserialize)]
struct GenDef { on: String, spawn: String, count: String, #[serde(default)] child_stats: BTreeMap<String, String> }
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
    match s {
        "sum" => Reducer::Sum,
        "max" => Reducer::Max,
        "min" => Reducer::Min,
        "frac_above" => Reducer::FracAbove(0.5),
        _ => Reducer::Mean,
    }
}
fn wire(w: &mut World, def: &Def) {
    for r in &def.rules { w.add_rule(&r.on, &r.set, &r.expr).unwrap(); }
    for r in &def.coarse_rules { w.add_coarse_rule(&r.on, &r.set, &r.expr).unwrap(); }
    for a in &def.actions { w.add_data_action(&a.on, &a.name, &a.score, effs(&a.effects)).unwrap(); }
    for e in &def.events { w.add_event(&e.on, &e.when, effs(&e.do_), &e.label).unwrap(); }
    for g in &def.generators {
        let cs: Vec<(String, String)> = g.child_stats.iter().map(|(k, v)| (k.clone(), v.clone())).collect();
        w.add_generator(&g.on, &g.spawn, &g.count, cs).unwrap();
    }
    for r in &def.rollups {
        w.add_rollup(Rollup { parent_kind: r.parent.clone(), child_stat: r.child_stat.clone(), parent_stat: r.parent_stat.clone(), reducer: reducer(&r.reduce), drain: false });
    }
    for b in &def.broadcasts {
        w.add_broadcast(Broadcast { parent_kind: String::new(), parent_stat: b.parent_stat.clone(), child_stat: b.child_stat.clone(), gain: b.gain });
    }
}

// ---------- flavor: deterministic names from the entity seed ----------
const DISTRICTS: &[&str] = &["Dockside", "Highcrest", "the Warrens", "Ashford", "Rivergate", "Kiln Row", "Verdant Hill", "the Flats", "Old Custom", "Sableport"];
const STREETS: &[&str] = &["Pike St", "Harrow Ln", "Cinder Row", "Maple Walk", "Ferrel Way", "Tanner's Mile", "Gull St", "Low Bridge", "Sconce Ct", "Ivory Steps"];
const SHOPS: &[&str] = &["the Foundry", "Halvorsen Freight", "the Copper Desk", "Marlow & Sons", "the Exchange", "Pike St Clinic", "Ostheim Press", "the Green Room", "Dray Logistics", "Ferrel Textiles", "Basin Roasters", "Quill & Ledger"];
const PEOPLE: &[&str] = &["Rell", "Mara", "Tovin", "Sasha", "Emet", "Juno", "Cass", "Bram", "Nadia", "Idris", "Wren", "Otto", "Lise", "Gemma", "Pax", "Vera", "Dagen", "Soli"];
const SURNAMES: &[&str] = &["Vance", "Okonkwo", "Reyes", "Halloran", "Sato", "Bright", "Mireles", "Kade", "Ferro", "Nkemi", "Ostrov", "Lund", "Adeyemi", "Petrakis"];
const SECRETS: &[&str] = &[
    "is quietly planning to quit next month",
    "is drowning in debt and hiding it",
    "has feelings for someone at this office",
    "feeds gossip to the boss on the side",
    "is writing a novel nobody knows about",
    "forged a credential to get this job",
    "is caring for a sick parent alone",
    "already has one foot out the door for a rival firm",
];
fn pick<'a>(pool: &[&'a str], seed: u64) -> &'a str {
    pool[(seed % pool.len() as u64) as usize]
}

fn nm(w: &World, id: EntityId) -> String { w.name(id).to_string() }
fn s(w: &World, id: EntityId, k: &str) -> f32 { w.stat(id, k) }

/// Give each freshly-generated child a flavorful, deterministic, *distinct* name.
/// Siblings rotate through the pool by index so the first poolful never collides;
/// people also get a seeded surname so they read like a floor of real coworkers.
fn name_children(w: &mut World, parent: EntityId, pool: &[&str]) {
    let kids = w.children(parent);
    if kids.is_empty() { return; }
    let is_person = w.kind(kids[0]) == "person";
    let start = (w.entity_seed(parent) % pool.len() as u64) as usize;
    for (i, &c) in kids.iter().enumerate() {
        w.set_focus(c, 0.0);
        let base = pool[(start + i) % pool.len()];
        let name = if is_person {
            let sd = w.entity_seed(c) >> 7;
            format!("{} {}", base, SURNAMES[(sd as usize) % SURNAMES.len()])
        } else {
            base.to_string()
        };
        w.entities[c].name = name;
    }
}

// ---------- words for numbers ----------
fn band(x: f32) -> &'static str {
    if x < 0.2 { "very low" } else if x < 0.4 { "low" } else if x < 0.6 { "middling" } else if x < 0.8 { "high" } else { "very high" }
}
fn mood_word(x: f32) -> &'static str {
    if x < 0.25 { "miserable" } else if x < 0.45 { "down" } else if x < 0.6 { "so-so" } else if x < 0.8 { "content" } else { "great" }
}
fn boss_word(x: f32) -> &'static str {
    if x < 0.3 { "furious" } else if x < 0.5 { "impatient" } else if x < 0.7 { "steady" } else { "pleased" }
}
fn trait_read(w: &World, p: EntityId) -> String {
    let mut tags = Vec::new();
    if s(w, p, "ambition") > 0.66 { tags.push("ambitious"); }
    if s(w, p, "diligence") > 0.66 { tags.push("diligent"); } else if s(w, p, "diligence") < 0.4 { tags.push("a slacker"); }
    if s(w, p, "social") > 0.66 { tags.push("chatty"); } else if s(w, p, "social") < 0.34 { tags.push("keeps to themselves"); }
    if s(w, p, "guarded") > 0.66 { tags.push("guarded"); } else if s(w, p, "guarded") < 0.34 { tags.push("open"); }
    if s(w, p, "humor") > 0.66 { tags.push("funny"); }
    if tags.is_empty() { tags.push("unremarkable on the surface"); }
    tags.join(", ")
}

// ---------- the camera ----------
fn tag(w: &World, id: EntityId) -> &'static str {
    match w.fidelity(id) { Fidelity::Detailed => "●", Fidelity::Hazed => "◐", Fidelity::Coarse => "◦" }
}

fn idea_line(w: &World, id: EntityId) -> String {
    let n = nm(w, id);
    match w.kind(id) {
        "district" => format!("≈ {n} — a district. prosperity {}, tension {}, danger {}.", band(s(w,id,"prosperity")), band(s(w,id,"tension")), band(s(w,id,"danger"))),
        "block" => format!("≈ {n} — a street. wealth {}, grit {}.", band(s(w,id,"wealth")), band(s(w,id,"grit"))),
        "workplace" => format!("≈ {n} — a workplace. prestige {}, demand {}, ~{:.0} coin/day.", band(s(w,id,"prestige")), band(s(w,id,"demand")), s(w,id,"wage")),
        "person" => format!("≈ {n} — a coworker. {} — just doing coworker stuff.", trait_read(w, id)),
        "convo" => format!("≈ a conversation with {n} — it could go a thousand ways."),
        _ => format!("≈ {n}"),
    }
}

/// Feather a scope in: idea -> hazing (structure resolves) -> live (its game
/// ticks). Returns nothing; the node is left Detailed and warmed up.
fn feather_in(w: &mut World, id: EntityId, steps: u32, child_pool: &[&str]) {
    println!("      {} {}", tag(w, id), idea_line(w, id));           // ◦ an idea
    w.reveal_structure(id);                                          // haze the structure in
    if !child_pool.is_empty() { name_children(w, id, child_pool); }
    let kids = w.children(id);
    if let Some(&first) = kids.first() {
        let ck = w.kind(first).to_string();
        println!("      {} {} — sharpening… {} {}s resolve out of the haze", tag(w, id), nm(w, id), kids.len(), ck);
    }
    w.reveal(id);                                                    // fully render
    for _ in 0..steps { w.step(); }
    println!("      {} {} — in focus:", tag(w, id), nm(w, id));
    for line in live_lines(w, id) { println!("          {line}"); }
}

fn live_lines(w: &World, id: EntityId) -> Vec<String> {
    let mut out = Vec::new();
    match w.kind(id) {
        "district" => {
            out.push(format!("streets feel {} — tension {:.2}, rent {:.2}, prosperity {}, vibe {}",
                if s(w,id,"tension")>0.7 {"tense"} else if s(w,id,"tension")>0.45 {"uneasy"} else {"easy"},
                s(w,id,"tension"), s(w,id,"rent"), band(s(w,id,"prosperity")), band(s(w,id,"vibe"))));
            let names: Vec<String> = w.children(id).iter().take(5).map(|&c| nm(w, c)).collect();
            out.push(format!("blocks here (still ideas): {}", names.join(", ")));
        }
        "block" => {
            out.push(format!("wealth {}, grit {} — {} workplaces on this street",
                band(s(w,id,"wealth")), band(s(w,id,"grit")), w.children(id).len()));
            let names: Vec<String> = w.children(id).iter().take(5).map(|&c| nm(w, c)).collect();
            out.push(format!("doorways (ideas): {}", names.join(", ")));
        }
        "workplace" => {
            out.push(format!("the floor: workload {}, boss is {}, morale {}, wage ~{:.0} coin",
                band(s(w,id,"workload")), boss_word(s(w,id,"boss_mood")), band(s(w,id,"morale")), s(w,id,"wage")));
            out.push(format!("crunch pressure {} ({:.2}), productivity {:.2}",
                band(s(w,id,"crunch")), s(w,id,"crunch"), s(w,id,"productivity")));
        }
        "person" => {
            let last = w.last_action(id).unwrap_or("settling in");
            out.push(format!("{}: {} mood, {} energy, {} stress, {:.0} coin — currently: {}",
                nm(w,id), mood_word(s(w,id,"mood")), band(s(w,id,"energy")), band(s(w,id,"stress")), s(w,id,"money"), last));
            out.push(format!("read on them: {}", trait_read(w, id)));
        }
        _ => out.push(idea_line(w, id)),
    }
    out
}

/// Fold a scope back out: it collapses from a live world to one line — an idea
/// again, plus whatever fact the visit left behind.
fn feather_out(w: &mut World, id: EntityId, leaves: &str) {
    let name = nm(w, id);
    let kind = w.kind(id).to_string();
    w.fold(id); // -> Coarse
    println!("      ⤴ collapsing {kind} '{name}' → {}", idea_line(w, id).trim_start_matches("≈ "));
    if !leaves.is_empty() {
        println!("        ↳ left behind: {leaves}");
    }
}

fn pick_child(w: &World, parent: EntityId, kind: &str, rng: &mut Rng) -> Option<EntityId> {
    let kids: Vec<EntityId> = w.children(parent).into_iter().filter(|&c| w.kind(c) == kind).collect();
    if kids.is_empty() { return None; }
    Some(kids[(rng.next_u64() as usize) % kids.len()])
}

// ---------- the conversation micro-game ----------
fn move_label(m: &str) -> &'static str {
    match m {
        "small_talk" => "make small talk",
        "joke" => "crack a joke",
        "open_up" => "open up about yourself",
        "probe" => "ask something personal",
        "challenge" => "push back on them",
        "ask_secret" => "ask what they're really thinking",
        _ => "say something",
    }
}
fn reaction(dw: f32, dt: f32, dten: f32, ddep: f32) -> &'static str {
    if dten > 0.1 { "bristles — guard snaps up" }
    else if ddep > 0.12 { "opens up, the conversation goes somewhere real" }
    else if dw > 0.08 { "warms to you, laughs a little" }
    else if dt > 0.08 { "leans in, trusts you a notch more" }
    else if dten < -0.02 && dw >= 0.0 { "relaxes a bit" }
    else { "gives a noncommittal nod" }
}

/// Zoom into one conversation and play it out. Same script, but the person's
/// traits + running state make each one branch differently. Returns (rapport
/// delta applied, optional secret learned).
fn converse(w: &mut World, person: EntityId, script: &[&str]) -> (f32, Option<String>) {
    let pname = nm(w, person);
    let convo = w.children(person).into_iter().find(|&c| w.kind(c) == "convo");
    let convo = match convo { Some(c) => c, None => { println!("      (no conversation node — reveal the person first)"); return (0.0, None); } };
    w.entities[convo].name = pname.clone(); // so the conversation reads as "with <person>"

    println!("\n      ── you stop and actually talk to {pname}. the lens dives one more level ──");
    println!("      {} {}", tag(w, convo), idea_line(w, convo));
    w.reveal(convo); // its own little world goes live
    println!("      {} a whole conversation resolves: warmth {:.2}, trust {:.2}, tension {:.2}",
        tag(w, convo), s(w,convo,"warmth"), s(w,convo,"trust"), s(w,convo,"tension"));

    let mut secret_pre_trust = 0.0f32;
    for &mv in script {
        let (w0, t0, x0, d0) = (s(w,convo,"warmth"), s(w,convo,"trust"), s(w,convo,"tension"), s(w,convo,"depth"));
        if mv == "ask_secret" { secret_pre_trust = t0; }
        w.set_intent(convo, mv);
        w.step();
        let (w1, t1, x1, d1) = (s(w,convo,"warmth"), s(w,convo,"trust"), s(w,convo,"tension"), s(w,convo,"depth"));
        println!("        you {:<28} → {pname} {}", move_label(mv).to_string() + ".", reaction(w1-w0, t1-t0, x1-x0, d1-d0));
    }
    w.clear_intent(convo);

    let (warmth, trust, tension, depth) = (s(w,convo,"warmth"), s(w,convo,"trust"), s(w,convo,"tension"), s(w,convo,"depth"));
    // A secret only surfaces if they trusted you enough at the moment you asked.
    let secret = if secret_pre_trust > 0.7 && tension < 0.55 {
        let sec = pick(SECRETS, w.entity_seed(person) >> 5).to_string();
        w.record_claim(person, "hides", None, &sec);
        w.add_fact(person, format!("you learned: {pname} {sec}"));
        Some(sec)
    } else { None };

    let delta = (0.5*warmth + 0.5*trust + 0.35*depth - 0.5*tension - 0.35).clamp(-0.6, 0.6);
    w.add(person, "rapport", delta);
    (delta, secret)
}

fn detailed_count(w: &World) -> usize {
    w.entities.iter().filter(|e| !e.dead && e.fidelity == Fidelity::Detailed).count()
}

fn main() {
    let text = std::fs::read_to_string("worlds/metropolis.json").expect("read worlds/metropolis.json");
    let def: Def = serde_json::from_str(&text).expect("parse metropolis.json");

    let mut w = World::new(42);
    wire(&mut w, &def);

    // Build the city: metro is always live (surviving it is the top-level game).
    let metro = w.spawn("metro", "MERIDIAN", w.root);
    for (k, v) in [("population", 0.8), ("rent_index", 1.0), ("wealth", 0.5), ("opportunity", 0.6), ("unrest", 0.4), ("crime", 0.3)] {
        w.set(metro, k, v);
    }
    w.reveal(metro); // generates the districts
    name_children(&mut w, metro, DISTRICTS);
    for d in w.children(metro) { w.set_node_fidelity(d, Fidelity::Coarse); } // park them as ideas
    for _ in 0..4 { w.step(); }

    println!("╔══════════════════════════════════════════════════════════════════╗");
    println!("║  MERIDIAN — one city, six nested games, no graphics.               ║");
    println!("║  The only 'rendering' is fidelity: offscreen is an idea, onscreen  ║");
    println!("║  resolves into a whole world. Watch the camera walk the scales.    ║");
    println!("╚══════════════════════════════════════════════════════════════════╝\n");

    println!("┌─ SCALE 0 · THE CITY (always live — 'surviving the big expensive city' is the game) ─┐");
    println!("   MERIDIAN: rent index {:.2}, wealth {}, unrest {:.2}, crime {:.2}, opportunity {:.2}",
        s(&w,metro,"rent_index"), band(s(&w,metro,"wealth")), s(&w,metro,"unrest"), s(&w,metro,"crime"), s(&w,metro,"opportunity"));
    println!("   Its districts are just ideas until you look — {} of them out there in the haze:", w.children(metro).len());
    for d in w.children(metro) { println!("      ◦ {}", idea_line(&w, d).trim_start_matches("≈ ")); }
    let rent0 = s(&w, metro, "rent_index");
    let unrest0 = s(&w, metro, "unrest");

    let mut rng = Rng::new(7);

    // ================= DESCENT: random-walk down to a coworker =================
    println!("\n┌─ ZOOM IN · the camera picks a path at random and feathers each scope in ─┐");
    let d = pick_child(&w, metro, "district", &mut rng).unwrap();
    println!("   ▼ SCALE 1 · DISTRICT");
    feather_in(&mut w, d, 3, STREETS);

    let b = pick_child(&w, d, "block", &mut rng).unwrap();
    println!("   ▼ SCALE 2 · BLOCK (a street)");
    feather_in(&mut w, b, 2, SHOPS);

    let wp = pick_child(&w, b, "workplace", &mut rng).unwrap();
    println!("   ▼ SCALE 3 · WORKPLACE ('a day at work' is now the whole game)");
    feather_in(&mut w, wp, 6, PEOPLE);

    // check in on the coworkers — they are NOT interchangeable
    println!("   ▼ SCALE 4 · THE COWORKERS (each a different person; zoom person 2 ≠ person 5)");
    let staff = w.children(wp);
    for &p in staff.iter().take(6) {
        println!("      ◦ {}: {} mood, {} stress, doing '{}' — {}",
            nm(&w,p), mood_word(s(&w,p,"mood")), band(s(&w,p,"stress")),
            w.last_action(p).unwrap_or("—"), trait_read(&w, p));
    }

    // pick the most OPEN and most GUARDED coworker — same script, opposite souls
    let mut by_guard = staff.clone();
    by_guard.sort_by(|&a, &b| s(&w, a, "guarded").partial_cmp(&s(&w, b, "guarded")).unwrap());
    let p_a = by_guard[0];                       // most open
    let p_b = by_guard[by_guard.len() - 1];      // most guarded
    let script = ["small_talk", "joke", "open_up", "open_up", "probe", "ask_secret"];
    println!("\n   ▼ SCALE 5 · A CONVERSATION (its own branching world)");
    println!("   The camera picks the most OPEN and most GUARDED coworker on the floor and runs the");
    println!("   SAME five dialogue moves on each. Watch one script fork on two personalities:");

    w.reveal(p_a); // spawns this person's convo node
    let (da, seca) = converse(&mut w, p_a, &script);
    let na = nm(&w, p_a);
    println!("      → the whole conversation collapses to one line on {}: rapport {:+.2}{}",
        na, da, seca.as_ref().map(|x| format!(", and you learned {na} {x}")).unwrap_or_default());

    // the SAME six moves on the guarded one — a totally different arc
    w.reveal(p_b);
    let (db, secb) = converse(&mut w, p_b, &script);
    let nb = nm(&w, p_b);
    println!("      → same six moves, different soul. {} ends at rapport {:+.2}{}",
        nb, db, secb.as_ref().map(|x| format!(", secret out: {nb} {x}")).unwrap_or_default());

    let deepest = detailed_count(&w);

    // ================= PULL BACK: everything collapses to ideas/facts =================
    println!("\n┌─ PULL BACK · each scope collapses to a single idea, canon left behind ─┐");
    let pa_leaves = format!("{} — {}", nm(&w, p_a), w.facts(p_a).last().cloned().unwrap_or_else(|| "a coworker you spoke to once".into()));
    feather_out(&mut w, p_a, &pa_leaves);
    feather_out(&mut w, wp, "a workday: wages earned, morale shifted, a deadline looming");
    feather_out(&mut w, b, "a street you passed through");
    feather_out(&mut w, d, "an afternoon in one district");

    // meanwhile, the city kept living while you were deep in one conversation
    for _ in 0..6 { w.step(); }
    let rent1 = s(&w, metro, "rent_index");
    let unrest1 = s(&w, metro, "unrest");
    println!("\n   ◦ back at SCALE 0. While you were down in one conversation, the city moved on:");
    println!("      rent index {:.2} → {:.2}   unrest {:.2} → {:.2}   (offscreen districts drifted on their own)",
        rent0, rent1, unrest0, unrest1);
    for ev in w.log.iter().rev().take(3) {
        println!("      · tick {}: {}", ev.tick, ev.message);
    }

    // ================= REVISIT: canon persists =================
    println!("\n┌─ REVISIT · zoom back into the SAME district — is it consistent? ─┐");
    let blocks_before: Vec<String> = w.children(d).iter().map(|&c| nm(&w, c)).collect();
    let tension_before = s(&w, d, "tension");
    w.reveal(d); // re-detail; canon guard means nothing regenerates
    for _ in 0..2 { w.step(); }
    let blocks_after: Vec<String> = w.children(d).iter().map(|&c| nm(&w, c)).collect();
    println!("   same streets, same names (canon held): {}", blocks_after.join(", "));
    println!("   consistent structure? {}   tension then {:.2} → now {:.2} (it lived while unwatched)",
        if blocks_before == blocks_after { "yes — not regenerated" } else { "NO — regenerated (bug)" },
        tension_before, s(&w, d, "tension"));
    if let Some(fact) = w.facts(p_a).last() {
        println!("   and {} still carries what you learned: \"{}\"", nm(&w,p_a), fact);
    }

    // ================= the LOD receipt =================
    let total = w.entities.iter().filter(|e| !e.dead).count();
    let dtot = w.children(metro).len();
    let drev = w.children(metro).iter().filter(|&&d| w.is_revealed(d)).count();
    println!("\n┌─ THE LOD RECEIPT ─┐");
    println!("   Whole city so far: {total} nodes ever materialized. Of {dtot} districts, only {drev} was opened —");
    println!("   the other {} stayed pure ideas, ONE node each; their streets, offices, and people were never", dtot - drev);
    println!("   generated at all (lazy canon: you don't pay for the unlooked-at). And at the deepest point of");
    println!("   the zoom, only {deepest} nodes were Detailed at once — the camera path plus the room you stood in.");
    println!("   THAT is the whole trick: a GTA-scale world you hold in your hand, paying only for what's in frame.");
}
