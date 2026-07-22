// VERANHOLM — a living city you dive through the scope tree, rendered top-down at
// every scale. The engine owns structure + life; this renders it as a real place:
// districts on a map → blocks → typed buildings → a floorplan with people moving.
// Click to dive (camera scales INTO the region, its interior generated on reveal);
// zoom out reverses. Occupants glide room-to-room as the engine ticks.

import { useEffect, useMemo, useRef, useState } from 'react';
import { createWorld, World, type EntityDto, type Snapshot } from '../owos';
import cityJson from '../worlds/city.json';
import {
  layoutBlocks, layoutBuildings, layoutFloors, layoutRooms, corridorRect,
  center, useOf, h, type Placed,
} from './layout';
import CityMap from './CityMap';
import BlockMap from './BlockMap';

const NEXT: Record<string, string> = {
  city: 'district', district: 'block', block: 'building', building: 'floor', floor: 'room', room: 'occupant',
};
const VERB: Record<string, string> = {
  city: 'districts', district: 'blocks', block: 'buildings', building: 'floors', floor: 'rooms', room: 'people',
};

function layoutFor(kind: string, items: EntityDto[]): Placed[] {
  switch (kind) {
    case 'district': return layoutBlocks(items);
    case 'block': return layoutBuildings(items);
    case 'building': return layoutFloors(items);
    case 'floor': return layoutRooms(items);
    default: return [];
  }
}

