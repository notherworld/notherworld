//! A starter library of Kits + the bridges that overlap them.
//!
//! Three deliberately *different* worlds — an ecology (predator/prey), a market
//! (supply/demand/price), and public mood (rumor/unrest/cohesion). Each has its
//! own dynamics in isolation. The `bridges()` wire them into one causal web:
//! a bare meadow starves the market, dear goods anger the public, unrest chills
//! demand. Run them apart, then together, and watch chains appear that no single
//! Kit could produce. This is the "fractal legos" idea in its smallest real form.

use crate::kit::{Catalyst, Cmp, Flow, Impulse, Kit, SignalDef, Term, Threshold};

fn sig(id: &str, initial: f32, min: f32, max: f32, noise: f32) -> SignalDef {
    SignalDef { id: id.to_string(), initial, min, max, noise }
}
fn term(coeff: f32, factors: &[&str]) -> Term {
    Term { coeff, factors: factors.iter().map(|s| s.to_string()).collect() }
}
fn flow(target: &str, terms: Vec<Term>) -> Flow {
    Flow { target: target.to_string(), terms }
}
fn thresh(signal: &str, cmp: Cmp, value: f32, label: &str) -> Threshold {
    Threshold { signal: signal.to_string(), cmp, value, label: label.to_string() }
}

/// Predator/prey/plant — boom then bust.
pub fn ecology() -> Kit {
    Kit {
        name: "eco".into(),
        title: "Meadow ecology".into(),
        signals: vec![
            sig("grass", 70.0, 0.0, 300.0, 0.4),
            sig("rabbits", 25.0, 0.0, 400.0, 0.3),
            sig("foxes", 6.0, 0.0, 200.0, 0.2),
        ],
        flows: vec![
            flow("grass", vec![term(1.0, &["grass"]), term(-0.003, &["grass", "grass"]), term(-0.05, &["grass", "rabbits"])]),
            flow("rabbits", vec![term(0.015, &["grass", "rabbits"]), term(-0.12, &["rabbits"]), term(-0.03, &["rabbits", "foxes"])]),
            flow("foxes", vec![term(0.01, &["rabbits", "foxes"]), term(-0.22, &["foxes"])]),
        ],
        thresholds: vec![
            thresh("grass", Cmp::Below, 15.0, "the meadow is grazed down to dirt"),
            thresh("grass", Cmp::Above, 180.0, "the meadow grows back lush and green"),
            thresh("rabbits", Cmp::Above, 90.0, "rabbits are everywhere — a population boom"),
            thresh("rabbits", Cmp::Below, 4.0, "the rabbit population has collapsed"),
            thresh("foxes", Cmp::Below, 2.0, "the foxes are all but gone"),
        ],
    }
}

/// Supply / demand / price — a self-correcting (and overshooting) market.
pub fn economy() -> Kit {
    Kit {
        name: "econ".into(),
        title: "Town market".into(),
        signals: vec![
            sig("price", 10.0, 1.0, 300.0, 0.25),
            sig("supply", 50.0, 0.0, 400.0, 0.4),
            sig("demand", 50.0, 0.0, 400.0, 0.4),
        ],
        flows: vec![
            flow("price", vec![term(0.1, &["demand"]), term(-0.1, &["supply"])]),
            flow("supply", vec![term(0.15, &["price"]), term(-0.1, &["supply"])]),
            flow("demand", vec![term(12.0, &[]), term(-0.08, &["price"]), term(-0.15, &["demand"])]),
        ],
        thresholds: vec![
            thresh("price", Cmp::Above, 25.0, "prices spike — the cost of living soars"),
            thresh("price", Cmp::Below, 4.0, "prices crash into deflation"),
            thresh("supply", Cmp::Below, 12.0, "shelves run bare — a shortage"),
            thresh("supply", Cmp::Above, 120.0, "warehouses overflow — a glut"),
        ],
    }
}

