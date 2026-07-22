use owos_core::engine::World;
fn build(style: &str, weighted: bool) -> World {
    let w = if weighted { r#""weight":"wt","# } else { "" };
    let wt = if weighted { r#""wt":"1 + floor(rand(5)*rand(5)*6)","# } else { "" };
    let json = format!(r#"{{
      "rng_seed": 4,
      "seed": [{{ "kind":"space","name":"Space","reveal":true }}],
      "generators": [
        {{ "on":"space","spawn":"cell","count":"12",
           "partition": {{ "style":"{style}", "edge":"adj", "x":"px", "y":"py", {w} "junk":"" }},
           "child_stats": {{ {wt} "px":"0.1+0.8*rand(1)", "py":"0.1+0.8*rand(2)" }} }}
      ]
    }}"#);
    owos_author::build(&json).unwrap()
}
fn main() {
    let w = build("subdivide", true);
    let cells = w.by_kind("cell");
    // verify perfect tiling: sum of rect areas == 1.0
    let area: f32 = cells.iter().map(|&c| w.stat(c,"w")*w.stat(c,"h")).sum();
    println!("SUBDIVIDE: {} cells, total area = {:.4} (1.0 = perfect tile, no gaps)", cells.len(), area);
    let edges = w.edges().iter().filter(|e| e.kind=="adj" && !e.dead).count();
    println!("adjacency edges: {}", edges);
    println!("cell sizes (masonry — varied):");
    let mut sizes: Vec<f32> = cells.iter().map(|&c| w.stat(c,"w")*w.stat(c,"h")).collect();
    sizes.sort_by(|a,b| b.partial_cmp(a).unwrap());
    for (i,s) in sizes.iter().enumerate() { print!("{:.3} ", s); if i==5 {println!();} }
    println!();
}
