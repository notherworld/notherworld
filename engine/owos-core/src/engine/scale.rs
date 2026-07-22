//! Cross-scale coupling — the fractal glue.
//!
//! `Rollup` aggregates children into a parent stat (citizens' discontent → a
//! city's unrest → a nation's instability → the world's tension). `Broadcast`
//! pushes a parent stat down onto its children (a nation at war → danger in its
//! cities → fear in its citizens). Together they make effects ripple up and down
//! the scope tree without any system knowing about any other scale.

#[derive(Clone, Copy, Debug)]
pub enum Reducer {
    Sum,
    Mean,
    Max,
    Min,
    CountAbove(f32),
    FracAbove(f32),
}

impl Reducer {
    pub fn reduce(&self, vals: &[f32]) -> f32 {
        if vals.is_empty() {
            return 0.0;
        }
        match self {
            Reducer::Sum => vals.iter().sum(),
            Reducer::Mean => vals.iter().sum::<f32>() / vals.len() as f32,
            Reducer::Max => vals.iter().copied().fold(f32::NEG_INFINITY, f32::max),
            Reducer::Min => vals.iter().copied().fold(f32::INFINITY, f32::min),
            Reducer::CountAbove(t) => vals.iter().filter(|&&v| v > *t).count() as f32,
            Reducer::FracAbove(t) => vals.iter().filter(|&&v| v > *t).count() as f32 / vals.len() as f32,
        }
    }
}

/// Aggregate children of `parent_kind` into `parent_stat`. Runs bottom-up.
///
/// `drain`: after reducing, zero the `child_stat` on every child. This makes a
/// PER-TICK FLOW variable expressible in pure data — an action accumulates into
/// the child stat during the tick, the rollup harvests the sum up to the parent,
/// then clears it so next tick starts fresh. Without this, a data author cannot
/// reset a flow stat around the rollup (rules run BEFORE rollups, so a reset rule
/// wipes the flow before it's ever aggregated). The natural home for resource
/// drawn, damage dealt, gold spent — anything measured "this tick, then gone".
#[derive(Clone)]
pub struct Rollup {
    pub parent_kind: String,
    pub child_stat: String,
    pub parent_stat: String,
    pub reducer: Reducer,
    pub drain: bool,
}

/// Set each child's `child_stat` to `gain * parent.parent_stat`. Runs top-down.
///
/// `parent_kind`: only broadcast from parents of this kind ("" = every parent —
/// the historical behavior). ⚠️ The unfiltered form applies at EVERY level of the
/// tree: a stat-named broadcast like raining→raining also runs from the ROOT down
/// (root has no `raining` → reads 0), silently ZEROING the child stat every tick
/// and stomping whatever a rule just set. If parent and child stat share a name,
/// you almost always want a `parent_kind`.
#[derive(Clone)]
pub struct Broadcast {
    pub parent_kind: String,
    pub parent_stat: String,
    pub child_stat: String,
    pub gain: f32,
}