export default function CityDemo() {
  const worldRef = useRef<World | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [focus, setFocus] = useState<number>(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [playing, setPlaying] = useState(true);
  const [seed, setSeed] = useState<number>((cityJson as { rng_seed?: number }).rng_seed ?? 20);
  const [err, setErr] = useState('');

  const refresh = () => { if (worldRef.current) setSnap(worldRef.current.snapshot()); };

  // Build (or rebuild) the whole world for a seed — a NEW deterministic city each
  // time, same rules. This is the "refresh = a different trackable world" hook.
  const boot = (sd: number) => {
    (async () => {
      try {
        const spec = { ...(cityJson as object), rng_seed: sd };
        const w = await createWorld(JSON.stringify(spec));
        worldRef.current?.dispose();
        worldRef.current = w;
        const s = w.snapshot();
        const city = s.entities.find((e) => e.kind === 'city');
        setFocus(city ? city.id : w.root());
        setSelected(null);
        setSnap(s);
      } catch (e) { setErr(String(e)); }
    })();
  };
  useEffect(() => { boot(seed); return () => worldRef.current?.dispose(); }, []); // eslint-disable-line

  const reseed = () => { const s = seed + 1; setSeed(s); boot(s); };

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => { worldRef.current?.step(); refresh(); }, 500);
    return () => clearInterval(t);
  }, [playing]);

  const byId = useMemo(() => {
    const m = new Map<number, EntityDto>();
    snap?.entities.forEach((e) => m.set(e.id, e));
    return m;
  }, [snap]);

  const focusE = byId.get(focus);

  // SCALE CONTINUITY (spec T1): nothing true at a coarser zoom disappears at a
  // finer one. Every ANCESTOR level's circulation projects into this view, in
  // WORLD coords: the city's road network shows inside a district AND a block
  // (the highway you saw from the plane is still there from the street), and the
  // district's lane web shows inside its blocks. BlockMap maps world→local.
  const arteries = useMemo(() => {
    if (!snap || !focusE) return [];
    const segs: { a: { x: number; y: number }; b: { x: number; y: number }; cls: string }[] = [];
    const pos = new Map<number, { x: number; y: number }>();
    snap.entities.forEach((e) => {
      if (e.stats.cx !== undefined && e.stats.cy !== undefined) pos.set(e.id, { x: e.stats.cx, y: e.stats.cy });
    });
    const push = (kind: string, cls: string, at: (id: number) => { x: number; y: number } | null | undefined,
                  toWorld?: (p: { x: number; y: number }) => { x: number; y: number }) => {
      const seen = new Set<string>();
      for (const g of snap.edges) {
        if (g.kind !== kind) continue;
        const key = g.from < g.to ? `${g.from}-${g.to}` : `${g.to}-${g.from}`;
        if (seen.has(key)) continue; seen.add(key);
        const a = at(g.from), b = at(g.to);
        if (!a || !b) continue;
        // the engine's PATHFOUND curve for this hop, if routing chose one — the
        // road as the terrain decided it, not a straight overlay
        const flat = worldRef.current?.routePath(g.from, g.to) ?? [];
        if (flat.length >= 4) {
          const raw = [];
          for (let i = 0; i < flat.length; i += 2) raw.push({ x: flat[i], y: flat[i + 1] });
          const pts = toWorld ? raw.map(toWorld) : raw;
          for (let i = 1; i < pts.length; i++) segs.push({ a: pts[i - 1], b: pts[i], cls });
        } else {
          segs.push({ a, b, cls });
        }
      }
    };
    if (focusE.kind === 'district' || focusE.kind === 'block') {
      push('road', 'artery', (id) => pos.get(id)); // the CITY network (roads, shores, bridges)
    }
    if (focusE.kind === 'block' && focusE.parent != null) {
      const d = byId.get(focusE.parent);
      if (d && d.stats.wx1 > d.stats.wx0) {
        const [dx0, dy0, dx1, dy1] = [d.stats.wx0, d.stats.wy0, d.stats.wx1, d.stats.wy1];
        const toWorld = (p: { x: number; y: number }) => ({ x: dx0 + p.x * (dx1 - dx0), y: dy0 + p.y * (dy1 - dy0) });
        push('lane', 'lane', (id) => {
          const e = byId.get(id);
          if (e?.kind === 'gate') return toWorld({ x: e.stats.gx ?? 0.5, y: e.stats.gy ?? 0.5 });
          if (!e || e.stats.bx === undefined) return null;
          return toWorld({ x: e.stats.bx, y: e.stats.by });
        }, toWorld);
      }
    }
    return segs;
  }, [snap, focusE, byId]);
  // infrastructure the routing prim spawns (shores, bridges/ferries/…) are children
  // of a scope but are NOT navigable sub-scopes — the engine flags them, we filter.
  const kids = (focusE?.children ?? []).map((c) => byId.get(c)!).filter((e) => e && !e.infra);
  // GATES: where an ancestor road crosses this scope's boundary (engine-spawned,
  // infra). The local route net includes them — streets meet the artery here.
  const gateKids = (focusE?.children ?? []).map((c) => byId.get(c)!).filter((e) => e && e.kind === 'gate');
  const placed = useMemo(() => (focusE ? layoutFor(focusE.kind, kids) : []), [focusE, kids]);

  // Zoom IN: reveal the clicked region's interior (materialize it) and focus it.
  const diveInto = (p: Placed) => {
    const e = p.e;
    if (e.kind === 'occupant' || !NEXT[e.kind]) { setSelected(e.id); return; }
    worldRef.current?.reveal(e.id);   // materialize its interior now
    setFocus(e.id);
    setSelected(null);
    refresh();
  };

  const zoomOut = () => {
    if (!focusE || focusE.parent == null) return;
    worldRef.current?.fold(focus);
    setFocus(focusE.parent);
    setSelected(null);
    refresh();
  };

  const trail = useMemo(() => {
    const t: EntityDto[] = [];
    let cur: number | undefined = focus;
    while (cur != null) { const e = byId.get(cur); if (!e) break; t.unshift(e); cur = e.parent ?? undefined; }
    return t.filter((e) => e.kind !== 'world');
  }, [focus, byId]);

  if (err) return <div className="city-err">Failed to load Veranholm: {err}</div>;
  if (!snap || !focusE) return <div className="city-load">materialising Veranholm…</div>;

  const isFloorplan = focusE.kind === 'floor';

  return (
    <div className="cx-root">
      <header className="cx-bar">
        <span className="cx-brand">VERANHOLM</span>
        <span className="cx-tag">a living city, generated as you look into it</span>
        <span className="cx-sp" />
        <button className="cx-btn hot" onClick={reseed} title="generate a whole new deterministic world, same rules">⟳ new world · seed {seed}</button>
        <button className="cx-btn" onClick={() => setPlaying((p) => !p)}>{playing ? '❚❚ pause' : '▶ resume'}</button>
        <span className="cx-tick">day {Math.floor(snap.tick / 3)} · {snap.entities.length} things exist</span>
      </header>

      <nav className="cx-trail">
        {trail.map((e, i) => (
          <span key={e.id} className="cx-crumbwrap">
            {i > 0 && <span className="cx-sep">›</span>}
            <button className={`cx-crumb ${e.id === focus ? 'on' : ''}`} onClick={() => { setFocus(e.id); setSelected(null); }}>
              {e.name}<em>{e.kind}</em>
            </button>
          </span>
        ))}
        {focusE.parent != null && <button className="cx-out" onClick={zoomOut}>▲ back</button>}
      </nav>

      <div className="cx-body">
        <div className={`cx-stage-wrap ${isFloorplan ? 'floorplan' : ''}`}>
          <div className={`cx-stage ${focusE.kind}`}
            style={focusE.kind === 'building' || focusE.kind === 'floor' || focusE.kind === 'room'
              ? ({ '--use': useOf(nearestBuilding(focusE, byId) ?? focusE).color } as React.CSSProperties)
              : undefined}>
            {focusE.kind === 'city' ? (
              <CityMap districts={kids}
                bridges={snap.entities.filter((e) => e.kind === 'bridge')}
                shores={snap.entities.filter((e) => e.kind === 'shore')}
                edges={snap.edges} world={worldRef.current}
                selected={selected}
                onSelect={setSelected}
                onDive={(e) => diveInto({ e, rect: { x: 0, y: 0, w: 0, h: 0 } })} />
            ) : focusE.kind === 'district' ? (
              <BlockMap buildings={kids} edges={snap.edges}
                routeKind="lane" xk="bx" yk="by" mode="block"
                arteries={arteries} gates={gateKids}
                world={worldRef.current} byId={byId}
                bounds={[focusE.stats.wx0 ?? 0, focusE.stats.wy0 ?? 0, focusE.stats.wx1 ?? 1, focusE.stats.wy1 ?? 1]}
                selected={selected} onSelect={setSelected}
                onDive={(e) => diveInto({ e, rect: { x: 0, y: 0, w: 0, h: 0 } })} />
            ) : focusE.kind === 'block' ? (
              <BlockMap buildings={kids} edges={snap.edges}
                routeKind="street" xk="px" yk="py" mode="building"
                arteries={arteries} gates={gateKids}
                world={worldRef.current}
                bounds={focusE.stats.wx1 > focusE.stats.wx0
                  ? [focusE.stats.wx0, focusE.stats.wy0, focusE.stats.wx1, focusE.stats.wy1]
                  : null}
                selected={selected} onSelect={setSelected}
                onDive={(e) => diveInto({ e, rect: { x: 0, y: 0, w: 0, h: 0 } })} />
            ) : (
              <>
                <StageBg kind={focusE.kind} />
                {focusE.kind === 'building' && <BuildingCore floors={kids.length} use={useOf(focusE)} />}
                {isFloorplan && <Corridor items={kids} />}
                {placed.map((p) => (
                  <Node key={p.e.id} p={p} selected={selected === p.e.id}
                    onSelect={() => setSelected(p.e.id)} onDive={() => diveInto(p)} />
                ))}
                {isFloorplan && <DoorLayer placed={placed} edges={snap.edges} items={kids} />}
                {isFloorplan && <OccupantLayer placed={placed} byId={byId}
                  selected={selected} onSelect={setSelected} />}
                {focusE.kind === 'room' && <RoomInterior room={focusE} byId={byId}
                  selected={selected} onSelect={setSelected} />}
              </>
            )}
          </div>
          <div className="cx-hint">
            {NEXT[focusE.kind]
              ? <>inside <b>{focusE.name}</b> — {kids.length} {VERB[focusE.kind]} · <span className="cx-clickhint">click to dive in</span></>
              : <>a single soul — click to read their day</>}
          </div>
        </div>

        <Inspector e={selected != null ? byId.get(selected) : focusE} snap={snap} byId={byId} />
      </div>

      <ChronStrip snap={snap} />
    </div>
  );
}

