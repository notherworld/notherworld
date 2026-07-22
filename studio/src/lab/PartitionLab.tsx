// PARTITION LAB — the same set of seeds, partitioned four different ways by the
// ENGINE, rendered so you can see the range: voronoi (organic territory), grid
// (lattice), cluster (communities), relational (a logic map, no geometry). Plus a
// FILL toggle — total-fill (cells tile every pixel) vs gaps (discrete blobs with
// wild space between, e.g. woods/water). The engine owns the adjacency; each panel
// draws the geometry that matches.

import { useEffect, useMemo, useState } from 'react';
import { createWorld, World, type EntityDto, type EdgeDto } from '../owos';
import { tessellate, centroid, type Seed, type P } from '../view/voronoi';

const STYLES = ['voronoi', 'subdivide', 'grid', 'cluster', 'relational'] as const;
type Style = typeof STYLES[number];

// each style gets its OWN seed so panels don't mirror each other, and its own
// node count where it reads better.
const SEEDS: Record<Style, number> = { voronoi: 7, subdivide: 13, grid: 9, cluster: 21, relational: 5 };
const COUNT: Record<Style, number> = { voronoi: 16, subdivide: 22, grid: 16, cluster: 18, relational: 14 };

function specFor(style: Style): string {
  return JSON.stringify({
    rng_seed: SEEDS[style],
    seed: [{ kind: 'space', name: 'Space', reveal: true }],
    generators: [{
      on: 'space', spawn: 'zone', count: `${COUNT[style]}`,
      // subdivide reads a weight → variable-size masonry (many small, few big)
      partition: { style, edge: 'adj', x: 'px', y: 'py', weight: 'wt' },
      child_stats: {
        px: '0.08 + 0.84*rand(1)',
        py: '0.08 + 0.84*rand(2)',
        wt: '1 + floor(rand(4)*rand(4)*8)',
        hue: 'rand(3)',
      },
    }],
  });
}

type Snap = { entities: EntityDto[]; edges: EdgeDto[] };

export default function PartitionLab() {
  const [worlds, setWorlds] = useState<Record<Style, Snap> | null>(null);
  const [fill, setFill] = useState<'total' | 'gaps'>('total');
  const [err, setErr] = useState('');

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const out = {} as Record<Style, Snap>;
        for (const s of STYLES) {
          const w: World = await createWorld(specFor(s));
          const snap = w.snapshot();
          out[s] = { entities: snap.entities, edges: snap.edges };
          w.dispose();
        }
        if (!dead) setWorlds(out);
      } catch (e) { setErr(String(e)); }
    })();
    return () => { dead = true; };
  }, []);

  if (err) return <div className="lab-err">Failed: {err}</div>;
  if (!worlds) return <div className="lab-load">partitioning…</div>;

  return (
    <div className="lab-root">
      <header className="lab-bar">
        <span className="lab-brand">PARTITION LAB</span>
        <span className="lab-tag">one set of seeds · four ways the engine divides a space · fill it, or leave the wild between</span>
        <span className="lab-sp" />
        <div className="lab-toggle">
          <button className={fill === 'total' ? 'on' : ''} onClick={() => setFill('total')}>total fill</button>
          <button className={fill === 'gaps' ? 'on' : ''} onClick={() => setFill('gaps')}>gaps (woods/water)</button>
        </div>
      </header>
      <div className="lab-grid">
        {STYLES.map((s) => (
          <Panel key={s} style={s} snap={worlds[s]} fill={fill} />
        ))}
      </div>
    </div>
  );
}

const DESC: Record<Style, string> = {
  voronoi: 'nearest-seed organic territory — neighbourhoods, biomes, influence',
  subdivide: 'variable-size rects that PERFECTLY tile — masonry, zero wasted space (city lots, UI, rooms)',
  grid: 'a regular lattice — tiles, boardgames, city blocks',
  cluster: 'communities grouped by proximity — tribes, mingled quarters',
  relational: 'pure who-connects-to-whom, NO geometry — a skill tree / faction web',
};

