//! A tiny expression language — so BEHAVIORS are data, not code.
//!
//! A rule is a formula string authored in a data file: `discontent + 0.3*(fear -
//! discontent)`. The engine parses it once and evaluates it each tick against an
//! entity's stats. Idents are the entity's own stats; `parent.NAME` reaches up a
//! scale. Functions: clamp/min/max/abs. This is the "lego" — you compose worlds
//! by stacking these rules in the data, never by editing Rust.

use super::entity::EntityId;
use super::world::World;

#[derive(Clone, Debug)]
pub enum Expr {
    Num(f32),
    Stat(String),
    Parent(String),
    /// `target.NAME` — a stat on the OTHER entity in an interaction (the one being
    /// acted upon). Resolves to 0 outside an interaction context.
    Target(String),
    Neg(Box<Expr>),
    Bin(char, Box<Expr>, Box<Expr>),
    Call(String, Vec<Expr>),
}

impl Expr {
    pub fn eval(&self, w: &World, id: EntityId) -> f32 {
        self.eval_with(w, id, None)
    }

    /// Evaluate with an optional `other` entity in scope. Bare idents are `id`'s
    /// stats, `parent.X` reaches up from `id`, and `target.X` reads the `other`
    /// entity — so an interaction formula can factor in the entity it's acting on.
    pub fn eval_with(&self, w: &World, id: EntityId, other: Option<EntityId>) -> f32 {
        match self {
            Expr::Num(n) => *n,
            Expr::Stat(s) => w.stat(id, s),
            Expr::Parent(s) => w.parent(id).map(|p| w.stat(p, s)).unwrap_or(0.0),
            Expr::Target(s) => other.map(|o| w.stat(o, s)).unwrap_or(0.0),
            Expr::Neg(e) => -e.eval_with(w, id, other),
            Expr::Bin(op, a, b) => {
                let (x, y) = (a.eval_with(w, id, other), b.eval_with(w, id, other));
                match op {
                    '+' => x + y,
                    '-' => x - y,
                    '*' => x * y,
                    '/' => {
                        if y != 0.0 {
                            x / y
                        } else {
                            0.0
                        }
                    }
                    _ => 0.0,
                }
            }
            Expr::Call(f, args) => match f.as_str() {
                // Aggregate over this entity's children.
                "child_count" => w.children(id).len() as f32,
                "child_sum" | "child_mean" | "child_max" | "child_min" => {
                    let stat = arg_ident(args, 0);
                    let vals: Vec<f32> = w.children(id).iter().map(|&c| w.stat(c, &stat)).collect();
                    reduce(f, &vals)
                }
                // Aggregate over CO-LOCATED peers (same parent = same place/room).
                // Topological proximity without pre-wired edges — "who is here".
                "here_count" => w.siblings(id).len() as f32,
                "here_sum" | "here_mean" | "here_max" | "here_min" => {
                    let stat = arg_ident(args, 0);
                    let vals: Vec<f32> = w.siblings(id).iter().map(|&s| w.stat(s, &stat)).collect();
                    reduce(f, &vals)
                }
                // "Sometimes": deterministic per (entity, tick) so replays match.
                // An optional salt arg draws INDEPENDENT values within one tick —
                // rand(1), rand(2), … differ, so a generator can roll a whole
                // personality (skill, nerve, humor…) from one entity in one pass.
                "rand" => {
                    let salt = args.first().map(|a| a.eval_with(w, id, other) as i64 as u64).unwrap_or(0);
                    hashf(w.entity_seed(id) ^ w.tick ^ salt.wrapping_mul(0x9E37_79B9_7F4A_7C15))
                }
                "chance" => {
                    let p = args.first().map(|a| a.eval_with(w, id, other)).unwrap_or(0.0);
                    let salt = args.get(1).map(|a| a.eval_with(w, id, other) as i64 as u64).unwrap_or(0);
                    (hashf(w.entity_seed(id) ^ w.tick ^ salt.wrapping_mul(0x9E37_79B9_7F4A_7C15)) < p) as i32 as f32
                }
                // sample a named FIELD at an arbitrary point (layered worlds):
                // e.g. a child reads its terrain height: field(elevation, cx, cy).
                "field" => {
                    let name = arg_ident(args, 0);
                    let ex = args.get(1).map(|a| a.eval_with(w, id, other)).unwrap_or(0.0);
                    let ey = args.get(2).map(|a| a.eval_with(w, id, other)).unwrap_or(0.0);
                    w.sample_field(&name, ex, ey)
                }
                "noise" => {
                    let ex = args.first().map(|a| a.eval_with(w, id, other)).unwrap_or(0.0);
                    let ey = args.get(1).map(|a| a.eval_with(w, id, other)).unwrap_or(0.0);
                    value_noise(w.base_seed_pub(), ex, ey)
                }
                "edge_count" => w.neighbor_count(id, &arg_ident(args, 0)) as f32,
                "edge_sum" | "edge_mean" | "edge_max" | "edge_min" => {
                    let (kind, stat) = (arg_ident(args, 0), arg_ident(args, 1));
                    let vals: Vec<f32> = w.neighbors(id, &kind).iter().map(|&n| w.stat(n, &stat)).collect();
                    reduce(f, &vals)
                }
                // Plain numeric functions.
                _ => {
                    let v: Vec<f32> = args.iter().map(|a| a.eval_with(w, id, other)).collect();
                    match (f.as_str(), v.as_slice()) {
                        ("clamp", [x, lo, hi]) => x.clamp(*lo, *hi),
                        ("min", [a, b]) => a.min(*b),
                        ("max", [a, b]) => a.max(*b),
                        ("abs", [a]) => a.abs(),
                        // geometry/periodic: needed for real spatial layout (place a
                        // district on a ring, angle a street) computed AS DATA.
                        ("sin", [a]) => a.sin(),
                        ("cos", [a]) => a.cos(),
                        ("sqrt", [a]) => a.max(0.0).sqrt(),
                        ("floor", [a]) => a.floor(),
                        ("mod", [a, b]) => {
                            if *b != 0.0 { a - b * (a / b).floor() } else { 0.0 }
                        }
                        ("pi", []) => std::f32::consts::PI,
                        // comparisons return 1.0 / 0.0; iff(c, a, b) chooses.
                        ("gt", [a, b]) => (*a > *b) as i32 as f32,
                        ("lt", [a, b]) => (*a < *b) as i32 as f32,
                        ("ge", [a, b]) => (*a >= *b) as i32 as f32,
                        ("le", [a, b]) => (*a <= *b) as i32 as f32,
                        ("eq", [a, b]) => ((*a - *b).abs() < 1e-6) as i32 as f32,
                        // region algebra (also available in entity formulas)
                        ("and", [a, b]) => a.min(*b),
                        ("or", [a, b]) => a.max(*b),
                        ("not", [a]) => (1.0 - a).clamp(0.0, 1.0),
                        ("sub", [a, b]) => (a.min(1.0 - b)).clamp(0.0, 1.0),
                        ("xor", [a, b]) => (a - b).abs(),
                        ("iff", [c, a, b]) => {
                            if *c > 0.5 {
                                *a
                            } else {
                                *b
                            }
                        }
                        _ => 0.0,
                    }
                }
            },
        }
    }
}

