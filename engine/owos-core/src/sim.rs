//! The simulation loop — where everything actually happens.
//!
//! Each tick runs an ordered pipeline of systems over the world. Systems don't
//! call each other directly; they read and write shared state and append events.
//! Emergent stories come from these systems *colliding*: work feeds money, money
//! pays rent, missed rent becomes debt, debt becomes eviction, eviction wrecks
//! sleep and mood, which changes what the agent does next. Nobody scripted that.

use crate::agent::{Action, Agent, Housing};
use crate::event::{Event, EventKind};
use crate::time::TICKS_PER_DAY;
use crate::world::{Config, World};

/// Fast-forward the world by `days`. This is the "time-skip" — the same loop
/// that would run live, just run headless while no one is watching.
pub fn advance_days(w: &mut World, days: u64) {
    for _ in 0..days * TICKS_PER_DAY as u64 {
        tick(w);
    }
}

/// Advance the world by exactly one tick (one in-world hour).
pub fn tick(w: &mut World) {
    let hour = w.clock.hour();
    let day = w.clock.day();

    decay_needs(w);
    for i in 0..w.agents.len() {
        act(w, i, hour, day);
    }

    // Daily systems fire once, at a fixed hour of the day.
    if hour == 6 {
        rent_system(w, day);
        eviction_system(w, day);
        rehouse_system(w, day);
    }
    if hour == 21 {
        hunger_system(w, day);
    }

    w.clock.advance();
}

/// Needs drift toward desperation every hour.
fn decay_needs(w: &mut World) {
    let hunger_rate = w.config.hunger_rate;
    let fatigue_rate = w.config.fatigue_rate;
    let loneliness_rate = w.config.loneliness_rate;
    for a in &mut w.agents {
        a.hunger = (a.hunger + hunger_rate).clamp(0.0, 1.0);
        a.fatigue = (a.fatigue + fatigue_rate).clamp(0.0, 1.0);
        // More sociable people get lonely faster.
        a.loneliness = (a.loneliness + loneliness_rate * (0.5 + a.sociability)).clamp(0.0, 1.0);
    }
}

/// Pick the action with the highest "pull" given needs and the time of day.
/// This is deliberately simple and readable — it's the first place you'll tune.
fn choose_action(a: &Agent, hour: u32, cfg: &Config) -> Action {
    let night = !(6..22).contains(&hour);
    let work_hour = (cfg.work_start..cfg.work_end).contains(&hour);

    let sleep = a.fatigue * if night { 1.6 } else { 0.4 };
    let eat = if a.hunger > 0.35 && a.money >= cfg.food_cost {
        a.hunger + 0.2
    } else {
        0.0
    };
    let need_money = a.money < cfg.food_cost + cfg.rent_per_day;
    let work = if work_hour {
        if need_money {
            1.3
        } else {
            0.5
        }
    } else {
        0.0
    };
    let social = if !night && !work_hour {
        a.loneliness * (0.5 + a.sociability)
    } else {
        0.0
    };

    // `Idle` wins only if nothing crosses the minimum-motivation threshold.
    let mut best = Action::Idle;
    let mut best_score = 0.25_f32;
    for (action, score) in [
        (Action::Sleep, sleep),
        (Action::Eat, eat),
        (Action::Work, work),
        (Action::Socialize, social),
    ] {
        if score > best_score {
            best_score = score;
            best = action;
        }
    }
    best
}

/// Resolve one agent's chosen action, mutating the world and logging events.
fn act(w: &mut World, i: usize, hour: u32, day: u64) {
    let action = choose_action(&w.agents[i], hour, &w.config);
    let id = w.agents[i].id;

    match action {
        Action::Sleep => {
            // The homeless barely rest — the first turn of the downward spiral.
            let recover = if w.agents[i].housing == Housing::Housed {
                0.6
            } else {
                0.25
            };
            let a = &mut w.agents[i];
            a.fatigue = (a.fatigue - recover).max(0.0);
        }
        Action::Work => {
            let wage = w.agents[i].wage;
            {
                let a = &mut w.agents[i];
                a.money += wage;
                a.fatigue = (a.fatigue + 0.05).min(1.0);
            }
            w.log.push(Event { day, hour, actor: id, kind: EventKind::Worked { earned: wage } });
        }
        Action::Eat => {
            let cost = w.config.food_cost;
            if w.agents[i].money >= cost {
                {
                    let a = &mut w.agents[i];
                    a.money -= cost;
                    a.hunger = (a.hunger - 0.6).max(0.0);
                }
                w.log.push(Event { day, hour, actor: id, kind: EventKind::Ate });
            }
        }
        Action::Socialize => {
            if let Some(j) = pick_partner(w, i) {
                let other = w.agents[j].id;
                w.agents[i].loneliness = (w.agents[i].loneliness - 0.5).max(0.0);
                w.agents[j].loneliness = (w.agents[j].loneliness - 0.25).max(0.0);
                w.bump_rel(id, other, 0.15);
                w.log.push(Event { day, hour, actor: id, kind: EventKind::Socialized { with: other } });
            }
        }
        Action::Idle => {}
    }

    w.agents[i].last_action = action;
}

/// Deterministically pick someone other than `i` to spend time with.
fn pick_partner(w: &mut World, i: usize) -> Option<usize> {
    let n = w.agents.len();
    if n < 2 {
        return None;
    }
    let offset = (w.rng.next_u64() % (n as u64 - 1)) as usize + 1;
    Some((i + offset) % n)
}

/// Rent falls due each morning. Can't pay it -> it becomes debt.
fn rent_system(w: &mut World, day: u64) {
    let rent = w.config.rent_per_day;
    for i in 0..w.agents.len() {
        if w.agents[i].housing == Housing::Homeless {
            continue;
        }
        let id = w.agents[i].id;
        if w.agents[i].money >= rent {
            w.agents[i].money -= rent;
            w.log.push(Event { day, hour: 6, actor: id, kind: EventKind::RentPaid { amount: rent } });
        } else {
            w.agents[i].debt += rent;
            w.log.push(Event { day, hour: 6, actor: id, kind: EventKind::RentMissed { amount: rent } });
        }
    }
}

/// Too much debt and you lose your home.
fn eviction_system(w: &mut World, day: u64) {
    let threshold = w.config.eviction_debt;
    for i in 0..w.agents.len() {
        if w.agents[i].housing == Housing::Housed && w.agents[i].debt >= threshold {
            w.agents[i].housing = Housing::Homeless;
            let id = w.agents[i].id;
            w.log.push(Event { day, hour: 6, actor: id, kind: EventKind::Evicted });
        }
    }
}

/// Save up enough and a homeless agent can claw back into housing.
fn rehouse_system(w: &mut World, day: u64) {
    let cost = w.config.rehouse_cost;
    for i in 0..w.agents.len() {
        if w.agents[i].housing == Housing::Homeless && w.agents[i].money >= cost {
            w.agents[i].money -= cost;
            w.agents[i].debt = 0;
            w.agents[i].housing = Housing::Housed;
            let id = w.agents[i].id;
            w.log.push(Event { day, hour: 6, actor: id, kind: EventKind::RegainedHousing });
        }
    }
}

/// Anyone who ends the day badly hungry is recorded as having gone hungry.
fn hunger_system(w: &mut World, day: u64) {
    for i in 0..w.agents.len() {
        if w.agents[i].hunger >= 0.8 {
            let id = w.agents[i].id;
            w.log.push(Event { day, hour: 21, actor: id, kind: EventKind::WentHungry });
        }
    }
}
