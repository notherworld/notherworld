# Build Your First Living World

A from-scratch walkthrough. By the end you'll have authored a small world that
comes alive — and you'll understand the loop well enough to build your own. No Rust,
no engine code: a world is a JSON file. Read `ENGINE.md` alongside this for the
exact vocabulary; this doc is the *how you actually do it*.

We'll build a tiny version of **Le Méridian** (the living Paris hotel) so you can see
the full pattern, then point you at the knobs.

---

## The mental model

You are not scripting events. You are describing **a system with pressures**, and
letting behavior emerge. Three questions define any world:

1. **What exists?** → entities in a scope tree (`seed` + `generators`).
2. **What changes on its own?** → `rules` (drift, needs, decay) + cross-scale
   `rollups`/`broadcasts`.
3. **What do things DO, and when do moments happen?** → `actions` (utility choices)
   + `events` (thresholds becoming moments).

Tune until the pressures balance into a story. That's the whole craft.

---

## Step 1 — What exists (structure)

Start with the tree. A hotel contains a kitchen; the kitchen contains cooks.

```json
{
  "rng_seed": 3,
  "seed": [
    { "kind": "hotel", "name": "Le Méridian", "reveal": true,
      "stats": { "reputation": 0.35 } }
  ],
  "generators": [
    { "on": "hotel", "spawn": "kitchen", "count": "1", "cascade": true,
      "child_stats": { "pantry": "0.8", "quality": "0.4" } },
    { "on": "kitchen", "spawn": "cook", "count": "6",
      "child_stats": {
        "skill":  "0.15 + 0.5*rand(1)",
        "morale": "0.55 + 0.3*rand(2)",
        "warmth": "0.2 + 0.7*rand(3)",
        "alive":  "1"
      } }
  ]
}
```

Two things that will bite you if you skip them:
- **`reveal: true`** on the seed — without it the hotel exists but its generator
  never fires (no kitchen, no cooks).
- **`cascade: true`** on the hotel→kitchen generator — this makes the kitchen reveal
  immediately so ITS generator (kitchen→cooks) fires in the same pass. Without it,
  you get a kitchen but zero cooks. (This is a real, load-bearing flag — a world
  deeper than one generated layer needs it.)

**Run it now** — even empty of behavior, confirm the structure materialized:
```
cargo run --release --bin live -- worlds/hotel.json 5 cook
```
You want to see "6 live". If you see 0, your reveal/cascade is wrong.

---

## Step 2 — What changes on its own (rules)

Give cooks a metabolism and the kitchen an economy. Add a `rules` section:

```json
"rules": [
  { "on": "cook", "set": "morale", "expr": "clamp(morale + 0.01*gt(ration,0.4) - 0.015*lt(ration,0.2), 0, 1)" },
  { "on": "kitchen", "set": "pantry", "expr": "clamp(pantry + 0.12*(1 - pantry) - draw*0.05, 0, 1)" }
]
```