function Panel({ style, snap, fill }: { style: Style; snap: Snap; fill: 'total' | 'gaps' }) {
  const zones = snap.entities.filter((e) => e.kind === 'zone');
  return (
    <div className="lab-panel">
      <div className="lab-head"><b>{style}</b><span>{DESC[style]}</span>
        <span className="lab-count">{zones.length} zones · {snap.edges.filter((e) => e.kind === 'adj').length} edges</span></div>
      <div className="lab-canvas">
        {style === 'relational' ? <GraphMap zones={zones} edges={snap.edges} />
          : style === 'subdivide' ? <RectMap zones={zones} edges={snap.edges} fill={fill} />
          : <GeoMap zones={zones} edges={snap.edges} style={style} fill={fill} />}
      </div>
    </div>
  );
}

// subdivide → TRUE rectangles that tile perfectly (the masonry / no-gap fill).
function RectMap({ zones, edges, fill }: { zones: EntityDto[]; edges: EdgeDto[]; fill: 'total' | 'gaps' }) {
  const rects = zones.map((z) => ({
    z, x: ((z.stats.px ?? 0.5) - (z.stats.w ?? 0) / 2) * S, y: ((z.stats.py ?? 0.5) - (z.stats.h ?? 0) / 2) * S,
    w: (z.stats.w ?? 0.1) * S, h: (z.stats.h ?? 0.1) * S,
  }));
  const gap = fill === 'gaps' ? 6 : 0;         // total-fill = zero gap = perfect tile
  const links = useMemo(() => adjLines(edges, zones), [edges, zones]);
  return (
    <svg viewBox={`0 0 ${S} ${S}`} className="lab-svg">
      {rects.map((r) => (
        <rect key={r.z.id} x={r.x + gap} y={r.y + gap} width={Math.max(0, r.w - gap * 2)} height={Math.max(0, r.h - gap * 2)}
          rx={fill === 'gaps' ? 10 : 2} fill={color(r.z)} className="rectcell" />
      ))}
      <g className="lab-adj">
        {links.map((l, i) => <line key={i} x1={l.a.x * S} y1={l.a.y * S} x2={l.b.x * S} y2={l.b.y * S} />)}
      </g>
    </svg>
  );
}
function adjLines(edges: EdgeDto[], zones: EntityDto[]) {
  const pos = new Map(zones.map((z) => [z.id, { x: z.stats.px ?? 0.5, y: z.stats.py ?? 0.5 }]));
  const seen = new Set<string>(); const out: { a: { x: number; y: number }; b: { x: number; y: number } }[] = [];
  for (const g of edges) {
    if (g.kind !== 'adj') continue;
    const key = g.from < g.to ? `${g.from}-${g.to}` : `${g.to}-${g.from}`;
    if (seen.has(key)) continue; seen.add(key);
    const a = pos.get(g.from), b = pos.get(g.to);
    if (a && b) out.push({ a, b });
  }
  return out;
}

const S = 1000;
function color(z: EntityDto): string {
  const hue = (z.stats.hue ?? 0.5) * 300;
  return `hsl(${hue} 42% 42%)`;
}

