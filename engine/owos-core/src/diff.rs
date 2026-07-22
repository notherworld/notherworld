//! Snapshots and diffs — the payoff.
//!
//! The product isn't the tick loop; it's this: capture the world, let time pass,
//! then describe what changed in human terms. That "what happened while you were
//! away" story is the thing a game surfaces to the player.

use crate::agent::Housing;
use crate::event::EventKind;
use crate::world::World;

#[derive(Clone)]
pub struct AgentSnap {
    pub id: u32,
    pub name: String,
    pub money: i64,
    pub debt: i64,
    pub housing: Housing,
    pub mood: f32,
}

#[derive(Clone)]
pub struct Snapshot {
    pub agents: Vec<AgentSnap>,
}

/// Freeze the current state of every agent.
pub fn snapshot(w: &World) -> Snapshot {
    Snapshot {
        agents: w
            .agents
            .iter()
            .map(|a| AgentSnap {
                id: a.id,
                name: a.name.clone(),
                money: a.money,
                debt: a.debt,
                housing: a.housing,
                mood: a.mood(),
            })
            .collect(),
    }
}

/// Render a human-readable story of what changed between `before` and now.
pub fn report(before: &Snapshot, w: &World) -> String {
    let now = snapshot(w);
    let mut out = String::new();
    out.push_str(&format!("=== {} days later in the town ===\n\n", w.clock.day()));

    for (b, a) in before.agents.iter().zip(now.agents.iter()) {
        let dmoney = a.money - b.money;
        let sign = if dmoney >= 0 { "+" } else { "" };
        let worked = w.log.count_kind(a.id, |k| matches!(k, EventKind::Worked { .. }));
        let hungry = w.log.count_kind(a.id, |k| matches!(k, EventKind::WentHungry));
        let met = w.log.count_kind(a.id, |k| matches!(k, EventKind::Socialized { .. }));

        out.push_str(&format!("{}\n", a.name));
        out.push_str(&format!(
            "   money ${} -> ${} ({}{})   debt ${}   mood {:+.2} -> {:+.2}\n",
            b.money, a.money, sign, dmoney, a.debt, b.mood, a.mood
        ));

        let mut story: Vec<String> = Vec::new();
        if b.housing != a.housing {
            story.push(match a.housing {
                Housing::Homeless => "was evicted and is now homeless".to_string(),
                Housing::Housed => "clawed back into housing".to_string(),
            });
        }
        if hungry > 0 {
            story.push(format!("went hungry {hungry} nights"));
        }
        story.push(format!("worked {worked} shifts, met people {met} times"));
        out.push_str(&format!("   {}\n\n", story.join("; ")));
    }

    // A couple of town-wide headlines pulled straight from the event log.
    if let Some((pair, affinity)) = w
        .relationships
        .iter()
        .max_by(|p, q| p.1.partial_cmp(q.1).unwrap())
    {
        let (x, y) = *pair;
        out.push_str(&format!(
            "Closest bond formed: {} & {} ({:.0}%)\n",
            w.agents[x as usize].name,
            w.agents[y as usize].name,
            affinity * 100.0
        ));
    }
    let evictions = w
        .log
        .events
        .iter()
        .filter(|e| e.kind == EventKind::Evicted)
        .count();
    out.push_str(&format!("Evictions this stretch: {evictions}\n"));

    out
}