/// Rumor / unrest / cohesion — mood that can tip into a wave.
pub fn society() -> Kit {
    Kit {
        name: "civ".into(),
        title: "Public mood".into(),
        signals: vec![
            sig("unrest", 20.0, 0.0, 100.0, 0.5),
            sig("cohesion", 50.0, 0.0, 100.0, 0.4),
            sig("rumor", 5.0, 0.0, 100.0, 0.7),
        ],
        flows: vec![
            flow("rumor", vec![term(0.8, &[]), term(0.12, &["rumor"]), term(-0.004, &["rumor", "rumor"])]),
            flow("unrest", vec![term(0.25, &["rumor"]), term(0.08, &["unrest"]), term(-0.001, &["unrest", "unrest"]), term(-0.13, &["cohesion"])]),
            flow("cohesion", vec![term(6.0, &[]), term(-0.1, &["cohesion"]), term(-0.12, &["unrest"])]),
        ],
        thresholds: vec![
            thresh("unrest", Cmp::Above, 60.0, "unrest boils over into a riot"),
            thresh("unrest", Cmp::Below, 12.0, "the streets fall calm again"),
            thresh("rumor", Cmp::Above, 40.0, "a rumor is spreading fast"),
        ],
    }
}

// --- Catalysts: shocks you (or a player, or an LLM) fire into a running world ---

/// Scorch the meadow to near-nothing.
pub fn drought() -> Catalyst {
    Catalyst {
        name: "drought".into(),
        label: "a drought scorches the meadow".into(),
        impulses: vec![Impulse::Set { signal: "eco.grass".into(), value: 6.0 }],
    }
}

/// A sudden run on the market: demand spikes, stock halves.
pub fn market_panic() -> Catalyst {
    Catalyst {
        name: "panic".into(),
        label: "panic buying grips the market".into(),
        impulses: vec![
            Impulse::Add { signal: "econ.demand".into(), amount: 120.0 },
            Impulse::Scale { signal: "econ.supply".into(), factor: 0.5 },
        ],
    }
}

/// A scandal breaks — rumor and unrest jump, cohesion drops.
pub fn scandal() -> Catalyst {
    Catalyst {
        name: "scandal".into(),
        label: "a political scandal breaks".into(),
        impulses: vec![
            Impulse::Add { signal: "civ.rumor".into(), amount: 45.0 },
            Impulse::Add { signal: "civ.unrest".into(), amount: 20.0 },
            Impulse::Add { signal: "civ.cohesion".into(), amount: -25.0 },
        ],
    }
}

/// A bumper harvest floods the meadow and the market with plenty.
pub fn bumper_harvest() -> Catalyst {
    Catalyst {
        name: "bumper".into(),
        label: "a bumper harvest floods the market".into(),
        impulses: vec![
            Impulse::Set { signal: "eco.grass".into(), value: 220.0 },
            Impulse::Add { signal: "econ.supply".into(), amount: 120.0 },
        ],
    }
}

// --- Sim-LOD demo: one person's fate depends on your presence (attention) ---

/// A life focused on one person, Mira. `presence` (1 = you're here and engaged,
/// 0 = you've left) gates which dynamics govern her: while you're present your
/// bond grows and keeps her from pairing off; leave, and the region resolves her
/// romance on its own from the ambient pressure. High-LOD vs low-LOD, on one
/// signal. Flip `presence` with a catalyst to move in / move out.
pub fn riverside() -> Kit {
    Kit {
        name: "life".into(),
        title: "Riverside (a life with Mira)".into(),
        signals: vec![
            sig("presence", 1.0, 0.0, 1.0, 0.0),
            sig("affinity", 8.0, 0.0, 100.0, 0.3),
            sig("taken", 0.0, 0.0, 100.0, 0.3),
            sig("ambient", 35.0, 0.0, 100.0, 0.5),
        ],
        flows: vec![
            // Your bond only grows while you're here; it fades otherwise, and
            // fades faster once she's committed to someone else.
            flow("affinity", vec![term(3.0, &["presence"]), term(-0.02, &["affinity"]), term(-0.05, &["taken"])]),
            // She drifts toward someone else from ambient romance — strongly
            // held back while you're present, and once she's fallen for you.
            flow("taken", vec![term(0.06, &["ambient"]), term(-0.03, &["taken"]), term(-0.25, &["presence"]), term(-0.03, &["affinity"])]),
            flow("ambient", vec![term(4.0, &[]), term(-0.1, &["ambient"])]),
        ],
        thresholds: vec![
            thresh("affinity", Cmp::Above, 70.0, "you and Mira have fallen for each other"),
            thresh("affinity", Cmp::Above, 92.0, "you and Mira are engaged to be married"),
            thresh("taken", Cmp::Above, 55.0, "Mira is growing close to someone else"),
            thresh("taken", Cmp::Above, 85.0, "Mira has gotten engaged to another"),
        ],
    }
}

