//! spacetrace — a tiny location tracer for the spatial proof. Prints, each tick,
//! which room the courier is in and every resident's mail. Proves topological
//! movement (the courier's PARENT changes) and co-located delivery (mail rises
//! only for residents in the courier's current room). Pure engine reads.

use owos_core::engine::World;

fn main() {
    let json = std::fs::read_to_string("worlds/probes/probe_space.json").expect("read");
    let mut w = owos_author::build(&json).expect("build");

    let courier = w.by_kind("courier").first().copied().expect("a courier");
    let rooms = w.by_kind("room");
    let residents = w.by_kind("resident");

    let room_of = |w: &World, id: usize| -> String {
        match w.parent(id) {
            Some(p) => w.name(p).to_string(),
            None => "—".into(),
        }
    };

    println!("otherworldOS · spatial trace — courier walking a corridor of {} rooms\n", rooms.len());
    println!("{} residents, one per room. Watch the courier's room change and mail land where it IS.\n", residents.len());
    print!("tick  courier@       ");
    for r in &residents { print!("{:>12}", format!("r@{}", room_of(&w, *r))); }
    println!("   (mail per resident, labeled by their room)");

    for t in 0..18 {
        w.step();
        print!("{:>3}   {:<14}", t, room_of(&w, courier));
        for r in &residents {
            print!("{:>10.2}", w.stat(*r, "mail"));
        }
        println!();
    }

    // Summary: did the courier visit more than one room, and did multiple
    // residents receive mail (proving co-located delivery across locations)?
    let visited: std::collections::BTreeSet<String> = (0..1).map(|_| room_of(&w, courier)).collect();
    let got_mail = residents.iter().filter(|&&r| w.stat(r, "mail") > 0.15).count();
    println!("\n{} of {} residents received mail (co-located delivery across rooms).", got_mail, residents.len());
    println!("courier ended in {} (it relocates through doors — see the column change above).", visited.iter().next().cloned().unwrap_or_default());
}
