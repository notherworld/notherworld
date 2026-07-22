// The BLOCK level — the city treatment one scale down. Blocks are DISJOINT chunks
// of the district's buildable land (the engine's mask-aware carve; rects come from
// each parcel's exact world patch wx0..wy1). Terrain renders with the SAME palette
// as the city view — the coastline you saw from above continues here. LANES route
// between blocks; each block HAZES its next level through: a revealed block shows
// its real buildings faintly, an unrevealed one shows a speckled "idea" of itself.
// Click a block to dive; the haze is what you're diving into.

import { useMemo } from 'react';
import type { EntityDto, EdgeDto, World } from '../owos';
import { useOf } from './layout';
import { h } from '../view/hash';
import {
  makeScopeMap, localToScreenWith, regionPerimeter, cellsCenter,
  type ScopeMap, type GCell,
} from '../view/scope';

type Props = {
  buildings: EntityDto[];   // the parcels (blocks OR buildings)
  edges: EdgeDto[];
  routeKind: string;        // "lane" (district→blocks) | "street" (block→buildings)
  xk: string; yk: string;   // position stats: "bx","by" (blocks) | "px","py" (buildings)
  mode: 'block' | 'building';
  world?: World | null;     // to sample the real fields as terrain context
  bounds?: [number, number, number, number] | null; // this scope's world-space patch
  /** ANCESTOR circulation in WORLD coords (spec T1): the city's roads inside a
   *  district/block, the district's lanes inside a block. Mapped through bounds
   *  and drawn under the parcels — the highway never disappears as you zoom. */
  arteries?: { a: { x: number; y: number }; b: { x: number; y: number }; cls: string }[];
  /** engine `gate` children: where an ancestor road crosses THIS scope's boundary
   *  (positions gx,gy in scope-local 0..1). The local net's connection points. */
  gates?: EntityDto[];
  byId?: Map<number, EntityDto> | null; // full snapshot lookup (for the haze layer)
  selected: number | null;
  onSelect: (id: number) => void;
  onDive: (e: EntityDto) => void;
};

const S = 1000;
const G = 52;
const SEA = 0.40;

// The uniform scope→screen mapping now lives in ../view/scope (shared kit).

