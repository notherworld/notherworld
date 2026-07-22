// Verify fill/split/count: reveal, settle, show per-building fill+split by use, and
// building counts per block (should scale to area now, fewer on small blocks).
fn main(){
  let json=std::fs::read_to_string("worlds/city.json").unwrap();
  let mut w=owos_author::build(&json).unwrap();
  let names=["resi","shop","cafe","clinic","school","office"];
  let city=w.by_kind("city")[0];
  for &d in &w.children(city){ if w.kind(d)=="district"{ w.reveal(d);
    for &b in &w.children(d){ if w.kind(b)=="block"{ w.reveal(b); }}}}
  for _ in 0..14 { w.step(); }
  // counts per block vs block area
  println!("building count vs block area:");
  let mut shown=0;
  for d in w.by_kind("district"){ for b in w.children(d).into_iter().filter(|&b|w.kind(b)=="block"){
    let n=w.children(b).into_iter().filter(|&c|w.kind(c)=="building").count();
    if shown<10 { println!("  {} area {:.3} -> {} buildings", w.name(b), w.stat(b,"area"), n); shown+=1; }
  }}
  // fill/split by use
  let mut byuse:[(f32,f32,i32);6]=[(0.0,0.0,0);6];
  for bd in w.by_kind("building"){ let u=(w.stat(bd,"use")as usize).min(5);
    byuse[u].0+=w.stat(bd,"fill"); byuse[u].1+=w.stat(bd,"split"); byuse[u].2+=1; }
  println!("\navg fill / avg split by use:");
  for i in 0..6 { if byuse[i].2>0 { println!("  {:<7} fill {:.2}  split {:.2}  (n={})",
    names[i], byuse[i].0/byuse[i].2 as f32, byuse[i].1/byuse[i].2 as f32, byuse[i].2); } }
  let splits=w.by_kind("building").iter().filter(|&&b|w.stat(b,"split")>1.5).count();
  println!("\nbuildings that SPLIT (2+ footprints): {}", splits);
}
