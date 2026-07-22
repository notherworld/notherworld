//! canon — "canon as an unfolding".
//!
//! Five nations start with ZERO turmoil. A coarse sim evolves their grievances
//! from hidden tendencies, so some drift into unrest — but only as an aggregate
//! number. The WHY doesn't exist yet. When the player REVEALS a nation, an
//! Unfolder writes canon consistent with its evolved state (a corruption scandal,
//! a famine, a war), spawns the specific people involved, and persists it. That
//! canon can then be gossiped elsewhere — but a nation just as turbulent, never
//! visited, stays a rumor with no story, because no one wrote it.

use owos_core::engine::{System, Unfolder, World};
use owos_core::Rng;

const LEADERS: [&str; 6] = ["Zhao", "Vael", "Okonkwo", "Mirza", "Solene", "Batu"];
const VICTIMS: [&str; 4] = ["Mara the widow", "old farmer Sun", "the miller's daughter", "blind Tomas"];
const GOODS: [&str; 4] = ["the winter grain", "the temple's gold", "the last seed corn", "the tax silver"];

/// Coarse rule: each nation's hidden tendencies slowly grow real grievances,
/// and unrest tracks its worst one. No specifics — just aggregates.
struct Grievances;
impl System for Grievances {
    fn name(&self) -> &str {
        "grievances"
    }
    fn tick(&self, w: &mut World) {
        for id in w.by_kind("nation") {
            for (dim, tend) in [("corruption", "t_corrupt"), ("hunger", "t_hunger"), ("war", "t_war")] {
                let grow = 0.03 * w.stat(id, tend);
                w.set(id, dim, (w.stat(id, dim) + grow).min(1.0));
            }
            let (c, h, war) = (w.stat(id, "corruption"), w.stat(id, "hunger"), w.stat(id, "war"));
            let worst = c.max(h).max(war);
            w.set(id, "unrest", (0.8 * worst + 0.2 * (c + h + war) / 3.0).clamp(0.0, 1.0));
        }
    }
}

/// The canon generator: writes a specific, persistent story that EXPLAINS the
/// nation's evolved aggregate — then spawns the individuals it names.
struct NationCanon;
impl Unfolder for NationCanon {
    fn unfold(&self, w: &mut World, id: EntityId) {
        let name = w.name(id).to_string();
        let unrest = w.stat(id, "unrest");
        if unrest < 0.4 {
            w.add_fact(id, format!("{name} is quiet — a fair harvest, and a people content to be left alone."));
            return;
        }
        let (c, h, war) = (w.stat(id, "corruption"), w.stat(id, "hunger"), w.stat(id, "war"));
        let mut rng = Rng::new(w.entity_seed(id));
        let leader = LEADERS[(rng.next_u64() as usize) % LEADERS.len()];
        let pres = w.spawn("leader", &format!("President {leader}"), id);
        w.set(pres, "popularity", 0.15);
        w.set(pres, "fear", 0.7);

        let story = if c >= h && c >= war {
            let victim = VICTIMS[(rng.next_u64() as usize) % VICTIMS.len()];
            let goods = GOODS[(rng.next_u64() as usize) % GOODS.len()];
            let vid = w.spawn("citizen", victim, id);
            w.set(vid, "wronged", 1.0);
            format!("President {leader} was caught stealing {goods} from {victim}. Offered a chance to confess, he lied — and has since doubled the palace guard, certain a revolt is coming.")
        } else if h >= war {
            format!("Famine has hollowed out {name}: the granaries are empty while President {leader} feasts behind barred gates.")
        } else {
            format!("President {leader}'s endless wars have bled {name} white; in the markets they whisper openly of an ousting.")
        };
        w.add_fact(id, story);
    }
}

use owos_core::engine::EntityId;

fn main() {
    let mut w = World::new(7);
    let world = w.root;

    // Five nations, all folded (offscreen), each with hidden tendencies.
    for n in 0..5 {
        let nation = w.spawn("nation", &format!("Nation {n}"), world);
        w.fold(nation);
        let mut r = Rng::new(w.entity_seed(nation));
        w.set(nation, "t_corrupt", r.next_f32());
        w.set(nation, "t_hunger", r.next_f32());
        w.set(nation, "t_war", r.next_f32());
    }
    w.add_system(Box::new(Grievances));
    w.set_unfolder("nation", Box::new(NationCanon));

    // Time passes. Turmoil grows from zero — but only as distant aggregates.
    for _ in 0..30 {
        w.step();
    }

    println!("otherworldOS · canon as an unfolding\n");
    println!("After 30 turns — what the world knows from a DISTANCE (coarse, no specifics):");
    for n in w.by_kind("nation") {
        let u = w.stat(n, "unrest");
        let tag = if u >= 0.4 { "in turmoil — but WHY is unknown, no one has been" } else { "calm" };
        println!("   {} · unrest {:.2}  ({tag})", w.name(n), u);
    }

    // Rank by turmoil; visit the worst, leave the second-worst untouched.
    let mut ns = w.by_kind("nation");
    ns.sort_by(|&a, &b| w.stat(b, "unrest").partial_cmp(&w.stat(a, "unrest")).unwrap());
    let (visited, unvisited) = (ns[0], ns[1]);

    println!("\n>>> You travel to {} and live there. The lens focuses — canon is written:", w.name(visited));
    w.reveal(visited);
    for f in w.facts(visited) {
        println!("   « {f} »");
    }
    print!("   people who now exist here:");
    for c in w.children(visited) {
        print!("  {} ({})", w.name(c), w.kind(c));
    }
    println!();

    println!(
        "\n{} is just as turbulent (unrest {:.2}) — but you never went. Its canon:",
        w.name(unvisited),
        w.stat(unvisited, "unrest")
    );
    if w.facts(unvisited).is_empty() {
        println!("   (nothing. the 'why' was never written — no scandal, no names, no story.)");
    }

    println!("\nTavern talk over in the calm nations — only canon that was WRITTEN can travel:");
    for n in w.by_kind("nation") {
        if w.is_revealed(n) {
            for f in w.facts(n) {
                if f.contains("stealing") || f.contains("Famine") || f.contains("wars") {
                    println!("   \"Did you hear? {f}\"");
                }
            }
        }
    }
    println!("   (…and not one word about {} — as far as anyone here knows, there's no story to tell.)", w.name(unvisited));
}
