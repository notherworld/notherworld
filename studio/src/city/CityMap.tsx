// The CITY level as a real, CONTIGUOUS map. Districts are Voronoi cells that tile
// the whole space (no gaps, shared organic borders) — computed from the engine's
// seed positions. The engine already told us who borders whom (border edges); we
// draw those seams as roads. Color = heat/wealth; downtown is the bright core.

import { useMemo } from 'react';
import type { EntityDto, EdgeDto, World } from '../owos';
import { tessellate, organicPath, centroid, type Seed, type P } from '../view/voronoi';

type Props = {
  districts: EntityDto[];
  bridges?: EntityDto[];
  shores?: EntityDto[];
  edges: EdgeDto[];
  world: World | null;
  selected: number | null;
  onSelect: (id: number) => void;
  onDive: (e: EntityDto) => void;
};

const S = 1000;
const SEA = 0.40; // elevation below this is water — a real coastline

// bold, DISTINCT per-district color so each neighbourhood reads as its own place.
// hue spread by the district's own character stat (well-separated), warmth by heat,
// richness by wealth. These are the SUBJECT — vivid, not faint tints.
function fill(e: EntityDto): string {
  const ring0 = (e.stats.ring ?? 1) < 0.5;
  const heat = e.stats.heat ?? 0.2, wealth = e.stats.wealth ?? 0.5;
  const ch = e.stats.character ?? ((e.id * 0.137) % 1);
  if (ring0) return `hsl(${44 + heat * 8} 70% 52%)`; // downtown = warm gold, always distinct
  const hue = (ch * 320 + heat * 20) % 360;
  const sat = 46 + wealth * 20;
  const light = 46 + wealth * 8;
  return `hsl(${hue} ${sat}% ${light}%)`;
}

