//! World seeding — the default starting town.
//!
//! This stands in for the future world-building engine: a hardcoded cast today,
//! authored data tomorrow. It now produces an editable [`WorldSpec`], so the
//! default town is just a starting point the portal can reshape.

use crate::spec::{ResidentSpec, WorldSpec};
use crate::world::{Config, World};

struct Resident {
    name: &'static str,
    wage: i64,
    money: i64,
    sociability: f32,
}

const TOWN: &[Resident] = &[
    Resident { name: "Dov (nurse)",         wage: 9, money: 40, sociability: 0.4 },
    Resident { name: "Bea (mechanic)",      wage: 8, money: 30, sociability: 0.5 },
    Resident { name: "Hana (teacher)",      wage: 7, money: 28, sociability: 0.6 },
    Resident { name: "Jax (line cook)",     wage: 6, money: 24, sociability: 0.7 },
    Resident { name: "Cy (barista)",        wage: 5, money: 20, sociability: 0.8 },
    Resident { name: "Esme (clerk)",        wage: 5, money: 22, sociability: 0.6 },
    Resident { name: "Gus (day labor)",     wage: 4, money: 12, sociability: 0.5 },
    Resident { name: "Finn (busker)",       wage: 3, money: 14, sociability: 0.9 },
    Resident { name: "Ivo (dishwasher)",    wage: 3, money: 10, sociability: 0.3 },
    Resident { name: "Mara (student)",      wage: 2, money: 16, sociability: 0.8 },
    Resident { name: "Wren (between jobs)", wage: 1, money: 12, sociability: 0.5 },
    Resident { name: "Ida (retired)",       wage: 0, money: 48, sociability: 0.3 },
];

/// The default town as an editable specification.
pub fn default_spec(seed: u64) -> WorldSpec {
    WorldSpec {
        seed,
        config: Config::default(),
        residents: TOWN
            .iter()
            .map(|r| ResidentSpec {
                name: r.name.to_string(),
                wage: r.wage,
                money: r.money,
                sociability: r.sociability,
            })
            .collect(),
    }
}

/// A small town of a dozen residents, ready to be advanced through time.
pub fn small_town(seed: u64) -> World {
    default_spec(seed).build()
}
