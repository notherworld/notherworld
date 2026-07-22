// THE UNIFORM SCOPE→SCREEN MAP + region-cell geometry — the demo-agnostic core
// of rendering ANY engine scope honestly. Two laws live here (see
// docs/DEMO_RENDER_HANDOFF.md §1):
//  1. ONE uniform scale for both axes (px per world-unit identical in x/y; the
//     longer patch side fills the frame, the shorter is letterboxed) — a sliver
//     scope renders as a sliver, never stretched square.
//  2. Shape comes from the engine's carved region cells (`world.region(id)`),
//     never from a bounding box.

export type ScopeMap = {
  unit: number; offx: number; offy: number; pw: number; ph: number;
  toS: (wx: number, wy: number) => { x: number; y: number };
  toW: (sx: number, sy: number) => { wx: number; wy: number };
};

// Build the map for a scope patch [x0,y0,x1,y1] rendered into an S×S frame.
// Pass bounds=null for an identity map (the root scope in 0..1).
//
// `fit` (optional): the DEVICE-VISIBLE sub-rectangle of the S×S frame, for a
// renderer whose square buffer is displayed object-fit:cover on a non-square
// screen. cover crops the square to a centred fitW×fitH window — so the scope
// patch must fit INSIDE that window, or the crop eats the scope itself (the
// "I can never see the whole block I clicked" bug). With fit, the patch is
// scaled into the visible window and the crop only ever trims letterbox margin
// (real neighbouring world) — a wide screen simply SEES MORE WORLD sideways.
// This is also the seed of the free-camera architecture: the visible world span
// is derived from the viewport, not hardcoded square.
// `unitOverride` (optional): a FIXED px-per-world-unit — the "zoom never warps"
// law. At a given level (all blocks, all districts) the unit is CONSTANT, derived
// from the TYPICAL sibling size, not this patch's own — so a car that is 20px in
// one block is 20px in every block. A larger-than-typical scope then OVERFLOWS the
// viewport (centred; you walk to see the rest once there's walking), a smaller one
// shows more neighbouring world. Without it, unit fits this patch (warping zoom).
export function makeScopeMap(
  bounds: [number, number, number, number] | null, S: number,
  fit?: { w: number; h: number }, unitOverride?: number,
): ScopeMap {
  const fw = fit?.w ?? S, fh = fit?.h ?? S;
  const [x0, y0, x1, y1] = bounds ?? [0, 0, 1, 1];
  const pw = x1 - x0, ph = y1 - y0;
  // uniform px-per-world-unit: fixed per level if overridden, else fit THIS patch
  const unit = unitOverride ?? Math.min(fw / (pw || 1), fh / (ph || 1));
  // centring with (S - span·unit)/2 works in BOTH regimes: overflow goes negative
  // and the patch spills equally off both sides of the viewport.
  const offx = (S - pw * unit) / 2;
  const offy = (S - ph * unit) / 2;
  return {
    unit, offx, offy, pw, ph,
    toS: (wx, wy) => ({ x: offx + (wx - x0) * unit, y: offy + (wy - y0) * unit }),
    toW: (sx, sy) => ({ wx: x0 + (sx - offx) / unit, wy: y0 + (sy - offy) / unit }),
  };
}

// scope-local (0..1 within the patch) → screen, honoring the letterbox.
export function localToScreenWith(map: ScopeMap, lx: number, ly: number) {
  return { x: map.offx + lx * map.pw * map.unit, y: map.offy + ly * map.ph * map.unit };
}

// ---- region cells: the engine's carve as grid coords ------------------------
// `world.region(id)` returns flat [cellSize, cx0,cy0, cx1,cy1, …] (scope-local
// cell CENTRES). These helpers convert to integer grid cells and derive shape.

export type GCell = { gx: number; gy: number };
export const cellKey = (gx: number, gy: number) => `${gx},${gy}`;

export function regionCells(flat: number[]): { cell: number; cells: GCell[]; own: Set<string> } {
  const cell = flat[0];
  const cells: GCell[] = [];
  const own = new Set<string>();
  for (let i = 1; i + 1 < flat.length; i += 2) {
    const gx = Math.round(flat[i] / cell - 0.5), gy = Math.round(flat[i + 1] / cell - 0.5);
    cells.push({ gx, gy }); own.add(cellKey(gx, gy));
  }
  return { cell, cells, own };
}

// The perimeter of a cell set as one SVG path: every cell edge NOT shared with
// another cell of the set. `include` optionally filters which boundary edges
// count (e.g. sidewalks only on street-facing edges).
export function cellsPerimeter(
  cells: GCell[], own: Set<string>, cell: number, map: ScopeMap,
  include?: (ngx: number, ngy: number) => boolean,
): string {
  const P = (gx: number, gy: number) => localToScreenWith(map, gx * cell, gy * cell);
  const ok = (ngx: number, ngy: number) => !own.has(cellKey(ngx, ngy)) && (!include || include(ngx, ngy));
  const edges: string[] = [];
  for (const { gx, gy } of cells) {
    const a = P(gx, gy), b = P(gx + 1, gy + 1);
    if (ok(gx - 1, gy)) edges.push(`M${a.x.toFixed(1)} ${a.y.toFixed(1)} L${a.x.toFixed(1)} ${b.y.toFixed(1)}`);
    if (ok(gx + 1, gy)) edges.push(`M${b.x.toFixed(1)} ${a.y.toFixed(1)} L${b.x.toFixed(1)} ${b.y.toFixed(1)}`);
    if (ok(gx, gy - 1)) edges.push(`M${a.x.toFixed(1)} ${a.y.toFixed(1)} L${b.x.toFixed(1)} ${a.y.toFixed(1)}`);
    if (ok(gx, gy + 1)) edges.push(`M${a.x.toFixed(1)} ${b.y.toFixed(1)} L${b.x.toFixed(1)} ${b.y.toFixed(1)}`);
  }
  return edges.join(' ');
}
export function regionPerimeter(flat: number[], map: ScopeMap): string {
  const { cell, cells, own } = regionCells(flat);
  return cellsPerimeter(cells, own, cell, map);
}

// screen-space centroid of a cell set (where a label belongs).
export function cellsCenter(cells: GCell[], cell: number, map: ScopeMap) {
  let sx = 0, sy = 0;
  for (const c of cells) {
    const p = localToScreenWith(map, (c.gx + 0.5) * cell, (c.gy + 0.5) * cell);
    sx += p.x; sy += p.y;
  }
  return { x: sx / Math.max(1, cells.length), y: sy / Math.max(1, cells.length) };
}