`pantry` regrows toward 1 but is drawn down by `draw` (which we'll feed in Step 4).
This is the **commons** pattern — a shared resource that depletes under use and
recovers when use drops. It's the heart of most interesting worlds.

---

## Step 3 — What things DO (actions)

Cooks work, mentor, and compete. Each tick a cook runs its **highest-scoring**
action. Add:

```json
"actions": [
  { "on": "cook", "name": "work_service",
    "score": "gt(ration,0.05)*(0.45 + 0.35*morale)*(0.5+skill)",
    "effects": [
      { "op": "set", "stat": "took",   "expr": "0.1*ration" },
      { "op": "add", "stat": "skill",  "expr": "0.004*(1-skill)" }
    ] },

  { "on": "cook", "name": "mentor",
    "score": "warmth*gt(skill,0.45)*gt(morale,0.45)*lt(edge_count(mentee),3)*1.1",
    "effects": [ { "op": "link", "stat": "mentee:cook" } ] },

  { "on": "cook", "name": "coach",
    "score": "warmth*gt(edge_count(mentee),0)*gt(morale,0.4)*(0.8 + 0.6*chance(0.5))",
    "effects": [
      { "op": "affect", "stat": "mentee:skill", "expr": "0.03*gt(skill, target.skill)" }
    ] },

  { "on": "cook", "name": "take_a_breather",
    "score": "0.35 + 0.7*lt(morale,0.35)",
    "effects": [ { "op": "add", "stat": "morale", "expr": "0.06" } ] }
]
```

Read what's happening: working **teaches the worker** (`skill += …`) — that's how a
cook rises. A warm, skilled, high-morale cook **mentors** an apprentice (forms a
`mentee` edge), then **coaches** them (pushes skill onto that edge-neighbor, reading
`target.skill` so they only help someone less skilled). A burnt-out cook takes a
breather. This little web is what produces the emergent "who gets promoted first."

**This is where you'll spend 80% of your time.** See "Tuning" below.

---

## Step 4 — Cross-scale coupling (rollups & broadcasts)

Wire the scales together so a cook's work reaches the hotel and vice-versa.

```json
"rollups": [
  { "parent": "kitchen", "child_stat": "took",  "parent_stat": "draw",    "reduce": "sum", "drain": true },
  { "parent": "kitchen", "child_stat": "skill", "parent_stat": "quality", "reduce": "mean" },
  { "parent": "hotel",   "child_stat": "quality","parent_stat": "kitchen_q","reduce": "max" }
],
"broadcasts": [
  { "parent_stat": "reputation", "child_stat": "house_rep", "gain": 1.0 }
]
```

- The `took`→`draw` rollup uses **`drain: true`**: each cook sets `took` this tick,
  the kitchen sums it into `draw`, then drain zeroes `took` for next tick. That's how
  "amount drawn from the pantry THIS service" works. (A flow variable — you can't do
  this without `drain`; a reset rule would wipe it before the rollup reads it.)
- Skill rolls up to kitchen `quality`, which rolls up to the hotel — the reputation
  chain.
- Reputation broadcasts DOWN as `house_rep` so cooks/guests can read the hotel's
  standing. **Note we broadcast into a *different* stat name (`house_rep`), not
  `reputation`** — broadcasting a stat onto a child of the same name can clobber a
  scope's own value. Use a distinct downstream name.

---

## Step 5 — Moments (events)

Thresholds become story beats. Add:

```json
"events": [
  { "on": "cook", "when": "gt(skill,0.85)*lt(promoted,0.5)",
    "label": "earns a station — promoted up the brigade",
    "do": [ { "op": "set", "stat": "promoted", "expr": "1" }, { "op": "add", "stat": "morale", "expr": "0.15" } ] },

  { "on": "hotel", "when": "gt(reputation,0.6)*lt(starred,0.5)",
    "label": "★ Le Méridian earns its first star",
    "do": [ { "op": "set", "stat": "starred", "expr": "1" } ] }
]
```

The **guard-stat pattern** (`lt(promoted,0.5)` + set `promoted=1` in the effect) makes
a rising-edge event fire exactly once. Every milestone uses it. Reputation needs a
rule to actually climb — add one on the hotel:
`{ "on": "hotel", "set": "reputation", "expr": "clamp(reputation + 0.02*(kitchen_q - reputation), 0, 1)" }`.

**Run the full year:**
```
cargo run --release --bin live -- worlds/hotel.json 220 cook
```
Read the **chronicle** and **oracle**. A living hotel prints: first star ~day 73,
several promotions, mentorship firing hundreds of times. If it's flat, tune.

---

## Tuning — the actual craft (read this twice)

Almost every "it's not alive" problem is one of these, and NONE need an engine change:

1. **One action dominates (the #1 bug).** The oracle shows `work_service 100%`. Its
   score is simply higher than everything else, always. Fix: lower the dominant
   score's constant, raise the others, and check their **gates are reachable** — a
   `gt(skill,0.5)` gate on cooks who start at 0.15 means that action NEVER fires
   until something raises skill. Add `chance()` jitter so choices vary.

2. **An event fires 0 times.** Its `when` never crossed. Either the driving stat
   never climbs (no rule/effect raises it) or the threshold is unreachable. Trace the
   chain backward: promotion needs skill>0.85 needs coaching needs mentoring needs a
   warm high-morale cook. If any link is dammed, the whole chain is.

3. **Runaway growth or total die-off.** Births outpace deaths (population explodes,
   the run hangs) or nothing sustains (everyone dies by tick 20). Balance the
   birth/death rates against the resource economy. A healthy world usually needs a
   **carrying capacity** — births gated on genuine surplus, deaths from scarcity —
   so it self-regulates instead of exploding or flatlining. (Emberhold's boom-bust
   is this balance tuned to oscillate.)

4. **A stat pins to 0 or 1.** Usually a broadcast clobber (see Step 4) or a formula
   with the wrong sign. Print it: the `live` oracle + chronicle usually reveal which
   stat is stuck.

**The method:** change ONE thing, re-run, read the oracle, repeat. The oracle telling
you exactly which actions/events fired (and how often) is your debugger.

---

## When it's genuinely an engine gap, not tuning

If a whole *capability* is missing — you literally cannot express the thing in the
vocabulary (`ENGINE.md` §3–4) — that's a prim, not a tuning problem. The tells:
- You want a behavior that needs a value the DSL can't compute (no function for it).
- You want an entity relationship the effect ops can't form.
- You want timing/structure the tick order can't produce.

See `ENGINE.md` §7 for the known candidate gaps (spatial, inventory, scheduled time,
targeted link). Adding one is a real (small) Rust change — keep it additive and
default-off, and re-run the determinism checks. But **check it's not tuning first** —
that's been the lesson every time.

---

## Where to go next

- Copy `worlds/emberhold.json` (a tuned boom-bust commons) and `worlds/hotel.json`
  (this walkthrough, finished) and take them apart.
- Read `ENGINE.md` for the exact tick order and every effect op.
- Build something in a NEW domain (a monastery, a starship, a school). If it comes
  alive with only tuning, the engine did its job. If you hit a real wall, you found
  the next prim — that's the good outcome too.
```