impl Expr {
    /// Evaluate this expression as a FIELD at point (x,y): `fx`→x, `fy`→y, and
    /// `field(name, ex, ey)` samples another named field at (ex,ey). No entity is
    /// involved — this is a pure continuous scalar over space (elevation, moisture).
    /// `noise(ex, ey)` gives deterministic value-noise for organic terrain.
    pub fn sample(&self, w: &World, x: f32, y: f32) -> f32 {
        self.sample_for(w, None, x, y)
    }

    /// `sample`, with a MOVER: bare idents that aren't `fx`/`fy` resolve to the
    /// mover entity's stats. This is what lets a pathfinding COST FIELD read the
    /// traveller's own personality — `1 + 9*field(danger,fx,fy)*(1-courage)` costs
    /// a timid mover dearly through danger and a brave one almost nothing. The
    /// same formula, different souls, different paths.
    pub fn sample_for(&self, w: &World, mover: Option<super::entity::EntityId>, x: f32, y: f32) -> f32 {
        match self {
            Expr::Num(n) => *n,
            Expr::Stat(s) => match s.as_str() {
                "fx" => x,
                "fy" => y,
                _ => mover.map(|m| w.stat(m, s)).unwrap_or(0.0),
            },
            Expr::Parent(_) | Expr::Target(_) => 0.0,
            Expr::Neg(e) => -e.sample_for(w, mover, x, y),
            Expr::Bin(op, a, b) => {
                let (u, v) = (a.sample_for(w, mover, x, y), b.sample_for(w, mover, x, y));
                match op {
                    '+' => u + v,
                    '-' => u - v,
                    '*' => u * v,
                    '/' => if v != 0.0 { u / v } else { 0.0 },
                    _ => 0.0,
                }
            }
            Expr::Call(f, args) => match f.as_str() {
                // sample another field at an arbitrary point
                "field" => {
                    let name = arg_ident(args, 0);
                    let ex = args.get(1).map(|a| a.sample_for(w, mover, x, y)).unwrap_or(x);
                    let ey = args.get(2).map(|a| a.sample_for(w, mover, x, y)).unwrap_or(y);
                    w.sample_field(&name, ex, ey)
                }
                // deterministic smooth value-noise in [0,1) — organic terrain
                "noise" => {
                    let ex = args.first().map(|a| a.sample_for(w, mover, x, y)).unwrap_or(x);
                    let ey = args.get(1).map(|a| a.sample_for(w, mover, x, y)).unwrap_or(y);
                    value_noise(w.base_seed_pub(), ex, ey)
                }
                // near(name, radius): 1 if the field `name` is "inside" (≥0.5) anywhere
                // within `radius` of this point — a spatial BUFFER (coastlines, blast
                // radii, catchments). Region-algebra op that needs to sample around.
                "near" => {
                    let name = arg_ident(args, 0);
                    let radius = args.get(1).map(|a| a.sample_for(w, mover, x, y)).unwrap_or(0.05);
                    let mut hit = 0.0f32;
                    let rings = 3;
                    for ri in 1..=rings {
                        let r = radius * ri as f32 / rings as f32;
                        for s in 0..8 {
                            let a = (s as f32 / 8.0) * std::f32::consts::TAU;
                            let v = w.sample_field(&name, (x + r * a.cos()).clamp(0.0, 1.0), (y + r * a.sin()).clamp(0.0, 1.0));
                            if v >= 0.5 { hit = 1.0; }
                        }
                    }
                    hit
                }
                // road_near(width): 1 if within `width` of any laid road segment, else
                // 0 — a REGION. The engine has every road's world geometry (world_roads);
                // this makes it subtractable land, so a block carves plots from
                // `sub(buildable, road_near(w))` and nothing builds on an artery. Sampled
                // in WORLD coords (x,y already patch-remapped when called via a field), so
                // a district's road is correctly "here" inside a block. Meaning-agnostic:
                // the engine reports proximity to a route; the dev decides what it forbids.
                "road_near" => {
                    let width = args.first().map(|a| a.sample_for(w, mover, x, y)).unwrap_or(0.01);
                    if w.road_dist_world(x, y) < width { 1.0 } else { 0.0 }
                }
                // otherwise reuse the numeric-function handling by sampling args
                _ => {
                    let v: Vec<f32> = args.iter().map(|a| a.sample_for(w, mover, x, y)).collect();
                    numeric_fn(f, &v)
                }
            },
        }
    }
}

