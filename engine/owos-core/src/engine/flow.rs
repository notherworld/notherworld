//! # Flow / watershed — a generic primitive over any scalar field.
//!
//! Given ANY named field (elevation, pressure, heat, gossip-potential…), compute
//! where "stuff" flows: priority-flood pit-fill turns closed basins into filled
//! pools with spill points (→ lakes that overflow onward), D8 steepest descent
//! gives every cell a downstream neighbour, and flow accumulation counts the
//! upstream area draining through each cell (→ dendritic branching, wider
//! downstream). The engine knows nothing about rivers: a renderer reads
//! "high accumulation" as a river, "pool depth > 0" as a lake — another game
//! reads the same grids as lava, wind, or crowd flow. Fully deterministic.

use super::world::World;

/// The computed flow grids, all `n × n` row-major over the unit square.
/// Cell (i, j) samples the field at ((i + 0.5)/n, (j + 0.5)/n).
pub struct FlowMap {
    pub n: usize,
    /// The pit-filled surface: `max(original, pool level)`. Monotone downhill
    /// to the boundary — nothing gets stuck.
    pub fill: Vec<f32>,
    /// `fill − original`: 0 on open terrain, the pool DEPTH inside a basin.
    pub pool: Vec<f32>,
    /// Downstream cell index (row-major), or -1 where flow exits the grid.
    pub down: Vec<i32>,
    /// Upstream cells draining through each cell (own cell counts 1).
    pub accum: Vec<f32>,
}

impl FlowMap {
    /// Compute the flow map for `field` on an `n × n` grid.
    pub fn compute(w: &World, field: &str, n: usize) -> FlowMap {
        let n = n.max(2);
        let len = n * n;
        // 1. sample the field once per cell.
        let mut orig = vec![0.0f32; len];
        for j in 0..n {
            for i in 0..n {
                let x = (i as f32 + 0.5) / n as f32;
                let y = (j as f32 + 0.5) / n as f32;
                orig[j * n + i] = w.sample_field(field, x, y);
            }
        }

        // 2. priority-flood pit fill (Barnes et al.): flood inward from the
        // boundary, always expanding the lowest frontier cell; a cell's filled
        // height is max(its own height, the height we flooded in at). Closed
        // basins fill exactly to their spill point.
        let mut fill = vec![f32::INFINITY; len];
        let mut from = vec![-1i32; len]; // which neighbour flooded this cell (its spill path)
        let mut heap: std::collections::BinaryHeap<std::cmp::Reverse<(u32, u32)>> =
            std::collections::BinaryHeap::new();
        // key = (elevation as sortable bits, index) — total order, deterministic ties.
        let key = |h: f32, idx: usize| {
            let b = h.to_bits();
            // map float bits to lexicographically ordered unsigned (handles negatives)
            let k = if b & 0x8000_0000 != 0 { !b } else { b | 0x8000_0000 };
            (k, idx as u32)
        };
        let mut seen = vec![false; len];
        let mut pop_order: Vec<u32> = Vec::with_capacity(len);
        for j in 0..n {
            for i in 0..n {
                if i == 0 || j == 0 || i == n - 1 || j == n - 1 {
                    let idx = j * n + i;
                    fill[idx] = orig[idx];
                    seen[idx] = true;
                    heap.push(std::cmp::Reverse(key(fill[idx], idx)));
                }
            }
        }
        const NB: [(i32, i32); 8] = [(-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (1, -1), (-1, 1), (1, 1)];
        while let Some(std::cmp::Reverse((_, idx))) = heap.pop() {
            pop_order.push(idx);
            let idx = idx as usize;
            let (ci, cj) = ((idx % n) as i32, (idx / n) as i32);
            for (di, dj) in NB {
                let (ni, nj) = (ci + di, cj + dj);
                if ni < 0 || nj < 0 || ni >= n as i32 || nj >= n as i32 {
                    continue;
                }
                let nidx = nj as usize * n + ni as usize;
                if seen[nidx] {
                    continue;
                }
                seen[nidx] = true;
                fill[nidx] = orig[nidx].max(fill[idx]);
                from[nidx] = idx as i32;
                heap.push(std::cmp::Reverse(key(fill[nidx], nidx)));
            }
        }

        let pool: Vec<f32> = (0..len).map(|i| (fill[i] - orig[i]).max(0.0)).collect();

        // 3. D8 downstream on the FILLED surface: steepest strictly-lower
        // neighbour (diagonals distance-weighted). Flats (pool floors) drain
        // along the flood path — toward the cell that flooded them, which
        // chains to the basin's spill point. Boundary cells with no lower
        // neighbour exit the grid (-1).
        let mut down = vec![-1i32; len];
        for j in 0..n {
            for i in 0..n {
                let idx = j * n + i;
                let h = fill[idx];
                let mut best = -1i32;
                let mut best_drop = 0.0f32;
                for (di, dj) in NB {
                    let (ni, nj) = (i as i32 + di, j as i32 + dj);
                    if ni < 0 || nj < 0 || ni >= n as i32 || nj >= n as i32 {
                        continue;
                    }
                    let nidx = nj as usize * n + ni as usize;
                    let dist = if di != 0 && dj != 0 { std::f32::consts::SQRT_2 } else { 1.0 };
                    let drop = (h - fill[nidx]) / dist;
                    if drop > best_drop {
                        best_drop = drop;
                        best = nidx as i32;
                    }
                }
                down[idx] = if best >= 0 { best } else { from[idx] };
            }
        }

        // 4. flow accumulation in REVERSE priority-flood pop order — a true
        // topological order: every cell's downstream (a strictly lower cell, or
        // its flood parent on a flat) was popped earlier, so it is visited
        // later here and receives the full upstream count. A plain height sort
        // gets flat pool floors wrong.
        let mut accum = vec![1.0f32; len];
        for &idx in pop_order.iter().rev() {
            let idx = idx as usize;
            let d = down[idx];
            if d >= 0 {
                accum[d as usize] += accum[idx];
            }
        }

        FlowMap { n, fill, pool, down, accum }
    }
}