// LAND — a real green gradient (low land = deep green, high land = lighter, drier
// green), so land reads as GREEN LAND at EVERY zoom. Before, this was a near-black
// grey-green and the vivid green only came from the district's block-territory fill
// — so diving into a block LOST the green (the founder caught this: "wouldn't the
// left be green if it's green when we zoom out?"). Now the terrain itself carries
// the green, consistent across levels.
function landColor(e: number): string {
  const t = Math.max(0, Math.min(1, (e - SEA) / (1 - SEA))); // 0 at coast → 1 at peak
  // muted green (low) → lighter drier green (high) — subtle, real terrain, not neon
  const r = 40 + t * 70;
  const g = 62 + t * 58;
  const b = 46 + t * 24;
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
function waterColor(e: number): string {
  const d = e / SEA;
  return `rgb(${18 + d * 34},${58 + d * 74},${110 + d * 70})`;
}

// DEBUG: hide building fills at the block level so the terrain/background under
// them is visible (shows plot OUTLINES + POI ★ instead). true = debug the
// carve against the buildable_block tint; false = the real render (base demo).
const DEBUG_HIDE_PLOTS = false;

export default function BlockMap({ buildings, edges, routeKind, xk, yk, mode, world, bounds, byId, arteries = [], gates = [], selected, onSelect, onDive }: Props) {
  // ── CONSISTENT WORLD-UNIT SCALE ──────────────────────────────────────────
  // Every scope draws into the same S×S SVG, but with ONE uniform scale for both
  // axes (never stretched) so a scope's TRUE aspect is preserved — a sliver
  // district renders as a sliver, not squared. The longer side of the scope's
  // world patch fills S; the shorter side is letterboxed (centred). Result: one
  // world-unit = the SAME pixels in x AND y at this level, so a lot's real
  // pixel-size is honest and style rules can read "cramped 20px lot" vs "roomy
  // 80px lot". `unit` (px per world-unit) is exposed so children can style by
  // true available space. Fallback identity map when no bounds (city root).
  const map = useMemo(() => makeScopeMap(bounds ?? null, S), [bounds]);

  // ANCESTOR circulation (spec T1) mapped world→screen (uniform scale): the
  // highway from the plane is still there from the street, at TRUE proportions.
  const arterySegs = useMemo(() => {
    if (!bounds) return [];
    return arteries.map((s) => ({ a: map.toS(s.a.x, s.a.y), b: map.toS(s.b.x, s.b.y), cls: s.cls }));
  }, [arteries, bounds, map]);
  // TERRAIN CONTEXT: sample the real world fields over this scope's bounds — the
  // same elevation/beach/cliff/water the city view drew, this scope's slice of it.
  const terrain = useMemo(() => {
    if (!world || !bounds) return null;
    // Sample terrain over the WHOLE VIEWPORT's world extent (not just the scope's
    // patch), so the frame is FILLED — the block sits in its real surroundings
    // (neighbouring land, the nearby coast, roads passing) instead of a black void
    // in the letterbox margins. map.toW maps the screen frame corners → world, so
    // we cover exactly what's visible, at true scale. The scope's own patch is
    // highlighted separately; this is the context around it.
    const wa = map.toW(0, 0), wb = map.toW(S, S);
    const wx0 = wa.wx, wy0 = wa.wy, wx1 = wb.wx, wy1 = wb.wy;
    const cw = (wx1 - wx0) / G, ch = (wy1 - wy0) / G;
    const sw = S / G + 1.2, sh = S / G + 1.2; // one grid cell = the frame / G (fills it)
    const g: { e: number; water: boolean; beach: boolean; cliff: boolean; steep: boolean; buildable: boolean; buildableBlock: boolean; plotLand: boolean; sx: number; sy: number; sw: number; sh: number }[] = [];
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
      const fx = wx0 + cw * (i + 0.5), fy = wy0 + ch * (j + 0.5);
      g.push({
        e: world.sampleField('elevation', fx, fy),
        water: world.sampleField('water', fx, fy) >= 0.5,
        beach: world.sampleField('beach', fx, fy) >= 0.5,
        cliff: world.sampleField('cliff', fx, fy) >= 0.5,
        steep: world.sampleField('steep', fx, fy) >= 0.5,
        buildable: world.sampleField('buildable', fx, fy) >= 0.5,
        buildableBlock: world.sampleField('buildable_block', fx, fy) >= 0.5,
        plotLand: world.sampleField('plot_land', fx, fy) >= 0.5,
        sx: (i / G) * S, sy: (j / G) * S, sw, sh,
      });
    }
    return g;
  }, [world, bounds, map]);

  // parcel rect for each item — from its exact world patch (the engine's carve),
  // mapped through this scope's bounds. Fallback: centre ± w,h. Nothing hidden.
  const plots = useMemo(() => buildings.map((b) => {
    const s = b.stats;
    if (bounds && s.wx1 > s.wx0 && s.wy1 > s.wy0) {
      // UNIFORM world→screen: the plot's true world rect at true proportions
      // (a plot's on-screen size is now its REAL relative size in the scope).
      const p0 = map.toS(s.wx0, s.wy0), p1 = map.toS(s.wx1, s.wy1);
      return { b, x: p0.x, y: p0.y, w: p1.x - p0.x, h: p1.y - p0.y };
    }
    const w = (s.w ?? 0.2) * map.unit, h = (s.h ?? 0.2) * map.unit;
    const c = map.toS(s[xk] ?? 0.5, s[yk] ?? 0.5);
    const x = c.x - w / 2, y = c.y - h / 2;
    return { b, x, y, w, h };
  }), [buildings, xk, yk, bounds, map]);
  // anchor = the parcel's position stat (scope-LOCAL 0..1), mapped to screen through
  // the letterboxed patch: local 0..1 → offset + local * (patch-size * unit). So the
  // anchor sits at its TRUE relative spot in the scope's real shape.
  const localToScreen = (lx: number, ly: number) => localToScreenWith(map, lx, ly);
  const posOf = useMemo(() => new Map(buildings.map((b) =>
    [b.id, localToScreen(b.stats[xk] ?? 0.5, b.stats[yk] ?? 0.5)])), [buildings, xk, yk, map]);

  // SIDEWALKS — pavement along STREETS only, not ringing every lot. A lot-edge
  // segment gets sidewalk iff the cell on the OTHER side of it is (a) owned by
  // NO parcel (so lot-to-lot party walls get none) and (b) still on the block's
  // buildable land (so edges facing open terrain/green get none). What remains
  // is exactly the edges that face a street corridor — pavement where people
  // actually walk.
  const sidewalks = useMemo(() => {
    const m = new Map<number, string>();
    if (mode !== 'building' || !world) return m;
    const key = (gx: number, gy: number) => `${gx},${gy}`;
    const per: { id: number; cell: number; cells: GCell[] }[] = [];
    const ownedAll = new Set<string>();
    for (const b of buildings) {
      const flat = world.region(b.id) ?? [];
      if (flat.length <= 2) continue;
      const cell = flat[0];
      const cells: GCell[] = [];
      for (let i = 1; i + 1 < flat.length; i += 2) {
        const gx = Math.round(flat[i] / cell - 0.5), gy = Math.round(flat[i + 1] / cell - 0.5);
        cells.push({ gx, gy }); ownedAll.add(key(gx, gy));
      }
      per.push({ id: b.id, cell, cells });
    }
    for (const p of per) {
      const cell = p.cell;
      const own = new Set(p.cells.map((c) => key(c.gx, c.gy)));
      const P = (gx: number, gy: number) => localToScreenWith(map, gx * cell, gy * cell);
      const isStreet = (ngx: number, ngy: number) => {
        if (ownedAll.has(key(ngx, ngy))) return false;
        const s = localToScreenWith(map, (ngx + 0.5) * cell, (ngy + 0.5) * cell);
        const wpt = map.toW(s.x, s.y);
        return world.sampleField('buildable_block', wpt.wx, wpt.wy) >= 0.5;
      };
      const edges: string[] = [];
      for (const { gx, gy } of p.cells) {
        const a = P(gx, gy), b = P(gx + 1, gy + 1);
        if (!own.has(key(gx - 1, gy)) && isStreet(gx - 1, gy)) edges.push(`M${a.x.toFixed(1)} ${a.y.toFixed(1)} L${a.x.toFixed(1)} ${b.y.toFixed(1)}`);
        if (!own.has(key(gx + 1, gy)) && isStreet(gx + 1, gy)) edges.push(`M${b.x.toFixed(1)} ${a.y.toFixed(1)} L${b.x.toFixed(1)} ${b.y.toFixed(1)}`);
        if (!own.has(key(gx, gy - 1)) && isStreet(gx, gy - 1)) edges.push(`M${a.x.toFixed(1)} ${a.y.toFixed(1)} L${b.x.toFixed(1)} ${a.y.toFixed(1)}`);
        if (!own.has(key(gx, gy + 1)) && isStreet(gx, gy + 1)) edges.push(`M${a.x.toFixed(1)} ${b.y.toFixed(1)} L${b.x.toFixed(1)} ${b.y.toFixed(1)}`);
      }
      if (edges.length) m.set(p.id, edges.join(' '));
    }
    return m;
  }, [mode, buildings, world, map]);

  // THE LOCAL ROUTE NET — the engine's lane/street edges among parcels AND gates
  // (the points where an ancestor road crosses this scope's boundary). Because the
  // gates are network nodes, the local net CONNECTS to the projected artery at
  // exactly the point it enters — one circulation system, refined per zoom. The
  // subdivide gaps still read as minor streets under the inset plots.
  const localNet = useMemo(() => {
    const posAll = new Map(posOf);
    gates.forEach((g) => posAll.set(g.id, localToScreen(g.stats.gx ?? 0.5, g.stats.gy ?? 0.5)));
    const seen = new Set<string>();
    const segs: { a: { x: number; y: number }; b: { x: number; y: number } }[] = [];
    for (const g of edges) {
      if (g.kind !== routeKind) continue;
      const key = g.from < g.to ? `${g.from}-${g.to}` : `${g.to}-${g.from}`;
      if (seen.has(key)) continue; seen.add(key);
      const a = posAll.get(g.from), b = posAll.get(g.to);
      if (!a || !b) continue;
      // prefer the engine's pathfound curve (scope-local coords — this IS the
      // routing scope), so lanes bend with the terrain like the city's roads
      const flat = world?.routePath(g.from, g.to) ?? [];
      if (flat.length >= 4) {
        for (let i = 2; i + 1 < flat.length; i += 2) {
          segs.push({ a: localToScreen(flat[i - 2], flat[i - 1]), b: localToScreen(flat[i], flat[i + 1]) });
        }
      } else {
        segs.push({ a, b });
      }
    }
    return segs;
  }, [edges, routeKind, posOf, gates, world, map]);

  return (
   <div className="cx-mapwrap">
    <svg className="bk-map" viewBox={`0 0 ${S} ${S}`} preserveAspectRatio="xMidYMid meet">
      <defs>
        <radialGradient id="bkvign" cx="50%" cy="50%" r="62%">
          <stop offset="60%" stopColor="#000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.5" />
        </radialGradient>
      </defs>
      <rect x="0" y="0" width={S} height={S} className="bk-ground" />

      {/* TERRAIN — SCALE-AWARE: the same fields, the representation right for the
          zoom band. FAR (district/"plane"): the raster heightmap — reads as terrain
          from up there. NEAR (block/"street"): raw raster reads as noise, so the
          SAME fields render as their street-level abstraction — flat paved ground,
          flat water, rugged as hatched texture (not a black hole), and the coast
          as a smooth CONTOURED EDGE (marching squares on the continuous elevation
          field), because a coastline is a clean line up close, a field from far. */}
      {terrain && mode !== 'building' && (
        <g shapeRendering="crispEdges">
          {terrain.map((t, k) => {
            const c = t.water ? waterColor(t.e)
              : t.beach ? '#c9b98a'
              : t.cliff ? '#6b6f78'
              : landColor(t.e);
            const op = t.water ? 1 : (t.beach || t.cliff) ? 0.9 : 0.55;
            return <rect key={k} x={t.sx} y={t.sy} width={t.sw} height={t.sh} fill={c} opacity={op} />;
          })}
          {terrain.map((t, k) => {
            if (!t.steep || t.water || t.cliff) return null;
            return <rect key={`s${k}`} x={t.sx} y={t.sy} width={t.sw} height={t.sh} fill="#00000044" />;
          })}
        </g>
      )}
      {terrain && mode === 'building' && (
        <g>
          <defs>
            <pattern id="bk-rugged" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="9" height="9" fill="#20242f" />
              <line x1="0" y1="0" x2="0" y2="9" stroke="#3a3f4c" strokeWidth="2.5" />
            </pattern>
          </defs>
          {/* GROUND — the SAME rich terrain palette as the district/city view
              (beach sand, cliff grey, water depth-shaded, land elevation-shaded), so
              a block sits in REAL-looking terrain, not flat gray. Buildings + the
              coastline contour draw on top. (Was a flat #262b3a abstraction that read
              washed-out; the terrain data was always here — just under-used.) */}
          <g shapeRendering="crispEdges">
            {terrain.map((t, k) => {
              const c = t.water ? waterColor(t.e)
                : t.beach ? '#c9b98a'
                : t.cliff ? '#6b6f78'
                : landColor(t.e);
              return <rect key={k} x={t.sx} y={t.sy} width={t.sw} height={t.sh} fill={c}
                opacity={t.water ? 1 : 0.92} />;
            })}
            {/* steep (non-cliff) land: a subtle hatch so hills read as texture */}
            {terrain.map((t, k) => {
              if (!t.steep || t.water || t.cliff) return null;
              return <rect key={`rg${k}`} x={t.sx} y={t.sy} width={t.sw} height={t.sh} fill="url(#bk-rugged)" opacity={0.5} />;
            })}
          </g>
          {/* PLOT_LAND tint (real render, faint) — the exact land building plots
              carve from (buildable_block minus the road corridors). A faint warm
              wash under the plots so the streets (un-tinted road channels) read.
              In DEBUG this is replaced by the bold mask overlay below. */}
          {!DEBUG_HIDE_PLOTS && (
            <g shapeRendering="crispEdges">
              {terrain.map((t, k) => {
                if (!t.plotLand) return null;
                return <rect key={`bb${k}`} x={t.sx} y={t.sy} width={t.sw} height={t.sh} fill="#e8c06a" opacity={0.07} />;
              })}
            </g>
          )}
          <Coastline world={world!} bounds={bounds!} map={map} />
        </g>
      )}


      {/* ── DEBUG MASK OVERLAY ──────────────────────────────────────────────
          GREEN = `plot_land` = buildable_block MINUS the road corridors (road_near).
          This is the mask BUILDINGS actually carve from — so the ROADS should show
          as un-green CHANNELS cutting through the green (a building can't sit on a
          lane). If the green runs straight under a road, road subtraction failed.
          The un-green also includes water + steep. Compare the channels to the lanes
          drawn below: they should line up. */}
      {DEBUG_HIDE_PLOTS && terrain && (
        <g shapeRendering="crispEdges">
          {terrain.map((t, k) => {
            if (!t.plotLand) return null;
            return <rect key={`dbg${k}`} x={t.sx} y={t.sy} width={t.sw} height={t.sh} fill="#3fd07a" opacity={0.28} />;
          })}
        </g>
      )}

      {/* STREET-GROUND on the buildable land: a paved base UNDER the plots. Each plot
          is inset from its carved cell, so the gaps between plots reveal this ground
          as the street grid — circulation for free from the subdivide tiling. */}
      {!DEBUG_HIDE_PLOTS && mode === 'building' && terrain && (
        <g className="bk-streetground" shapeRendering="crispEdges">
          {/* pave the block's BUILDABLE land (street corridors included) — NOT the
              plots' bounding boxes, which slab over unbuildable terrain a lot only
              WRAPS (a bbox spanning a forest painted the forest grey). */}
          {terrain.map((t, k) => {
            if (!t.buildableBlock) return null;
            return <rect key={`sg${k}`} x={t.sx} y={t.sy} width={t.sw} height={t.sh} className="bk-pave" />;
          })}
        </g>
      )}

      {/* ANCESTOR CIRCULATION (spec T1) — the city's road network and the
          district's lanes, projected through this scope's patch. The artery you
          saw from the plane runs through here, same look, deeper zoom = MORE
          roads, never fewer. Drawn over terrain, under the parcels. */}
      {arterySegs.length > 0 && (
        <g className="bk-arteries">
          {arterySegs.map((s, i) => (
            <g key={i}>
              <line x1={s.a.x} y1={s.a.y} x2={s.b.x} y2={s.b.y}
                className={s.cls === 'artery' ? 'bk-artery-bed' : 'bk-lane-bed2'} />
              <line x1={s.a.x} y1={s.a.y} x2={s.b.x} y2={s.b.y}
                className={s.cls === 'artery' ? 'bk-artery-top' : 'bk-lane-top'} />
            </g>
          ))}
        </g>
      )}

      {/* the LOCAL net — lanes/streets among parcels AND gates, so it visibly
          JOINS the artery at its entry points (the gates). */}
      {localNet.length > 0 && (
        <g className="bk-streets">
          {localNet.map((s, i) => (
            <g key={i}>
              <line x1={s.a.x} y1={s.a.y} x2={s.b.x} y2={s.b.y} className="bk-lane-bed" />
              <line x1={s.a.x} y1={s.a.y} x2={s.b.x} y2={s.b.y} className="bk-street" />
            </g>
          ))}
          {gates.map((g) => (
            <circle key={g.id} cx={localToScreen(g.stats.gx ?? 0.5, g.stats.gy ?? 0.5).x} cy={localToScreen(g.stats.gx ?? 0.5, g.stats.gy ?? 0.5).y} r={6} className="bk-gate" />
          ))}
        </g>
      )}

      {/* DEBUG: plot OUTLINES (the real carved shape, unfilled) + a POI ★ at each
          anchor — over the terrain, no fills. See where plots + POIs land. */}
      {DEBUG_HIDE_PLOTS && plots.map((p) => {
        const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
        const isSel = selected === p.b.id;
        const region = world?.region(p.b.id) ?? [];
        return (
          <g key={`poi${p.b.id}`}
            onClick={(e) => { e.stopPropagation(); onSelect(p.b.id); }}
            onDoubleClick={(e) => { e.stopPropagation(); onDive(p.b); }} style={{ cursor: 'pointer' }}>
            {region.length > 2
              ? <RegionOutline flat={region} sel={isSel} map={map} />
              : <rect x={p.x} y={p.y} width={p.w} height={p.h} fill="none"
                  stroke={isSel ? '#e8c06a' : '#7d93bd'} strokeWidth={isSel ? 2 : 1} />}
            <text x={cx} y={cy + 6} textAnchor="middle" fontSize={20}
              fill={isSel ? '#e8c06a' : '#ffde8a'} stroke="#0008" strokeWidth={0.6}>★</text>
          </g>
        );
      })}

      {/* the PARCELS — disjoint carves of the land, drawn from their world patch */}
      {!DEBUG_HIDE_PLOTS && plots.map((p) => {
        const isSel = selected === p.b.id;
        const pad = mode === 'building' ? 6 : 4;
        const big = p.w > 90 && p.h > 60;
        if (mode === 'building') {
          const u = useOf(p.b);
          const floors = Math.max(1, Math.round(p.b.stats.floors ?? 1));
          const region = world?.region(p.b.id) ?? [];
          const anchor = posOf.get(p.b.id) ?? { x: p.x + p.w / 2, y: p.y + p.h / 2 };
          // ── LOT SIZE → CAPACITY (engine-decided) ──────────────────────────────
          // built=0 → an EMPTY lot (a yard/pocket, no building); fill = how much of
          // the lot the roof covers (rich→yard, dense→brim, per use); split = how
          // many footprints on this lot (a big lot = a duplex / complex). All from
          // the engine's settle rules — the LAND decides, the renderer draws it.
          const built = (p.b.stats.built ?? 1) > 0.5;
          const fill = p.b.stats.fill ?? Math.min(0.85, 0.5 + floors * 0.03);
          const split = Math.max(1, Math.round(p.b.stats.split ?? 1));
          // ── THE ROOF = the carved lot, ERODED to a setback ────────────────────
          // The footprint is a SUBSET of the lot's own region cells: erode the cell
          // set inward by a (1-fill) margin, so the roof HAS THE LOT'S SHAPE (an
          // L-lot → an L-roof) with a yard ring whose width the engine decided.
          // split>1 partitions the eroded cells along the lot's longer axis into
          // separate roofs with a 1-cell gap. A top-down floorplan, from data.
          const roofs = built && region.length > 2 ? roofGroups(region, fill, split) : null;
          const lotSide = Math.max(10, Math.min(p.w, p.h)); // fallback-square extent
          const horiz = p.w >= p.h;
          const roofSide = Math.min(lotSide * fill, S * 0.14);
          const showText = built && split === 1 && (roofs ? p.w > 60 : roofSide > 44);
          return (
            <g key={p.b.id} className={`bk-plot ${isSel ? 'sel' : ''}`}
              onClick={(e) => { e.stopPropagation(); onSelect(p.b.id); }}
              onDoubleClick={(e) => { e.stopPropagation(); onDive(p.b); }} style={{ cursor: 'pointer' }}>
              {/* the LOT = the real carved region (yard/ground), outlined so an EMPTY
                  lot still reads as a parcel (just no building on it). */}
              {region.length > 2 ? (
                <>
                  <RegionShape flat={region} color={built ? '#2c3242' : '#27331f'} opacity={built ? 0.5 : 0.42} map={map} />
                  {/* sidewalk: pavement only on the edges that face a STREET
                      (computed block-wide) — not a ring around the lot. */}
                  {sidewalks.get(p.b.id) && <Sidewalk d={sidewalks.get(p.b.id)!} />}
                  {isSel && <RegionOutline flat={region} sel map={map} />}
                </>
              ) : (
                <rect x={p.x + 4} y={p.y + 4} width={Math.max(0, p.w - 8)} height={Math.max(0, p.h - 8)} rx={2}
                  fill={built ? '#2c3242' : '#27331f'} fillOpacity={0.5} stroke={isSel ? '#e8c06a' : '#7d93bd'} strokeWidth={1} />
              )}
              {/* the ROOF footprint(s) — lot-shaped: the eroded region cells drawn
                  as a solid roof mass (per split group), with a crisp perimeter and
                  windows scaled to each roof's bbox. Empty lots (built=0) draw no
                  roof — just the yard/ground above shows. Fallback (no region data):
                  the old anchor squares. */}
              {roofs && roofs.map((grp, si) => (
                <RoofShape key={si} cells={grp} cell={region[0]} color={u.color} map={map}
                  floors={floors} seed={p.b.id + si * 97} uid={`${p.b.id}-${si}`} />
              ))}
              {built && !roofs && Array.from({ length: split }).map((_, si) => {
                const off = (si - (split - 1) / 2) * roofSide * 1.15;
                const rx = anchor.x + (horiz ? off : 0) - roofSide / 2;
                const ry = anchor.y + (horiz ? 0 : off) - roofSide / 2;
                return (
                  <g key={si}>
                    <rect x={rx} y={ry} width={roofSide} height={roofSide} rx={2} fill={u.color} className="bk-rect" />
                    <BuildingWindows x={rx} y={ry} w={roofSide} h={roofSide} floors={floors} seed={p.b.id + si * 97} />
                  </g>
                );
              })}
              {showText && (() => {
                // the label belongs ON the roof — its centroid, not the land anchor
                const c = roofs?.[0]?.length ? cellsCenter(roofs[0], region[0], map) : anchor;
                return <>
                  <text x={c.x} y={c.y - 2} className="bk-glyph" textAnchor="middle">{u.glyph}</text>
                  <text x={c.x} y={c.y + 15} className="bk-use" textAnchor="middle">{u.label}</text>
                </>;
              })()}
            </g>
          );
        }
        // BLOCK mode — the city treatment: bold territory drawn as the parcel's
        // TRUE CARVED SHAPE (engine region_cells — a coastal block hugs the
        // coastline, never drapes the bay), plus the HAZE of the next level
        // showing through (real buildings if revealed, a speckled idea if not).
        const mix = p.b.stats.mix ?? 0.5;
        const idea = !p.b.revealed;
        // block IDENTITY tint — a LIGHT wash keyed to block type, over the real
        // terrain (which now carries the land green). Subtle, so you read block
        // boundaries + character without a green FLOOD burying the terrain. (Was a
        // solid 0.88 hsl fill that doubled up with the terrain green — over-green.)
        const color = `hsl(${28 + mix * 175} 45% 55%)`;
        const kind = mix < 0.38 ? 'commercial' : mix > 0.66 ? 'residential' : 'mixed-use';
        const kidsOf = (p.b.children ?? []).map((c) => byId?.get(c)).filter((e): e is EntityDto => !!e && !e.infra);
        const anchor = posOf.get(p.b.id)!;
        const region = world?.region(p.b.id) ?? [];
        return (
          <g key={p.b.id} className={`bk-plot ${idea ? 'idea' : ''} ${isSel ? 'sel' : ''}`}
            onClick={(e) => { e.stopPropagation(); onSelect(p.b.id); }}
            onDoubleClick={(e) => { e.stopPropagation(); onDive(p.b); }} style={{ cursor: 'pointer' }}>
            {region.length > 2 ? (
              <>
                {/* light identity wash over the terrain + a crisp boundary outline */}
                <RegionShape flat={region} color={color} opacity={idea ? 0.16 : 0.26} map={map} />
                <RegionOutline flat={region} sel={isSel} map={map} />
              </>
            ) : (
              <rect x={p.x + pad} y={p.y + pad} width={Math.max(0, p.w - pad * 2)} height={Math.max(0, p.h - pad * 2)}
                rx={6} fill={color} className="bk-rect" opacity={idea ? 0.16 : 0.26}
                stroke="#9fb2d0" strokeWidth={1} />
            )}
            {/* THE HAZE — the next zoom level shimmering through this one */}
            {idea
              ? <IdeaSpeckle plot={p} busy={p.b.stats.busy ?? 0.4} seed={p.b.id} />
              : <BuildingHaze plot={p} kids={kidsOf} />}
            {big && <>
              <text x={anchor.x} y={anchor.y - 2} className="bk-use" textAnchor="middle">{p.b.name}</text>
              <text x={anchor.x} y={anchor.y + 16} className="bk-fl" textAnchor="middle">
                {kind}{kidsOf.length ? ` · ${kidsOf.length} buildings` : ''}
              </text>
              {idea && <text x={anchor.x} y={anchor.y + 36} className="bk-dive" textAnchor="middle">▸ dive in</text>}
            </>}
          </g>
        );
      })}

      {/* no street lines — the GAPS between the subdivide plots ARE the streets,
          showing the street-ground under the inset plots (the lab's Subdivide look). */}
      <rect x="0" y="0" width={S} height={S} fill="url(#bkvign)" pointerEvents="none" />
    </svg>
    {mode === 'block' && (
      <div className="cx-legend">
        <span><i className="lg dist" /> block</span>
        <span><i className="lg rug" /> hills / cliffs</span>
        <span><i className="lg beach" /> beach</span>
        <span><i className="lg water" /> water</span>
        <span><i className="lg road" /> lane</span>
      </div>
    )}
   </div>
  );
}

