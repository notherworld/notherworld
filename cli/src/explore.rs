//! explore — walk a procedurally-unfolded town. Type commands; buildings,
//! rooms, objects, and their occupants generate lazily ON ENTRY, coherent to
//! type, and stay canon. Everything the generator reads is DATA (the catalogs
//! below) — the authoring layer taking shape. Same reveal/Unfolder/LOD/graph
//! machinery as the nations and building demos, now as something you can play.
//!
//! Run interactively:  cargo run -p owos-cli --bin explore
//! Commands: look · enter <name> · out · who · map · quit

use std::io::{self, BufRead, Write};

use owos_core::engine::{EntityId, Unfolder, World};
use owos_core::Rng;

// ------------------------------- the catalog (DATA) -------------------------------

struct RType {
    key: &'static str,
    objects: &'static [&'static str],
}
struct BType {
    key: &'static str,
    names: &'static [&'static str],
    rows: usize,
    cols: usize,
    rooms: &'static [&'static str],
    occ: &'static [(&'static str, &'static str)], // (role, which room-kind they're in)
}

static RTYPES: &[RType] = &[
    RType { key: "taproom", objects: &["a long oak bar", "a roaring hearth", "ale barrels", "round tables"] },
    RType { key: "kitchen", objects: &["a cook fire", "an iron cauldron", "hanging herbs", "a cutting block"] },
    RType { key: "cellar", objects: &["wine racks", "dusty crates", "a locked chest"] },
    RType { key: "guest room", objects: &["a narrow bed", "a travel chest", "a guttering candle"] },
    RType { key: "hall", objects: &["a hearth", "a plank table", "worn stools"] },
    RType { key: "bedroom", objects: &["a straw bed", "a blanket chest"] },
    RType { key: "forge floor", objects: &["an anvil", "a glowing forge", "a bellows", "a tool rack"] },
    RType { key: "storeroom", objects: &["iron ingots", "crates", "water barrels"] },
    RType { key: "nave", objects: &["rows of pews", "a stone font"] },
    RType { key: "altar", objects: &["a candlelit altar", "an offering bowl"] },
    RType { key: "vestry", objects: &["hanging robes", "a locked reliquary"] },
    RType { key: "shopfront", objects: &["drying herbs", "tincture bottles", "a mortar and pestle"] },
    RType { key: "back room", objects: &["a bubbling still", "jars of strange roots"] },
];

static BTYPES: &[BType] = &[
    BType {
        key: "tavern",
        names: &["The Prancing Pony", "The Green Dragon", "The Broken Tankard"],
        rows: 2,
        cols: 2,
        rooms: &["taproom", "kitchen", "cellar", "guest room"],
        occ: &[("barkeep", "taproom"), ("cook", "kitchen"), ("weary traveler", "guest room")],
    },
    BType {
        key: "cottage",
        names: &["a mossy cottage", "a tidy cottage", "a leaning cottage"],
        rows: 1,
        cols: 2,
        rooms: &["hall", "bedroom"],
        occ: &[("old farmer", "hall")],
    },
    BType {
        key: "smithy",
        names: &["The Anvil & Ember", "the village smithy"],
        rows: 1,
        cols: 2,
        rooms: &["forge floor", "storeroom"],
        occ: &[("blacksmith", "forge floor"), ("apprentice", "forge floor")],
    },
    BType {
        key: "temple",
        names: &["the Shrine of the Tide", "the Old Temple"],
        rows: 1,
        cols: 3,
        rooms: &["nave", "altar", "vestry"],
        occ: &[("priest", "altar"), ("acolyte", "nave")],
    },
    BType {
        key: "apothecary",
        names: &["Mother Rue's shop", "the Herbalist's"],
        rows: 1,
        cols: 2,
        rooms: &["shopfront", "back room"],
        occ: &[("herbalist", "shopfront")],
    },
];

static PEOPLE: &[&str] = &["Bram", "Elsie", "Tomas", "Rue", "Gil", "Mara", "Otho", "Sela", "Doran", "Wyn", "Hale", "Pia"];

