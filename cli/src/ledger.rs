//! ledger — canon consistency across entities.
//!
//! Two nations drift into war-weariness. When you reveal the first, its canon
//! generator can't just invent an enemy — it picks a real war-torn peer and
//! COMMITS the war to the ledger (symmetrically). When you later reveal the
//! second, the generator READS the ledger, sees it's already at war with the
//! first, and writes canon that agrees — same war, referencing the first
//! nation's actual president — instead of contradicting it. That's the
//! difference between "lazy canon" and "lazy canon that holds together".

use owos_core::engine::{EntityId, System, Unfolder, World};
use owos_core::Rng;

const LEADERS: [&str; 6] = ["Zhao", "Vael", "Okonkwo", "Mirza", "Solene", "Batu"];
const VICTIMS: [&str; 4] = ["Mara the widow", "old farmer Sun", "the miller's daughter", "blind Tomas"];
const GOODS: [&str; 4] = ["the winter grain", "the temple's gold", "the last seed corn", "the tax silver"];

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

struct NationCanon;
impl NationCanon {
    fn ensure_leader(w: &mut World, nation: EntityId) -> EntityId {
        match w.object_of(nation, "leader") {
            Some(p) => p,
            None => {
                let mut rng = Rng::new(w.entity_seed(nation));
                let nm = LEADERS[(rng.next_u64() as usize) % LEADERS.len()];
                let p = w.spawn("leader", nm, nation); // bare name; prose adds the title
                w.record_claim(nation, "leader", Some(p), "");
                p
            }
        }
    }
}
impl Unfolder for NationCanon {
    fn unfold(&self, w: &mut World, id: EntityId) {
        let name = w.name(id).to_string();
        let leader = Self::ensure_leader(w, id);
        let leader_name = w.name(leader).to_string();
        let unrest = w.stat(id, "unrest");

        if unrest < 0.4 {
            w.add_fact(id, format!("{name} is quiet under President {leader_name}; the people ask only to be left alone."));
            return;
        }

        let (corr, hun, war) = (w.stat(id, "corruption"), w.stat(id, "hunger"), w.stat(id, "war"));
        let committed = w.object_of(id, "at_war_with");

        // Consistency rule: if a war is already committed, OR war is the worst
        // grievance, the story MUST be about that war.
        if committed.is_some() || (war >= corr && war >= hun) {
            let enemy = match committed {
                Some(e) => e,
                None => {
                    // Pick the most war-torn peer as a mutual enemy; commit both.
                    let mut best = None;
                    let mut best_v = 0.2;
                    for other in w.by_kind("nation") {
                        if other != id && w.stat(other, "war") > best_v {
                            best_v = w.stat(other, "war");
                            best = Some(other);
                        }
                    }
                    match best {
                        Some(e) => {
                            w.record_claim(id, "at_war_with", Some(e), "");
                            w.record_claim(e, "at_war_with", Some(id), "");
                            e
                        }
                        None => {
                            w.add_fact(id, format!("{name} festers under President {leader_name}, its enemies all within."));
                            return;
                        }
                    }
                }
            };
            let ename = w.name(enemy).to_string();
            let story = match w.object_of(enemy, "leader") {
                Some(el) => {
                    let eln = w.name(el).to_string();
                    format!("{name} is locked in a grinding war with {ename} — President {leader_name} against President {eln} — and both peoples bleed.")
                }
                None => format!("{name}, under President {leader_name}, has warred with {ename} for years with no end in sight."),
            };
            w.add_fact(id, story);
            return;
        }

        if corr >= hun {
            let mut rng = Rng::new(w.entity_seed(id).wrapping_add(1));
            let victim = VICTIMS[(rng.next_u64() as usize) % VICTIMS.len()];
            let goods = GOODS[(rng.next_u64() as usize) % GOODS.len()];
            let v = w.spawn("citizen", victim, id);
            w.record_claim(id, "scandal", Some(v), goods);
            w.add_fact(id, format!("President {leader_name} was caught stealing {goods} from {victim}; he lied when confronted, and now doubles the guard."));
        } else {
            w.add_fact(id, format!("Famine hollows out {name} while President {leader_name} feasts behind barred gates."));
        }
    }
}

fn main() {
    let mut w = World::new(7);
    let world = w.root;

    for n in 0..5 {
        let nation = w.spawn("nation", &format!("Nation {n}"), world);
        w.fold(nation);
        let mut r = Rng::new(w.entity_seed(nation));
        // Nations 0 and 1 are steered toward war so they become mutual enemies;
        // the rest get random tendencies.
        if n < 2 {
            w.set(nation, "t_corrupt", 0.1);
            w.set(nation, "t_hunger", 0.1);
            w.set(nation, "t_war", 0.95);
        } else {
            w.set(nation, "t_corrupt", r.next_f32());
            w.set(nation, "t_hunger", r.next_f32());
            w.set(nation, "t_war", r.next_f32());
        }
    }
    w.add_system(Box::new(Grievances));
    w.set_unfolder("nation", Box::new(NationCanon));
    for _ in 0..30 {
        w.step();
    }

    let n0 = w.by_kind("nation")[0];
    let n1 = w.by_kind("nation")[1];

    println!("otherworldOS · canon that holds together\n");
    println!(">>> You visit {} first. Its canon is written:", w.name(n0));
    w.reveal(n0);
    for f in w.facts(n0) {
        println!("   « {f} »");
    }

    println!("\n>>> Later you visit {}. The generator reads the ledger before writing:", w.name(n1));
    w.reveal(n1);
    for f in w.facts(n1) {
        println!("   « {f} »");
    }
    println!("   ^ same war, and it names {}'s actual president — because the ledger already committed it.", w.name(n0));

    println!("\nThe canon ledger (structured facts, contradiction-free):");
    for c in w.ledger() {
        let obj = c.object.map(|o| w.name(o).to_string()).unwrap_or_default();
        let detail = if c.detail.is_empty() { String::new() } else { format!("  ({})", c.detail) };
        println!("   {} —{}→ {}{}", w.name(c.subject), c.predicate, obj, detail);
    }
}