// THE STREET-LEVEL COASTLINE — the same elevation field the city view rasters,
// contoured into a smooth EDGE (marching squares at the sea level iso, with
// linear interpolation along cell edges). A sand band + a water line trace it.
// This is the scale-aware principle's flagship: field far, contour near.
function Coastline({ world, bounds, map }: { world: World; bounds: [number, number, number, number]; map: ScopeMap }) {
  const paths = useMemo(() => {
    const N = 72, ISO = SEA;
    // sample over the WHOLE VIEWPORT's world extent (matching the terrain grid), so
    // the coastline traces the coast across the filled frame, not just the patch.
    const wa = map.toW(0, 0), wb = map.toW(S, S);
    const x0 = wa.wx, y0 = wa.wy, x1 = wb.wx, y1 = wb.wy;
    const e: number[] = [];
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      e.push(world.sampleField('elevation', x0 + (x1 - x0) * i / N, y0 + (y1 - y0) * j / N));
    }
    const at = (i: number, j: number) => e[j * (N + 1) + i];
    // interpolated crossing point on an edge between two lattice corners
    const lerp = (a: number, b: number) => { const d = b - a; return Math.abs(d) < 1e-6 ? 0.5 : (ISO - a) / d; };
    const segs: { a: [number, number]; b: [number, number] }[] = [];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const tl = at(i, j), tr = at(i + 1, j), br = at(i + 1, j + 1), bl = at(i, j + 1);
      const c = (Number(tl > ISO) << 3) | (Number(tr > ISO) << 2) | (Number(br > ISO) << 1) | Number(bl > ISO);
      if (c === 0 || c === 15) continue;
      // lattice index (i/N) now spans the whole viewport → screen fills the frame
      const X = (v: number) => (v / N) * S;
      const Y = (v: number) => (v / N) * S;
      const top: [number, number] = [X(i + lerp(tl, tr)), Y(j)];
      const right: [number, number] = [X(i + 1), Y(j + lerp(tr, br))];
      const bot: [number, number] = [X(i + lerp(bl, br)), Y(j + 1)];
      const left: [number, number] = [X(i), Y(j + lerp(tl, bl))];
      const put = (a: [number, number], b: [number, number]) => segs.push({ a, b });
      switch (c) {
        case 1: case 14: put(left, bot); break;
        case 2: case 13: put(bot, right); break;
        case 3: case 12: put(left, right); break;
        case 4: case 11: put(top, right); break;
        case 6: case 9: put(top, bot); break;
        case 7: case 8: put(left, top); break;
        case 5: put(left, top); put(bot, right); break;
        case 10: put(left, bot); put(top, right); break;
      }
    }
    // chain segments into polylines by shared endpoints, then smooth
    const key = (p: [number, number]) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`;
    const by = new Map<string, number[]>();
    segs.forEach((s, i) => {
      for (const p of [s.a, s.b]) {
        const k = key(p);
        if (!by.has(k)) by.set(k, []);
        by.get(k)!.push(i);
      }
    });
    const used = new Array(segs.length).fill(false);
    const lines: [number, number][][] = [];
    for (let i = 0; i < segs.length; i++) {
      if (used[i]) continue;
      used[i] = true;
      const line: [number, number][] = [segs[i].a, segs[i].b];
      let grew = true;
      while (grew) {
        grew = false;
        for (const end of [0, 1]) {
          const tip = end === 0 ? line[0] : line[line.length - 1];
          const next = (by.get(key(tip)) ?? []).find((s) => !used[s]);
          if (next == null) continue;
          used[next] = true;
          const s = segs[next];
          const add = key(s.a) === key(tip) ? s.b : s.a;
          if (end === 0) line.unshift(add); else line.push(add);
          grew = true;
        }
      }
      if (line.length > 2) lines.push(line);
    }
    // drop tiny noise loops (islet specks read as stray squiggles, not coast)
    const len = (pts: [number, number][]) => {
      let l = 0;
      for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      return l;
    };
    return lines.filter((pts) => len(pts) > 70).map((pts) => {
      let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)} `;
      for (let i = 1; i < pts.length - 1; i++) {
        const m = [(pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2];
        d += `Q ${pts[i][0].toFixed(1)} ${pts[i][1].toFixed(1)} ${m[0].toFixed(1)} ${m[1].toFixed(1)} `;
      }
      const last = pts[pts.length - 1];
      return d + `L ${last[0].toFixed(1)} ${last[1].toFixed(1)}`;
    });
  }, [world, bounds, map]);
  return (
    <g fill="none">
      {paths.map((d, i) => <path key={`sand${i}`} d={d} stroke="#c9b98a" strokeWidth={10} strokeLinecap="round" opacity={0.9} />)}
      {paths.map((d, i) => <path key={`edge${i}`} d={d} stroke="#173c63" strokeWidth={3.5} strokeLinecap="round" />)}
    </g>
  );
}