fn rtype_idx(key: &str) -> usize {
    RTYPES.iter().position(|r| r.key == key).unwrap_or(0)
}
fn btype_idx(key: &str) -> usize {
    BTYPES.iter().position(|b| b.key == key).unwrap_or(0)
}

// ------------------------------- generators -------------------------------

struct BuildingGen;
impl Unfolder for BuildingGen {
    fn unfold(&self, w: &mut World, id: EntityId) {
        let bt = (w.stat(id, "bt") as usize).min(BTYPES.len() - 1);
        let b = &BTYPES[bt];
        let mut grid = vec![vec![0usize; b.cols]; b.rows];
        for r in 0..b.rows {
            for c in 0..b.cols {
                let key = b.rooms[(r * b.cols + c).min(b.rooms.len() - 1)];
                let room = w.spawn("room", key, id);
                w.set(room, "rt", rtype_idx(key) as f32);
                w.set(room, "gr", r as f32);
                w.set(room, "gc", c as f32);
                grid[r][c] = room;
            }
        }
        for r in 0..b.rows {
            for c in 0..b.cols {
                if c + 1 < b.cols {
                    w.link(grid[r][c], grid[r][c + 1], "door", 1.0);
                }
                if r + 1 < b.rows {
                    w.link(grid[r][c], grid[r + 1][c], "door", 1.0);
                }
            }
        }
        for (i, (role, room_key)) in b.occ.iter().enumerate() {
            let target = w.children(id).into_iter().find(|&rm| RTYPES[w.stat(rm, "rt") as usize].key == *room_key);
            if let Some(rm) = target {
                let name = PEOPLE[(w.entity_seed(id).wrapping_add(i as u64) as usize) % PEOPLE.len()];
                w.spawn("person", &format!("{name} the {role}"), rm);
            }
        }
    }
}

struct RoomGen;
impl Unfolder for RoomGen {
    fn unfold(&self, w: &mut World, id: EntityId) {
        let rt = (w.stat(id, "rt") as usize).min(RTYPES.len() - 1);
        for obj in RTYPES[rt].objects {
            w.spawn("object", obj, id);
        }
    }
}

// ------------------------------- the town -------------------------------

fn build_town(w: &mut World) -> EntityId {
    let city = w.spawn("city", "Saltmarsh", w.root);
    let plan = ["tavern", "smithy", "temple", "apothecary", "cottage", "cottage", "tavern"];
    let mut rng = Rng::new(3);
    for key in plan {
        let bt = btype_idx(key);
        let name = BTYPES[bt].names[(rng.next_u64() as usize) % BTYPES[bt].names.len()];
        let b = w.spawn("building", name, city);
        w.set(b, "bt", bt as f32);
        w.fold(b);
    }
    w.set_unfolder("building", Box::new(BuildingGen));
    w.set_unfolder("room", Box::new(RoomGen));
    city
}

// ------------------------------- views -------------------------------

fn look(w: &World, cur: EntityId) {
    match w.kind(cur) {
        "city" => {
            println!("\nYou stand in the muddy streets of {}. You can see:", w.name(cur));
            for b in w.children(cur) {
                let k = BTYPES[w.stat(b, "bt") as usize].key;
                println!("   • {}  ({k})", w.name(b));
            }
            println!("(`enter <name or type>`, `quit`)");
        }
        "building" => {
            println!("\nYou're inside {}. Rooms:", w.name(cur));
            for rm in w.children(cur) {
                let ppl = w.children(rm).iter().filter(|&&p| w.kind(p) == "person").count();
                let tag = if ppl > 0 { format!("   ({ppl} here)") } else { String::new() };
                println!("   • {}{tag}", w.name(rm));
            }
            println!("(`enter <room>`, `map`, `who`, `out`)");
        }
        "room" => {
            let objs: Vec<_> = w.children(cur).iter().filter(|&&o| w.kind(o) == "object").map(|&o| w.name(o).to_string()).collect();
            let ppl: Vec<_> = w.children(cur).iter().filter(|&&p| w.kind(p) == "person").map(|&p| w.name(p).to_string()).collect();
            println!("\nYou're in the {}.", w.name(cur));
            if !objs.is_empty() {
                println!("   You see: {}.", objs.join(", "));
            }
            if !ppl.is_empty() {
                println!("   Present: {}.", ppl.join(", "));
            }
            println!("(`out`)");
        }
        _ => {}
    }
}

