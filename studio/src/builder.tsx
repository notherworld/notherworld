// The BUILDER — the structured authoring surface. Every section here creates a
// piece of the engine's data vocabulary: seed entities, rules, behaviors,
// events, generators, and cross-scale coupling. This is where you build a world.

import { useState, type ReactNode } from 'react';
import { EFFECT_OPS, REDUCERS, type Eff, type Spec } from './spec';

type Patch = (fn: (draft: Spec) => void) => void;

export function Builder({ spec, patch }: { spec: Spec; patch: Patch }) {
  return (
    <div className="builder">
      <div className="world-meta">
        <label>World name <Txt v={spec.name} onChange={(v) => patch((s) => { s.name = v; })} /></label>
        <label>seed <Num v={spec.rng_seed} onChange={(v) => patch((s) => { s.rng_seed = v; })} w={70} /></label>
      </div>

      <Section title="Seed entities" hint="the world you start with; deeper structure is generated" count={spec.seed.length}
        addLabel="+ entity" onAdd={() => patch((s) => { s.seed.push({ kind: 'thing', name: '', stats: {}, reveal: false, park_children: false }); })}>
        {spec.seed.map((sd, i) => (
          <Card key={i} onDel={() => patch((s) => { s.seed.splice(i, 1); })}>
            <Row><L>kind</L><Txt mono v={sd.kind} onChange={(v) => patch((s) => { s.seed[i].kind = v; })} /><L>name</L><Txt v={sd.name} ph="(optional)" onChange={(v) => patch((s) => { s.seed[i].name = v; })} /></Row>
            <Row>
              <Chk v={sd.reveal} label="reveal on load (run its generators)" onChange={(v) => patch((s) => { s.seed[i].reveal = v; })} />
              <Chk v={sd.park_children} label="park children as ideas" onChange={(v) => patch((s) => { s.seed[i].park_children = v; })} />
            </Row>
            <SubLabel>starting stats</SubLabel>
            <StatsEd stats={sd.stats} onChange={(m) => patch((s) => { s.seed[i].stats = m; })} />
          </Card>
        ))}
      </Section>

      <Section title="Rules" hint="set a stat = formula, every tick, for each entity of a kind" count={spec.rules.length}
        addLabel="+ rule" onAdd={() => patch((s) => { s.rules.push({ on: '', set: '', expr: '' }); })}>
        {spec.rules.map((r, i) => (
          <Card key={i} onDel={() => patch((s) => { s.rules.splice(i, 1); })}>
            <Row><L>on</L><Txt mono v={r.on} ph="kind" onChange={(v) => patch((s) => { s.rules[i].on = v; })} /><L>set</L><Txt mono v={r.set} ph="stat" onChange={(v) => patch((s) => { s.rules[i].set = v; })} /></Row>
            <Row><L>=</L><Txt mono wide v={r.expr} ph="formula, e.g. clamp(energy + 0.03, 0, 1)" onChange={(v) => patch((s) => { s.rules[i].expr = v; })} /></Row>
          </Card>
        ))}
      </Section>

      <Section title="Behaviors" hint="each tick an entity does its highest-scoring action" count={spec.actions.length}
        addLabel="+ behavior" onAdd={() => patch((s) => { s.actions.push({ on: '', name: '', score: '', effects: [] }); })}>
        {spec.actions.map((a, i) => (
          <Card key={i} onDel={() => patch((s) => { s.actions.splice(i, 1); })}>
            <Row><L>on</L><Txt mono v={a.on} ph="kind" onChange={(v) => patch((s) => { s.actions[i].on = v; })} /><L>name</L><Txt v={a.name} ph="do_task" onChange={(v) => patch((s) => { s.actions[i].name = v; })} /></Row>
            <Row><L>score</L><Txt mono wide v={a.score} ph="utility formula, e.g. energy*gt(size,0.8)" onChange={(v) => patch((s) => { s.actions[i].score = v; })} /></Row>
            <SubLabel>effects</SubLabel>
            <EffectsEd effects={a.effects} onChange={(e) => patch((s) => { s.actions[i].effects = e; })} />
          </Card>
        ))}
      </Section>

      <Section title="Events" hint="fire once when a condition first becomes true (a birth, a collapse)" count={spec.events.length}
        addLabel="+ event" onAdd={() => patch((s) => { s.events.push({ on: '', when: '', label: '', do: [] }); })}>
        {spec.events.map((e, i) => (
          <Card key={i} onDel={() => patch((s) => { s.events.splice(i, 1); })}>
            <Row><L>on</L><Txt mono v={e.on} ph="kind" onChange={(v) => patch((s) => { s.events[i].on = v; })} /><L>label</L><Txt v={e.label} ph="a cell divides" onChange={(v) => patch((s) => { s.events[i].label = v; })} /></Row>
            <Row><L>when</L><Txt mono wide v={e.when} ph="condition, e.g. gt(age,72)*chance(0.3)" onChange={(v) => patch((s) => { s.events[i].when = v; })} /></Row>
            <SubLabel>do</SubLabel>
            <EffectsEd effects={e.do} onChange={(d) => patch((s) => { s.events[i].do = d; })} />
          </Card>
        ))}
      </Section>

      <Section title="Generators" hint="on reveal, spawn N children with formula-set stats (lazy worldgen)" count={spec.generators.length}
        addLabel="+ generator" onAdd={() => patch((s) => { s.generators.push({ on: '', spawn: '', count: '1', child_stats: {} }); })}>
        {spec.generators.map((g, i) => (
          <Card key={i} onDel={() => patch((s) => { s.generators.splice(i, 1); })}>
            <Row><L>on</L><Txt mono v={g.on} ph="parent kind" onChange={(v) => patch((s) => { s.generators[i].on = v; })} /><L>spawn</L><Txt mono v={g.spawn} ph="child kind" onChange={(v) => patch((s) => { s.generators[i].spawn = v; })} /></Row>
            <Row><L>count</L><Txt mono wide v={g.count} ph="formula, e.g. 4 + population*4" onChange={(v) => patch((s) => { s.generators[i].count = v; })} /></Row>
            <SubLabel>each child's stats</SubLabel>
            <ChildStatsEd map={g.child_stats} onChange={(m) => patch((s) => { s.generators[i].child_stats = m; })} />
          </Card>
        ))}
      </Section>

      <Section title="Cross-scale" hint="roll children up into a parent stat, or broadcast a parent stat down" count={spec.rollups.length + spec.broadcasts.length}>
        <SubLabel>rollups (children → parent) <button className="addmini" onClick={() => patch((s) => { s.rollups.push({ parent: '', child_stat: '', parent_stat: '', reduce: 'mean' }); })}>+ rollup</button></SubLabel>
        {spec.rollups.map((r, i) => (
          <div className="line" key={i}>
            <Txt mono v={r.parent} ph="parent kind" onChange={(v) => patch((s) => { s.rollups[i].parent = v; })} />
            <span className="op">·</span>
            <Txt mono v={r.child_stat} ph="child stat" onChange={(v) => patch((s) => { s.rollups[i].child_stat = v; })} />
            <Sel v={r.reduce} opts={REDUCERS} onChange={(v) => patch((s) => { s.rollups[i].reduce = v; })} />
            <span className="op">→</span>
            <Txt mono v={r.parent_stat} ph="parent stat" onChange={(v) => patch((s) => { s.rollups[i].parent_stat = v; })} />
            <button className="x" onClick={() => patch((s) => { s.rollups.splice(i, 1); })}>×</button>
          </div>
        ))}
        <SubLabel>broadcasts (parent → children) <button className="addmini" onClick={() => patch((s) => { s.broadcasts.push({ parent_stat: '', child_stat: '', gain: 1 }); })}>+ broadcast</button></SubLabel>
        {spec.broadcasts.map((b, i) => (
          <div className="line" key={i}>
            <Txt mono v={b.parent_stat} ph="parent stat" onChange={(v) => patch((s) => { s.broadcasts[i].parent_stat = v; })} />
            <span className="op">×</span>
            <Num v={b.gain} w={54} onChange={(v) => patch((s) => { s.broadcasts[i].gain = v; })} />
            <span className="op">→</span>
            <Txt mono v={b.child_stat} ph="child stat" onChange={(v) => patch((s) => { s.broadcasts[i].child_stat = v; })} />
            <button className="x" onClick={() => patch((s) => { s.broadcasts.splice(i, 1); })}>×</button>
          </div>
        ))}
      </Section>
    </div>
  );
}