// A parcel's TRUE shape from the engine's carve: [cellSize, x0,y0,x1,y1,…] in
// parent-local coords. Drawn as crisp grid squares — the coastline edge is the
// engine's actual ownership boundary, not an approximation.
// DEBUG: the carved region's PERIMETER only (unfilled outline). Draw each cell edge
// that ISN'T shared with another cell of the same plot → the plot's true boundary.
function RegionOutline({ flat, sel, map }: { flat: number[]; sel: boolean; map: ScopeMap }) {
  return <path d={regionPerimeter(flat, map)} fill="none" stroke={sel ? '#e8c06a' : '#9fb2d0'} strokeWidth={sel ? 2 : 1.2} shapeRendering="crispEdges" />;
}
// SIDEWALK: a pale band hugging the lot's boundary. Drawn under the lot fill so
// only the outer half of the stroke shows — a curb ribbon between lot and
// street; the gaps between lots read as streets WITH sidewalks, not voids.
function Sidewalk({ d }: { d: string }) {
  return <g>
    {/* pavement band + a faint curb line */}
    <path d={d} fill="none" stroke="#788093" strokeOpacity={0.85} strokeWidth={7} strokeLinecap="square" shapeRendering="crispEdges" />
    <path d={d} fill="none" stroke="#a8afc0" strokeOpacity={0.5} strokeWidth={1} shapeRendering="crispEdges" />
  </g>;
}