export default function CityMap({ districts, bridges = [], shores = [], edges, world, selected, onSelect, onDive }: Props) {
  const seeds: Seed[] = useMemo(
    () => districts.map((d) => ({ id: d.id, x: (d.stats.cx ?? 0.5) * S, y: (d.stats.cy ?? 0.5) * S })),
    [districts],
  );
  const cells = useMemo(() => tessellate(seeds, S, S), [seeds]);
  const byId = useMemo(() => new Map(districts.map((d) => [d.id, d])), [districts]);

  // ---- terrain layer: sample the elevation field on a grid for shading, and get
  // the river path from the engine. The land the city sits on, straight from the brain.
  const G = 48;
  // sample terrain per cell: elevation + which SHORE type (beach/cliff) it is —
  // both derived from the SAME water field, split by slope. Different field combo,
  // different coastline.
  const elevGrid = useMemo(() => {
    if (!world) return null;
    const g: { e: number; beach: boolean; cliff: boolean }[] = [];
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
      const x = (i + 0.5) / G, y = (j + 0.5) / G;
      g.push({
        e: world.sampleField('elevation', x, y),
        beach: world.sampleField('beach', x, y) >= 0.5,
        cliff: world.sampleField('cliff', x, y) >= 0.5,
      });
    }
    return g;
  }, [world, districts.length]);
  const buildGrid = useMemo(() => {
    if (!world) return null;
    const g: boolean[] = [];
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
      g.push(world.sampleField('buildable', (i + 0.5) / G, (j + 0.5) / G) >= 0.5);
    }
    return g;
  }, [world, districts.length]);
  const river = useMemo(() => {
    if (!world) return [];
    const flat = world.river('elevation', 60);
    const pts: P[] = [];
    for (let i = 0; i < flat.length; i += 2) pts.push({ x: flat[i] * S, y: flat[i + 1] * S });
    return pts;
  }, [world, districts.length]);

  // ROAD NETWORK: `road` edges between districts + bridges, drawn as the city's
  // circulation. Positions from cx,cy (districts) or the bridge's own cx,cy.
  const posOf = useMemo(() => {
    const m = new Map<number, P>();
    districts.forEach((d) => m.set(d.id, { x: (d.stats.cx ?? 0.5) * S, y: (d.stats.cy ?? 0.5) * S }));
    bridges.forEach((b) => m.set(b.id, { x: (b.stats.cx ?? 0.5) * S, y: (b.stats.cy ?? 0.5) * S }));
    shores.forEach((s) => m.set(s.id, { x: (s.stats.cx ?? 0.5) * S, y: (s.stats.cy ?? 0.5) * S }));
    return m;
  }, [districts, bridges, shores]);
  const bridgeIds = useMemo(() => new Set(bridges.map((b) => b.id)), [bridges]);
  const roads = useMemo(() => {
    const seen = new Set<string>();
    const landRoads: string[] = [];      // road on land (incl. district↔shore approaches)
    const spans: { a: P; b: P }[] = [];  // shore↔bridge: the water span ONLY
    for (const g of edges) {
      if (g.kind !== 'road') continue;
      const key = g.from < g.to ? `${g.from}-${g.to}` : `${g.to}-${g.from}`;
      if (seen.has(key)) continue; seen.add(key);
      const a = posOf.get(g.from), b = posOf.get(g.to);
      if (!a || !b) continue;
      // A BRIDGE SPAN is only the shore↔bridge hop (the water). Everything else —
      // district↔district, district↔shore — is ROAD on land.
      if (bridgeIds.has(g.from) || bridgeIds.has(g.to)) {
        spans.push({ a, b });
        continue;
      }
      // THE ENGINE'S DECISION first: the pathfound curve for this hop (the road
      // as the terrain routed it). Fallback: straight + renderer nudge.
      const flat = world?.routePath(g.from, g.to) ?? [];
      if (flat.length >= 4) {
        const pts: P[] = [];
        for (let i = 0; i < flat.length; i += 2) pts.push({ x: flat[i] * S, y: flat[i + 1] * S });
        landRoads.push(smoothPath(pts));
        continue;
      }
      const N = 10; const pts: P[] = [];
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        pts.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      }
      if (world) {
        const nx = -(b.y - a.y), ny = (b.x - a.x); const len = Math.hypot(nx, ny) || 1;
        for (let i = 1; i < pts.length - 1; i++) {
          const p = pts[i];
          if (world.sampleField('land', p.x / S, p.y / S) < 0.5) {
            for (const s of [1, -1, 2, -2, 3, -3]) {
              const qx = p.x + (nx / len) * 28 * s, qy = p.y + (ny / len) * 28 * s;
              if (world.sampleField('land', qx / S, qy / S) >= 0.5) { p.x = qx; p.y = qy; break; }
            }
          }
        }
      }
      landRoads.push(smoothPath(pts));
    }
    return { landRoads, spans };
  }, [edges, posOf, world, bridgeIds]);

  // border seams: engine `border` edges, drawn along the shared cell boundary.
  // We draw the segment between the two seeds' midpoint region — simplest true
  // representation is a line between the two centroids, sitting on the seam.
  const seams = useMemo(() => {
    const seen = new Set<string>();
    const segs: { a: P; b: P; downtown: boolean }[] = [];
    for (const g of edges) {
      if (g.kind !== 'border') continue;
      const key = g.from < g.to ? `${g.from}-${g.to}` : `${g.to}-${g.from}`;
      if (seen.has(key)) continue; seen.add(key);
      const ca = cells.get(g.from), cb = cells.get(g.to);
      if (!ca || !cb) continue;
      // the shared edge midpoint ≈ midpoint between the two seeds
      const sa = seeds.find((s) => s.id === g.from)!, sb = seeds.find((s) => s.id === g.to)!;
      const da = byId.get(g.from), db = byId.get(g.to);
      const downtown = (da?.stats.ring ?? 1) < 0.5 || (db?.stats.ring ?? 1) < 0.5;
      segs.push({ a: { x: sa.x, y: sa.y }, b: { x: sb.x, y: sb.y }, downtown });
    }
    return segs;
  }, [edges, cells, seeds, byId]);

  return (
   <div className="cx-mapwrap">
    <svg className="cx-map" viewBox={`0 0 ${S} ${S}`} preserveAspectRatio="xMidYMid meet">
      <defs>
        <radialGradient id="cityvign" cx="50%" cy="50%" r="62%">
          <stop offset="60%" stopColor="#000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.55" />
        </radialGradient>
      </defs>

      {/* TERRAIN LAYER — a subtle stage under the city: water is bold (a hard
          boundary), but LAND is a quiet shade so the districts (the subject) pop. */}
      {elevGrid && (
        <g className="terrain">
          {elevGrid.map((t, k) => {
            const i = k % G, j = Math.floor(k / G);
            const water = t.e < SEA;
            // beach = pale sand, cliff = grey rock — SAME water, split by slope
            const c = water ? waterColor(t.e)
              : t.beach ? '#c9b98a'
              : t.cliff ? '#6b6f78'
              : landColor(t.e);
            const op = water ? 1 : (t.beach || t.cliff) ? 0.9 : 0.5;
            return <rect key={k} x={(i / G) * S} y={(j / G) * S} width={S / G + 1.2} height={S / G + 1.2}
              fill={c} opacity={op} />;
          })}
        </g>
      )}

      {/* the districts — BOLD, distinct territory clipped to their buildable land
          (cell ∩ buildable, engine-computed). This is the subject of the map. */}
      <g opacity={0.86}>
        {districts.map((d) => {
          const poly = cells.get(d.id);
          if (!poly || poly.length < 3) return null;
          const idea = !d.revealed;
          const isSel = selected === d.id;
          return (
            <g key={d.id} className={`cx-cell ${idea ? 'idea' : ''} ${isSel ? 'sel' : ''}`}
              onClick={(e) => { e.stopPropagation(); onSelect(d.id); }}
              onDoubleClick={(e) => { e.stopPropagation(); onDive(d); }}
              style={{ cursor: 'pointer' }}>
              <MaskedCell poly={poly} color={fill(d)} world={world} />
              <Stipple id={d.id} poly={poly} density={d.stats.density ?? 0.5} heat={d.stats.heat ?? 0.2} world={world} />
            </g>
          );
        })}
      </g>

      {/* a mask = white on BUILDABLE land only (not water, not cliffs) — clips the
          district borders so they trace the developed land edge, not the full cell
          over water OR rocky cliffs. */}
      {buildGrid && (
        <mask id="landmask">
          <rect x="0" y="0" width={S} height={S} fill="black" />
          {buildGrid.map((ok, k) => {
            if (!ok) return null;
            const i = k % G, j = Math.floor(k / G);
            return <rect key={k} x={(i / G) * S} y={(j / G) * S} width={S / G + 1.2} height={S / G + 1.2} fill="white" />;
          })}
        </mask>
      )}

      {/* district BORDERS as a crisp outline pass, CLIPPED to land via the mask */}
      <g className="cx-outlines" mask="url(#landmask)">
        {districts.map((d) => {
          const poly = cells.get(d.id);
          if (!poly || poly.length < 3) return null;
          const ring0 = (d.stats.ring ?? 1) < 0.5;
          return <path key={d.id} d={organicPath(poly)} fill="none"
            className={`cx-outline ${ring0 ? 'dt' : ''} ${selected === d.id ? 'sel' : ''}`} />;
        })}
      </g>

      {/* THE RIVER — traced downhill through the elevation field by the engine */}
      {river.length > 1 && (
        <g className="river">
          <path d={riverPath(river)} className="river-wide" />
          <path d={riverPath(river)} className="river-core" />
        </g>
      )}

      {/* THE ROAD NETWORK — pathfound by the engine over land, around water, bridging
          where it must cross. Circulation that reads territory + terrain. */}
      <g className="roads">
        {/* land roads — bend along the land, never over open water */}
        {roads.landRoads.map((d, i) => (
          <g key={i}>
            <path d={d} className="road-bed2" fill="none" />
            <path d={d} className="road-top" fill="none" />
          </g>
        ))}
        {/* BRIDGE SPANS — the structural crossings that carry a road over water */}
        {roads.spans.map((s, i) => (
          <line key={`sp${i}`} x1={s.a.x} y1={s.a.y} x2={s.b.x} y2={s.b.y} className="bridge-span" />
        ))}
        {/* bridge structures at the crossing points */}
        {bridges.map((b) => {
          const p = posOf.get(b.id); if (!p) return null;
          return <g key={b.id}>
            <circle cx={p.x} cy={p.y} r={7} className="bridge-mark" />
            <text x={p.x} y={p.y - 11} className="bridge-label" textAnchor="middle">⤴ bridge</text>
          </g>;
        })}
      </g>

      {/* the seams between bordering districts = the city's roads (engine edges) */}
      <g className="cx-seams">
        {seams.map((s, i) => (
          <line key={i} x1={s.a.x} y1={s.a.y} x2={s.b.x} y2={s.b.y}
            className={s.downtown ? 'seam artery' : 'seam'} />
        ))}
      </g>

      {/* labels on top, at cell centroids */}
      <g>
        {districts.map((d) => {
          const poly = cells.get(d.id);
          if (!poly || poly.length < 3) return null;
          const ring0 = (d.stats.ring ?? 1) < 0.5;
          const c = centroid(poly);
          const idea = !d.revealed;
          return (
            <g key={d.id} pointerEvents="none">
              <text x={c.x} y={c.y - 4} className={`dist-name ${ring0 ? 'dt' : ''}`} textAnchor="middle">
                {ring0 ? 'Downtown' : districtName(d)}
              </text>
              <text x={c.x} y={c.y + 18} className="dist-sub" textAnchor="middle">{descriptor(d, ring0)}</text>
              {idea && <text x={c.x} y={c.y + 40} className="dist-idea" textAnchor="middle">▸ dive in</text>}
            </g>
          );
        })}
      </g>

      <rect x="0" y="0" width={S} height={S} fill="url(#cityvign)" pointerEvents="none" />
    </svg>
    <div className="cx-legend">
      <span><i className="lg dist" /> district</span>
      <span><i className="lg rug" /> hills / cliffs</span>
      <span><i className="lg beach" /> beach</span>
      <span><i className="lg water" /> water</span>
      <span><i className="lg road" /> road</span>
      <span><i className="lg bridge" /> bridge</span>
      <span><i className="lg river" /> river</span>
    </div>
   </div>
  );
}