function StageBg({ kind }: { kind: string }) {
  // subtle ground texture per level (streets / grass / floor grid)
  return <div className={`cx-ground ${kind}`} />;
}

function Node({ p, selected, onSelect, onDive }: {
  p: Placed; selected: boolean; onSelect: () => void; onDive: () => void;
}) {
  const e = p.e;
  const r = p.rect;
  const idea = !e.revealed && e.kind !== 'occupant';
  const style: React.CSSProperties = {
    left: `${r.x}%`, top: `${r.y}%`, width: `${r.w}%`, height: `${r.h}%`,
  };
  const cls = `cx-node ${e.kind} ${selected ? 'sel' : ''} ${idea ? 'idea' : ''}`;

  // per-kind inner content
  let inner: React.ReactNode = null;
  if (e.kind === 'district') {
    style.background = tint(e.stats.wealth ?? 0.5, e.stats.heat ?? 0.2);
    inner = <><span className="cx-label">{e.name}</span><span className="cx-sub">{Math.round((e.stats.wealth ?? 0) * 100)}% well-off</span></>;
  } else if (e.kind === 'block') {
    style.background = 'var(--block)';
    inner = <><span className="cx-label">{e.name}</span><span className="cx-sub">{e.children.length || '·'} buildings</span></>;
  } else if (e.kind === 'building') {
    const u = useOf(e);
    style.background = u.color;
    const floors = Math.max(1, Math.round(e.stats.floors ?? 1));
    inner = <>
      <span className="cx-bglyph">{u.glyph}</span>
      <span className="cx-label sm">{u.label}</span>
      <span className="cx-sub">{floors} fl</span>
      <BuildingWindows floors={floors} seed={e.id} />
    </>;
  } else if (e.kind === 'floor') {
    style.background = 'var(--floor)';
    const lvl = Math.round(e.stats.level ?? 0);
    const ground = (e.stats.public ?? 0) > 0.5;
    inner = <>
      <span className="cx-flabel">floor {lvl}</span>
      <span className="cx-sub">{ground ? 'ground · public' : 'private'}{e.children.length ? ` · ${e.children.length} rooms` : ''}</span>
      <FloorWindows seed={e.id} revealed={!!e.revealed} rooms={e.children.length} />
      {ground && <span className="cx-entrance" title="entrance" />}
    </>;
  } else if (e.kind === 'room') {
    style.background = roomTint(e);
    inner = <span className="cx-rlabel">{roomName(e)}</span>;
  }

  return (
    <div className={cls} style={style}
      onClick={(ev) => { ev.stopPropagation(); onSelect(); }}
      onDoubleClick={(ev) => { ev.stopPropagation(); onDive(); }}
      onMouseDown={(ev) => { if (ev.detail === 1 && !idea && e.kind !== 'occupant') {/* single click selects */} }}>
      {inner}
      {idea && <span className="cx-idea">▸ reveal</span>}
      {NEXT[e.kind] && <button className="cx-enter" onClick={(ev) => { ev.stopPropagation(); onDive(); }}>enter →</button>}
    </div>
  );
}

