fn main() {
    let json = std::fs::read_to_string("worlds/city.json").unwrap();
    let mut w = owos_author::build(&json).unwrap();
    let city = *w.by_kind("city").first().unwrap();
    let ds: Vec<usize> = w.children(city).into_iter().filter(|&c| w.kind(c)=="district").collect();
    for &d in &ds { w.reveal(d); }
    let heat0: Vec<f32> = ds.iter().map(|&d| w.stat(d,"heat")).collect();
    for _ in 0..30 { w.step(); }
    println!("district      heat t0 -> t30   (downtown hot should warm its neighbors)");
    for (i,&d) in ds.iter().enumerate() {
        let ring = if w.stat(d,"ring") < 0.5 { "DOWNTOWN" } else { "" };
        println!("{:<11} {:.2} -> {:.2}  {}", w.name(d), heat0[i], w.stat(d,"heat"), ring);
    }
}