/// Smooth deterministic value-noise in [0,1). Bilinear-interpolated hashed lattice —
/// enough for terrain heightmaps; same seed+point → same value forever.
fn value_noise(seed: u64, x: f32, y: f32) -> f32 {
    let s = 5.0; // lattice frequency
    let (px, py) = (x * s, y * s);
    let (x0, y0) = (px.floor(), py.floor());
    let (fx, fy) = (px - x0, py - y0);
    let corner = |ix: f32, iy: f32| -> f32 {
        let h = seed
            ^ (ix as i64 as u64).wrapping_mul(0x9E37_79B9_7F4A_7C15)
            ^ (iy as i64 as u64).wrapping_mul(0x85EB_CA6B_0000_0001);
        hashf(h)
    };
    let (sx, sy) = (fx * fx * (3.0 - 2.0 * fx), fy * fy * (3.0 - 2.0 * fy)); // smoothstep
    let n00 = corner(x0, y0);
    let n10 = corner(x0 + 1.0, y0);
    let n01 = corner(x0, y0 + 1.0);
    let n11 = corner(x0 + 1.0, y0 + 1.0);
    let a = n00 + (n10 - n00) * sx;
    let b = n01 + (n11 - n01) * sx;
    a + (b - a) * sy
}

/// The plain numeric functions, shared by entity-eval and field-sample.
fn numeric_fn(f: &str, v: &[f32]) -> f32 {
    match (f, v) {
        ("clamp", [x, lo, hi]) => x.clamp(*lo, *hi),
        ("min", [a, b]) => a.min(*b),
        ("max", [a, b]) => a.max(*b),
        ("abs", [a]) => a.abs(),
        ("sin", [a]) => a.sin(),
        ("cos", [a]) => a.cos(),
        ("sqrt", [a]) => a.max(0.0).sqrt(),
        ("floor", [a]) => a.floor(),
        ("mod", [a, b]) => if *b != 0.0 { a - b * (a / b).floor() } else { 0.0 },
        ("pi", []) => std::f32::consts::PI,
        ("gt", [a, b]) => (*a > *b) as i32 as f32,
        ("lt", [a, b]) => (*a < *b) as i32 as f32,
        ("ge", [a, b]) => (*a >= *b) as i32 as f32,
        ("le", [a, b]) => (*a <= *b) as i32 as f32,
        ("eq", [a, b]) => ((*a - *b).abs() < 1e-6) as i32 as f32,
        ("iff", [c, a, b]) => if *c > 0.5 { *a } else { *b },
        // ---- REGION ALGEBRA: any value is a region (≥0.5 = inside). These compose
        // fields/masks/gates with set logic, across data types. buildable = and(land,
        // not(steep)); contested = and(factionA, factionB); coast = and(land, near…).
        ("and", [a, b]) => a.min(*b),           // ∩ intersect (fuzzy: min)
        ("or", [a, b]) => a.max(*b),            // ∪ union     (fuzzy: max)
        ("not", [a]) => (1.0 - a).clamp(0.0, 1.0), // ¬ invert
        ("sub", [a, b]) => (a.min(1.0 - b)).clamp(0.0, 1.0), // A − B  (A and not B)
        ("xor", [a, b]) => (a - b).abs(),       // symmetric difference
        _ => 0.0,
    }
}

