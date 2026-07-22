//! interior — spatial procedural unfolding: walk into a building and its inside
//! is generated on entry; walk into a room and its contents appear, based on the
//! building/room TYPE. Same reveal + Unfolder + LOD + canon as the nations, now
//! applied to SPACE, with the new relationship-graph primitive wiring doors
//! between rooms. Building & room types are DATA (a first taste of authoring).

use owos_core::engine::{EntityId, Unfolder, World};

// ---- authoring data: the catalog (later: loaded from a file / an editor) ----

struct RoomKind {
    name: &'static str,
    objects: &'static [&'static str],
}
struct BuildingKind {
    name: &'static str,
    rows: usize,
    cols: usize,
    rooms: &'static [&'static str],
}

static ROOMS: &[RoomKind] = &[
    RoomKind { name: "taproom", objects: &["long bar", "stone hearth", "ale barrels", "round tables"] },
    RoomKind { name: "kitchen", objects: &["cook fire", "iron cauldron", "hanging herbs", "cutting block"] },
    RoomKind { name: "cellar", objects: &["wine racks", "dusty crates", "a locked chest"] },
    RoomKind { name: "bedroom", objects: &["straw bed", "oak chest", "washbasin"] },
    RoomKind { name: "hall", objects: &["hearth", "dining table", "woven tapestry"] },
    RoomKind { name: "forge floor", objects: &["anvil", "glowing forge", "bellows", "tool rack"] },
    RoomKind { name: "storeroom", objects: &["iron ingots", "crates", "water barrels"] },
];

static BUILDINGS: &[BuildingKind] = &[
    BuildingKind { name: "tavern", rows: 2, cols: 2, rooms: &["taproom", "kitchen", "cellar", "bedroom"] },
    BuildingKind { name: "cottage", rows: 1, cols: 2, rooms: &["hall", "bedroom"] },
    BuildingKind { name: "smithy", rows: 1, cols: 2, rooms: &["forge floor", "storeroom"] },
];

fn room_index(name: &str) -> usize {
    ROOMS.iter().position(|r| r.name == name).unwrap_or(0)
}

// ---- generators: run once, on entry, driven by the catalog ----

/// Subdivides a building's footprint into rooms and wires doors between them.
struct BuildingGen;
impl Unfolder for BuildingGen {
    fn unfold(&self, w: &mut World, id: EntityId) {
        let t = (w.stat(id, "type") as usize).min(BUILDINGS.len() - 1);
        let bk = &BUILDINGS[t];
        w.add_fact(id, format!("a {} of {} rooms", bk.name, bk.rows * bk.cols));

        let (bw, bh) = (w.stat(id, "w"), w.stat(id, "h"));
        let (rw, rh) = (bw / bk.cols as f32, bh / bk.rows as f32);

        let mut grid = vec![vec![0usize; bk.cols]; bk.rows];
        for r in 0..bk.rows {
            for c in 0..bk.cols {
                let name = bk.rooms[(r * bk.cols + c).min(bk.rooms.len() - 1)];
                let room = w.spawn("room", name, id);
                w.set(room, "rk", room_index(name) as f32);
                w.set(room, "gr", r as f32);
                w.set(room, "gc", c as f32);
                w.set(room, "x", c as f32 * rw);
                w.set(room, "y", r as f32 * rh);
                w.set(room, "w", rw);
                w.set(room, "h", rh);
                grid[r][c] = room;
            }
        }
        // Doors between adjacent rooms — the relationship graph in action.
        for r in 0..bk.rows {
            for c in 0..bk.cols {
                if c + 1 < bk.cols {
                    w.link(grid[r][c], grid[r][c + 1], "door", 1.0);
                }
                if r + 1 < bk.rows {
                    w.link(grid[r][c], grid[r + 1][c], "door", 1.0);
                }
            }
        }
    }
}

/// Fills a room with objects appropriate to its kind — on entry.
struct RoomGen;
impl Unfolder for RoomGen {
    fn unfold(&self, w: &mut World, id: EntityId) {
        let rk = (w.stat(id, "rk") as usize).min(ROOMS.len() - 1);
        for (i, obj) in ROOMS[rk].objects.iter().enumerate() {
            let o = w.spawn("object", obj, id);
            w.set(o, "slot", i as f32);
        }
    }
}

fn render_interior(w: &World, b: EntityId) {
    let bk = &BUILDINGS[(w.stat(b, "type") as usize).min(BUILDINGS.len() - 1)];
    println!("\nYou step inside {} — its interior generates on entry ({} rooms):", w.name(b), bk.rows * bk.cols);
    let mut grid = vec![vec![String::new(); bk.cols]; bk.rows];
    let rooms = w.children(b);
    for &room in &rooms {
        let (r, c) = (w.stat(room, "gr") as usize, w.stat(room, "gc") as usize);
        grid[r][c] = w.name(room).to_string();
    }
    let cw = 14;
    let border = format!("  +{}", vec![format!("{}+", "-".repeat(cw)); bk.cols].concat());
    for r in 0..bk.rows {
        println!("{border}");
        let mut line = String::from("  |");
        for c in 0..bk.cols {
            line.push_str(&format!(" {:<w$}|", grid[r][c], w = cw - 1));
        }
        println!("{line}");
    }
    println!("{border}");
    let mut doors = Vec::new();
    for &room in &rooms {
        for n in w.neighbors(room, "door") {
            if room < n {
                doors.push(format!("{} <-> {}", w.name(room), w.name(n)));
            }
        }
    }
    println!("  doors: {}", doors.join(",  "));
}

fn render_room(w: &World, room: EntityId) {
    let items: Vec<String> = w.children(room).iter().map(|&o| format!("• {}", w.name(o))).collect();
    println!("\nYou enter the {} — on load, it holds:  {}", w.name(room), items.join("   "));
}

fn main() {
    let mut w = World::new(42);
    let city = w.spawn("city", "Old Town", w.root);

    // Place buildings on the map — coarse footprints, interiors ungenerated.
    let specs = [("The Prancing Pony", 0, 16.0, 8.0), ("Miller's Cottage", 1, 14.0, 6.0), ("The Smithy", 2, 14.0, 6.0)];
    let mut buildings = Vec::new();
    for (name, ty, wd, ht) in specs {
        let b = w.spawn("building", name, city);
        w.set(b, "type", ty as f32);
        w.set(b, "w", wd);
        w.set(b, "h", ht);
        w.fold(b); // offscreen: on the map, but no interior yet
        buildings.push(b);
    }
    w.set_unfolder("building", Box::new(BuildingGen));
    w.set_unfolder("room", Box::new(RoomGen));

    println!("otherworldOS · spatial unfolding\n");
    println!("Old Town — you see buildings, but not their insides (coarse / not yet entered):");
    for &b in &buildings {
        println!("   ▛▜ {}  (a building; interior ungenerated)", w.name(b));
    }

    // Enter the tavern -> its interior is laid out on entry.
    w.reveal(buildings[0]);
    render_interior(&w, buildings[0]);

    // Enter the taproom -> its contents appear.
    let taproom = w.children(buildings[0])[0];
    w.reveal(taproom);
    render_room(&w, taproom);

    // A different building type -> a different interior, same logic.
    w.reveal(buildings[2]);
    render_interior(&w, buildings[2]);
    let forge = w.children(buildings[2])[0];
    w.reveal(forge);
    render_room(&w, forge);

    println!("\nThe cottage next door? Never entered — so it still has no interior at all.");
    println!("Re-enter the tavern and it's the SAME rooms — the layout is canon now.");
}