// voronoi / grid / cluster → positioned geometry
function GeoMap({ zones, edges, style, fill }: { zones: EntityDto[]; edges: EdgeDto[]; style: Style; fill: 'total' | 'gaps' }) {
  const seeds: Seed[] = useMemo(
    () => zones.map((z) => ({ id: z.id, x: (z.stats.px ?? 0.5) * S, y: (z.stats.py ?? 0.5) * S })),
    [zones],
  );
  const cells = useMemo(() => tessellate(seeds, S, S), [seeds]);
  const byId = useMemo(() => new Map(zones.map((z) => [z.id, z])), [zones]);

  // adjacency lines (engine edges) between seed points
  const links = useMemo(() => {
    const seen = new Set<string>(); const out: { a: Seed; b: Seed }[] = [];
    for (const g of edges) {
      if (g.kind !== 'adj') continue;
      const key = g.from < g.to ? `${g.from}-${g.to}` : `${g.to}-${g.from}`;
      if (seen.has(key)) continue; seen.add(key);
      const a = seeds.find((s) => s.id === g.from), b = seeds.find((s) => s.id === g.to);
      if (a && b) out.push({ a, b });
    }
    return out;
  }, [edges, seeds]);

  return (
    <svg viewBox={`0 0 ${S} ${S}`} className="lab-svg">
      {/* gaps mode: a dark wild backdrop shows between discrete blobs */}
      {fill === 'gaps' && <rect x="0" y="0" width={S} height={S} className="wild" />}
      <g>
        {zones.map((z) => {
          const poly = cells.get(z.id);
          if (!poly || poly.length < 3) return null;
          if (fill === 'total') {
            // tile the whole space with HARD shared edges — a true 100% partition,
            // no rounded-inward gaps. (Raw polygon, not the softened path.)
            const d = 'M ' + poly.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L ') + ' Z';
            return <path key={z.id} d={d} fill={color(z)} className="cellshape tight" />;
          }
          // gaps mode — draw a shrunken blob around the seed (discrete territory,
          // wild space left between). Radius from cell size so dense areas = smaller.
          const c = centroid(poly);
          const r = blobR(poly) * (style === 'grid' ? 0.62 : 0.7);
          return <circle key={z.id} cx={c.x} cy={c.y} r={r} fill={color(z)} className="cellshape blob" />;
        })}
      </g>
      {/* adjacency graph overlaid — the engine's real topology */}
      <g className="lab-adj">
        {links.map((l, i) => <line key={i} x1={l.a.x} y1={l.a.y} x2={l.b.x} y2={l.b.y} />)}
      </g>
      <g>
        {seeds.map((s) => <circle key={s.id} cx={s.x} cy={s.y} r={5} className="lab-node"
          fill={color(byId.get(s.id)!)} />)}
      </g>
    </svg>
  );
}

// relational → a force-free graph drawn from index order (no positions), showing
// it's a pure topology. We lay nodes on a circle so the web is legible.
function GraphMap({ zones, edges }: { zones: EntityDto[]; edges: EdgeDto[] }) {
  const pos = useMemo(() => {
    const m = new Map<number, P>();
    zones.forEach((z, i) => {
      const a = (i / zones.length) * Math.PI * 2 - Math.PI / 2;
      m.set(z.id, { x: S / 2 + Math.cos(a) * S * 0.38, y: S / 2 + Math.sin(a) * S * 0.38 });
    });
    return m;
  }, [zones]);
  const links = useMemo(() => {
    const seen = new Set<string>(); const out: { a: P; b: P }[] = [];
    for (const g of edges) {
      if (g.kind !== 'adj') continue;
      const key = g.from < g.to ? `${g.from}-${g.to}` : `${g.to}-${g.from}`;
      if (seen.has(key)) continue; seen.add(key);
      const a = pos.get(g.from), b = pos.get(g.to);
      if (a && b) out.push({ a, b });
    }
    return out;
  }, [edges, pos]);
  return (
    <svg viewBox={`0 0 ${S} ${S}`} className="lab-svg">
      <g className="lab-adj strong">
        {links.map((l, i) => <line key={i} x1={l.a.x} y1={l.a.y} x2={l.b.x} y2={l.b.y} />)}
      </g>
      <g>
        {zones.map((z) => {
          const p = pos.get(z.id)!;
          return <g key={z.id}>
            <circle cx={p.x} cy={p.y} r={16} fill={color(z)} className="lab-gnode" />
          </g>;
        })}
      </g>
    </svg>
  );
}

function blobR(poly: P[]): number {
  const c = centroid(poly);
  let min = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    // distance from centroid to edge midpoint (rough inradius)
    const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    min = Math.min(min, Math.hypot(m.x - c.x, m.y - c.y));
  }
  return Math.max(28, Math.min(min, 120));
}
