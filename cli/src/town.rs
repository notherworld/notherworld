//! town — the explorer, now DATA-DRIVEN. The entire world is loaded from a JSON
//! file; the engine and generators know nothing about taverns or reactors. Point
//! it at `worlds/saltmarsh.json` and it's a medieval town; point it at
//! `worlds/station.json` and the SAME binary is a space station. That's the
//! authoring layer: define worlds as data, load, walk in.
//!
//!   cargo run -p owos-cli --bin town -- worlds/saltmarsh.json
//!   cargo run -p owos-cli --bin town -- worlds/station.json

use std::io::{self, BufRead, Write};
use std::rc::Rc;

use owos_core::engine::{EntityId, Unfolder, World};
use owos_core::Rng;
use serde::Deserialize;

// ------------------- the world definition (loaded from a file) -------------------

#[derive(Deserialize)]
struct RoomTypeDef {
    key: String,
    objects: Vec<String>,
}

#[derive(Deserialize)]
struct OccDef {
    role: String,
    room: String,
}

#[derive(Deserialize)]
struct BuildingTypeDef {
    key: String,
    names: Vec<String>,
    rows: usize,
    cols: usize,
    rooms: Vec<String>,
    occupants: Vec<OccDef>,
}

#[derive(Deserialize)]
struct WorldDef {
    name: String,
    outer: String,
    people: Vec<String>,
    room_types: Vec<RoomTypeDef>,
    building_types: Vec<BuildingTypeDef>,
    plan: Vec<String>,
}

impl WorldDef {
    fn btype(&self, key: &str) -> Option<usize> {
        self.building_types.iter().position(|b| b.key == key)
    }
    fn rtype(&self, key: &str) -> usize {
        self.room_types.iter().position(|r| r.key == key).unwrap_or(0)
    }
}

// ------------------- generators (read the loaded definition) -------------------

struct BuildingGen {
    def: Rc<WorldDef>,
}
impl Unfolder for BuildingGen {
    fn unfold(&self, w: &mut World, id: EntityId) {
        let bt = w.stat(id, "bt") as usize;
        let b = &self.def.building_types[bt];
        let mut grid = vec![vec![0usize; b.cols]; b.rows];
        for r in 0..b.rows {
            for c in 0..b.cols {
                let key = &b.rooms[(r * b.cols + c).min(b.rooms.len() - 1)];
                let room = w.spawn("room", key, id);
                w.set(room, "rt", self.def.rtype(key) as f32);
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
        for (i, occ) in b.occupants.iter().enumerate() {
            let target = w.children(id).into_iter().find(|&rm| self.def.room_types[w.stat(rm, "rt") as usize].key == occ.room);
            if let Some(rm) = target {
                let name = &self.def.people[(w.entity_seed(id).wrapping_add(i as u64) as usize) % self.def.people.len()];
                w.spawn("person", &format!("{} the {}", name, occ.role), rm);
            }
        }
    }
}

struct RoomGen {
    def: Rc<WorldDef>,
}
impl Unfolder for RoomGen {
    fn unfold(&self, w: &mut World, id: EntityId) {
        let rt = w.stat(id, "rt") as usize;
        for obj in &self.def.room_types[rt].objects {
            w.spawn("object", obj, id);
        }
    }
}

fn build_world(w: &mut World, def: &WorldDef) -> EntityId {
    let city = w.spawn("city", &def.name, w.root);
    let mut rng = Rng::new(7);
    for key in &def.plan {
        if let Some(bt) = def.btype(key) {
            let names = &def.building_types[bt].names;
            let name = &names[(rng.next_u64() as usize) % names.len()];
            let b = w.spawn("building", name, city);
            w.set(b, "bt", bt as f32);
            w.fold(b);
        }
    }
    city
}

// ------------------- views -------------------

fn look(w: &World, def: &WorldDef, cur: EntityId) {
    match w.kind(cur) {
        "city" => {
            println!("\nYou are in {}. Around you:", def.outer);
            for b in w.children(cur) {
                let k = &def.building_types[w.stat(b, "bt") as usize].key;
                println!("   • {}  ({k})", w.name(b));
            }
            println!("(`enter <name or type>`, `quit`)");
        }
        "building" => {
            println!("\nYou're inside {}. Areas:", w.name(cur));
            for rm in w.children(cur) {
                let ppl = w.children(rm).iter().filter(|&&p| w.kind(p) == "person").count();
                let tag = if ppl > 0 { format!("   ({ppl} here)") } else { String::new() };
                println!("   • {}{tag}", w.name(rm));
            }
            println!("(`enter <area>`, `map`, `who`, `out`)");
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

fn render_map(w: &World, def: &WorldDef, b: EntityId) {
    let bt = &def.building_types[w.stat(b, "bt") as usize];
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
    println!("   {}", if list.is_empty() { "No one around.".to_string() } else { list.join(", ") });
}

fn find_child(w: &World, def: &WorldDef, cur: EntityId, target: &str) -> Option<EntityId> {
    w.children(cur).into_iter().find(|&c| {
        let mut hay = w.name(c).to_lowercase();
        if w.kind(c) == "building" {
            hay.push(' ');
            hay.push_str(&def.building_types[w.stat(c, "bt") as usize].key);
        }
        hay.contains(target)
    })
}

fn main() {
    let path = std::env::args().nth(1).unwrap_or_else(|| "worlds/saltmarsh.json".to_string());
    let text = match std::fs::read_to_string(&path) {
        Ok(t) => t,
        Err(e) => {
            eprintln!("could not read world file '{path}': {e}");
            return;
        }
    };
    let def: WorldDef = match serde_json::from_str(&text) {
        Ok(d) => d,
        Err(e) => {
            eprintln!("invalid world file '{path}': {e}");
            return;
        }
    };
    let def = Rc::new(def);

    let mut w = World::new(42);
    let city = build_world(&mut w, &def);
    w.set_unfolder("building", Box::new(BuildingGen { def: Rc::clone(&def) }));
    w.set_unfolder("room", Box::new(RoomGen { def: Rc::clone(&def) }));

    println!("otherworldOS · loaded world from {path}");
    let mut cur = city;
    look(&w, &def, cur);
    print!("\n> ");
    io::stdout().flush().ok();

    for line in io::stdin().lock().lines() {
        let line = line.unwrap_or_default();
        let line = line.trim();
        let (verb, rest) = line.split_once(' ').unwrap_or((line, ""));
        let rest = rest.trim().to_lowercase();
        match verb.to_lowercase().as_str() {
            "look" | "l" => look(&w, &def, cur),
            "enter" | "go" | "e" => match find_child(&w, &def, cur, &rest) {
                Some(c) => {
                    w.reveal(c);
                    cur = c;
                    look(&w, &def, cur);
                }
                None => println!("   Nothing like '{rest}' here."),
            },
            "out" | "back" | "o" => match w.parent(cur) {
                Some(p) => {
                    cur = p;
                    look(&w, &def, cur);
                }
                None => println!("   You're already outside."),
            },
            "who" => who(&w, cur),
            "map" | "m" => {
                if w.kind(cur) == "building" {
                    render_map(&w, &def, cur);
                } else {
                    println!("   (a map only makes sense inside a building)");
                }
            }
            "quit" | "q" | "exit" => break,
            "" => {}
            _ => println!("   Try: look, enter <name>, out, who, map, quit."),
        }
        print!("\n> ");
        io::stdout().flush().ok();
    }
}
