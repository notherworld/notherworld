fn main() {
    let json = std::fs::read_to_string("worlds/city.json").unwrap();
    let mut w = owos_author::build(&json).unwrap();
    let city = *w.by_kind("city").first().unwrap();
    let ds: Vec<usize> = w.children(city).into_iter().filter(|&c| w.kind(c)=="district").collect();
    // most coastal district
    let mut d = ds[0];
    for &c in &ds { if w.stat(c,"shore_frac") > w.stat(d,"shore_frac") { d = c; } }
    w.reveal(d);
    let (wx0,wy0,wx1,wy1)=(w.stat(d,"wx0"),w.stat(d,"wy0"),w.stat(d,"wx1"),w.stat(d,"wy1"));
    let blocks: std::collections::BTreeSet<usize> = w.children(d).into_iter().filter(|&c| w.kind(c)=="block").collect();
    let mut wet=0; let mut total=0;
    for e in w.edges().iter().filter(|e| e.kind=="lane" && !e.dead) {
        if !blocks.contains(&e.from) || !blocks.contains(&e.to) { continue; }
        let (mx,my)=((w.stat(e.from,"bx")+w.stat(e.to,"bx"))/2.0,(w.stat(e.from,"by")+w.stat(e.to,"by"))/2.0);
        let (fx,fy)=(wx0+(wx1-wx0)*mx, wy0+(wy1-wy0)*my);
        total+=1; if w.sample_field("water",fx,fy)>=0.5 { wet+=1; }
    }
    println!("coastal district ({:.0}% shore): {} block-to-block lanes, {} cross water at midpoint, {} footbridges spawned",
        w.stat(d,"shore_frac")*100.0, total, wet, w.by_kind("footbridge").len());
}