// little lit/unlit windows on a building footprint — cute + hints at occupancy
function BuildingWindows({ floors, seed }: { floors: number; seed: number }) {
  const rows = Math.min(floors, 5);
  const cols = 4;
  const cells = [];
  for (let i = 0; i < rows * cols; i++) {
    const lit = ((seed * 2654435761 + i * 40503) >>> 0) / 4294967296 > 0.55;
    cells.push(<span key={i} className={`cx-win ${lit ? 'lit' : ''}`} />);
  }
  return <div className="cx-windows" style={{ gridTemplateColumns: `repeat(${cols},1fr)` }}>{cells}</div>;
}

// walk up the trail to the building this floor/room belongs to (for its use color)
function nearestBuilding(e: EntityDto, byId: Map<number, EntityDto>): EntityDto | null {
  let cur: EntityDto | undefined = e;
  while (cur) {
    if (cur.kind === 'building') return cur;
    cur = cur.parent != null ? byId.get(cur.parent) : undefined;
  }
  return null;
}

// THE CORE — the stair/elevator spine tying the cutaway's slabs together (the
// building's vertical circulation, same trend as streets/corridors).
function BuildingCore({ floors, use }: { floors: number; use: { color: string } }) {
  return (
    <div className="cx-core" style={{ borderColor: use.color }}>
      {Array.from({ length: Math.max(2, floors * 2) }).map((_, i) => <span key={i} className="cx-core-step" />)}
    </div>
  );
}