// A district cell filled ONLY where the `buildable` field holds — its territory
// clipped to the land (cell ∩ buildable). Sampled on a fine grid within the cell's
// bbox; each buildable, in-cell square is filled. The edge follows the coastline.
function MaskedCell({ poly, color, world }: { poly: P[]; color: string; world: World | null }) {
  const squares = useMemo(() => {
    if (!world) return null;
    const bb = bboxOf(poly);
    const step = 12; // px grid
    // fill on all LAND (not just buildable) so a district reads as CONTINUOUS
    // territory; the cliff/steep patches are drawn as texture on top, not holes.
    const land: { x: number; y: number; rugged: boolean }[] = [];
    for (let y = bb.y0; y < bb.y1; y += step) {
      for (let x = bb.x0; x < bb.x1; x += step) {
        const cx = x + step / 2, cy = y + step / 2;
        if (!pointInPoly({ x: cx, y: cy }, poly)) continue;
        if (world.sampleField('land', cx / S, cy / S) < 0.5) continue; // clip only at water
        const rugged = world.sampleField('steep', cx / S, cy / S) >= 0.5;
        land.push({ x, y, rugged });
      }
    }
    return { land, step };
  }, [poly, world]);
  if (!squares) return <path d={organicPath(poly)} fill={color} />; // fallback: no world
  return (
    <g shapeRendering="crispEdges">
      {/* the district's whole land, its colour */}
      <g fill={color}>
        {squares.land.map((s, i) => <rect key={i} x={s.x} y={s.y} width={squares.step + 0.6} height={squares.step + 0.6} />)}
      </g>
      {/* rugged (steep) patches darkened ON TOP — reads as hills/cliffs within the
          district, not black holes eating it */}
      <g fill="#00000055">
        {squares.land.filter((s) => s.rugged).map((s, i) => <rect key={i} x={s.x} y={s.y} width={squares.step + 0.6} height={squares.step + 0.6} />)}
      </g>
    </g>
  );
}
function bboxOf(poly: P[]) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const p of poly) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  return { x0, y0, x1, y1 };
}
function pointInPoly(p: P, poly: P[]) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