pub fn player_leaves() -> Catalyst {
    Catalyst {
        name: "leave".into(),
        label: "you leave Riverside to explore elsewhere".into(),
        impulses: vec![Impulse::Set { signal: "life.presence".into(), value: 0.0 }],
    }
}

pub fn player_returns() -> Catalyst {
    Catalyst {
        name: "return".into(),
        label: "you return to Riverside".into(),
        impulses: vec![Impulse::Set { signal: "life.presence".into(), value: 1.0 }],
    }
}

/// The wires between Kits — where overlap turns three worlds into one.
pub fn bridges() -> Vec<Flow> {
    vec![
        // A bare meadow starves the market of food.
        flow("econ.supply", vec![term(0.04, &["eco.grass"]), term(-2.5, &[])]),
        // Expensive goods anger the public.
        flow("civ.unrest", vec![term(0.06, &["econ.price"]), term(-0.5, &[])]),
        // Unrest keeps people home and depresses demand.
        flow("econ.demand", vec![term(-0.1, &["civ.unrest"]), term(1.2, &[])]),
    ]
}

// --- Collapse: regime shift + role choice + probabilistic disaster ---

/// A single survivor's life across a societal collapse. Two complementary gate
/// signals — `stable` (1 before) and `collapsed` (1 after) — flip which rules
/// run. Before: your career grows `money`. After: money is worthless and only
/// prep that MATCHES the disaster (`boat` for a flood, `shelter` for a volcano)
/// keeps you fed and safe — and safety is what gathers survivors to you.
pub fn collapse_survivor() -> Kit {
    Kit {
        name: "surv".into(),
        title: "Survivor (before & after collapse)".into(),
        signals: vec![
            sig("stable", 1.0, 0.0, 1.0, 0.0),
            sig("collapsed", 0.0, 0.0, 1.0, 0.0),
            sig("flood", 0.0, 0.0, 1.0, 0.0),
            sig("volcano", 0.0, 0.0, 1.0, 0.0),
            sig("money", 40.0, 0.0, 500.0, 0.0),
            sig("boat", 0.0, 0.0, 100.0, 0.0),
            sig("shelter", 0.0, 0.0, 100.0, 0.0),
            sig("food", 60.0, 0.0, 200.0, 0.4),
            sig("safety", 60.0, 0.0, 100.0, 0.4),
            sig("influence", 0.0, 0.0, 100.0, 0.3),
        ],
        flows: vec![
            // Before collapse: a career quietly grows money (soon worthless).
            flow("money", vec![term(1.2, &["stable"])]),
            // After collapse: food comes only from prep matching the disaster.
            flow("food", vec![
                term(0.02, &["collapsed", "boat", "flood"]),
                term(0.02, &["collapsed", "shelter", "volcano"]),
                term(-0.6, &["collapsed"]),
            ]),
            // Safety = matching prep + food, minus constant danger.
            flow("safety", vec![
                term(0.045, &["collapsed", "boat", "flood"]),
                term(0.045, &["collapsed", "shelter", "volcano"]),
                term(0.02, &["collapsed", "food"]),
                term(-2.5, &["collapsed"]),
                term(-0.03, &["collapsed", "safety"]),
            ]),
            // Stay safe and others gather to you — you become a leader.
            flow("influence", vec![
                term(0.05, &["collapsed", "safety"]),
                term(-1.2, &["collapsed"]),
                term(-0.02, &["collapsed", "influence"]),
            ]),
        ],
        thresholds: vec![
            thresh("influence", Cmp::Above, 40.0, "survivors rally to you — you're becoming their leader"),
            thresh("food", Cmp::Below, 10.0, "starvation looms"),
            thresh("safety", Cmp::Below, 15.0, "you're barely surviving, alone"),
        ],
    }
}