// ---- small building blocks ----
function Txt({ v, onChange, ph, mono, wide }: { v: string; onChange: (v: string) => void; ph?: string; mono?: boolean; wide?: boolean }) {
  return <input className={`f${mono ? ' mono' : ''}${wide ? ' wide' : ''}`} value={v} placeholder={ph} spellCheck={false} onChange={(e) => onChange(e.target.value)} />;
}
function Num({ v, onChange, w }: { v: number; onChange: (v: number) => void; w?: number }) {
  return <input className="f mono" type="number" step="any" style={{ width: w ?? 80 }} value={Number.isFinite(v) ? v : 0} onChange={(e) => onChange(parseFloat(e.target.value))} />;
}
function Sel({ v, onChange, opts }: { v: string; onChange: (v: string) => void; opts: string[] }) {
  return <select className="f" value={v} onChange={(e) => onChange(e.target.value)}>{opts.map((o) => <option key={o}>{o}</option>)}</select>;
}
function Chk({ v, onChange, label }: { v: boolean; onChange: (v: boolean) => void; label: string }) {
  return <label className="chk"><input type="checkbox" checked={v} onChange={(e) => onChange(e.target.checked)} /> {label}</label>;
}
function L({ children }: { children: ReactNode }) { return <span className="fl">{children}</span>; }
function Row({ children }: { children: ReactNode }) { return <div className="frow">{children}</div>; }
function SubLabel({ children }: { children: ReactNode }) { return <div className="sublabel">{children}</div>; }
function Card({ children, onDel }: { children: ReactNode; onDel: () => void }) {
  return <div className="card"><button className="card-x" onClick={onDel} title="remove">×</button>{children}</div>;
}

