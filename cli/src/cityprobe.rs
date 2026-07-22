//! cityprobe — verify the demo's zoom pipeline AND occupant movement from the
//! engine side: dive city→district→block→building→floor→room, revealing each
//! level (lazy worldgen), then step and confirm occupants actually change rooms
//! (the movement the gliding renderer depends on).

use owos_core::engine::World;

fn kids(w: &World, id: usize, kind: &str) -> Vec<usize> {
    w.children(id).into_iter().filter(|&c| w.kind(c) == kind).collect()
}
fn first(w: &World, id: usize, kind: &str) -> usize {
    *kids(w, id, kind).first().unwrap_or_else(|| panic!("GAP: no {kind} under #{id}"))
}

fn main() {
    let json = std::fs::read_to_string("worlds/city.json").expect("read");
    let mut w = owos_author::build(&json).expect("build");
    let city = *w.by_kind("city").first().expect("city");

    let d = first(&w, city, "district"); w.reveal(d);
    let bl = first(&w, d, "block");      w.reveal(bl);
    let bu = first(&w, bl, "building");  w.reveal(bu);
    let fl = first(&w, bu, "floor");     w.reveal(fl);
    for r in kids(&w, fl, "room") { w.reveal(r); }
    let rooms = kids(&w, fl, "room");

    println!("dive: city → {} districts → {} blocks → {} buildings → {} floors → {} rooms",
        kids(&w, city, "district").len(), kids(&w, d, "block").len(), kids(&w, bl, "building").len(),
        kids(&w, bu, "floor").len(), rooms.len());

    // Which rooms is each occupant in BEFORE stepping?
    let occ: Vec<usize> = rooms.iter().flat_map(|&r| kids(&w, r, "occupant")).collect();
    println!("{} occupants live on this floor.", occ.len());
    let where_of = |w: &World, o: usize| w.parent(o).map(|p| w.name(p).to_string()).unwrap_or_default();
    let before: Vec<(usize, String)> = occ.iter().map(|&o| (o, where_of(w_ref(&w), o))).collect();

    // Step and watch for room changes (occupants `move` along the floor's door chain).
    for _ in 0..12 { w.step(); }
    let mut moved = 0;
    for (o, was) in &before {
        let now = where_of(&w, *o);
        if &now != was { moved += 1; }
    }
    println!("after 12 ticks: {} of {} occupants CHANGED rooms (move along door edges).", moved, before.len());
    if let Some(&o) = occ.first() {
        println!("sample: {} is in {} doing '{}' (mood {:.2}, energy {:.2}).",
            w.name(o), where_of(&w, o), w.last_action(o).unwrap_or("—"), w.stat(o, "mood"), w.stat(o, "energy"));
    }

    let total = w.entities.iter().filter(|e| !e.dead).count();
    println!("\nmaterialized: {total} entities — the rest of Veranholm is generated only when looked at.");
    if moved > 0 { println!("PASS: full 7-level dive works AND occupants move room-to-room (gliding has real data)."); }
    else { println!("NOTE: dive works but no occupant moved in 12 ticks — check wander score / door chain."); }
}

// tiny helper so the closure borrow above type-checks cleanly
fn w_ref(w: &World) -> &World { w }