pub fn role_banker() -> Catalyst {
    Catalyst {
        name: "banker".into(),
        label: "you build a comfortable career as a banker".into(),
        impulses: vec![
            Impulse::Set { signal: "surv.money".into(), value: 120.0 },
            Impulse::Set { signal: "surv.boat".into(), value: 0.0 },
            Impulse::Set { signal: "surv.shelter".into(), value: 0.0 },
        ],
    }
}

pub fn role_boatman() -> Catalyst {
    Catalyst {
        name: "boatman".into(),
        label: "you spend your years quietly building a boat".into(),
        impulses: vec![
            Impulse::Set { signal: "surv.money".into(), value: 25.0 },
            Impulse::Set { signal: "surv.boat".into(), value: 85.0 },
            Impulse::Set { signal: "surv.shelter".into(), value: 0.0 },
        ],
    }
}

pub fn role_prepper() -> Catalyst {
    Catalyst {
        name: "prepper".into(),
        label: "you fortify a shelter in the highlands".into(),
        impulses: vec![
            Impulse::Set { signal: "surv.money".into(), value: 25.0 },
            Impulse::Set { signal: "surv.boat".into(), value: 0.0 },
            Impulse::Set { signal: "surv.shelter".into(), value: 85.0 },
        ],
    }
}

pub fn flood() -> Catalyst {
    Catalyst {
        name: "flood".into(),
        label: "the floodwaters rise — society breaks".into(),
        impulses: vec![
            Impulse::Set { signal: "surv.stable".into(), value: 0.0 },
            Impulse::Set { signal: "surv.collapsed".into(), value: 1.0 },
            Impulse::Set { signal: "surv.flood".into(), value: 1.0 },
        ],
    }
}

pub fn volcano() -> Catalyst {
    Catalyst {
        name: "volcano".into(),
        label: "the volcano erupts — society breaks".into(),
        impulses: vec![
            Impulse::Set { signal: "surv.stable".into(), value: 0.0 },
            Impulse::Set { signal: "surv.collapsed".into(), value: 1.0 },
            Impulse::Set { signal: "surv.volcano".into(), value: 1.0 },
        ],
    }
}

pub fn quake() -> Catalyst {
    Catalyst {
        name: "quake".into(),
        label: "the earth splits open — society breaks (no one prepped for this)".into(),
        impulses: vec![
            Impulse::Set { signal: "surv.stable".into(), value: 0.0 },
            Impulse::Set { signal: "surv.collapsed".into(), value: 1.0 },
        ],
    }
}

/// The weighted disaster deck — what might strike, and how likely.
pub fn disaster_deck() -> Vec<(f32, Catalyst)> {
    vec![(0.6, flood()), (0.25, volcano()), (0.15, quake())]
}

/// A spontaneous GOOD event — fortune cuts both ways, not just disasters.
pub fn festival() -> Catalyst {
    Catalyst {
        name: "festival".into(),
        label: "a joyful festival lifts the whole town".into(),
        impulses: vec![
            Impulse::Add { signal: "civ.cohesion".into(), amount: 30.0 },
            Impulse::Add { signal: "civ.unrest".into(), amount: -25.0 },
            Impulse::Add { signal: "civ.rumor".into(), amount: -15.0 },
        ],
    }
}

/// Every Kit the portal can offer as a lego.
pub fn kit_library() -> Vec<Kit> {
    vec![ecology(), economy(), society(), riverside(), collapse_survivor()]
}

/// Every catalyst the portal can offer as a god-mode button.
pub fn catalyst_library() -> Vec<Catalyst> {
    vec![
        drought(),
        market_panic(),
        scandal(),
        bumper_harvest(),
        festival(),
        player_leaves(),
        player_returns(),
        role_banker(),
        role_boatman(),
        role_prepper(),
        flood(),
        volcano(),
        quake(),
    ]
}
