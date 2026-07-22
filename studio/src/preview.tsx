// The live PREVIEW pane. It rebuilds the world from the current spec (so editing
// logic re-runs it instantly), plays/steps time, and lets you zoom the scope
// tree, inspect any entity, and read the chronicle. This is the "does what I
// built actually behave?" feedback loop.

import { useEffect, useMemo, useRef, useState } from 'react';
import { createWorld, World, type Snapshot, type EntityDto } from './owos';

export function Preview({ specJson }: { specJson: string }) {
  const worldRef = useRef<World | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [err, setErr] = useState('');

  const refresh = () => { if (worldRef.current) setSnap(worldRef.current.snapshot()); };

  // Rebuild whenever the spec changes. A bad formula surfaces here as an error
  // instead of crashing — the whole point of authoring with live feedback.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const w = await createWorld(specJson);
        if (cancelled) { w.dispose(); return; }
        worldRef.current?.dispose();
        worldRef.current = w;
        setErr('');
        setSelected(w.root());
        setSnap(w.snapshot());
        setPlaying(false);
      } catch (e) {
        if (!cancelled) setErr(String(e).replace(/^Error:\s*/, ''));
      }
    })();
    return () => { cancelled = true; };
  }, [specJson]);

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => { worldRef.current?.step(); refresh(); }, 300);
    return () => clearInterval(t);
  }, [playing]);

  const step = (n: number) => { worldRef.current?.steps(n); refresh(); };
  const byId = useMemo(() => { const m = new Map<number, EntityDto>(); snap?.entities.forEach((e) => m.set(e.id, e)); return m; }, [snap]);
  const onSelect = (id: number) => {
    setSelected(id);
    const e = byId.get(id);
    if (e && e.fidelity !== 'detailed') { worldRef.current?.reveal(id); refresh(); }
  };
  const sel = selected != null ? byId.get(selected) : undefined;

  return (
    <div className="preview">
      <div className="prev-bar">
        <button onClick={() => step(1)} disabled={!!err}>Step</button>
        <button onClick={() => step(10)} disabled={!!err}>×10</button>
        <button className={playing ? 'accent' : ''} disabled={!!err} onClick={() => setPlaying((p) => !p)}>{playing ? '❚❚' : '▶'} Play</button>
        <span className="tick">tick {snap?.tick ?? 0} · {snap?.entities.length ?? 0} live</span>
      </div>

      {err && <div className="build-err"><b>Build error:</b> {err}<div className="muted">Fix the formula/spec on the left — the preview re-runs automatically.</div></div>}

      {!err && (
        <div className="prev-cols">
          <div className="prev-tree">
            {snap && <TreeNode id={snap.root} byId={byId} depth={0} selected={selected} onSelect={onSelect} />}
            <Legend />
          </div>
          <div className="prev-inspect">
            <Inspector sel={sel} snap={snap} byId={byId}
              onFold={(id) => { worldRef.current?.fold(id); refresh(); }}
              onReveal={(id) => { worldRef.current?.reveal(id); refresh(); }} />
            <Chronicle snap={snap} />
          </div>
        </div>
      )}
    </div>
  );
}

function TreeNode({ id, byId, depth, selected, onSelect }: {
  id: number; byId: Map<number, EntityDto>; depth: number; selected: number | null; onSelect: (id: number) => void;
}) {
  const e = byId.get(id);
  if (!e) return null;
  const idea = e.fidelity !== 'detailed' && e.children.length === 0;
  return (
    <>
      <div className={`node ${e.fidelity} ${selected === id ? 'sel' : ''}`} style={{ paddingLeft: depth * 14 + 6 }} onClick={() => onSelect(id)}>
        <span className={`dot ${e.fidelity}`} />
        <span className="nname">{e.name}</span>
        <span className="nkind">{e.kind}</span>
        {idea && <span className="zoomhint">▸ zoom</span>}
        {e.last_action && <span className="lastact">{e.last_action}</span>}
      </div>
      {e.children.map((c) => <TreeNode key={c} id={c} byId={byId} depth={depth + 1} selected={selected} onSelect={onSelect} />)}
    </>
  );
}

function Inspector({ sel, snap, byId, onFold, onReveal }: {
  sel: EntityDto | undefined; snap: Snapshot | null; byId: Map<number, EntityDto>;
  onFold: (id: number) => void; onReveal: (id: number) => void;
}) {
  if (!sel) return <div className="muted pad">Select an entity in the tree.</div>;
  const edges = snap?.edges.filter((e) => e.from === sel.id || e.to === sel.id) ?? [];
  const statKeys = Object.keys(sel.stats).sort();
  return (
    <div className="inspector">
      <div className="ins-head">
        <div>
          <h3>{sel.name}</h3>
          <div className="muted">{sel.kind} · #{sel.id} · <span className={`badge ${sel.fidelity}`}>{sel.fidelity}</span>{sel.active ? ' · live' : ' · dormant'}</div>
        </div>
        {sel.fidelity === 'detailed'
          ? <button onClick={() => onFold(sel.id)}>Fold ▲</button>
          : <button className="accent" onClick={() => onReveal(sel.id)}>Reveal ▼</button>}
      </div>
      {sel.last_action && <div className="doing">doing: <b>{sel.last_action}</b></div>}
      <div className="stats">
        {statKeys.length === 0 && <div className="muted">no stats</div>}
        {statKeys.map((k) => <StatRow key={k} k={k} v={sel.stats[k]} />)}
      </div>
      {sel.facts.length > 0 && <>
        <div className="ins-sub">canon</div>
        <ul className="facts">{sel.facts.map((f, i) => <li key={i}>{f}</li>)}</ul>
      </>}
      {edges.length > 0 && <>
        <div className="ins-sub">relationships</div>
        <ul className="edges">{edges.map((e, i) => {
          const other = e.from === sel.id ? e.to : e.from;
          return <li key={i}><span className="ekind">{e.kind}</span> → {byId.get(other)?.name ?? `#${other}`}</li>;
        })}</ul>
      </>}
    </div>
  );
}

function StatRow({ k, v }: { k: string; v: number }) {
  const w = Math.max(0, Math.min(1, v)) * 100;
  return (
    <div className="stat">
      <span className="sk">{k}</span>
      <span className="sbar"><span style={{ width: `${w}%` }} /></span>
      <span className="sv">{v.toFixed(2)}</span>
    </div>
  );
}

function Chronicle({ snap }: { snap: Snapshot | null }) {
  const log = snap?.log ?? [];
  const tail = log.slice(-30).reverse();
  return (
    <div className="chronicle">
      <div className="ins-sub">chronicle <span className="muted-inline">{log.length}</span></div>
      <div className="log">
        {tail.length === 0 && <div className="muted">— nothing notable yet —</div>}
        {tail.map((n, i) => <div key={i} className="logline"><span className="lt">t{n.tick}</span> {n.message}</div>)}
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="legend">
      <span><i className="dot detailed" /> live</span>
      <span><i className="dot hazed" /> sharpening</span>
      <span><i className="dot coarse" /> idea (click to zoom)</span>
    </div>
  );
}