function RegionShape({ flat, color, opacity, map }: { flat: number[]; color: string; opacity: number; map: ScopeMap }) {
  // cells are stored in scope-local 0..1 (both axes); the uniform screen scale maps
  // local-X by pw*unit and local-Y by ph*unit, so on a non-square patch a cell is a
  // rectangle — the honest shape, not stretched to square.
  const cw = flat[0] * map.pw * map.unit, ch = flat[0] * map.ph * map.unit;
  const squares = [];
  for (let i = 1; i + 1 < flat.length; i += 2) {
    const s = localToScreenWith(map, flat[i], flat[i + 1]);
    squares.push(<rect key={i} x={s.x - cw / 2} y={s.y - ch / 2} width={cw + 0.6} height={ch + 0.6} />);
  }
  return <g className="bk-region" shapeRendering="crispEdges" fill={color} opacity={opacity}>{squares}</g>;
}

// ── ROOF FOOTPRINT from the carved lot ──────────────────────────────────────
// The lot IS a set of grid cells (world.region). The roof = that set eroded
// inward by a (1-fill) margin (morphological 4-neighbour erosion), so it keeps
// the lot's SHAPE with a yard ring around it; split>1 partitions the eroded set
// into contiguous bands along the lot's longer axis, with a 1-cell gap.
function roofGroups(flat: number[], fill: number, split: number): GCell[][] {
  const cell = flat[0];
  const key = (gx: number, gy: number) => `${gx},${gy}`;
  let cells: GCell[] = [];
  const own = new Set<string>();
  for (let i = 1; i + 1 < flat.length; i += 2) {
    const gx = Math.round(flat[i] / cell - 0.5), gy = Math.round(flat[i + 1] / cell - 0.5);
    cells.push({ gx, gy }); own.add(key(gx, gy));
  }
  if (!cells.length) return [];
  // bbox → erosion margin: (1-fill) of the half-span, at least 0, and never so
  // deep the roof vanishes (back off a step if an iteration would empty the set).
  // fill = fraction of the lot COVERED. Erosion is COVERAGE-DRIVEN, not a
  // precomputed pass count: peel boundary rings until the surviving cells reach
  // fill×total, stopping BEFORE a pass that would overshoot (or empty). This is
  // exact for any lot shape — a bbox-derived margin over-eroded big irregular
  // lots (local thickness ≪ bbox halfspan) down to specks.
  const target = Math.max(4, Math.round(cells.length * Math.max(0.05, Math.min(1, fill))));
  let alive = new Set(own);
  while (alive.size > target) {
    const next = new Set<string>();
    for (const c of cells) {
      if (!alive.has(key(c.gx, c.gy))) continue;
      const inner = alive.has(key(c.gx - 1, c.gy)) && alive.has(key(c.gx + 1, c.gy))
        && alive.has(key(c.gx, c.gy - 1)) && alive.has(key(c.gx, c.gy + 1));
      if (inner) next.add(key(c.gx, c.gy));
    }
    if (next.size === 0 || next.size < target * 0.6) break; // would overshoot — keep this ring
    alive = next;
  }
  let roof = cells.filter((c) => alive.has(key(c.gx, c.gy)));
  if (!roof.length) roof = cells; // degenerate sliver lot: roof = the whole lot
  // ── STRAIGHTEN THE WALLS (bendable) ────────────────────────────────────────
  // A building prefers a few clean rectangular chunks over a jagged staircase
  // edge. Two smoothing passes over the cell set: FILL concave notches (a lot
  // cell with ≥3 roof neighbours joins the roof — walls square off) and SHAVE
  // spurs (a roof cell with ≤1 roof neighbour drops — no lone teeth). Fills are
  // constrained to the LOT's own cells, so the roof never escapes its parcel;
  // it's a preference, not a law — big terrain-hugging bends survive.
  if (roof.length > 4) {
    let set = new Set(roof.map((c) => key(c.gx, c.gy)));
    const nOf = (s: Set<string>, gx: number, gy: number) =>
      Number(s.has(key(gx - 1, gy))) + Number(s.has(key(gx + 1, gy)))
      + Number(s.has(key(gx, gy - 1))) + Number(s.has(key(gx, gy + 1)));
    for (let pass = 0; pass < 2; pass++) {
      const next = new Set(set);
      for (const c of cells) { // fill notches (lot cells only)
        if (!set.has(key(c.gx, c.gy)) && nOf(set, c.gx, c.gy) >= 3) next.add(key(c.gx, c.gy));
      }
      for (const c of cells) { // shave spurs
        if (next.has(key(c.gx, c.gy)) && nOf(next, c.gx, c.gy) <= 1 && next.size > 4) next.delete(key(c.gx, c.gy));
      }
      set = next;
    }
    roof = cells.filter((c) => set.has(key(c.gx, c.gy)));
    if (!roof.length) roof = cells;
  }
  // ── MAX SLENDERNESS (bendable) ─────────────────────────────────────────────
  // A building is a CHUNK, not a ribbon: on a sliver lot the erosion can't bite
  // (margin rounds to 0) and the roof fills the whole strip. Cap the roof's
  // aspect at ~3:1 — keep a centred window along the long axis, the rest of the
  // strip stays yard. (The window is centred on the roof's own centroid, so the
  // chunk sits where the lot's mass is.)
  {
    let bx0 = Infinity, bx1 = -Infinity, by0 = Infinity, by1 = -Infinity, cxm = 0, cym = 0;
    for (const c of roof) {
      if (c.gx < bx0) bx0 = c.gx; if (c.gx > bx1) bx1 = c.gx;
      if (c.gy < by0) by0 = c.gy; if (c.gy > by1) by1 = c.gy;
      cxm += c.gx; cym += c.gy;
    }
    cxm /= roof.length; cym /= roof.length;
    const bw = bx1 - bx0 + 1, bh = by1 - by0 + 1;
    const short = Math.min(bw, bh), long = Math.max(bw, bh);
    const maxLong = Math.max(3, short * 3) * Math.max(1, split); // splits get room for their bands
    if (long > maxLong) {
      const alongX = bw >= bh;
      const ctr = alongX ? cxm : cym;
      const lo = Math.round(ctr - maxLong / 2), hi = lo + maxLong;
      const cut = roof.filter((c) => { const v = alongX ? c.gx : c.gy; return v >= lo && v < hi; });
      if (cut.length) roof = cut;
    }
  }
  if (split <= 1) return [roof];
  // partition along the roof's longer axis into `split` bands, 1-cell gap between
  let rx0 = Infinity, rx1 = -Infinity, ry0 = Infinity, ry1 = -Infinity;
  for (const c of roof) {
    if (c.gx < rx0) rx0 = c.gx; if (c.gx > rx1) rx1 = c.gx;
    if (c.gy < ry0) ry0 = c.gy; if (c.gy > ry1) ry1 = c.gy;
  }
  const rw = rx1 - rx0 + 1;
  const rh = ry1 - ry0 + 1;
  const alongX = rw >= rh;
  const lo = alongX ? rx0 : ry0;
  const extent = alongX ? rw : rh;
  const n = Math.min(split, Math.max(1, Math.floor((extent + 1) / 2))); // need ≥1 cell/band
  const groups: GCell[][] = Array.from({ length: n }, () => []);
  // gap between the split roofs SCALES with the band size (a fixed 1-cell gap
  // vanishes on fine grids) — ~12% of a band, at least 1 cell.
  const gapW = Math.max(1, Math.round((extent / n) * 0.12));
  for (const c of roof) {
    const v = (alongX ? c.gx : c.gy) - lo;
    const gi = Math.min(n - 1, Math.floor((v / extent) * n));
    const bandLo = Math.ceil((gi * extent) / n);
    if (gi > 0 && v < bandLo + gapW) continue;
    groups[gi].push(c);
  }
  return groups.filter((g) => g.length > 0);
}

