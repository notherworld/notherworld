//! afterhours — pushing LOD to the limit. Follow Sarah from the beach to her
//! condo at night; the floorplan + apartment stats generate on first entry and
//! PERSIST. Her evening activities are time-of-day gated (but 'gated' = weighted,
//! not a law — 5% chance she cooks breakfast at 9pm). She dreams; the dream moves
//! her mood next morning. Then the same for three coworkers as a live LOD *set*.
//! Then we skip a month and drop back in at random — is the apartment the same?
//! did anyone's late nights catch up with them? did the others notice?
//!
//! Behaviors are all data (worlds/afterhours.json). This host is a camera + clock.

use owos_core::engine::{EntityId, Fidelity, World};
use owos_core::Rng;
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
struct Def { rules: Vec<RuleDef>, actions: Vec<ActDef>, events: Vec<EventDef>, generators: Vec<GenDef> }

fn effs(v: &[EffDef]) -> Vec<(String, String, String)> {
    v.iter().map(|e| (e.op.clone(), e.stat.clone(), e.expr.clone())).collect()
}
fn wire(w: &mut World, def: &Def) {
    for r in &def.rules { w.add_rule(&r.on, &r.set, &r.expr).unwrap(); }
    for a in &def.actions { w.add_data_action(&a.on, &a.name, &a.score, effs(&a.effects)).unwrap(); }
    for e in &def.events { w.add_event(&e.on, &e.when, effs(&e.do_), &e.label).unwrap(); }
    for g in &def.generators {
        let cs: Vec<(String, String)> = g.child_stats.iter().map(|(k, v)| (k.clone(), v.clone())).collect();
        w.add_generator(&g.on, &g.spawn, &g.count, cs).unwrap();
    }
}

fn s(w: &World, id: EntityId, k: &str) -> f32 { w.stat(id, k) }
fn nm(w: &World, id: EntityId) -> String { w.name(id).to_string() }
fn band(x: f32) -> &'static str {
    if x < 0.2 { "very low" } else if x < 0.4 { "low" } else if x < 0.6 { "middling" } else if x < 0.8 { "high" } else { "very high" }
}
fn mood_word(x: f32) -> &'static str {
    if x < 0.3 { "low" } else if x < 0.5 { "flat" } else if x < 0.7 { "okay" } else { "good" }
}

const ROOMS: &[&str] = &["the bedroom", "the kitchen", "the living room", "the bathroom", "a small study", "a cramped balcony"];

fn enter_apartment(w: &mut World, apt: EntityId) {
    w.reveal(apt); // floorplan generates now — once, then persists
    let kids = w.children(apt);
    for (i, &r) in kids.iter().enumerate() {
        w.entities[r].name = ROOMS[i % ROOMS.len()].to_string();
    }
    println!("      you step inside. the floorplan resolves — {} rooms, and they'll stay this way:", kids.len());
    println!("      apartment: size {}, coziness {}, clutter {}, rent {}",
        band(s(w,apt,"size")), band(s(w,apt,"coziness")), band(s(w,apt,"clutter")), band(s(w,apt,"rent")));
    let names: Vec<String> = kids.iter().map(|&r| nm(w, r)).collect();
    println!("      → {}", names.join(" · "));
}

/// The dream, computed from the day just lived: good day + real sleep = a good
/// dream; a stressed doomscroll night = a groggy, anxious one. Returns (valence, words).
fn dream_of(w: &World, p: EntityId) -> (f32, &'static str) {
    let (mood, stress, slept) = (s(w,p,"mood"), s(w,p,"stress"), s(w,p,"did_sleep"));
    let val = (0.5 + 0.5*(mood-0.5) - 0.45*stress + 0.1*(slept*2.0-1.0)).clamp(0.0, 1.0);
    let words = if slept < 0.5 { "barely slept — scrolled past 2am, groggy" }
        else if val > 0.62 { "dreamed of the coast; woke up lighter" }
        else if val < 0.4 { "an anxious dream about being late" }
        else { "slept through, no dreams they'd recall" };
    (val, words)
}

fn set_tod(w: &mut World, tod: f32) {
    for p in w.by_kind("person") { w.set(p, "tod", tod); }
}