// building-density dots scattered inside a cell polygon (rejection-sampled), on land
function Stipple({ id, poly, density, heat, world }: { id: number; poly: P[]; density: number; heat: number; world: World | null }) {
  const dots = useMemo(() => {
    const bb = bbox(poly);
    const target = Math.round(8 + density * 34);
    const out: { x: number; y: number; lit: boolean }[] = [];
    let tries = 0;
    while (out.length < target && tries < target * 12) {
      const r1 = h(id, tries * 2), r2 = h(id, tries * 2 + 1);
      const p = { x: bb.x0 + r1 * (bb.x1 - bb.x0), y: bb.y0 + r2 * (bb.y1 - bb.y0) };
      tries++;
      const onLand = !world || world.sampleField('buildable', p.x / S, p.y / S) >= 0.5;
      if (inside(p, poly) && onLand) out.push({ x: p.x, y: p.y, lit: h(id, out.length + 500) < 0.3 + heat * 0.45 });
    }
    return out;
  }, [id, poly, density, heat, world]);
  return <g>{dots.map((d, i) => (
    <circle key={i} cx={d.x} cy={d.y} r={d.lit ? 2.2 : 1.6} className={d.lit ? 'stip lit' : 'stip'} />
  ))}</g>;
}

function bbox(poly: P[]) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of poly) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  return { x0, y0, x1, y1 };
}
function inside(p: P, poly: P[]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

const HOODS = ['Harborside', 'Old Kettle', 'Marrow End', 'Greenreach', 'Saltgate', 'Ashford', 'Linden Row', 'Cinderhill', 'Fenwick', 'Bramblewick'];
function districtName(e: EntityDto): string { return HOODS[e.id % HOODS.length]; }
// A district's character is DERIVED from its engine-measured terrain makeup first
// (geography shapes what a place is), falling back to its social stats.
function descriptor(e: EntityDto, ring0: boolean): string {
  const beach = e.stats.beach_frac ?? 0, cliff = e.stats.cliff_frac ?? 0;
  const shore = e.stats.shore_frac ?? 0, hill = e.stats.hill_frac ?? 0;
  if (beach > 0.10) return 'a breezy harbour town';
  if (cliff > 0.14) return 'a rugged clifftop quarter';
  if (shore > 0.10) return 'a working waterfront';
  if (hill > 0.45) return 'windswept hill streets';
  if (ring0) return 'the dense, humming core';
  const heat = e.stats.heat ?? 0.2, wealth = e.stats.wealth ?? 0.5, dens = e.stats.density ?? 0.5;
  if (heat > 0.45) return 'a restless nightlife quarter';
  if (wealth > 0.66) return 'leafy, well-to-do streets';
  if (dens < 0.4) return 'quiet outskirts';
  if (wealth < 0.4) return 'a hard-working district';
  return 'an ordinary neighbourhood';
}

// QUIET land shade — a muted dark base so districts pop on top. Barely varies with
// elevation (just enough to hint hills), never competes with the district colors.
function landColor(e: number): string {
  const t = (e - SEA) / (1 - SEA);
  const v = 26 + t * 22;
  return `rgb(${v | 0},${(v + 8) | 0},${(v + 4) | 0})`;
}
// unmistakable water: deep saturated blue offshore, lighter at the shallows.
function waterColor(e: number): string {
  const d = e / SEA; // 0 deep, 1 shore
  return `rgb(${18 + d * 34},${58 + d * 74},${110 + d * 70})`;
}
// smooth a polyline through its points (quadratic midpoints) — for bending roads.
function smoothPath(pts: P[]): string {
  if (pts.length < 2) return '';
  if (pts.length === 2) return `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)} L ${pts[1].x.toFixed(1)} ${pts[1].y.toFixed(1)}`;
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)} `;
  for (let i = 1; i < pts.length - 1; i++) {
    const m = { x: (pts[i].x + pts[i + 1].x) / 2, y: (pts[i].y + pts[i + 1].y) / 2 };
    d += `Q ${pts[i].x.toFixed(1)} ${pts[i].y.toFixed(1)} ${m.x.toFixed(1)} ${m.y.toFixed(1)} `;
  }
  const last = pts[pts.length - 1];
  return d + `L ${last.x.toFixed(1)} ${last.y.toFixed(1)}`;
}

// a smooth river path from the traced points
function riverPath(pts: P[]): string {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)} `;
  for (let i = 1; i < pts.length - 1; i++) {
    const m = { x: (pts[i].x + pts[i + 1].x) / 2, y: (pts[i].y + pts[i + 1].y) / 2 };
    d += `Q ${pts[i].x.toFixed(1)} ${pts[i].y.toFixed(1)} ${m.x.toFixed(1)} ${m.y.toFixed(1)} `;
  }
  return d;
}

function h(id: number, salt: number): number {
  let z = (id * 2654435761 + salt * 40503 + 0x9e3779b9) >>> 0;
  z ^= z >>> 15; z = Math.imul(z, 0x85ebca6b) >>> 0; z ^= z >>> 13; z >>>= 0;
  return (z >>> 0) / 4294967296;
}