function Section({ title, hint, count, children, onAdd, addLabel }: {
  title: string; hint: string; count: number; children: ReactNode; onAdd?: () => void; addLabel?: string;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="section">
      <div className="sec-head" onClick={() => setOpen((o) => !o)}>
        <span className="caret">{open ? '▾' : '▸'}</span>
        <span className="sec-title">{title}</span>
        <span className="sec-count">{count}</span>
        <span className="muted-inline">{hint}</span>
        <span className="spacer" />
        {onAdd && <button className="add" onClick={(e) => { e.stopPropagation(); onAdd(); }}>{addLabel ?? '+ add'}</button>}
      </div>
      {open && <div className="sec-body">{children}</div>}
    </div>
  );
}

function EffectsEd({ effects, onChange }: { effects: Eff[]; onChange: (e: Eff[]) => void }) {
  const set = (i: number, p: Partial<Eff>) => { const c = effects.map((e, j) => (j === i ? { ...e, ...p } : e)); onChange(c); };
  return (
    <div className="effs">
      {effects.map((ef, i) => (
        <div className="eff-row" key={i}>
          <Sel v={ef.op} opts={EFFECT_OPS} onChange={(op) => set(i, { op })} />
          <Txt mono v={ef.stat ?? ''} ph="stat · edge:stat · kind" onChange={(stat) => set(i, { stat })} />
          <Txt mono wide v={ef.expr ?? ''} ph="value / formula" onChange={(expr) => set(i, { expr })} />
          <button className="x" onClick={() => onChange(effects.filter((_, j) => j !== i))}>×</button>
        </div>
      ))}
      <button className="addmini" onClick={() => onChange([...effects, { op: 'add', stat: '', expr: '' }])}>+ effect</button>
    </div>
  );
}

function StatsEd({ stats, onChange }: { stats: Record<string, number>; onChange: (m: Record<string, number>) => void }) {
  const entries = Object.entries(stats);
  const rename = (old: string, nk: string) => { const m: Record<string, number> = {}; for (const [k, v] of entries) m[k === old ? nk : k] = v; onChange(m); };
  return (
    <div className="kv">
      {entries.map(([k, v], i) => (
        <div className="kv-row" key={i}>
          <Txt mono v={k} ph="stat" onChange={(nk) => rename(k, nk)} />
          <input className="f mono" type="number" step="any" style={{ width: 80 }} value={v} onChange={(e) => onChange({ ...stats, [k]: parseFloat(e.target.value) })} />
          <button className="x" onClick={() => { const m = { ...stats }; delete m[k]; onChange(m); }}>×</button>
        </div>
      ))}
      <button className="addmini" onClick={() => onChange({ ...stats, ['stat' + entries.length]: 0.5 })}>+ stat</button>
    </div>
  );
}

function ChildStatsEd({ map, onChange }: { map: Record<string, string>; onChange: (m: Record<string, string>) => void }) {
  const entries = Object.entries(map);
  const rename = (old: string, nk: string) => { const m: Record<string, string> = {}; for (const [k, v] of entries) m[k === old ? nk : k] = v; onChange(m); };
  return (
    <div className="kv">
      {entries.map(([k, v], i) => (
        <div className="kv-row" key={i}>
          <Txt mono v={k} ph="stat" onChange={(nk) => rename(k, nk)} />
          <Txt mono wide v={v} ph="formula, e.g. rand(1) or parent.wealth" onChange={(nv) => onChange({ ...map, [k]: nv })} />
          <button className="x" onClick={() => { const m = { ...map }; delete m[k]; onChange(m); }}>×</button>
        </div>
      ))}
      <button className="addmini" onClick={() => onChange({ ...map, ['stat' + entries.length]: 'rand(1)' })}>+ stat</button>
    </div>
  );
}
