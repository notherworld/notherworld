//! dive — the block-level test harness. The plain `live` driver never dives, so
//! blocks (and the people who live in them) never reveal. `dive` mirrors what the
//! Atlas camera does on a dive: reveal the city → a district → ALL its blocks,
//! which fires the block→person generators, then steps the sim and reports the
//! people living their day. This is how you honestly test block-scoped templates
//! (person/schedule/venue/…) IN the real Atlas world, not just a flat probe.
//!
//! Usage:  cargo run --release --bin dive -- portal/src/atlas/world.json 300 person

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let path = args.get(1).cloned().unwrap_or_else(|| "portal/src/atlas/world.json".to_string());
    let ticks: usize = args.get(2).and_then(|s| s.parse().ok()).unwrap_or(300);
    let watch = args.get(3).cloned().unwrap_or_else(|| "person".to_string());

    let json = std::fs::read_to_string(&path).unwrap_or_else(|e| {
        eprintln!("cannot read {path}: {e}");
        std::process::exit(1);
    });
    let mut w = match owos_author::build(&json) {
        Ok(w) => w,
        Err(e) => {
            eprintln!("build error in {path}:\n  {e}");
            std::process::exit(1);
        }
    };
    w.record(true);
    w.watch(&watch);

    // Dive: city is already reveal:true. Reveal every district (spawns its
    // blocks), then reveal every block (spawns people/venues/buildings). Same
    // calls the browser makes on a click-dive. Works on flat probe worlds too
    // (blocks straight under the city, no district layer).
    let city = *w.by_kind("city").first().expect("no city in world");
    for d in w.by_kind("district") {
        w.reveal(d);
    }
    let mut revealed_blocks = 0usize;
    for b in w.by_kind("block") {
        w.reveal(b);
        revealed_blocks += 1;
    }
    let people0 = w.active_by_kind(&watch).len();
    println!("otherworldOS · dive — {path}");
    println!("  dived city → district → {revealed_blocks} blocks · {people0} {watch} came alive\n");

    // Track each venue's PEAK crowd per night — the emergence gate. If two
    // identical venues split evenly every night it's a script; if crowds pile
    // lopsided and the winner FLIPS night to night, that's symmetry-breaking.
    let venues = w.by_kind("venue");
    let nv = venues.len();
    let mut night_hosted: Vec<Vec<i64>> = Vec::new(); // [night][venue] = guest-ticks
    let mut night_qual:   Vec<Vec<f32>> = Vec::new();  // [night][venue] = food_quality
    let mut night_ranout: Vec<Vec<bool>> = Vec::new(); // [night][venue] = ran out of stock
    let mut cur_hosted = vec![0i64; nv];
    let mut cur_qual   = vec![0f32; nv];
    let mut cur_ranout = vec![false; nv];
    let mut last_day = w.stat(city, "day") as i32;
    // Capture the first night a venue runs dry, hour-by-hour, to SEE the migration.
    let mut cur_trace: Vec<(f32, Vec<i32>)> = Vec::new();
    let mut example: Option<(usize, Vec<(f32, Vec<i32>)>)> = None;
    let mut last_hr = -1i32;

    // COMMUTE COHORT — track when a handful of people LEAVE for work and ARRIVE,
    // against their own computed leave_h, to see the emergent variation.
    let cohort: Vec<usize> = w.active_by_kind(&watch).into_iter().take(8).collect();
    // per person: (commute, diligence, leave_h, left@hour, arrived@hour)
    let mut commute: std::collections::BTreeMap<usize, (f32, f32, f32, f32, f32)> = std::collections::BTreeMap::new();
    for &p in &cohort {
        commute.insert(p, (w.stat(p, "commute"), w.stat(p, "diligence"), w.stat(p, "leave_h"), -1.0, -1.0));
    }

    // Sample a person and the city clock across the run.
    let sample = w.active_by_kind(&watch).first().copied();
    for t in 0..ticks {
        w.step();
        // record commute leave/arrival on day 1 (a settled day, home→work)
        {
            let day1 = w.stat(city, "day") as i32 == 1;
            let hour = w.stat(city, "hour");
            for &p in &cohort {
                if let Some(e) = commute.get_mut(&p) {
                    if day1 && hour > 6.0 && hour < 14.0 {
                        let heading_to_work = (w.stat(p, "at") - 1.0).abs() < 0.5;   // at == 1
                        if e.3 < 0.0 && heading_to_work && w.stat(p, "dist_job") > 0.06 { e.3 = hour; }
                        if e.4 < 0.0 && heading_to_work && w.stat(p, "dist_job") < 0.07 && e.3 > 0.0 { e.4 = hour; }
                    }
                }
            }
        }
        // roll the nightly peak buckets at each day boundary
        let day_now = w.stat(city, "day") as i32;
        if day_now != last_day {
            if cur_ranout.iter().any(|&r| r) && example.is_none() {
                example = Some((night_hosted.len(), cur_trace.clone()));
            }
            night_hosted.push(cur_hosted.clone());
            night_qual.push(cur_qual.clone());
            night_ranout.push(cur_ranout.clone());
            cur_hosted = vec![0; nv];
            cur_ranout = vec![false; nv];
            cur_trace.clear();
            last_hr = -1;
            last_day = day_now;
        }
        for (vi, &v) in venues.iter().enumerate() {
            cur_hosted[vi] += w.stat(v, "crowd") as i64;
            cur_qual[vi] = w.stat(v, "food_quality");
            if w.stat(v, "is_open") > 0.5 && w.stat(v, "stock") < 0.5 { cur_ranout[vi] = true; }
        }
        let hr = w.stat(city, "hour").floor() as i32;
        if hr != last_hr && (17..24).contains(&hr) {
            cur_trace.push((w.stat(city, "hour"), venues.iter().map(|&v| w.stat(v, "crowd") as i32).collect()));
            last_hr = hr;
        }
        if t % (ticks / 8).max(1) == 0 {
            let hour = w.stat(city, "hour");
            let day = w.stat(city, "day");
            let n = w.active_by_kind(&watch).len();
            let mean_e: f32 = if n > 0 {
                w.active_by_kind(&watch).iter().map(|&i| w.stat(i, "energy")).sum::<f32>() / n as f32
            } else { 0.0 };
            let (at, px, py, tx, ty) = match sample {
                Some(s) => (w.stat(s, "at"), w.stat(s, "px"), w.stat(s, "py"), w.stat(s, "tx"), w.stat(s, "ty")),
                None => (0.0, 0.0, 0.0, 0.0, 0.0),
            };
            let dist = ((px - tx).powi(2) + (py - ty).powi(2)).sqrt();
            let where_ = ["home", "work", "out", "eatery", "venue"].get(at as usize).copied().unwrap_or("?");
            // Any venues? show each venue's live state — the emergence gate.
            let crowds: String = venues.iter()
                .map(|&v| format!("{}[crowd {} appeal {:.2} stock {:.0} word {:.2}]",
                    w.name(v), w.stat(v, "crowd") as i32, w.stat(v, "appeal_now"),
                    w.stat(v, "stock"), w.stat(v, "word")))
                .collect::<Vec<_>>().join(" ");
            let tail = if crowds.is_empty() { String::new() } else { format!("\n         {crowds}") };
            println!(
                "  d{day:.0} {hour:4.1}h | {n} {watch}, mean E {mean_e:.2} | sample: {where_:<6} pos({px:.2},{py:.2})→({tx:.2},{ty:.2}) d={dist:.2}{tail}"
            );
        }
    }

    println!("\n┌─ what the people DID ({ticks} ticks) ─┐");
    let acts = w.action_tally();
    let total: u64 = acts.values().sum();
    let mut sorted: Vec<_> = acts.iter().collect();
    sorted.sort_by(|a, b| b.1.cmp(a.1));
    for (name, n) in sorted {
        let pct = if total > 0 { 100 * *n / total } else { 0 };
        println!("    {name:<28} {n:>6}  ({pct:>2}%)");
    }
    println!("  events:");
    for (label, n) in w.event_tally() {
        if *n > 0 {
            println!("    {label:<40} {n:>5}");
        }
    }

    night_hosted.push(cur_hosted.clone());
    night_qual.push(cur_qual.clone());
    night_ranout.push(cur_ranout.clone());
    if nv > 0 {
        println!("\n┌─ the night, decided by the WEB (nobody scripts the winner) ─┐");
        println!("    share = guest-ticks hosted · q = tonight's food roll · [out] = ran out of mains");
        let mut wins = vec![0; nv];
        let mut against_quality = 0;
        for n in 0..night_hosted.len() {
            let hosted = &night_hosted[n];
            let total: i64 = hosted.iter().sum();
            if total == 0 { continue; }
            let win = (0..nv).max_by_key(|&i| hosted[i]).unwrap();
            let best_q = (0..nv).max_by(|&a, &b| night_qual[n][a].partial_cmp(&night_qual[n][b]).unwrap()).unwrap();
            if win != best_q { against_quality += 1; }
            wins[win] += 1;
            let bars: String = (0..nv)
                .map(|vi| format!("{}{} {:>3}% (q{:.2}){}",
                    if vi == win { "▶" } else { " " }, w.name(venues[vi]),
                    100 * hosted[vi] / total, night_qual[n][vi],
                    if night_ranout[n][vi] { " [out]" } else { "" }))
                .collect::<Vec<_>>().join("  ");
            println!("    night {n}:  {bars}");
        }
        let won: Vec<String> = (0..nv).filter(|&i| wins[i] > 0)
            .map(|i| format!("{} won {}", w.name(venues[i]), wins[i])).collect();
        println!("    → {won:?}", won = won.join(", "));
        println!("    → winner flips across nights = symmetry-breaking; {against_quality} night(s) the WORSE-food venue still won (crowd/word/stock overrode quality) = the web at work, not one stat.");

        if let Some((n, trace)) = &example {
            println!("\n┌─ a night the mains ran dry (night {n}) — watch the crowd MIGRATE, unscripted ─┐");
            for (hour, crowds) in trace {
                let bars: String = crowds.iter().enumerate()
                    .map(|(vi, &c)| format!("{} {:<12}", w.name(venues[vi]), "█".repeat(c.max(0) as usize)))
                    .collect::<Vec<_>>().join(" ");
                println!("    {hour:4.1}h  {bars}");
            }
            println!("    (a venue fills → burns through its mains → food craters → the room empties → the night moves next door)");
        }
    }

    if !commute.is_empty() {
        println!("\n┌─ WHEN THEY LEAVE FOR WORK (9am start) — emergent, nobody says 'go' ─┐");
        println!("    commute = home→job distance · dilig = cares-about-work trait · leave_h = their OWN computed leave time");
        let hh = |h: f32| if h < 0.0 { "  —  ".to_string() } else { format!("{:.1}h", h) };
        for (&p, &(cm, dl, lh, left, arr)) in &commute {
            let verdict = if arr < 0.0 { "" } else if arr <= 9.15 { "  ✓ on time" } else { "  ✗ LATE" };
            println!("    {} {}: commute {:.2}, dilig {:.2}  →  leaves ~{}  (left {}, arrived {}){}",
                watch, p, cm, dl, hh(lh.max(0.0)), hh(left), hh(arr), verdict);
        }
        println!("    → far job or high diligence ⇒ leaves earlier; near + slack ⇒ leaves late & clocks in late. All from distance ÷ speed − trait.");
    }

    // SHOPS (template #5 prices) — do shops price by scarcity + wealth?
    let shops: Vec<usize> = w.by_kind("building").into_iter().filter(|&b| w.stat(b, "use") > 0.5 && w.stat(b, "use") < 1.5).collect();
    if !shops.is_empty() {
        let mut prices: Vec<f32> = shops.iter().map(|&s| w.stat(s, "price")).filter(|&p| p > 0.0).collect();
        prices.sort_by(|a, b| a.partial_cmp(b).unwrap());
        if !prices.is_empty() {
            let (lo, hi) = (prices[0], prices[prices.len() - 1]);
            let mean = prices.iter().sum::<f32>() / prices.len() as f32;
            println!("\n┌─ SHOP PRICES (template #5 goods/prices) ─┐");
            println!("    {} shops trading · price {:.2}–{:.2} (mean {:.2}) — the gap IS the merchant's opportunity", prices.len(), lo, hi, mean);
        }
    }

    println!("\n┌─ chronicle (last 14) ─┐");
    for n in w.log.iter().rev().take(14).rev() {
        println!("  t{:<4} {}", n.tick, n.message);
    }
}
