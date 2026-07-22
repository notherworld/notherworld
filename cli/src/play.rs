//! play — proving the engine does GAMEPLAY, not a canned sim.
//!
//! Six households, each different (heterogeneous start + resilience). Every week
//! spontaneous fortune strikes — GOOD or bad, seeded — so the event stream is
//! identical across the runs below. The only thing that changes is what the
//! PLAYER does each week. Same seed, same world, same events → three different
//! endings, purely from the player's choices. That's a game, not a movie.

use owos_core::Rng;

const NAMES: [&str; 6] = ["Aiko", "Bao", "Chen", "Devi", "Emi", "Fen"];
const WEEKS: u32 = 14;
const SEED: u64 = 7;

/// Spontaneous fortune — good or bad. Always draws exactly two rng values, so
/// the stream is identical no matter what the player does.
fn fortune(rng: &mut Rng, happy: &mut [f32]) -> String {
    let r = rng.next_f32();
    let t = (rng.next_u64() % happy.len() as u64) as usize;
    if r < 0.22 {
        happy[t] = (happy[t] + 0.28).min(1.0);
        format!("+ bumper harvest for {}", NAMES[t])
    } else if r < 0.40 {
        happy[t] = (happy[t] + 0.22).min(1.0);
        format!("+ a wedding lifts {}", NAMES[t])
    } else if r < 0.52 {
        for h in happy.iter_mut() {
            *h = (*h + 0.10).min(1.0);
        }
        "+ a good omen cheers the whole village".to_string()
    } else if r < 0.72 {
        happy[t] = (happy[t] - 0.30).max(0.0);
        format!("- illness strikes {}", NAMES[t])
    } else if r < 0.88 {
        happy[t] = (happy[t] - 0.24).max(0.0);
        format!("- a storm batters {}", NAMES[t])
    } else {
        for h in happy.iter_mut() {
            *h = (*h - 0.12).max(0.0);
        }
        "- the crown levies a heavy tax".to_string()
    }
}

fn help_neediest(h: &[f32]) -> Option<usize> {
    (0..h.len()).min_by(|&a, &b| h[a].partial_cmp(&h[b]).unwrap())
}
fn help_favorite(h: &[f32]) -> Option<usize> {
    (0..h.len()).max_by(|&a, &b| h[a].partial_cmp(&h[b]).unwrap())
}
fn help_nobody(_: &[f32]) -> Option<usize> {
    None
}

fn run(policy: fn(&[f32]) -> Option<usize>, title: &str) {
    let mut rng = Rng::new(SEED);
    // Heterogeneous households (identical across runs — same seed, same draws).
    let mut happy: Vec<f32> = (0..6).map(|_| 0.35 + rng.next_f32() * 0.30).collect();
    let resil: Vec<f32> = (0..6).map(|_| rng.next_f32() * 0.5).collect();

    println!("\n=== {title} ===");
    for week in 1..=WEEKS {
        let event = fortune(&mut rng, &mut happy); // same every run
        let action = match policy(&happy) {
            Some(i) => {
                happy[i] = (happy[i] + 0.24).min(1.0);
                format!("you rally {}", NAMES[i])
            }
            None => "you keep to yourself".to_string(),
        };
        // Everyone drifts back toward a modest baseline; resilient homes hold.
        for i in 0..6 {
            happy[i] = (happy[i] + (0.42 - happy[i]) * 0.05 * (1.0 - resil[i])).clamp(0.0, 1.0);
        }
        println!("  wk{week:>2}  {event:<40}  |  {action}");
    }

    let happy_count = happy.iter().filter(|&&h| h > 0.6).count();
    print!("  final: ");
    for i in 0..6 {
        print!("{} {:.2}  ", NAMES[i], happy[i]);
    }
    println!(
        "\n  {happy_count} of 6 women happy → {}",
        if happy_count >= 4 { "🐉 THE LOVE DRAGON AWAKENS" } else { "…the spirit sleeps" }
    );
}

fn main() {
    println!("otherworldOS · same world, same fortune — YOUR choices decide the ending");
    println!("(seed {SEED}: identical households + identical random events in all three runs)");

    run(help_neediest, "PLAYER A — a caring leader (rallies whoever is struggling)");
    run(help_favorite, "PLAYER B — plays favorites (rallies whoever's already thriving)");
    run(help_nobody, "PLAYER C — keeps to himself (never lifts a finger)");

    println!("\nSame seed. Same heterogeneous homes. Same good & bad events.");
    println!("Three different endings — because the PLAYER acted differently. That's gameplay.");
}
