//! regime — the overthrow, as data. A polity + citizens; citizens' fondness for
//! the ruler is a formula that is role-general: for the first 3 years it's a
//! honeymoon; after that it's judged on whether life IMPROVED (life - a baseline
//! stamped at takeover). An EVENT fires when mean fondness drops too low: the
//! regime falls. The SAME rule then judges the next ruler — including YOU. Run it
//! with a capable successor vs an incapable one and watch the difference EMERGE.

use std::collections::BTreeMap;

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
struct EventDef {
    on: String,
    when: String,
    label: String,
    #[serde(rename = "do")]
    do_: Vec<EffDef>,
}
#[derive(Deserialize)]
struct RegimeDef {
    citizens: usize,
    months: u32,
    polity: BTreeMap<String, f32>,
    citizen: BTreeMap<String, f32>,
    rules: Vec<RuleDef>,
    events: Vec<EventDef>,
}

fn run(def: &RegimeDef, name: &str, successor: f32) {
    let mut w = World::new(1);
    let root = w.root;
    let polity = w.spawn("polity", "the state", root);
    for (k, v) in &def.polity {
        w.set(polity, k, *v);
    }
    let mut cits = Vec::new();
    for i in 0..def.citizens {
        let c = w.spawn("citizen", &format!("citizen {i}"), polity);
        for (k, v) in &def.citizen {
            w.set(c, k, *v);
        }
        cits.push(c);
    }
    for r in &def.rules {
        w.add_rule(&r.on, &r.set, &r.expr).unwrap();
    }
    for e in &def.events {
        let eff: Vec<(String, String, String)> = e.do_.iter().map(|f| (f.op.clone(), f.stat.clone(), f.expr.clone())).collect();
        w.add_event(&e.on, &e.when, eff, &e.label).unwrap();
    }

    let prosperities = [0.30f32, successor, 0.60];
    let mut regime = 0usize;
    let mut log_read = 0;
    println!("\n═══ {name} ═══");
    for month in 0..def.months {
        w.step();
        while log_read < w.log.len() {
            println!("     year {:>4.1}  ⚑ {}", month as f32 / 12.0, w.log[log_read].message);
            log_read += 1;
        }
        let r = w.stat(polity, "regime") as usize;
        if r != regime {
            regime = r;
            let p = *prosperities.get(r).unwrap_or(&0.6);
            w.set(polity, "prosperity", p);
            let who = if r == 1 { "   <- this is YOU" } else { "" };
            println!("     year {:>4.1}  → a new regime takes power (prosperity {p:.2}){who}", month as f32 / 12.0);
        }
        if month % 12 == 0 {
            let f: f32 = cits.iter().map(|&c| w.stat(c, "fondness")).sum::<f32>() / cits.len() as f32;
            let l: f32 = cits.iter().map(|&c| w.stat(c, "life")).sum::<f32>() / cits.len() as f32;
            println!("   yr {:>2}:  fondness {:.2}   life {:.2}   (tenure {:.1}y, prosperity {:.2})", month / 12, f, l, w.stat(polity, "tenure"), w.stat(polity, "prosperity"));
        }
    }
}

fn main() {
    let text = std::fs::read_to_string("worlds/regime.json").expect("read worlds/regime.json");
    let def: RegimeDef = serde_json::from_str(&text).expect("parse regime.json");
    println!("The old regime is failing. You will overthrow it — but the SAME rule that lifts you will judge you in 3 years.");
    run(&def, "You rule WELL (prosperity 0.80)", 0.80);
    run(&def, "You rule BADLY (prosperity 0.22)", 0.22);
}