// a floor slab's window strip — lit count is deterministic, denser once the
// floor is revealed (real rooms behind the glass).
function FloorWindows({ seed, revealed, rooms }: { seed: number; revealed: boolean; rooms: number }) {
  const n = 12;
  const cells = [];
  for (let i = 0; i < n; i++) {
    const lit = h(seed, i + 300) < (revealed ? 0.55 + Math.min(0.3, rooms * 0.05) : 0.25);
    cells.push(<span key={i} className={`cx-win ${lit ? 'lit' : ''}`} />);
  }
  return <div className="cx-floorwins">{cells}</div>;
}

// THE CORRIDOR — the floorplan's circulation band between the room banks, with
// a runner strip. Doors open onto it; occupants cross it room-to-room.
function Corridor({ items }: { items: EntityDto[] }) {
  const r = corridorRect(items);
  return (
    <div className="cx-corridor" style={{ left: `${r.x}%`, top: `${r.y}%`, width: `${r.w}%`, height: `${r.h}%` }}>
      <div className="cx-runner" />
    </div>
  );
}

// DOORS — the engine's actual `door` edges between rooms, drawn as a gap in the
// wall where each room meets the corridor + a faint path linking the pair.
function DoorLayer({ placed, edges, items }: { placed: Placed[]; edges: { kind: string; from: number; to: number }[]; items: EntityDto[] }) {
  const rectOf = new Map(placed.map((p) => [p.e.id, p.rect]));
  const cor = corridorRect(items);
  const corMid = cor.y + cor.h / 2;
  const seen = new Set<string>();
  const marks: { x: number; y: number }[] = [];
  const paths: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (const g of edges) {
    if (g.kind !== 'door') continue;
    const key = g.from < g.to ? `${g.from}-${g.to}` : `${g.to}-${g.from}`;
    if (seen.has(key)) continue; seen.add(key);
    const a = rectOf.get(g.from), b = rectOf.get(g.to);
    if (!a || !b) continue;
    // each room's door: on the wall FACING the corridor, at the room's centre x
    const doorOf = (r: { x: number; y: number; w: number; h: number }) => ({
      x: r.x + r.w / 2,
      y: r.y + r.h / 2 < corMid ? r.y + r.h : r.y, // bottom wall if above corridor, top wall if below
    });
    const da = doorOf(a), db = doorOf(b);
    marks.push(da, db);
    paths.push({ x1: da.x, y1: corMid, x2: db.x, y2: corMid });
  }
  return (
    <svg className="cx-doors" viewBox="0 0 100 100" preserveAspectRatio="none">
      {paths.map((p, i) => (
        <path key={i} d={`M${p.x1} ${p.y1} L${p.x2} ${p.y2}`} className="cx-doorpath" />
      ))}
      {marks.map((m, i) => (
        <g key={`m${i}`}>
          <line x1={m.x - 1.6} y1={m.y} x2={m.x + 1.6} y2={m.y} className="cx-doorgap" />
          <line x1={m.x - 1.6} y1={m.y} x2={m.x + 1.6} y2={m.y} className="cx-doorswing" />
        </g>
      ))}
    </svg>
  );
}