fn render_map(w: &World, b: EntityId) {
    let bt = &BTYPES[w.stat(b, "bt") as usize];
    let mut grid = vec![vec![String::new(); bt.cols]; bt.rows];
    for rm in w.children(b) {
        grid[w.stat(rm, "gr") as usize][w.stat(rm, "gc") as usize] = w.name(rm).to_string();
    }
    let cw = 13;
    let border = format!("  +{}", vec![format!("{}+", "-".repeat(cw)); bt.cols].concat());
    for r in 0..bt.rows {
        println!("{border}");
        let mut ln = String::from("  |");
        for c in 0..bt.cols {
            ln.push_str(&format!(" {:<w$}|", grid[r][c], w = cw - 1));
        }
        println!("{ln}");
    }
    println!("{border}");
}

fn who(w: &World, cur: EntityId) {
    let mut list = Vec::new();
    match w.kind(cur) {
        "room" => {
            for p in w.children(cur) {
                if w.kind(p) == "person" {
                    list.push(w.name(p).to_string());
                }
            }
        }
        "building" => {
            for rm in w.children(cur) {
                for p in w.children(rm) {
                    if w.kind(p) == "person" {
                        list.push(format!("{} (in the {})", w.name(p), w.name(rm)));
                    }
                }
            }
        }
        _ => {}
    }
    if list.is_empty() {
        println!("   No one around.");
    } else {
        println!("   {}", list.join(", "));
    }
}

fn find_child(w: &World, cur: EntityId, target: &str) -> Option<EntityId> {
    w.children(cur).into_iter().find(|&c| {
        let mut hay = w.name(c).to_lowercase();
        if w.kind(c) == "building" {
            hay.push(' ');
            hay.push_str(BTYPES[w.stat(c, "bt") as usize].key);
        }
        hay.contains(target)
    })
}

fn main() {
    let mut w = World::new(42);
    let city = build_town(&mut w);
    let mut cur = city;

    println!("╔═══════════════════════════════════════════════════╗");
    println!("║  otherworldOS · explore Saltmarsh                 ║");
    println!("║  every building unfolds when you walk in            ║");
    println!("╚═══════════════════════════════════════════════════╝");
    look(&w, cur);
    print!("\n> ");
    io::stdout().flush().ok();

    for line in io::stdin().lock().lines() {
        let line = line.unwrap_or_default();
        let line = line.trim();
        let (verb, rest) = line.split_once(' ').unwrap_or((line, ""));
        let rest = rest.trim().to_lowercase();
        match verb.to_lowercase().as_str() {
            "look" | "l" => look(&w, cur),
            "enter" | "go" | "e" => match find_child(&w, cur, &rest) {
                Some(c) => {
                    w.reveal(c);
                    cur = c;
                    look(&w, cur);
                }
                None => println!("   There's nothing like '{rest}' here."),
            },
            "out" | "back" | "o" => match w.parent(cur) {
                Some(p) => {
                    cur = p;
                    look(&w, cur);
                }
                None => println!("   You're already out in the open."),
            },
            "who" => who(&w, cur),
            "map" | "m" => {
                if w.kind(cur) == "building" {
                    render_map(&w, cur);
                } else {
                    println!("   (a map only makes sense inside a building)");
                }
            }
            "quit" | "q" | "exit" => {
                println!("You wander back out of Saltmarsh. It'll be exactly as you left it.");
                break;
            }
            "" => {}
            _ => println!("   Try: look, enter <name>, out, who, map, quit."),
        }
        print!("\n> ");
        io::stdout().flush().ok();
    }
}