/// Public stable [0,1) hash from a seed + salt — used by river source picking etc.
pub fn sample_hash(seed: u64, salt: usize) -> f32 {
    hashf(seed ^ (salt as u64).wrapping_mul(0x9E37_79B9_7F4A_7C15))
}

/// A stable pseudo-random f32 in [0,1) from a seed (splitmix64-ish).
fn hashf(seed: u64) -> f32 {
    let mut z = seed.wrapping_add(0x9E37_79B9_7F4A_7C15);
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    z ^= z >> 31;
    (z >> 40) as f32 / (1u64 << 24) as f32
}

/// The stat/kind NAME an aggregation arg refers to (a bare ident parses to Stat).
fn arg_ident(args: &[Expr], i: usize) -> String {
    match args.get(i) {
        Some(Expr::Stat(s)) => s.clone(),
        _ => String::new(),
    }
}

fn reduce(f: &str, vals: &[f32]) -> f32 {
    if vals.is_empty() {
        return 0.0;
    }
    if f.ends_with("sum") {
        vals.iter().sum()
    } else if f.ends_with("mean") {
        vals.iter().sum::<f32>() / vals.len() as f32
    } else if f.ends_with("max") {
        vals.iter().copied().fold(f32::NEG_INFINITY, f32::max)
    } else if f.ends_with("min") {
        vals.iter().copied().fold(f32::INFINITY, f32::min)
    } else {
        0.0
    }
}

/// A behavior authored as data: for each entity of `on_kind`, set `set_stat` to
/// the result of `expr` each tick.
pub struct Rule {
    pub on_kind: String,
    pub set_stat: String,
    pub expr: Expr,
}

// ---- tokenizer + recursive-descent parser ----

#[derive(Clone, Debug, PartialEq)]
enum Tok {
    Num(f32),
    Ident(String),
    Op(char),
    LP,
    RP,
    Comma,
}

