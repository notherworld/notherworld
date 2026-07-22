// The in-app manual for the formula language. This is what lets a game dev
// author world logic without reading the Rust — the whole vocabulary in one
// place, with examples.

import type { ReactNode } from 'react';

export function Help() {
  return (
    <div className="help">
      <p className="muted">Every formula is evaluated against one entity each tick. Values are just named numbers you invent (energy, mood, wealth, anything).</p>

      <H>Reading values</H>
      <Ref k="energy" d="a bare name = this entity's own stat" />
      <Ref k="parent.wealth" d="a stat on the parent scope" />
      <Ref k="target.armor" d="a stat on the OTHER entity (inside an affect effect)" />
      <Ref k="0.5   1.2   -3" d="plain numbers; + - * / and ( ) as usual" />

      <H>Math &amp; logic</H>
      <Ref k="clamp(x, lo, hi)" d="keep x within [lo,hi]  ·  min, max, abs" />
      <Ref k="gt lt ge le eq (a,b)" d="comparisons → 1 or 0, e.g. gt(age,18)" />
      <Ref k="iff(cond, a, b)" d="if cond>0.5 then a else b" />
      <Ref k="rand(k)" d="stable random 0..1; use rand(1), rand(2)… for independent draws" />
      <Ref k="chance(p)" d="1 with probability p, else 0 (deterministic per tick)" />

      <H>Aggregation (reach other entities)</H>
      <Ref k="child_mean(stat)" d="mean of a stat over children  ·  child_sum/max/min/count" />
      <Ref k="edge_count(kind)" d="how many neighbors via an edge kind" />
      <Ref k="edge_mean(kind, stat)" d="aggregate a stat over graph-neighbors  ·  edge_sum/max/min" />

      <H>Effect ops (what a behavior/event DOES)</H>
      <Ref k="set / add" d="stat = value  /  stat += value  (on self)" />
      <Ref k="affect  →  edge:stat" d="push a value onto every neighbor via that edge (attack, heal, pay). The value can read target.X — the one being acted on." />
      <Ref k="link  →  edge:kind" d="form a relationship to a co-located peer of that kind (befriend, recruit)" />
      <Ref k="unlink  →  edge" d="break all of the actor's edges of that kind" />
      <Ref k="move  →  edge" d="relocate the entity along an edge (go home / to work)" />
      <Ref k="spawn  →  kind" d="create a new sibling entity (birth, division, enemy wave)" />
      <Ref k="despawn" d="remove this entity (death)" />

      <H>The pieces you compose</H>
      <Ref k="Rule" d="set a stat = formula, every tick — drives drift, needs, decay" />
      <Ref k="Behavior" d="each tick an entity does its highest-scoring action; score is a utility formula" />
      <Ref k="Event" d="fires once when `when` first crosses true — a threshold becoming a moment" />
      <Ref k="Generator" d="on reveal, spawn N children with formula-set stats — lazy worldgen, any depth" />
      <Ref k="Rollup / Broadcast" d="aggregate children→parent, or push a parent stat down to children" />

      <p className="muted tip">Tip: give a seed entity <code>reveal: on</code> so its generators run when the world loads, and <code>park children</code> so the next level shows as zoomable ideas.</p>
    </div>
  );
}

function H({ children }: { children: ReactNode }) { return <div className="help-h">{children}</div>; }
function Ref({ k, d }: { k: string; d: string }) {
  return <div className="help-ref"><code>{k}</code><span>{d}</span></div>;
}