// ROOM INTERIOR — the deepest dive is a PLACE, not a void: furniture by room
// type (deterministic per room), a rug, and whoever is actually here.
const FURNITURE: Record<string, { cls: string; w: number; h: number }[]> = {
  bedroom: [{ cls: 'bed', w: 18, h: 26 }, { cls: 'dresser', w: 14, h: 7 }, { cls: 'plant', w: 6, h: 6 }],
  den: [{ cls: 'sofa', w: 24, h: 9 }, { cls: 'table', w: 10, h: 10 }, { cls: 'shelf', w: 16, h: 6 }],
  lounge: [{ cls: 'sofa', w: 24, h: 9 }, { cls: 'sofa', w: 24, h: 9 }, { cls: 'table', w: 10, h: 10 }],
  kitchen: [{ cls: 'counter', w: 30, h: 8 }, { cls: 'table', w: 12, h: 12 }, { cls: 'stove', w: 9, h: 8 }],
  study: [{ cls: 'desk', w: 18, h: 8 }, { cls: 'shelf', w: 16, h: 6 }, { cls: 'plant', w: 6, h: 6 }],
  bath: [{ cls: 'tub', w: 20, h: 9 }, { cls: 'sink', w: 8, h: 6 }],
  store: [{ cls: 'shelf', w: 22, h: 6 }, { cls: 'shelf', w: 22, h: 6 }, { cls: 'crate', w: 9, h: 9 }],
  ward: [{ cls: 'bed', w: 16, h: 24 }, { cls: 'bed', w: 16, h: 24 }, { cls: 'cabinet', w: 10, h: 6 }],
  exam: [{ cls: 'bed', w: 16, h: 24 }, { cls: 'desk', w: 16, h: 7 }, { cls: 'cabinet', w: 10, h: 6 }],
  office: [{ cls: 'desk', w: 18, h: 8 }, { cls: 'desk', w: 18, h: 8 }, { cls: 'plant', w: 6, h: 6 }],
  lab: [{ cls: 'counter', w: 28, h: 8 }, { cls: 'desk', w: 16, h: 7 }, { cls: 'cabinet', w: 10, h: 6 }],
  class: [{ cls: 'desk', w: 12, h: 7 }, { cls: 'desk', w: 12, h: 7 }, { cls: 'desk', w: 12, h: 7 }, { cls: 'board', w: 24, h: 4 }],
  'shop floor': [{ cls: 'counter', w: 26, h: 8 }, { cls: 'shelf', w: 20, h: 6 }, { cls: 'shelf', w: 20, h: 6 }],
};
function RoomInterior({ room, byId, selected, onSelect }: {
  room: EntityDto; byId: Map<number, EntityDto>;
  selected: number | null; onSelect: (id: number) => void;
}) {
  const name = roomName(room);
  const set = FURNITURE[name] ?? FURNITURE.den;
  const warmth = room.stats.warmth ?? 0.5;
  const occs = room.children.map((c) => byId.get(c)).filter((e): e is EntityDto => !!e && e.kind === 'occupant');
  return (
    <div className="cx-roominner" style={{ ['--warm' as string]: String(warmth) }}>
      <div className="cx-rug" style={{ opacity: 0.25 + warmth * 0.35 }} />
      {set.map((f, i) => {
        // deterministic placement: walls-first (big pieces hug walls), no overlap fuss
        const alongTop = h(room.id, i * 7 + 2) < 0.5;
        const x = 8 + h(room.id, i * 7 + 3) * (84 - f.w);
        const y = alongTop ? 6 + h(room.id, i * 7 + 4) * 12 : 94 - f.h - h(room.id, i * 7 + 4) * 12;
        return <div key={i} className={`cx-furn ${f.cls}`} title={f.cls}
          style={{ left: `${x}%`, top: `${y}%`, width: `${f.w}%`, height: `${f.h}%` }} />;
      })}
      <div className="cx-roomtag">{name}</div>
      {occs.map((e, i) => {
        const mood = e.stats.mood ?? 0.5;
        return (
          <div key={e.id} className={`cx-pawn big ${selected === e.id ? 'sel' : ''}`}
            style={{
              left: `${30 + h(e.id, 1) * 40 + i * 8}%`, top: `${40 + h(e.id, 2) * 25}%`,
              background: pawnColor(mood),
            }}
            title={`${e.name} — ${e.last_action ?? 'here'}`}
            onClick={(ev) => { ev.stopPropagation(); onSelect(e.id); }}>
            <span className="cx-pawn-face">{moodFace(mood)}</span>
            {e.last_action && <span className="cx-pawn-act">{shortAct(e.last_action)}</span>}
          </div>
        );
      })}
    </div>
  );
}

// ---- the floorplan occupant layer: pawns that GLIDE to their room each tick ----
function OccupantLayer({ placed, byId, selected, onSelect }: {
  placed: Placed[]; byId: Map<number, EntityDto>;
  selected: number | null; onSelect: (id: number) => void;
}) {
  // room id → its rect center (target position for anyone inside it)
  const roomCenter = useMemo(() => {
    const m = new Map<number, { x: number; y: number }>();
    placed.forEach((p) => m.set(p.e.id, center(p.rect)));
    return m;
  }, [placed]);

  // gather every occupant currently on this floor (children of its rooms)
  const occs: { e: EntityDto; room: number }[] = [];
  placed.forEach((p) => {
    p.e.children.forEach((cid) => {
      const c = byId.get(cid);
      if (c && c.kind === 'occupant') occs.push({ e: c, room: p.e.id });
    });
  });

  return (
    <>
      {occs.map(({ e, room }) => {
        const c = roomCenter.get(room);
        if (!c) return null;
        // fan out multiple occupants within a room so they don't overlap
        const peers = occs.filter((o) => o.room === room);
        const idx = peers.findIndex((o) => o.e.id === e.id);
        const spread = peers.length > 1 ? (idx - (peers.length - 1) / 2) * 6 : 0;
        const mood = e.stats.mood ?? 0.5;
        return (
          <div key={e.id} className={`cx-pawn ${selected === e.id ? 'sel' : ''}`}
            style={{
              left: `${c.x + spread}%`, top: `${c.y}%`,
              // color by mood; the transition is what makes it GLIDE between rooms
              background: pawnColor(mood),
            }}
            title={`${e.name} — ${e.last_action ?? 'here'}`}
            onClick={(ev) => { ev.stopPropagation(); onSelect(e.id); }}>
            <span className="cx-pawn-face">{moodFace(mood)}</span>
            {e.last_action && <span className="cx-pawn-act">{shortAct(e.last_action)}</span>}
          </div>
        );
      })}
    </>
  );
}

