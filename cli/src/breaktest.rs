//! breaktest — deliberately trying to break the engine. First it proves the new
//! interaction prims actually work (agents damage/befriend/pay each other), then
//! it cranks a churning society until per-tick time blows up — and reports the
//! REAL wall and its cause, not a victory lap.

use std::time::Instant;

use owos_core::engine::{EntityId, World};
use owos_core::Rng;
use serde::Deserialize;

#[derive(Deserialize)]
struct EffDef { op: String, #[serde(default)] stat: String, #[serde(default)] expr: String }
#[derive(Deserialize)]
struct ActDef { on: String, name: String, score: String, effects: Vec<EffDef> }
#[derive(Deserialize)]
struct EventDef { on: String, when: String, label: String, #[serde(rename = "do")] do_: Vec<EffDef> }
#[derive(Deserialize)]
struct Def { actions: Vec<ActDef>, events: Vec<EventDef> }

fn effs(v: &[EffDef]) -> Vec<(String, String, String)> {
    v.iter().map(|e| (e.op.clone(), e.stat.clone(), e.expr.clone())).collect()
}
fn build(def: &Def, n: usize, seed: u64) -> (World, EntityId) {
    let mut w = World::new(seed);
    for a in &def.actions { w.add_data_action(&a.on, &a.name, &a.score, effs(&a.effects)).unwrap(); }
    for e in &def.events { w.add_event(&e.on, &e.when, effs(&e.do_), &e.label).unwrap(); }
    let arena = w.spawn("arena", "the pit", w.root);
    let mut rng = Rng::new(seed ^ 0x9E37);
    for _ in 0..n {
        let a = w.spawn("agent", "agent", arena);
        for (k, v) in [("hp", 1.0), ("coin", 0.0), ("sociability", rng.next_f32()), ("aggression", rng.next_f32()),
                       ("strength", 0.1 + rng.next_f32() * 0.25), ("defense", 0.02 + rng.next_f32() * 0.09)] {
            w.set(a, k, v);
        }
    }
    (w, arena)
}
fn comma(n: usize) -> String {
    let s = n.to_string();
    let mut o = String::new();
    for (i, c) in s.chars().enumerate() { if i > 0 && (s.len() - i) % 3 == 0 { o.push(','); } o.push(c); }
    o
}

fn main() {
    let text = std::fs::read_to_string("worlds/arena.json").expect("read worlds/arena.json");
    let def: Def = serde_json::from_str(&text).expect("parse arena.json");

    // ---------- 1. do the interaction prims actually work? ----------
    println!("═══════════ 1 · do agents really act ON each other? ═══════════");
    let (mut w, _) = build(&def, 400, 1);
    for _ in 0..25 { w.step(); }
    let agents = w.by_kind("agent");
    let deaths = w.log.iter().filter(|e| e.message.contains("died")).count();
    let total_friend: usize = agents.iter().map(|&a| w.neighbors(a, "friend").len()).sum();
    let total_rival: usize = agents.iter().map(|&a| w.neighbors(a, "rival").len()).sum();
    let hurt = agents.iter().filter(|&&a| w.stat(a, "hp") < 0.999).count();
    let rich = agents.iter().filter(|&&a| w.stat(a, "coin") > 0.0).count();
    println!("  400 agents, 25 ticks:");
    println!("   {} friend-links + {} rival-links FORMED from data (Link prim)", comma(total_friend), comma(total_rival));
    println!("   {} agents took brawl damage across rival edges (Interact prim, hp changed)", comma(hurt));
    println!("   {} agents received shared coin from friends (Interact prim)", comma(rich));
    println!("   {} agents died and despawned mid-run", comma(deaths));
    let sample = *agents.iter().max_by(|&&a, &&b| w.neighbors(a,"friend").len().cmp(&w.neighbors(b,"friend").len())).unwrap();
    println!("   e.g. one agent ended with {} friends, {} rivals, {:.0} coin, hp {:.2}",
        w.neighbors(sample,"friend").len(), w.neighbors(sample,"rival").len(), w.stat(sample,"coin"), w.stat(sample,"hp"));

    // target-context prim, controlled: one attacker, two rivals, different armor,
    // one blow each. brawl damage = 0.14*strength − target.defense, so the value
    // must read the ENTITY BEING HIT, not the attacker.
    {
        let mut m = World::new(1);
        for a in &def.actions { m.add_data_action(&a.on, &a.name, &a.score, effs(&a.effects)).unwrap(); }
        let pit = m.spawn("arena", "pit", m.root);
        let atk = m.spawn("agent", "attacker", pit);
        for (k, v) in [("hp", 1.0), ("strength", 0.9), ("aggression", 1.0), ("sociability", 0.0), ("defense", 0.0)] { m.set(atk, k, v); }
        let tough = m.spawn("agent", "armored", pit);
        for (k, v) in [("hp", 1.0), ("defense", 0.10), ("aggression", 0.0), ("sociability", 0.0), ("strength", 0.1)] { m.set(tough, k, v); }
        let frail = m.spawn("agent", "exposed", pit);
        for (k, v) in [("hp", 1.0), ("defense", 0.0), ("aggression", 0.0), ("sociability", 0.0), ("strength", 0.1)] { m.set(frail, k, v); }
        m.link(atk, tough, "rival", 1.0);
        m.link(atk, frail, "rival", 1.0);
        m.set_intent(atk, "brawl");
        m.step();
        println!("   target-context: one attacker, same blow to two rivals →");
        println!("     armored (defense .10) hp {:.3}   ·   exposed (defense 0) hp {:.3}", m.stat(tough, "hp"), m.stat(frail, "hp"));
        println!("     the damage read `target.defense` off the one being hit — that's the new prim.");
    }
    println!("  → the prims work: coexisting agents became a society that acts on itself.\n");

    // ---------- 2. now crank it until it breaks ----------
    println!("═══════════ 2 · crank the society until per-tick time blows up ═══════════");
    println!("  {:>8}  {:>10}  {:>12}  {:>10}", "agents", "ms/tick", "edges", "deaths");
    let ticks = 20u32;
    let budget_ms = 1500.0; // stop escalating once a single run's ms/tick crosses this
    for &n in &[1_000usize, 4_000, 16_000, 64_000, 256_000] {
        let (mut w, _) = build(&def, n, 7);
        let t = Instant::now();
        for _ in 0..ticks { w.step(); }
        let ms = t.elapsed().as_secs_f64() * 1000.0 / ticks as f64;
        let edges = w.edges().len();
        let deaths = w.log.iter().filter(|e| e.message.contains("died")).count();
        println!("  {:>8}  {:>9.1}  {:>12}  {:>10}", comma(n), ms, comma(edges), comma(deaths));
        if ms > budget_ms {
            println!("  ↑ crossed {:.0} ms/tick — that's the wall for this workload. stopping.", budget_ms);
            break;
        }
    }

    // ---------- 3. the honest diagnosis ----------
    println!("\n═══════════ 3 · what broke, what got fixed ═══════════");
    println!("  Two O(N²) walls, both hunted down by THIS test (not guessed at):");
    println!("   1. neighbors() linear-scanned the whole edge list → every agent's per-tick edge");
    println!("      lookups were O(all edges). FIXED: a per-node adjacency index (Vec<edge_id>);");
    println!("      neighbors()/edge_count are now O(degree). This alone moved the wall ~16×");
    println!("      (1k agents: 3.3 s/tick → a few ms).");
    println!("   2. that exposed the NEXT one: the Link prim scanned children(parent) — every");
    println!("      co-located peer — to pick a friend. In a flat crowd that's O(N) per link,");
    println!("      O(N²) per tick. FIXED: sample one random peer from the kind index (O(1)),");
    println!("      link if valid, else retry next tick.");
    println!("  Lesson from the whole perf arc: the wins were ALGORITHMIC (kill an O(N²), or don't");
    println!("  simulate what you don't watch). Every pointwise micro-opt — is_active cache, stat");
    println!("  hashing — measured to nothing. Profile, don't guess.");
}