// One roof mass: the group's cells filled solid + a crisp perimeter (edges not
// shared with a same-group cell), + windows scaled to the group's bbox. Same
// grid-corner math as RegionOutline — the roof snaps to the lot's own lattice.
function RoofShape({ cells, cell, color, map, floors, seed, uid }: {
  cells: GCell[]; cell: number; color: string; map: ScopeMap; floors: number; seed: number; uid: string;
}) {
  const key = (gx: number, gy: number) => `${gx},${gy}`;
  const own = new Set(cells.map((c) => key(c.gx, c.gy)));
  const P = (gx: number, gy: number) => localToScreenWith(map, gx * cell, gy * cell);
  const rects = [];
  const edges: string[] = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const { gx, gy } of cells) {
    const a = P(gx, gy), b = P(gx + 1, gy + 1);
    rects.push(<rect key={key(gx, gy)} x={a.x} y={a.y} width={b.x - a.x + 0.5} height={b.y - a.y + 0.5} />);
    minX = Math.min(minX, a.x); minY = Math.min(minY, a.y);
    maxX = Math.max(maxX, b.x); maxY = Math.max(maxY, b.y);
    if (!own.has(key(gx - 1, gy))) edges.push(`M${a.x.toFixed(1)} ${a.y.toFixed(1)} L${a.x.toFixed(1)} ${b.y.toFixed(1)}`);
    if (!own.has(key(gx + 1, gy))) edges.push(`M${b.x.toFixed(1)} ${a.y.toFixed(1)} L${b.x.toFixed(1)} ${b.y.toFixed(1)}`);
    if (!own.has(key(gx, gy - 1))) edges.push(`M${a.x.toFixed(1)} ${a.y.toFixed(1)} L${b.x.toFixed(1)} ${a.y.toFixed(1)}`);
    if (!own.has(key(gx, gy + 1))) edges.push(`M${a.x.toFixed(1)} ${b.y.toFixed(1)} L${b.x.toFixed(1)} ${b.y.toFixed(1)}`);
  }
  const w = maxX - minX, h = maxY - minY;
  // A speck-sized roof (a sliver lot) draws as a plain small mass, no perimeter
  // noise, no windows — it reads as a shed, not visual noise.
  const tiny = w < 14 || h < 12;
  const clipId = `roofclip-${uid}`;
  return (
    <g>
      <g shapeRendering="crispEdges" fill={color} className="bk-roof">{rects}</g>
      {!tiny && <>
        <path d={edges.join(' ')} fill="none" stroke="#0b0e16" strokeOpacity={0.55} strokeWidth={1.4} shapeRendering="crispEdges" />
        {/* ROOFTOP furniture (not windows — this is a roof seen from above):
            parapet rim + vents/AC boxes/a skylight, CLIPPED to the real cells so
            nothing lands on the yard of an L-shaped roof. */}
        <clipPath id={clipId}>{rects.map((r, i) => <rect key={i} {...(r.props as object)} />)}</clipPath>
        <g clipPath={`url(#${clipId})`}>
          {/* parapet: a soft dark rim just inside the perimeter */}
          <path d={edges.join(' ')} fill="none" stroke="#000" strokeOpacity={0.18} strokeWidth={7} />
          <RoofTier cells={cells} cell={cell} map={map} floors={floors} seed={seed} />
          {w > 26 && h > 20 && (
            <RoofDetails x={minX} y={minY} w={w} h={h} floors={floors} seed={seed} />
          )}
        </g>
      </>}
    </g>
  );
}
// THE RIM (bendable): many buildings — the taller, the likelier — carry an
// INSET UPPER TIER: the roof mass eroded by one cell, drawn lighter (sunlit
// upper storey) with its own crisp edge. The ring left around it reads as the
// rim / setback walkway. One-storey and small roofs skip it.
function RoofTier({ cells, cell, map, floors, seed }: {
  cells: GCell[]; cell: number; map: ScopeMap; floors: number; seed: number;
}) {
  const want = floors >= 2 && h(seed, 61) < Math.min(0.9, 0.25 + floors * 0.18);
  if (!want) return null;
  const key = (gx: number, gy: number) => `${gx},${gy}`;
  const own = new Set(cells.map((c) => key(c.gx, c.gy)));
  const inner = cells.filter((c) =>
    own.has(key(c.gx - 1, c.gy)) && own.has(key(c.gx + 1, c.gy))
    && own.has(key(c.gx, c.gy - 1)) && own.has(key(c.gx, c.gy + 1)));
  if (inner.length < 4) return null; // no room for a tier — flat roof
  const iset = new Set(inner.map((c) => key(c.gx, c.gy)));
  const P = (gx: number, gy: number) => localToScreenWith(map, gx * cell, gy * cell);
  const rects = [];
  const edges: string[] = [];
  for (const { gx, gy } of inner) {
    const a = P(gx, gy), b = P(gx + 1, gy + 1);
    rects.push(<rect key={key(gx, gy)} x={a.x} y={a.y} width={b.x - a.x + 0.5} height={b.y - a.y + 0.5} />);
    if (!iset.has(key(gx - 1, gy))) edges.push(`M${a.x.toFixed(1)} ${a.y.toFixed(1)} L${a.x.toFixed(1)} ${b.y.toFixed(1)}`);
    if (!iset.has(key(gx + 1, gy))) edges.push(`M${b.x.toFixed(1)} ${a.y.toFixed(1)} L${b.x.toFixed(1)} ${b.y.toFixed(1)}`);
    if (!iset.has(key(gx, gy - 1))) edges.push(`M${a.x.toFixed(1)} ${a.y.toFixed(1)} L${b.x.toFixed(1)} ${a.y.toFixed(1)}`);
    if (!iset.has(key(gx, gy + 1))) edges.push(`M${a.x.toFixed(1)} ${b.y.toFixed(1)} L${b.x.toFixed(1)} ${b.y.toFixed(1)}`);
  }
  return (
    <g>
      <g shapeRendering="crispEdges" fill="#fff" opacity={0.13}>{rects}</g>
      <path d={edges.join(' ')} fill="none" stroke="#0b0e16" strokeOpacity={0.4} strokeWidth={1} shapeRendering="crispEdges" />
    </g>
  );
}