fn lex(s: &str) -> Result<Vec<Tok>, String> {
    let b: Vec<char> = s.chars().collect();
    let mut i = 0;
    let mut out = Vec::new();
    while i < b.len() {
        let c = b[i];
        if c.is_whitespace() {
            i += 1;
        } else if c.is_ascii_digit() || c == '.' {
            let start = i;
            while i < b.len() && (b[i].is_ascii_digit() || b[i] == '.') {
                i += 1;
            }
            let num: f32 = b[start..i].iter().collect::<String>().parse().map_err(|_| "bad number".to_string())?;
            out.push(Tok::Num(num));
        } else if c.is_alphabetic() || c == '_' {
            let start = i;
            while i < b.len() && (b[i].is_alphanumeric() || b[i] == '_' || b[i] == '.') {
                i += 1;
            }
            out.push(Tok::Ident(b[start..i].iter().collect()));
        } else {
            match c {
                '+' | '-' | '*' | '/' => out.push(Tok::Op(c)),
                '(' => out.push(Tok::LP),
                ')' => out.push(Tok::RP),
                ',' => out.push(Tok::Comma),
                _ => return Err(format!("unexpected char '{c}'")),
            }
            i += 1;
        }
    }
    Ok(out)
}

struct P {
    toks: Vec<Tok>,
    i: usize,
}
impl P {
    fn peek(&self) -> Option<&Tok> {
        self.toks.get(self.i)
    }
    fn next(&mut self) -> Option<Tok> {
        let t = self.toks.get(self.i).cloned();
        self.i += 1;
        t
    }
    fn expr(&mut self) -> Result<Expr, String> {
        let mut left = self.term()?;
        while let Some(Tok::Op(op)) = self.peek() {
            let op = *op;
            if op == '+' || op == '-' {
                self.i += 1;
                let right = self.term()?;
                left = Expr::Bin(op, Box::new(left), Box::new(right));
            } else {
                break;
            }
        }
        Ok(left)
    }
    fn term(&mut self) -> Result<Expr, String> {
        let mut left = self.factor()?;
        while let Some(Tok::Op(op)) = self.peek() {
            let op = *op;
            if op == '*' || op == '/' {
                self.i += 1;
                let right = self.factor()?;
                left = Expr::Bin(op, Box::new(left), Box::new(right));
            } else {
                break;
            }
        }
        Ok(left)
    }
    fn factor(&mut self) -> Result<Expr, String> {
        if let Some(Tok::Op('-')) = self.peek() {
            self.i += 1;
            return Ok(Expr::Neg(Box::new(self.factor()?)));
        }
        self.primary()
    }
    fn primary(&mut self) -> Result<Expr, String> {
        match self.next() {
            Some(Tok::Num(n)) => Ok(Expr::Num(n)),
            Some(Tok::LP) => {
                let e = self.expr()?;
                match self.next() {
                    Some(Tok::RP) => Ok(e),
                    _ => Err("expected )".into()),
                }
            }
            Some(Tok::Ident(name)) => {
                if let Some(Tok::LP) = self.peek() {
                    self.i += 1;
                    let mut args = Vec::new();
                    if let Some(Tok::RP) = self.peek() {
                        self.i += 1;
                    } else {
                        loop {
                            args.push(self.expr()?);
                            match self.next() {
                                Some(Tok::Comma) => continue,
                                Some(Tok::RP) => break,
                                _ => return Err("expected , or )".into()),
                            }
                        }
                    }
                    Ok(Expr::Call(name, args))
                } else if let Some(rest) = name.strip_prefix("parent.") {
                    Ok(Expr::Parent(rest.to_string()))
                } else if let Some(rest) = name.strip_prefix("target.") {
                    Ok(Expr::Target(rest.to_string()))
                } else {
                    Ok(Expr::Stat(name))
                }
            }
            other => Err(format!("unexpected token {other:?}")),
        }
    }
}

pub fn parse(s: &str) -> Result<Expr, String> {
    let toks = lex(s)?;
    let mut p = P { toks, i: 0 };
    let e = p.expr()?;
    if p.i != p.toks.len() {
        return Err("trailing tokens in formula".into());
    }
    Ok(e)
}