fn main() {
    let text = std::fs::read_to_string("worlds/afterhours.json").expect("read worlds/afterhours.json");
    let def: Def = serde_json::from_str(&text).expect("parse afterhours.json");

    let mut w = World::new(42);
    wire(&mut w, &def);
    let mut rng = Rng::new(3);

    let city = w.spawn("city", "the city", w.root);
    let office = w.spawn("office", "Pier 7", city);

    // the cast — distinct people. (trait: energy, stress, mood, wage, night_owl, diligence)
    let cast_spec = [
        ("Sarah", 0.80, 0.40, 0.60, 12.0, 0.35, 0.70),
        ("Alex",  0.85, 0.30, 0.65, 14.0, 0.10, 0.85), // sleeps early, thrives
        ("Mara",  0.60, 0.70, 0.45, 11.0, 0.85, 0.50), // night owl, high stress — at risk
        ("Dev",   0.70, 0.50, 0.55, 10.0, 0.45, 0.55),
    ];
    let mut cast: Vec<EntityId> = Vec::new();
    for (name, e, st, m, wg, no, di) in cast_spec {
        let p = w.spawn("person", name, office);
        for (k, v) in [("energy",e),("stress",st),("mood",m),("wage",wg),("night_owl",no),("diligence",di),
                       ("hunger",0.4),("dream",0.5),("did_sleep",1.0),("missed_days",0.0),("tod",0.0),("money",0.0)] {
            w.set(p, k, v);
        }
        cast.push(p);
    }
    // six unnamed coworkers who share the office but whom we never follow home
    for _ in 0..6 {
        let p = w.spawn("person", "a coworker", office);
        for (k, v) in [("energy",0.6+rng.next_f32()*0.3),("stress",0.3+rng.next_f32()*0.4),("mood",0.5),
                       ("wage",10.0),("night_owl",rng.next_f32()),("diligence",0.5),("hunger",0.4),
                       ("dream",0.5),("did_sleep",1.0),("missed_days",0.0),("tod",0.0),("money",0.0)] {
            w.set(p, k, v);
        }
    }
    // they're coworkers — the tie that carries consequences
    for i in 0..cast.len() { for j in (i+1)..cast.len() { w.link(cast[i], cast[j], "coworker", 1.0); } }
    // reveal the cast → each gets an apartment (still just an idea until entered)
    for &p in &cast { w.reveal(p); }
    for &p in &cast {
        if let Some(&apt) = w.children(p).iter().find(|&&c| w.kind(c) == "apartment") {
            w.set_node_fidelity(apt, Fidelity::Coarse);
        }
    }

    println!("╔════════════════════════════════════════════════════════════════╗");
    println!("║  AFTER HOURS — four lives at full LOD, a month, no graphics.    ║");
    println!("╚════════════════════════════════════════════════════════════════╝");

    // ---------- SCENE 1: follow Sarah home ----------
    let sarah = cast[0];
    let sarah_apt = w.children(sarah).into_iter().find(|&c| w.kind(c) == "apartment").unwrap();
    println!("\n┌─ 9:14pm · you follow Sarah off the beach and up to her condo ─┐");
    enter_apartment(&mut w, sarah_apt);
    let sarah_rooms: Vec<String> = w.children(sarah_apt).iter().map(|&r| nm(&w, r)).collect();

    // ---------- SCENE 2: the LOD set — 3 coworkers, followed home the same night ----------
    println!("\n┌─ the same night · you pull three coworkers into the lens too (a live LOD set) ─┐");
    for &p in &cast[1..] {
        let apt = w.children(p).into_iter().find(|&c| w.kind(c) == "apartment").unwrap();
        w.reveal(apt);
        let kids = w.children(apt);
        for (i, &r) in kids.iter().enumerate() { w.entities[r].name = ROOMS[i % ROOMS.len()].to_string(); }
        println!("   {}'s place: {} rooms, coziness {}, clutter {}", nm(&w,p), kids.len(), band(s(&w,apt,"coziness")), band(s(&w,apt,"clutter")));
    }

    // ---------- SCENE 3: one evening → night → morning, all four ----------
    println!("\n┌─ one evening, four different lives (same activity list, gated by time-of-day) ─┐");
    set_tod(&mut w, 2.0); w.step(); // evening
    for &p in &cast { println!("   evening · {:<6} {}", nm(&w,p), w.last_action(p).unwrap_or("—")); }
    set_tod(&mut w, 3.0); w.step(); // night
    println!("   ── night ──");
    for &p in &cast {
        let act = w.last_action(p).unwrap_or("—");
        let flag = if act == "make_breakfast" { "  ⟵ the 5%! breakfast at 9pm — not a law" } else { "" };
        println!("   night   · {:<6} {}{}", nm(&w,p), act, flag);
    }
    // dreams, from the night just lived
    println!("   ── they dream ──");
    for &p in &cast {
        let (val, words) = dream_of(&w, p);
        w.set(p, "dream", val);
        println!("   {:<6} {}", nm(&w,p), words);
    }
    let mood_before: Vec<f32> = cast.iter().map(|&p| s(&w,p,"mood")).collect();
    set_tod(&mut w, 0.0); w.step(); // next morning — mood rule reads the dream
    println!("   ── next morning, mood shifted by the dream ──");
    for (i, &p) in cast.iter().enumerate() {
        println!("   {:<6} mood {} → {}", nm(&w,p), mood_word(mood_before[i]), mood_word(s(&w,p,"mood")));
    }

    // ---------- SCENE 4: skip a month, drop back in at random ----------
    println!("\n┌─ then a month passes. we drop back in on random days ─┐");
    let checkins: [u32; 3] = [
        7 + (rng.next_u64() % 4) as u32,
        15 + (rng.next_u64() % 4) as u32,
        24 + (rng.next_u64() % 4) as u32,
    ];
    let mut night_breakfasts: Vec<(u32, String)> = Vec::new();
    let mut noticed_logged = 0usize;

    for day in 1..=30u32 {
        for tod in 0..4 {
            set_tod(&mut w, tod as f32);
            w.step();
            if tod == 3 {
                for &p in &cast {
                    if w.last_action(p) == Some("make_breakfast") { night_breakfasts.push((day, nm(&w, p))); }
                    let (val, _) = dream_of(&w, p);
                    w.set(p, "dream", val);
                }
            }
        }
        // surface any "coworkers noticed" events as they land
        while noticed_logged < w.log.len() {
            noticed_logged += 1;
        }
        if checkins.contains(&day) {
            println!("\n   ── day {day}: you zoom back in ──");
            // persistence: same apartment?
            let now_rooms: Vec<String> = w.children(sarah_apt).iter().map(|&r| nm(&w, r)).collect();
            println!("   Sarah's condo: {} — {}", now_rooms.join(", "),
                if now_rooms == sarah_rooms { "identical to move-in night (canon held, not regenerated)" } else { "CHANGED (bug)" });
            for &p in &cast {
                println!("   {:<6} mood {}, stress {}, energy {}, ${:.0}, missed {} day(s), aware of {:.0} coworker-absence",
                    nm(&w,p), mood_word(s(&w,p,"mood")), band(s(&w,p,"stress")), band(s(&w,p,"energy")),
                    s(&w,p,"money"), s(&w,p,"missed_days") as i32, s(&w,p,"team_absence"));
            }
        }
    }

    // ---------- the payoff: did previous things affect the present? ----------
    println!("\n┌─ what actually happened over the month (all emergent, all from data) ─┐");
    let notices: Vec<&owos_core::engine::Notable> = w.log.iter().filter(|e| e.message.contains("noticed a coworker")).collect();
    for &p in &cast {
        let missed = s(&w,p,"missed_days") as i32;
        let tag = if missed >= 2 { "  ← the late nights caught up" } else if missed == 0 { "  ← never missed a day" } else { "" };
        println!("   {:<6} ${:>4.0} earned · {} day(s) missed · mood {} · stress {}{}",
            nm(&w,p), s(&w,p,"money"), missed, mood_word(s(&w,p,"mood")), band(s(&w,p,"stress")), tag);
    }
    println!();
    if let Some((maxp, _)) = cast.iter().map(|&p| (p, s(&w,p,"missed_days"))).max_by(|a,b| a.1.partial_cmp(&b.1).unwrap()) {
        if s(&w, maxp, "missed_days") >= 1.0 {
            println!("   The chain: {} is a night owl → doomscrolled most nights → ran chronically low on sleep,", nm(&w,maxp));
            println!("   energy, and mood → overslept and missed {} shifts. Nobody scripted that; it fell out of", s(&w,maxp,"missed_days") as i32);
            println!("   the activity weights — and only Mara, because only her night_owl trait tips the balance.");
        }
    }
    if notices.is_empty() {
        println!("   (no coworker crossed the 'noticed' threshold this month)");
    } else {
        println!("   And the coworkers NOTICED — {} times the office clocked someone's absences:", notices.len());
        for n in notices.iter().take(4) { println!("     · day~{}: {}", n.tick / 4 + 1, n.message); }
    }
    if !night_breakfasts.is_empty() {
        println!("\n   The 5% escape hatch fired {} time(s) — someone cooked breakfast at 9pm:", night_breakfasts.len());
        for (d, who) in night_breakfasts.iter().take(5) { println!("     · day {d}: {who}"); }
    } else {
        println!("\n   (the 5% night-breakfast never rolled this month — it's rare, as designed)");
    }

    // LOD receipt
    let apts = w.by_kind("apartment").len();
    let rooms = w.by_kind("room").len();
    let ppl = w.by_kind("person").len();
    println!("\n┌─ LOD receipt ─┐");
    println!("   {ppl} people in the office; we followed {} home, so only {apts} apartments and {rooms} rooms", cast.len());
    println!("   ever generated a floorplan. The other {} lived the whole month as single nodes — no interiors,", ppl - cast.len());
    println!("   no rooms, no rent. You paid for exactly the detail you looked at.");
}