// What a roof actually shows from above: HVAC boxes, small vents, maybe a
// skylight run — deterministic per building, count scaled to roof area, taller
// buildings get more plant. Drawn in neutral greys so the roof COLOR still
// carries the use; these are texture, not decoration.
function RoofDetails({ x, y, w, h: hh, floors, seed }: { x: number; y: number; w: number; h: number; floors: number; seed: number }) {
  // NB: the height prop is aliased to `hh` — the bare name would shadow the
  // module hash fn `h(...)` used below for the deterministic scatter.
  const area = w * hh;
  const nAC = Math.max(1, Math.min(5, Math.round(area / 3200) + Math.min(2, floors - 1)));
  const items = [];
  // AC/plant units: ONE NEAT ROW along the roof's longer axis, uniform size,
  // tucked toward a seeded corner — rooftop plant is installed, not littered.
  {
    const s = 8;
    const gap = 5;
    const along = w >= hh;
    const rowLen = nAC * s + (nAC - 1) * gap;
    const nearFar = h(seed, 71) < 0.5 ? 0.22 : 0.78; // which side of the roof
    const start = h(seed, 73) < 0.5 ? 0.2 : 0.8;     // which end the row hugs
    const ax = along ? x + w * start - (start > 0.5 ? rowLen : 0) : x + w * nearFar - s / 2;
    const ay = along ? y + hh * nearFar - s / 2 : y + hh * start - (start > 0.5 ? rowLen : 0);
    for (let i = 0; i < nAC; i++) {
      const px = along ? ax + i * (s + gap) : ax;
      const py = along ? ay : ay + i * (s + gap);
      items.push(<g key={`ac${i}`}>
        <rect x={px} y={py} width={s} height={s} fill="#3a3f4a" stroke="#12151c" strokeWidth={0.8} />
        <rect x={px + 1.5} y={py + 1.5} width={s - 3} height={2} fill="#565d6b" />
      </g>);
    }
  }
  // one skylight run on bigger roofs: a short light strip along the longer axis
  if (area > 3200) {
    const along = w >= hh;
    const len = (along ? w : hh) * 0.28;
    const px = x + w * (0.25 + h(seed, 501) * 0.4);
    const py = y + hh * (0.25 + h(seed, 503) * 0.4);
    items.push(<rect key="sky" x={px - (along ? len / 2 : 2.5)} y={py - (along ? 2.5 : len / 2)}
      width={along ? len : 5} height={along ? 5 : len} fill="#9fb6d8" opacity={0.5} rx={1.5} />);
  }
  return <g>{items}</g>;
}


