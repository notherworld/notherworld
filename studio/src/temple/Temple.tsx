// ── TEMPLE — the surface-template DESIGN ZONE (docs/PLANET_TEMPLATES.md §5.0), v3.
//
// v3 organizes the knobs by ABSTRACTION LEVEL (geology → transitions → weather →
// circulation → society), same as the schema. The claim this page demos: the
// engine supports whatever laws the renderer brings — what KIND of beach forms
// where ocean meets land, at which zoom band it materializes, whether roads lock
// to a grid or wander free — all data, same machinery, live side by side.
//
// ADDITIVE by design: no Atlas/city/nother file is touched.

import { useEffect, useMemo, useRef, useState } from 'react';
import { createWorld, World, type EntityDto } from '../owos';
import { regionCells } from '../view/scope';
import { BASE_DISTS, type Dists } from '../view/facts';
import { TEMPLATES, composeSpec, saveCharter, clearCharter, loadCharter, templeFor, type SurfaceTemplate, type BeachKind } from './templates';
import './temple.css';

const G = 256;                                   // bake lattice (pixel-art scale)

function hex(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const lerp3 = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] =>
  [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mixi = (x: number) => { x = Math.imul(x ^ (x >>> 16), 0x7feb352d); x = Math.imul(x ^ (x >>> 15), 0x846ca68b); return (x ^= x >>> 16) >>> 0; };
const rnd = (s: number, k: number) => (mixi((s | 0) ^ Math.imul(k, 0x9e3779b1)) % 100000) / 100000;

type Band = { kind: 'city' } | { kind: 'dist'; id: number };

// draw a polyline into raw image data (roads) — 1px, blended toward `col`
function drawPath(img: ImageData, pts: number[], col: [number, number, number], w2: number) {
  for (let i = 0; i + 3 < pts.length; i += 2) {
    const x0 = pts[i] * G, y0 = pts[i + 1] * G, x1 = pts[i + 2] * G, y1 = pts[i + 3] * G;
    const steps = Math.max(1, Math.hypot(x1 - x0, y1 - y0) | 0);
    for (let k = 0; k <= steps; k++) {
      const f = k / steps;
      const x = (x0 + (x1 - x0) * f) | 0, y = (y0 + (y1 - y0) * f) | 0;
      if (x < 0 || y < 0 || x >= G || y >= G) continue;
      const o = (y * G + x) * 4;
      img.data[o] = (img.data[o] + col[0] * w2) / (1 + w2);
      img.data[o + 1] = (img.data[o + 1] + col[1] * w2) / (1 + w2);
      img.data[o + 2] = (img.data[o + 2] + col[2] * w2) / (1 + w2);
    }
  }
}

// the TRANSITION material — what this planet's law says an ocean→land meeting IS.
// Each kind is a different pixel texture of the same band; the law picks, the
// skin colors it. (sand: smooth · pebble: grain · cliff: dark scarp · shard:
// angular glints · shelf: pale plates)
function beachMix(kind: BeachKind, x: number, y: number, k: number): number {
  switch (kind) {
    case 'sand': return 0.75;
    case 'pebble': return rnd((x * 73856093) ^ (y * 19349663), k) > 0.45 ? 0.85 : 0.25;
    case 'cliff': return 0.9;                            // solid scarp (color does the dark)
    case 'shard': return ((x + y * 2) % 4 === 0) || rnd((x * 2654435761) ^ y, k) > 0.82 ? 0.95 : 0.15;
    case 'shelf': return ((x >> 2) + (y >> 2)) % 2 === 0 ? 0.8 : 0.55;
  }
}

function SurfacePane({ tpl, seed, title }: { tpl: SurfaceTemplate; seed: number; title: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const worldRef = useRef<World | null>(null);
  const worldKeyRef = useRef('');
  const gridsRef = useRef<{ key: string; elev: Float32Array; moist: Float32Array } | null>(null);
  const baseImgRef = useRef<ImageData | null>(null);
  const distRef = useRef<EntityDto[]>([]);
  const roadsRef = useRef<number[][]>([]);              // laid route curves, city-local 0..1
  const [band, setBand] = useState<Band>({ kind: 'city' });
  const [status, setStatus] = useState('baking…');
  const [distName, setDistName] = useState('');
  const genRef = useRef(0);

  const fieldsKey = JSON.stringify(tpl.fields ?? {});
  // circulation + society change the SPEC → the engine re-lays the world
  const worldKey = `${seed}|${fieldsKey}|${tpl.society}|${JSON.stringify(tpl.roads)}`;
  const paintKey = JSON.stringify([tpl.geology, tpl.transitions, tpl.weather, tpl.skin]);
  const bandKey = band.kind === 'city' ? 'city' : `d${band.id}`;

  useEffect(() => { setBand({ kind: 'city' }); }, [worldKey]);   // new world → new ids

  useEffect(() => {
    const gen = ++genRef.current;
    (async () => {
      try {
        if (worldKeyRef.current !== worldKey || !worldRef.current) {
          setStatus('building world…');
          const w = await createWorld(composeSpec(tpl, seed));
          if (gen !== genRef.current) { w.dispose(); return; }
          worldRef.current?.dispose();
          worldRef.current = w; worldKeyRef.current = worldKey;
          gridsRef.current = null;
          const s = w.snapshot();
          distRef.current = s.entities.filter((e) => e.kind === 'district' && !e.infra);
          // the ENGINE's laid roads: each route edge's pathfound curve (or straight)
          const byId = new Map(s.entities.map((e) => [e.id, e]));
          roadsRef.current = [];
          for (const ed of s.edges) {
            if (ed.kind !== 'road') continue;
            const a = byId.get(ed.from), b = byId.get(ed.to);
            if (!a || !b) continue;
            const path = w.routePath(ed.from, ed.to);
            roadsRef.current.push(path.length >= 4 ? path
              : [a.stats.cx ?? 0.5, a.stats.cy ?? 0.5, b.stats.cx ?? 0.5, b.stats.cy ?? 0.5]);
          }
        }
        const w = worldRef.current!;
        let win: [number, number, number, number] = [0, 0, 1, 1];
        const blocks: { cells: { gx: number; gy: number }[]; cell: number }[] = [];
        if (band.kind === 'dist') {
          const s = w.snapshot();
          const d = s.entities.find((e) => e.id === band.id);
          if (d && d.stats.wx1 > d.stats.wx0) {
            win = [d.stats.wx0, d.stats.wy0, d.stats.wx1, d.stats.wy1];
            for (const cid of d.children ?? []) {
              const b = s.entities.find((e) => e.id === cid);
              if (!b || b.kind !== 'block' || b.infra) continue;
              const flat = w.region(b.id) ?? [];
              if (flat.length > 2) blocks.push(regionCells(flat));
            }
            setDistName(`${d.name || `district ${d.id}`} · ${blocks.length} blocks`);
          }
        } else setDistName('');
        const gk = `${worldKey}|${bandKey}`;
        if (gridsRef.current?.key !== gk) {
          setStatus('baking terrain…');
          const dx = (win[2] - win[0]) / G, dy = (win[3] - win[1]) / G;
          const elev = w.sampleGrid('elevation', win[0], win[1], dx, dy, G, G);
          const moist = w.sampleGrid('moisture', win[0], win[1], dx, dy, G, G);
          if (gen !== genRef.current) return;
          gridsRef.current = { key: gk, elev, moist };
        }
        // ── paint: all instant-level laws + skin over the cached geology
        const cv = canvasRef.current; if (!cv) return;
        cv.width = G; cv.height = G;
        const ctx = cv.getContext('2d')!;
        const img = ctx.createImageData(G, G);
        const { elev, moist } = gridsRef.current;
        const { seaLevel, snowLine, glowSea } = tpl.geology;
        const { shoreWidth, beachKind, foam } = tpl.transitions;
        // flora follows moisture (a real law), and RESOLVES with zoom: the
        // district band grows half again denser — detail earned, not painted.
        const floraD = tpl.flora.density * (band.kind === 'dist' ? 1.55 : 1);
        const cFlora = hex(tpl.skin.flora);
        // zoom-earned fidelity as LAW: the transition draws from its band DOWN
        const shoreHere = band.kind === 'dist' || tpl.transitions.band === 'city';
        const cSea = hex(tpl.skin.sea), cLow = hex(tpl.skin.low), cMid = hex(tpl.skin.mid);
        const cHigh = hex(tpl.skin.high), cSnow = hex(tpl.skin.snow), cShore = hex(tpl.skin.shore);
        const cDist = hex(tpl.skin.district), cLot = hex(tpl.skin.lot), cRoad = hex(tpl.skin.road);
        const seeds = band.kind === 'city'
          ? distRef.current.map((d) => ({ id: d.id, x: (d.stats.cx ?? 0.5) * G, y: (d.stats.cy ?? 0.5) * G }))
          : [];
        const own = seeds.length ? new Int16Array(G * G) : null;
        for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
          const k = y * G + x;
          const e = elev[k];
          let col: [number, number, number];
          if (e < seaLevel) {
            const depth = Math.min(1, (seaLevel - e) / Math.max(0.001, seaLevel));
            col = lerp3(cSea, [cSea[0] * 0.35, cSea[1] * 0.35, cSea[2] * 0.45], depth);
            if (glowSea) col = lerp3(col, [255, 240, 200], Math.max(0, 1 - depth * 3) * 0.55);
            // FOAM — agitation at the waterline (foam / embers / rime, per skin)
            if (shoreHere && foam > 0 && seaLevel - e < 0.012) {
              const sp = rnd((x * 40503) ^ (y * 2654435761), 5);
              if (sp < foam * 0.6) col = lerp3(col, glowSea ? [255, 210, 140] : [240, 248, 255], 0.7);
            }
            if (own) own[k] = -1;
          } else {
            const h2 = (e - seaLevel) / Math.max(0.001, 1 - seaLevel);
            col = h2 < 0.5 ? lerp3(cLow, cMid, h2 * 2) : lerp3(cMid, cHigh, (h2 - 0.5) * 2);
            if (e > snowLine) col = lerp3(col, cSnow, Math.min(1, (e - snowLine) / Math.max(0.02, 1 - snowLine) + 0.35));
            const gx = elev[y * G + Math.min(G - 1, x + 1)] - elev[y * G + Math.max(0, x - 1)];
            const shade = Math.max(0.55, Math.min(1.35, 1 - gx * 4.2));
            col = [col[0] * shade, col[1] * shade, col[2] * shade];
            // THE TRANSITION — what ocean-meets-land IS on this planet
            if (shoreHere && e - seaLevel < shoreWidth) {
              col = lerp3(col, cShore, beachMix(beachKind, x, y, seed));
            } else if (floraD > 0 && e < snowLine) {
              // II·b GROUND COVER — clumped by coarse noise, thickened by moisture
              const clump = rnd(((x >> 3) * 668265263) ^ ((y >> 3) * 374761393), seed);
              const p2 = floraD * (0.25 + 0.75 * moist[k]) * (0.35 + 0.65 * clump);
              const sp2 = rnd((x * 73856093) ^ (y * 19349663), seed ^ 0x5f356495);
              if (sp2 < p2) col = lerp3(col, cFlora, 0.55 + 0.35 * (sp2 / Math.max(0.001, p2)));
            }
            if (own && seeds.length) {
              let best = -1, bd = Infinity;
              for (let si = 0; si < seeds.length; si++) {
                const d2 = (x - seeds[si].x) ** 2 + (y - seeds[si].y) ** 2;
                if (d2 < bd) { bd = d2; best = si; }
              }
              own[k] = best;
              col = lerp3(col, cDist, 0.05 + 0.05 * rnd(seeds[best].id, 9));
            }
          }
          const o = k * 4;
          img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = 255;
        }
        if (own) for (let y = 1; y < G - 1; y++) for (let x = 1; x < G - 1; x++) {
          const k = y * G + x;
          if (own[k] < 0) continue;
          if ((own[k] !== own[k + 1] && own[k + 1] >= 0) || (own[k] !== own[k + G] && own[k + G] >= 0)) {
            const o = k * 4;
            img.data[o] = (img.data[o] + cDist[0] * 2) / 3;
            img.data[o + 1] = (img.data[o + 1] + cDist[1] * 2) / 3;
            img.data[o + 2] = (img.data[o + 2] + cDist[2] * 2) / 3;
          }
        }
        // IV · CIRCULATION — the engine's laid network, in this planet's character
        // (grid-locked, 45°-faceted, or wandering — the cost law already decided)
        if (band.kind === 'city' && tpl.society !== 'none') {
          for (const path of roadsRef.current) drawPath(img, path, cRoad, 2.2);
        }
        for (const b of blocks) {
          for (const c of b.cells) {
            const x0 = Math.max(0, Math.round(c.gx * b.cell * G)), y0 = Math.max(0, Math.round(c.gy * b.cell * G));
            const sz = Math.max(1, Math.round(b.cell * G));
            for (let y = y0; y < Math.min(G, y0 + sz); y++) for (let x = x0; x < Math.min(G, x0 + sz); x++) {
              const o = (y * G + x) * 4;
              img.data[o] = (img.data[o] + cLot[0] * 2.4) / 3.4;
              img.data[o + 1] = (img.data[o + 1] + cLot[1] * 2.4) / 3.4;
              img.data[o + 2] = (img.data[o + 2] + cLot[2] * 2.4) / 3.4;
            }
          }
        }
        baseImgRef.current = img;
        ctx.putImageData(img, 0, 0);
        setStatus('');
      } catch (err) {
        if (gen === genRef.current) setStatus(`bad formula: ${String(err).slice(0, 120)}`);
      }
    })();
  }, [worldKey, paintKey, bandKey]);   // eslint-disable-line react-hooks/exhaustive-deps

  // III · WEATHER — cloud shadows drift, and the ALWAYS-raining planet visibly rains
  useEffect(() => {
    const cv = canvasRef.current; if (!cv) return;
    const ctx = cv.getContext('2d')!;
    let raf = 0; const t0 = performance.now();
    const [rr, rg, rb] = hex(tpl.skin.rain);
    const n = Math.round(tpl.weather.rain * 150);
    const nc = Math.round(tpl.weather.cloud * 9);
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const base = baseImgRef.current; if (!base) return;
      if (n === 0 && nc === 0) { ctx.putImageData(base, 0, 0); return; }
      const t = (now - t0) / 1000;
      ctx.putImageData(base, 0, 0);
      // cloud COVER — soft shadow blobs crossing the land, density from the law
      if (nc > 0) {
        ctx.fillStyle = 'rgba(8, 10, 16, 0.16)';
        for (let i = 0; i < nc; i++) {
          const cxp = (rnd(i, 21) * G + t * (2 + rnd(i, 22) * 3)) % (G + 90) - 45;
          const cyp = (rnd(i, 23) * G + t * 0.7) % (G + 60) - 30;
          const cr2 = 22 + rnd(i, 24) * 34;
          ctx.beginPath();
          ctx.ellipse(cxp, cyp, cr2, cr2 * 0.62, 0, 0, 6.283);
          ctx.fill();
          ctx.beginPath();
          ctx.ellipse(cxp + cr2 * 0.7, cyp - cr2 * 0.2, cr2 * 0.6, cr2 * 0.4, 0, 0, 6.283);
          ctx.fill();
        }
      }
      if (n > 0) {
        ctx.fillStyle = `rgba(${rr},${rg},${rb},0.55)`;
        for (let i = 0; i < n; i++) {
          const sp = 60 + rnd(i, 2) * 90;
          const x = (rnd(i, 1) * G + t * 14) % G;
          const y = (rnd(i, 3) * G + t * sp) % G;
          ctx.fillRect(x | 0, y | 0, 1, 3);
        }
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [tpl.weather.rain, tpl.weather.cloud, tpl.skin.rain]);

  const onClick = (ev: React.MouseEvent) => {
    const w = worldRef.current; if (!w) return;
    if (band.kind === 'dist' || tpl.society === 'none') return;
    const r = (ev.target as HTMLCanvasElement).getBoundingClientRect();
    const ux = (ev.clientX - r.left) / r.width, uy = (ev.clientY - r.top) / r.height;
    let best: EntityDto | null = null, bd = Infinity;
    for (const d of distRef.current) {
      const dd = Math.hypot(ux - (d.stats.cx ?? 0.5), uy - (d.stats.cy ?? 0.5));
      if (dd < bd) { bd = dd; best = d; }
    }
    if (!best || bd > 0.3) return;
    w.reveal(best.id);
    setBand({ kind: 'dist', id: best.id });
  };

  useEffect(() => () => { worldRef.current?.dispose(); }, []);

  return (
    <div className="temple-pane">
      <div className="temple-pane-head">
        <b>{title}</b>
        <span>
          {band.kind === 'city'
            ? `${tpl.label} · city band${tpl.society === 'none' ? ' · uninhabited' : ' · click a district to dive'}`
            : `${tpl.label} · ${distName}`}
        </span>
        {band.kind === 'dist' && <button className="temple-back" onClick={() => setBand({ kind: 'city' })}>← city</button>}
      </div>
      <div className="temple-canvas-wrap">
        <canvas ref={canvasRef} className="temple-canvas" onClick={onClick} />
        {status && <div className="temple-status">{status}</div>}
      </div>
      <div className="temple-blurb">{tpl.blurb}</div>
    </div>
  );
}

export default function Temple() {
  const [seed, setSeed] = useState(7);
  const [rightKey, setRightKey] = useState('lava');
  const [custom, setCustom] = useState<SurfaceTemplate>(() => JSON.parse(JSON.stringify(TEMPLATES[0])));
  const [groundDraft, setGroundDraft] = useState('');
  const [note, setNote] = useState('');
  // the UNIVERSE dials — THE SAME constants the facts layer derives from
  // (BASE_DISTS is the literal base notherverse; edit → save → nother obeys)
  const [dists, setDistsUi] = useState<Dists>(() => loadCharter()?.dists ?? { ...BASE_DISTS });
  const [strength, setStrength] = useState(() => loadCharter()?.strength ?? 0.85);
  const right = useMemo(() => TEMPLATES.find((t) => t.key === rightKey) ?? TEMPLATES[1], [rightKey]);

  // ⤓ EXPLORE ARRIVAL — a body clicked in notherspace lands HERE as itself:
  // its natural type, tilted by your charter through the galaxy/system/body
  // variance chain, seeded by its address. The ladder's last connection.
  useEffect(() => {
    const m2 = location.hash.match(/^#x=([^~]+)~(-?\d+)~(-?\d+)~(-?\d+)~(-?\d+)~[01]~(.*)$/);
    if (!m2) return;
    const [, nk, u2, g2, s2, b2, nm] = m2;
    const r2 = templeFor({ u: +u2, g: +g2, s: +s2, b: +b2 }, nk);
    setCustom(r2.tpl);
    setGroundDraft(r2.tpl.fields?.elevation ?? '');
    setSeed(Math.abs(((+b2 | 0) ^ ((+u2 | 0) * 31)) % 999983) || 7);
    setNote(`⤓ exploring ${decodeURIComponent(nm)} — ${r2.note}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setUniverse = () => {
    saveCharter(custom, dists, strength);
    setNote('★ charter saved — your notherverse now runs these laws (reopen nother to see it)');
  };
  const unsetUniverse = () => { clearCharter(); setNote('charter cleared — back to the base universe'); };

  const loadPreset = (key: string) => {
    const t = TEMPLATES.find((x) => x.key === key); if (!t) return;
    setCustom(JSON.parse(JSON.stringify(t)));
    setGroundDraft(t.fields?.elevation ?? '');
    setNote(`loaded preset "${t.label}" into the workbench`);
  };
  const up = (patch: Partial<SurfaceTemplate>) => setCustom((c) => ({ ...c, ...patch }));
  const upGeo = (k: string, v: number | boolean) => setCustom((c) => ({ ...c, geology: { ...c.geology, [k]: v } }));
  const upTr = (k: string, v: number | string) => setCustom((c) => ({ ...c, transitions: { ...c.transitions, [k]: v } }));
  const upRd = (k: string, v: number | string) => setCustom((c) => ({ ...c, roads: { ...c.roads, [k]: v } }));
  const upSkin = (k: keyof SurfaceTemplate['skin'], v: string) => setCustom((c) => ({ ...c, skin: { ...c.skin, [k]: v } }));
  const applyGround = () => {
    setCustom((c) => ({ ...c, fields: groundDraft.trim() ? { ...(c.fields ?? {}), elevation: groundDraft.trim() } : undefined }));
    setNote('ground formula applied — rebuilding world');
  };
  const exportTpl = () => {
    void navigator.clipboard?.writeText(JSON.stringify(custom, null, 2));
    setNote('template JSON copied — paste it into templates.ts as a new preset');
  };

  return (
    <div className="temple-root">
      <div className="temple-bar">
        <b>temple</b><span className="dim"> · surface template workbench — laws by abstraction level. same machinery, your makeup.</span>
        <label className="temple-seed">seed
          <input type="number" value={seed} onChange={(e) => setSeed(parseInt(e.target.value, 10) || 0)} />
        </label>
      </div>

      <div className="temple-panes">
        <SurfacePane tpl={custom} seed={seed} title="workbench" />
        <SurfacePane tpl={right} seed={seed} title="compare" />
      </div>

      <div className="temple-controls">
        <div className="temple-col">
          <div className="temple-h">presets · load → workbench</div>
          <div className="temple-row">
            {TEMPLATES.map((t) => <button key={t.key} onClick={() => loadPreset(t.key)}>{t.label}</button>)}
          </div>
          <div className="temple-h">compare pane</div>
          <div className="temple-row">
            {TEMPLATES.map((t) => (
              <button key={t.key} className={t.key === rightKey ? 'on' : ''} onClick={() => setRightKey(t.key)}>{t.label}</button>
            ))}
          </div>
          <div className="temple-h">V · society (gates the levels below it)</div>
          <div className="temple-row">
            {(['none', 'settled'] as const).map((s2) => (
              <button key={s2} className={custom.society === s2 ? 'on' : ''} onClick={() => { up({ society: s2 }); setNote(s2 === 'none' ? 'uninhabited: settlement + circulation stripped from the spec' : 'settled: the machinery returns'); }}>{s2}</button>
            ))}
          </div>
          <div className="temple-h">★ universe charter — the dials of YOUR notherverse (base values = the real base universe)</div>
          <label className="temple-check">
            <input type="checkbox" checked={dists.lifeChance === undefined}
              onChange={(e) => setDistsUi((d) => { const nd = { ...d }; if (e.target.checked) delete nd.lifeChance; else nd.lifeChance = 0.5; return nd; })} />
            life physics-gated (the base law: habitable band + the star decides)
          </label>
          {dists.lifeChance !== undefined && (
            <label className="temple-slider">worlds bearing life {(dists.lifeChance * 100).toFixed(0)}%
              <input type="range" min={0} max={0.99} step={0.01} value={dists.lifeChance} onChange={(e) => setDistsUi((d) => ({ ...d, lifeChance: +e.target.value }))} />
            </label>
          )}
          <label className="temple-slider">heavy atmospheres {(dists.cloudyChance * 100).toFixed(0)}%
            <input type="range" min={0} max={1} step={0.01} value={dists.cloudyChance} onChange={(e) => setDistsUi((d) => ({ ...d, cloudyChance: +e.target.value }))} />
          </label>
          <label className="temple-slider">systems with belts {(dists.beltChance * 100).toFixed(0)}%
            <input type="range" min={0} max={1} step={0.01} value={dists.beltChance} onChange={(e) => setDistsUi((d) => ({ ...d, beltChance: +e.target.value }))} />
          </label>
          <label className="temple-slider">template rule strength {(strength * 100).toFixed(0)}% <span className="dim">(the rest stay alien)</span>
            <input type="range" min={0} max={1} step={0.05} value={strength} onChange={(e) => setStrength(+e.target.value)} />
          </label>
          <div className="temple-row">
            <button onClick={setUniverse}>★ set as my universe</button>
            <button onClick={unsetUniverse}>clear</button>
          </div>

          <div className="temple-h">export</div>
          <div className="temple-row"><button onClick={exportTpl}>copy template JSON</button></div>
          {note && <div className="temple-note">{note}</div>}
        </div>

        <div className="temple-col">
          <div className="temple-h">I · geology (instant)</div>
          <label className="temple-slider">sea level {custom.geology.seaLevel.toFixed(2)}
            <input type="range" min={0.1} max={0.7} step={0.01} value={custom.geology.seaLevel} onChange={(e) => upGeo('seaLevel', +e.target.value)} />
          </label>
          <label className="temple-slider">cap line {custom.geology.snowLine.toFixed(2)}
            <input type="range" min={0.5} max={0.98} step={0.01} value={custom.geology.snowLine} onChange={(e) => upGeo('snowLine', +e.target.value)} />
          </label>
          <label className="temple-check">
            <input type="checkbox" checked={custom.geology.glowSea} onChange={(e) => upGeo('glowSea', e.target.checked)} /> the sea glows (lava / plasma)
          </label>

          <div className="temple-h">II · transitions — what ocean→land IS here (instant)</div>
          <div className="temple-row">
            {(['sand', 'pebble', 'cliff', 'shard', 'shelf'] as const).map((k) => (
              <button key={k} className={custom.transitions.beachKind === k ? 'on' : ''} onClick={() => upTr('beachKind', k)}>{k}</button>
            ))}
          </div>
          <label className="temple-slider">shore width {custom.transitions.shoreWidth.toFixed(3)}
            <input type="range" min={0} max={0.06} step={0.002} value={custom.transitions.shoreWidth} onChange={(e) => upTr('shoreWidth', +e.target.value)} />
          </label>
          <label className="temple-slider">waterline agitation {custom.transitions.foam.toFixed(2)}
            <input type="range" min={0} max={1} step={0.05} value={custom.transitions.foam} onChange={(e) => upTr('foam', +e.target.value)} />
          </label>
          <div className="temple-row temple-inline">materializes at:
            {(['city', 'district'] as const).map((b) => (
              <button key={b} className={custom.transitions.band === b ? 'on' : ''} onClick={() => upTr('band', b)}>{b} band</button>
            ))}
          </div>

          <div className="temple-h">II·b · ground cover — what grows, how thick (instant)</div>
          <label className="temple-slider">flora density {custom.flora.density.toFixed(2)}
            <input type="range" min={0} max={1} step={0.05} value={custom.flora.density} onChange={(e) => setCustom((c) => ({ ...c, flora: { density: +e.target.value } }))} />
          </label>

          <div className="temple-h">III · weather (instant)</div>
          <label className="temple-slider">precipitation {custom.weather.rain.toFixed(2)}
            <input type="range" min={0} max={1} step={0.05} value={custom.weather.rain} onChange={(e) => setCustom((c) => ({ ...c, weather: { ...c.weather, rain: +e.target.value } }))} />
          </label>
          <label className="temple-slider">cloud cover {custom.weather.cloud.toFixed(2)}
            <input type="range" min={0} max={1} step={0.05} value={custom.weather.cloud} onChange={(e) => setCustom((c) => ({ ...c, weather: { ...c.weather, cloud: +e.target.value } }))} />
          </label>
        </div>

        <div className="temple-col">
          {custom.society !== 'none' ? (
            <>
              <div className="temple-h">IV · circulation — road character as a cost LAW (rebuild)</div>
              <div className="temple-row">
                {(['free', 'grid', 'grid45'] as const).map((m2) => (
                  <button key={m2} className={custom.roads.mode === m2 ? 'on' : ''} onClick={() => upRd('mode', m2)}>{m2 === 'grid45' ? 'grid + 45°' : m2}</button>
                ))}
              </div>
              <label className="temple-slider">lattice lock {custom.roads.lattice.toFixed(2)}
                <input type="range" min={0} max={1} step={0.05} value={custom.roads.lattice} onChange={(e) => upRd('lattice', +e.target.value)} />
              </label>
              <label className="temple-slider">wander {custom.roads.wander.toFixed(1)}
                <input type="range" min={0} max={8} step={0.5} value={custom.roads.wander} onChange={(e) => upRd('wander', +e.target.value)} />
              </label>
              <label className="temple-slider">terrain respect {custom.roads.terrain.toFixed(2)}
                <input type="range" min={0} max={1} step={0.05} value={custom.roads.terrain} onChange={(e) => upRd('terrain', +e.target.value)} />
              </label>
              <label className="temple-slider">loops / overlap {custom.roads.loops}
                <input type="range" min={0} max={4} step={1} value={custom.roads.loops} onChange={(e) => upRd('loops', +e.target.value)} />
              </label>

              <div className="temple-h">VI · buildings & beings — spider aliens, web houses: pick and color (block band renders these)</div>
              <div className="temple-row">
                {(['masonry', 'organic', 'woven', 'grown', 'carved'] as const).map((f2) => (
                  <button key={f2} className={custom.buildings.form === f2 ? 'on' : ''}
                    onClick={() => setCustom((c) => ({ ...c, buildings: { ...c.buildings, form: f2 } }))}>{f2}</button>
                ))}
              </div>
              <label className="temple-slider">build density {custom.buildings.density.toFixed(2)}
                <input type="range" min={0} max={1} step={0.05} value={custom.buildings.density}
                  onChange={(e) => setCustom((c) => ({ ...c, buildings: { ...c.buildings, density: +e.target.value } }))} />
              </label>
              <div className="temple-row">
                {(['biped', 'beast', 'swarm', 'arachnid', 'amorph'] as const).map((f2) => (
                  <button key={f2} className={custom.beings.form === f2 ? 'on' : ''}
                    onClick={() => setCustom((c) => ({ ...c, beings: { ...c.beings, form: f2 } }))}>{f2}</button>
                ))}
              </div>
              <label className="temple-slider">being size ×{custom.beings.size.toFixed(1)}
                <input type="range" min={0.5} max={3} step={0.1} value={custom.beings.size}
                  onChange={(e) => setCustom((c) => ({ ...c, beings: { ...c.beings, size: +e.target.value } }))} />
              </label>
              <label className="temple-slider">pace ×{custom.beings.pace.toFixed(1)}
                <input type="range" min={0.3} max={3} step={0.1} value={custom.beings.pace}
                  onChange={(e) => setCustom((c) => ({ ...c, beings: { ...c.beings, pace: +e.target.value } }))} />
              </label>
            </>
          ) : (
            <div className="temple-h">IV–VI · circulation, buildings, beings — <i>gated: nobody here</i></div>
          )}

          <div className="temple-h">skin (instant · every level)</div>
          <div className="temple-grid">
            {(['sea', 'low', 'mid', 'high', 'snow', 'shore', 'flora', 'rain', 'district', 'lot', 'road', 'building', 'being'] as const).map((k) => (
              <label key={k}>{k}<input type="color" value={custom.skin[k]} onChange={(e) => upSkin(k, e.target.value)} /></label>
            ))}
          </div>
        </div>

        <div className="temple-col temple-wide">
          <div className="temple-h">I · ground makeup — the elevation formula (engine DSL · rebuilds the WHOLE world: districts + roads re-settle onto the new land)</div>
          <textarea value={groundDraft} spellCheck={false}
            placeholder={'blank = Veranholm\'s own ground. try the crystal preset\'s faceting, or add mesas, trenches, ridgelines…'}
            onChange={(e) => setGroundDraft(e.target.value)} />
          <div className="temple-row"><button onClick={applyGround}>apply ground</button></div>
        </div>
      </div>
    </div>
  );
}
