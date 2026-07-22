// THE DROP — the killer mechanic, demonstrated. You descend over a city that
// DOESN'T EXIST until you approach it. Far regions are mist (Coarse — data only,
// no interior). As your glider nears a district it sharpens (Hazed → Detailed) and
// its interior GENERATES on demand (reveal cascade). You can't learn a world that
// materialises around you and re-rolls every drop. This is Coarse/Hazed/Detailed
// LOD driven by PROXIMITY — the engine's native behaviour, pointed at a player.

import { useEffect, useMemo, useRef, useState } from 'react';
import { createWorld, World, type EntityDto } from '../owos';
import { tessellate, organicPath, centroid, type Seed, type P } from '../view/voronoi';
import cityJson from '../worlds/city.json';

const S = 1000;

type Fid = 'mist' | 'hazed' | 'live';

export default function Drop() {
  const worldRef = useRef<World | null>(null);
  const [districts, setDistricts] = useState<EntityDto[]>([]);
  const [seed, setSeed] = useState(20);
  // glider position in 0..1 map space + altitude (1 = high/far, 0 = landed)
  const [g, setG] = useState<{ x: number; y: number; alt: number }>({ x: 0.5, y: -0.15, alt: 1 });
  const [landed, setLanded] = useState<number | null>(null);
  const [dropping, setDropping] = useState(false);
  const [err, setErr] = useState('');

  // (re)build the city for a given seed — a brand-new world each drop.
  const boot = (sd: number) => {
    (async () => {
      try {
        const spec = { ...(cityJson as object), rng_seed: sd };
        const w = await createWorld(JSON.stringify(spec));
        worldRef.current?.dispose();
        worldRef.current = w;
        const snap = w.snapshot();
        setDistricts(snap.entities.filter((e) => e.kind === 'district'));
        setG({ x: 0.3 + 0.4 * ((sd * 0.137) % 1), y: -0.15, alt: 1 });
        setLanded(null);
      } catch (e) { setErr(String(e)); }
    })();
  };
  useEffect(() => { boot(seed); return () => worldRef.current?.dispose(); }, []); // eslint-disable-line

  const seeds: Seed[] = useMemo(
    () => districts.map((d) => ({ id: d.id, x: (d.stats.cx ?? 0.5) * S, y: (d.stats.cy ?? 0.5) * S })),
    [districts],
  );
  const cells = useMemo(() => tessellate(seeds, S, S), [seeds]);

  // proximity → fidelity. The glider descends; distance to each district (in map
  // space) decides mist / hazed / live. This is the whole mechanic.
  const gx = g.x * S, gy = g.y * S;
  const dist = (d: EntityDto) => Math.hypot((d.stats.cx ?? 0.5) * S - gx, (d.stats.cy ?? 0.5) * S - gy);
  const fidOf = (d: EntityDto): Fid => {
    const near = dist(d);
    // altitude gates how much can be seen at all — high up, everything is mist
    const reach = 120 + (1 - g.alt) * 640;
    if (near < reach * 0.42) return 'live';
    if (near < reach) return 'hazed';
    return 'mist';
  };

  // when a district becomes 'live', reveal it in the engine (materialise interior).
  useEffect(() => {
    const w = worldRef.current; if (!w) return;
    for (const d of districts) {
      if (fidOf(d) === 'live' && !d.revealed) w.reveal(d.id);
    }
    // refresh revealed flags for render
    const snap = w.snapshot();
    setDistricts((prev) => {
      const byId = new Map(snap.entities.map((e) => [e.id, e]));
      return prev.map((d) => byId.get(d.id) ?? d);
    });
    // eslint-disable-next-line
  }, [g.x, g.y, g.alt]);

  // the descent animation: glide toward the target, dropping altitude.
  useEffect(() => {
    if (!dropping) return;
    let raf = 0;
    const tick = () => {
      setG((cur) => {
        // aim at the nearest district center as we descend (you commit to a zone)
        let tx = cur.x, ty = 0.5;
        let best = Infinity;
        for (const d of districts) {
          const dd = Math.hypot((d.stats.cx ?? 0.5) - cur.x, (d.stats.cy ?? 0.5) - Math.max(cur.y, 0.1));
          if (dd < best) { best = dd; tx = d.stats.cx ?? 0.5; ty = d.stats.cy ?? 0.5; }
        }
        const na = Math.max(0, cur.alt - 0.012);
        const k = 0.045 + (1 - na) * 0.05;
        const nx = cur.x + (tx - cur.x) * k;
        const ny = cur.y + (ty - cur.y) * k;
        if (na <= 0.001) {
          setDropping(false);
          // find landed district
          let land: number | null = null, bd = Infinity;
          for (const d of districts) {
            const dd = Math.hypot((d.stats.cx ?? 0.5) - nx, (d.stats.cy ?? 0.5) - ny);
            if (dd < bd) { bd = dd; land = d.id; }
          }
          setLanded(land);
          return { x: nx, y: ny, alt: 0 };
        }
        return { x: nx, y: ny, alt: na };
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [dropping, districts]);

  const reroll = () => { const s = seed + 1; setSeed(s); setDropping(false); boot(s); };
  const jumpAt = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    setG({ x, y, alt: 0.35 }); setLanded(null);
  };

  if (err) return <div className="drop-err">Failed: {err}</div>;

  const landedD = landed != null ? districts.find((d) => d.id === landed) : null;

  return (
    <div className="drop-root">
      <header className="drop-bar">
        <span className="drop-brand">THE DROP</span>
        <span className="drop-tag">a world that doesn’t exist until you fall toward it — and re-rolls every match</span>
        <span className="drop-sp" />
        <button className="drop-btn hot" disabled={dropping} onClick={() => { boot(seed); setTimeout(() => setDropping(true), 60); }}>
          {g.alt <= 0.01 ? 'drop again' : '▼ deploy'}
        </button>
        <button className="drop-btn" onClick={reroll}>⟳ new world (seed {seed})</button>
      </header>

      <div className="drop-stage">
        <svg viewBox={`0 0 ${S} ${S}`} className="drop-map" onClick={jumpAt}>
          <defs>
            <filter id="mist"><feGaussianBlur stdDeviation="14" /></filter>
            <filter id="haze"><feGaussianBlur stdDeviation="5" /></filter>
            <radialGradient id="cloud" cx="50%" cy="50%" r="55%">
              <stop offset="0%" stopColor="#2a3550" stopOpacity="0.0" />
              <stop offset="100%" stopColor="#0a0e1a" stopOpacity="0.92" />
            </radialGradient>
          </defs>

          {/* districts, each drawn at its proximity fidelity */}
          {districts.map((d) => {
            const poly = cells.get(d.id); if (!poly || poly.length < 3) return null;
            const fid = fidOf(d);
            const c = centroid(poly);
            const ring0 = (d.stats.ring ?? 1) < 0.5;
            return (
              <g key={d.id} className={`drop-cell ${fid}`}
                filter={fid === 'mist' ? 'url(#mist)' : fid === 'hazed' ? 'url(#haze)' : undefined}>
                <path d={organicPath(poly)} fill={fill(d, fid)} className="drop-shape" />
                {fid === 'live' && <Stipple id={d.id} poly={poly} density={d.stats.density ?? 0.5} heat={d.stats.heat ?? 0.2} />}
                {fid !== 'mist' && (
                  <text x={c.x} y={c.y} className={`drop-name ${fid} ${ring0 ? 'dt' : ''}`} textAnchor="middle">
                    {fid === 'live' ? (ring0 ? 'Downtown' : name(d)) : '▓▓▓▓'}
                  </text>
                )}
              </g>
            );
          })}

          {/* the rolling cloud cover — thickest where you're NOT looking */}
          <rect x="0" y="0" width={S} height={S} fill="url(#cloud)"
            opacity={0.35 + g.alt * 0.5} pointerEvents="none" />

          {/* the glider */}
          {g.y > -0.1 && (
            <g pointerEvents="none">
              <circle cx={gx} cy={gy} r={16 + g.alt * 26} className="glider-ring" />
              <circle cx={gx} cy={gy} r={7} className="glider" />
              <line x1={gx} y1={gy} x2={gx} y2={gy - 40 - g.alt * 60} className="glider-tail" />
            </g>
          )}
        </svg>

        <aside className="drop-side">
          <div className="drop-alt">
            <div className="alt-label">altitude</div>
            <div className="alt-bar"><span style={{ height: `${g.alt * 100}%` }} /></div>
            <div className="alt-v">{Math.round(g.alt * 3000)}m</div>
          </div>
          {landedD ? (
            <div className="drop-landed">
              <div className="ld-h">landed in</div>
              <h2>{(landedD.stats.ring ?? 1) < 0.5 ? 'Downtown' : name(landedD)}</h2>
              <p className="ld-desc">{desc(landedD)}</p>
              <div className="ld-stats">
                <Stat k="wealth" v={landedD.stats.wealth ?? 0} />
                <Stat k="heat" v={landedD.stats.heat ?? 0} />
                <Stat k="density" v={landedD.stats.density ?? 0} />
              </div>
              <p className="ld-note">this district — its blocks, buildings, the people inside — generated the instant you committed to it. High above, it was only mist.</p>
            </div>
          ) : (
            <div className="drop-hint">
              <p><b>Deploy</b> to fall toward the city, or <b>click anywhere</b> on the map to look there.</p>
              <p>Regions stay <span className="mistw">misted</span> until you approach — then they <span className="hazew">sharpen</span> and finally go <span className="livew">live</span>, their interior generating on demand.</p>
              <p>Hit <b>new world</b>: a different city entirely, same rules. <b>You cannot memorise a world that isn’t there yet.</b></p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function fill(d: EntityDto, fid: Fid): string {
  const heat = d.stats.heat ?? 0.2, wealth = d.stats.wealth ?? 0.5;
  const hue = 215 - heat * 175 + wealth * 20;
  if (fid === 'mist') return `hsl(${hue} 12% 20%)`;
  const sat = fid === 'hazed' ? 20 : 34 + heat * 30;
  const light = fid === 'hazed' ? 24 : 22 + heat * 16 + wealth * 8;
  return `hsl(${hue} ${sat}% ${light}%)`;
}

function Stipple({ id, poly, density, heat }: { id: number; poly: P[]; density: number; heat: number }) {
  const dots = useMemo(() => {
    const bb = poly.reduce((a, p) => ({ x0: Math.min(a.x0, p.x), y0: Math.min(a.y0, p.y), x1: Math.max(a.x1, p.x), y1: Math.max(a.y1, p.y) }), { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 });
    const out: { x: number; y: number; lit: boolean }[] = [];
    const target = Math.round(8 + density * 30); let t = 0;
    while (out.length < target && t < target * 12) {
      const p = { x: bb.x0 + h(id, t * 2) * (bb.x1 - bb.x0), y: bb.y0 + h(id, t * 2 + 1) * (bb.y1 - bb.y0) }; t++;
      if (inside(p, poly)) out.push({ x: p.x, y: p.y, lit: h(id, out.length + 99) < 0.3 + heat * 0.45 });
    }
    return out;
  }, [id, poly, density, heat]);
  return <g>{dots.map((d, i) => <circle key={i} cx={d.x} cy={d.y} r={d.lit ? 2.2 : 1.5} className={d.lit ? 'dstip lit' : 'dstip'} />)}</g>;
}
function inside(p: P, poly: P[]) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c; } return c; }
function Stat({ k, v }: { k: string; v: number }) {
  return <div className="ld-stat"><span>{k}</span><span className="ld-bar"><span style={{ width: `${v * 100}%` }} /></span></div>;
}
const HOODS = ['Harborside', 'Old Kettle', 'Marrow End', 'Greenreach', 'Saltgate', 'Ashford', 'Linden Row', 'Cinderhill', 'Fenwick', 'Bramblewick'];
function name(e: EntityDto) { return HOODS[e.id % HOODS.length]; }
function desc(e: EntityDto) {
  const heat = e.stats.heat ?? 0.2, wealth = e.stats.wealth ?? 0.5, dens = e.stats.density ?? 0.5;
  if ((e.stats.ring ?? 1) < 0.5) return 'the dense, humming core';
  if (heat > 0.45) return 'a restless nightlife quarter';
  if (wealth > 0.66) return 'leafy, well-to-do streets';
  if (dens < 0.4) return 'quiet outskirts';
  return 'an ordinary neighbourhood';
}
function h(id: number, salt: number) { let z = (id * 2654435761 + salt * 40503 + 0x9e3779b9) >>> 0; z ^= z >>> 15; z = Math.imul(z, 0x85ebca6b) >>> 0; z ^= z >>> 13; z >>>= 0; return (z >>> 0) / 4294967296; }