// ---- inspector ----
function Inspector({ e }: { e: EntityDto | undefined; snap: Snapshot; byId: Map<number, EntityDto> }) {
  if (!e) return <aside className="cx-inspect"><div className="cx-muted">click anything to inspect it.</div></aside>;
  const stats = Object.entries(e.stats).filter(([k]) => k !== 'index' && k !== 'use_roll').sort();
  return (
    <aside className="cx-inspect">
      <h3>{e.name}</h3>
      <div className="cx-muted">{e.kind === 'building' ? useOf(e).label + ' · ' : ''}{e.kind} · <span className={`cx-fid ${e.fidelity}`}>{e.fidelity}</span></div>
      {e.last_action && <div className="cx-doing">right now: <b>{e.last_action.replace(/_/g, ' ')}</b></div>}
      <div className="cx-stats">
        {stats.map(([k, v]) => (
          <div key={k} className="cx-stat">
            <span>{k}</span>
            <span className="cx-statbar"><span style={{ width: `${Math.max(0, Math.min(1, v)) * 100}%` }} /></span>
            <b>{v.toFixed(2)}</b>
          </div>
        ))}
      </div>
      {e.facts.length > 0 && <><div className="cx-ih">what's true here</div><ul className="cx-facts">{e.facts.map((f, i) => <li key={i}>{f}</li>)}</ul></>}
    </aside>
  );
}

function ChronStrip({ snap }: { snap: Snapshot }) {
  const tail = snap.log.slice(-5).reverse();
  return (
    <footer className="cx-chron">
      {tail.length === 0 ? <span className="cx-muted">the city settles into its day…</span>
        : tail.map((n, i) => <span key={i} className="cx-chronitem"><b>day {Math.floor(n.tick / 3)}</b> {n.message}</span>)}
    </footer>
  );
}

// ---- little helpers ----
function tint(wealth: number, heat: number): string {
  const g = Math.round(90 + wealth * 90);
  const r = Math.round(70 + heat * 90);
  return `rgb(${r},${g},${Math.round(70 + wealth * 40)})`;
}
const ROOMS = ['den', 'kitchen', 'bedroom', 'study', 'lounge', 'bath', 'store', 'ward', 'class', 'shop floor'];
function roomName(e: EntityDto): string {
  const u = e.stats.use_roll ?? 0.5;
  if (u > 0.7) return ['ward', 'exam', 'office', 'lab'][Math.floor((e.stats.size ?? 0.5) * 4) % 4];
  return ROOMS[e.id % ROOMS.length];
}
function roomTint(e: EntityDto): string {
  const w = e.stats.warmth ?? 0.5;
  return `rgb(${Math.round(70 + w * 40)},${Math.round(66 + w * 26)},${Math.round(86 - w * 10)})`;
}
function pawnColor(mood: number): string {
  // low mood → grey-blue, high → warm gold
  const t = Math.max(0, Math.min(1, mood));
  const r = Math.round(120 + t * 90), g = Math.round(120 + t * 60), b = Math.round(160 - t * 90);
  return `rgb(${r},${g},${b})`;
}
function moodFace(m: number): string { return m > 0.75 ? '◠' : m < 0.35 ? '◡' : '·'; }
function shortAct(a: string): string {
  return ({ wander_next_room: 'walks', mingle: 'chats', rest: 'rests', idle: '' } as Record<string, string>)[a] ?? '';
}