// The next level showing through, HONESTLY: the block's real generated buildings
// as faint footprints (their engine plot rects mapped into this block's rect).
function BuildingHaze({ plot, kids }: { plot: { x: number; y: number; w: number; h: number }; kids: EntityDto[] }) {
  return (
    <g pointerEvents="none" opacity={0.5}>
      {kids.map((k) => {
        // building plots are block-local (px,py + w,h in the block's 0..1)
        const bw = (k.stats.w ?? 0.2) * plot.w, bh = (k.stats.h ?? 0.2) * plot.h;
        const bx = plot.x + (k.stats.px ?? 0.5) * plot.w - bw / 2;
        const by = plot.y + (k.stats.py ?? 0.5) * plot.h - bh / 2;
        return <rect key={k.id} x={bx + bw * 0.18} y={by + bh * 0.18} width={bw * 0.64} height={bh * 0.64}
          rx={2} className="bk-haze" />;
      })}
    </g>
  );
}

// An unrevealed block's "idea" of itself: deterministic speckles scaled by its
// busy-ness — a coarse promise of the buildings that will crystallize on dive.
function IdeaSpeckle({ plot, busy, seed }: { plot: { x: number; y: number; w: number; h: number }; busy: number; seed: number }) {
  const n = Math.round(4 + busy * 10);
  const dots = [];
  for (let i = 0; i < n; i++) {
    const rx = h(seed, i * 2), ry = h(seed, i * 2 + 1);
    dots.push(<circle key={i} cx={plot.x + plot.w * (0.15 + rx * 0.7)} cy={plot.y + plot.h * (0.15 + ry * 0.7)}
      r={2 + h(seed, i + 900) * 2} className="bk-speck" />);
  }
  return <g pointerEvents="none">{dots}</g>;
}


function BuildingWindows({ x, y, w, h, floors, seed }: { x: number; y: number; w: number; h: number; floors: number; seed: number }) {
  // window CELL size targets a fixed ~16px pitch (never scales up with the roof):
  // a big roof gets MORE windows, not giant ones — reads as building texture.
  const cols = Math.max(2, Math.round((w * 0.8) / 16));
  const rows = Math.max(Math.min(floors, 5), Math.round((h * 0.7) / 16));
  const cells = [];
  const mw = w * 0.8, mh = h * 0.7;
  const ox = x + (w - mw) / 2, oy = y + (h - mh) / 2;
  const cw = mw / cols, ch = mh / rows;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const lit = ((seed * 2654435761 + (r * cols + c) * 40503) >>> 0) / 4294967296 > 0.5;
    cells.push(<rect key={`${r}-${c}`} x={ox + c * cw + cw * 0.2} y={oy + r * ch + ch * 0.2}
      width={cw * 0.6} height={ch * 0.55} className={lit ? 'bk-win lit' : 'bk-win'} />);
  }
  return <g>{cells}</g>;
}
