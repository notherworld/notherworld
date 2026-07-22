# otherworldOS — Engine Reference (operational)

The precise, verified reference for authoring worlds as data. Everything here was
confirmed against the source (`engine/owos-core/src/engine/`) and by running worlds
through the `live` driver. When this doc and a "it can do X" claim disagree, **test
it with `live` and trust the test.**

> The single most important rule this project has learned: **do not declare the
> primitive set "closed."** It has been claimed three times and been wrong three
> times, always because the claim rested on host-driven demos instead of pure-data
> worlds. Author a world that would expose the gap, run it, then believe.

---

## 1. The model in one screen

- **Everything is an `Entity`**: a `kind` (string), a bag of named `stats` (f32),
  a place in a **scope tree** (one parent, N children), and a `Fidelity`
  (Detailed / Hazed / Coarse). "Scale" is just depth. Domain-agnostic — a `world`,
  a `city`, a `cook`, a `conversation` are all just entities.
- **A world is authored as JSON** and built with `owos_author::build(json) -> World`.
  Then you drive it with `world.step()`. That's the whole runtime contract.
- **No host code required.** A spec's `seed` section bootstraps the root entities,
  so `build(json)` + `step()` runs a complete world. (Some older demos in
  `owos-cli` ARE host-driven — they set modes/drive a camera in Rust. Those prove
  engine *pieces*; they are NOT proof that a pure-data world works. The pure-data
  proof is the `live` bin + worlds like `hotel.json`, `emberhold.json`.)

The JSON spec is the union of these sections (all optional except you need a
`seed`): `seed`, `rules`, `coarse_rules`, `actions`, `events`, `generators`,
`rollups`, `broadcasts`, `convo_moves`, plus `rng_seed` and `name`.

---

## 2. The tick — EXACT order of operations

`World::step()` runs these phases **in this order**. Authoring correctly means
knowing what has and hasn't happened yet within a tick. (Source: `world.rs::step`.)

```
0.  data-actions      each ACTIVE entity picks its highest-scoring action, applies effects
1.  (native systems)  — rarely used in data worlds
2.  (coarse systems)  — rarely used in data worlds
2b. rules             each ACTIVE entity: set stat = formula   (in the ORDER rules appear)
2c. events            rising-edge: if `when` crosses false→true, fire effects once
2d. coarse_rules      FRONTIER nodes (Coarse/Hazed under a Detailed parent) drift as aggregates
3.  rollups           children → parent, deepest first; SKIPS non-Detailed parents; `drain` clears
4.  broadcasts        parent → children, root first; reaches folded scopes too
    (instrumentation: watched headcounts sampled)
    tick += 1
```

**The consequences you MUST author around:**

- **Actions run BEFORE rules (phase 0 vs 2b).** An action's effect on a stat can be
  overwritten by a rule that sets that same stat later the same tick. Don't have a
  rule `set` a stat an action is trying to accumulate — the rule wins.
- **Rollups/broadcasts run LAST (phases 3–4).** So within a tick, a child reading
  `parent.X` sees **last tick's** rolled-up value, and a parent reading a
  child-derived stat sees **last tick's**. Cross-scale feedback lags one tick.
  This is fine and correct — just know the loop has a one-tick delay.
- **Rules fire in authored order** (phase 2b iterates the array). If rule B reads a
  stat rule A sets, put A before B to use this tick's value; after, to use last's.
- **Only ACTIVE entities run actions/rules/events.** "Active" = every ancestor is
  Detailed (`is_active`). A child under a Hazed/Coarse parent is DORMANT — its
  rules/actions/events do NOT run. (This is the LOD lever; see §6.)

---

## 3. The formula DSL (`expr.rs`) — complete surface

A formula is evaluated against one entity per tick. **This is the ENTIRE language**
— there is nothing else; if you need something not here, it's a real gap.

**Values / identifiers**
- `energy` — a bare name = this entity's own stat (0.0 if unset)
- `parent.wealth` — a stat on the parent entity
- `target.armor` — a stat on the OTHER entity, ONLY inside an `affect`/`affect_set`
  effect (the entity being acted on); 0.0 elsewhere
- numbers: `0.5  1.2  -3`, and `+ - * /` with `( )`. Integer division by 0 = 0.

**Math:** `clamp(x,lo,hi)`  `min(a,b)`  `max(a,b)`  `abs(a)`
**Comparisons** (return 1.0 / 0.0): `gt lt ge le eq (a,b)` · `iff(cond,a,b)` (cond>0.5 ? a : b)
**Randomness** (deterministic per entity+tick, replay-safe):
- `rand(k)` — stable [0,1); `k` is a salt so `rand(1)`, `rand(2)`… are INDEPENDENT
  draws in the same tick (roll a whole personality in one pass)
- `chance(p)` or `chance(p,salt)` — 1 with probability p, else 0
**Aggregation over children:** `child_count()` · `child_sum/mean/max/min(stat)`
**Aggregation over graph-neighbors:** `edge_count(kind)` · `edge_sum/mean/max/min(kind,stat)`
**Aggregation over CO-LOCATED peers** (same parent = same place/room — topological
proximity, no edges needed): `here_count()` · `here_sum/mean/max/min(stat)`. Use for
"how many are in this room", "the neediest person here", "average mood of the table".
**Geometry:** `sin(a)` `cos(a)` `sqrt(a)` `floor(a)` `mod(a,b)` `pi()` — positions,
rings, periodic values as data.
**Fields / region algebra** (see §4.5): `field(name,x,y)` sample a named field ·
`noise(x,y)` value-noise · `near(name,r)` spatial buffer · `and/or/not/sub/xor` set
ops over fields-as-regions (`buildable = sub(land, steep)`).

**There is NO:** `and/or/not`, `ne`, `mod`, `floor/ceil/round`, `sqrt`, `pow`, `sin`,
ternary syntax, string ops, or variables. **Compose logic with arithmetic:**
- AND → multiply: `gt(a,1)*gt(b,1)`
- NOT → `1 - gt(a,1)`
- OR (either) → `gt(gt(a,1)+gt(b,1), 0)`  (or just add if you want a count)
- "in range" → `gt(x,lo)*lt(x,hi)`

---

## 4. The data vocabulary — every section

### `seed` — the root entities (bootstraps the world)
```json
{ "kind": "hotel", "name": "Le Méridian", "reveal": true,
  "count": 1, "park_children": false, "stats": { "reputation": 0.35 } }
```
- `reveal: true` → runs this seed's generators on load (materializes its structure).
  Without it, the seed exists but its generators never fire.
- `park_children: true` → after revealing, band the new children as Coarse "ideas"
  (for a camera to zoom later). Omit for a fully-live world.
- `count: N` → spawn N copies (named "kind 1", "kind 2", …).

### `rules` — set a stat = formula, every tick, per active entity of a kind
```json
{ "on": "cook", "set": "morale", "expr": "clamp(morale + 0.01 - morale_hit, 0, 1)" }
```
Drives drift, needs, decay. Runs in array order (§2).

### `coarse_rules` — the offscreen sim
Same shape, but runs on the **frontier** (Coarse/Hazed nodes just outside the
Detailed camera path) as single aggregates. This is how an unwatched district keeps
moving cheaply. (See `lodaudit` for proof it works.)

### `actions` — utility AI (behaviors)
```json
{ "on": "cook", "name": "mentor",
  "score": "warmth*gt(skill,0.45)*lt(edge_count(mentee),3)*1.1",
  "effects": [ { "op": "link", "stat": "mentee:cook" } ] }
```
Each tick, each active entity scores every action it has and runs the **single
highest** (ties → first; score ≤ 0 → never). A player `intent` overrides the pick.
**Balancing note:** if one action's score dominates, the others never fire — the
#1 tuning bug. Keep scores in comparable ranges; use `chance()` to add variety.

### Effect ops (used by `actions` and `events`)
| op | target field | expr field | does |
|---|---|---|---|
| `set` | stat | value | stat = value (self) |
| `add` | stat | value | stat += value (self) |
| `affect` | `edge:stat` OR `co:stat` (+ optional `@max:`/`@min:` pick — below) | value | stat += value on EVERY neighbor via edge — OR on every CO-LOCATED peer if target is `co:stat`; value may read `target.X` |
| `affect_set` | `edge:stat` / `co:stat` | value | as above but sets |
| `link` | `edge:kind` (+ optional `@max:`/`@min:` pick) | — | link to ONE random co-located peer of kind (same parent, not already linked). With a pick — `"prize:trader@max:target.bid"` — SELECTS the best-ranked candidate instead: award-to-highest-bidder, choose-THE-rival. Random sample is O(1); pick scans co-located kind (opt-in). |
| `claim` | `edge:kind` (+ optional pick) | — | EXCLUSIVE acquire: link to a co-located peer of kind that NO ONE else holds via `edge` — discrete single-owner ownership (a key, a job slot, a mate, a throne). **1:1 BOTH ways: a holder of an `edge` cannot claim another until they `unlink`.** Without a pick, first-free-in-id-order wins; with `@max:`/`@min:`, the best-ranked free candidate (take the shiniest / nearest). Release with `unlink`. First claimant in a tick wins. |
| `unlink` | edge | — | drop all of the actor's edges of that type |
| `move` | edge | — | relocate the actor: FIRST its own `edge` neighbor (private route home/work); ELSE through its current parent's `edge` (walk out this room's `door` into the connected room — topological movement, with anti-backtrack so corridors traverse) |
| `spawn` | kind | name | birth: new sibling of kind. **INHERITS actor's stats, age→0** (if same kind) |
| `despawn` | — | — | death: remove the actor |

**Weighted targeting:** `affect` hits all neighbors/co-peers, but the value reads
`target.X` — so "heal the neediest most" = `affect co:hp = 0.1*(1-target.hp)`,
"hit only strong rivals" = `affect rival:hp = -0.3*gt(target.skill,0.7)`. This covers
most "act on a specific one" cases.

**Strict single-best targeting (the `@max`/`@min` pick):** when weighting genuinely
isn't enough — duel THE #1 rival even at 0.71 vs 0.70, mend only the single sickest
friend — append a pick selector to the target: `"stat": "rival:hp@max:target.prowess"`.
The rank formula runs per candidate (with that candidate as `target`) and the value
applies ONLY to the argmax (`@min:` = argmin). Works with `co:` too. Exact ties break
to the earliest-linked neighbor — deterministic. Proven: `worlds/probe_pick.json`
(1 attacker, 4 co-located peers → exactly one hit lands on the top-prowess fighter,
exactly one care lands on the frailest).

**`link` gotcha:** it only links to a peer of the same **parent** (co-located). Two
entities in different scopes cannot `link`. To relate across scopes you need shared
parentage or a different design (this is a known edge — see §7).

### `events` — rising-edge state transitions
```json
{ "on": "hotel", "when": "gt(reputation,0.6)*lt(starred,0.5)",
  "label": "★ earns its first star", "do": [ { "op":"set","stat":"starred","expr":"1" } ] }
```
Fires `do` **once** when `when` goes false→true (tracked per entity). The classic
pattern is a `foo_logged`/`starred` guard stat set in the effect so it can't refire.
`label` is logged to the chronicle. Empty `do: []` = a pure narration beat.

**LOD gotcha (2026-07-20): events only evaluate for ACTIVE entities** (revealed /
detailed — `active_by_kind`), **but plain `rules` run on COARSE entities every
tick too.** So on an unzoomed scope, a rule feeding a stat visibly updates while
the event watching that stat never fires — no error, it just doesn't run until
someone reveals the entity. This is correct LOD semantics (dormant scopes don't
transition), but it surprises authors: if a state flag must track a condition at
EVERY fidelity (weather, seasons, alert levels), derive it with a RULE
(`raining = iff(gt(cloud_density,0.66),1,iff(lt(cloud_density,0.5),0,raining))`
— the self-reference gives rising/falling hysteresis), and keep EVENTS for
one-shot story beats that only matter where the camera is.

### `generators` — lazy worldgen on reveal
```json
{ "on": "kitchen", "spawn": "cook", "count": "6", "cascade": true,
  "child_stats": { "skill": "0.15 + 0.5*rand(1)", "morale": "0.6" } }
```
When an entity of `on` is revealed, spawn `count` (a formula over the parent)
children of `spawn`, each initialized by `child_stats` formulas (which can read
`parent.X`, `index`, `rand()`). **`child_stats` evaluate TOP-TO-BOTTOM in the order
you wrote them, against the child itself — so a later stat can READ an earlier one
by name** (`"radius": "0.8+0.1*rand(1)"`, then `"cx": "0.5 + radius*cos(angle)"`).
Name your intermediates instead of copy-pasting sub-expressions; a not-yet-set stat
reads 0. **`cascade: true`** → reveal each child immediately
so ITS generators fire too — this is what lets worldgen descend MULTIPLE scales from
one seed (hotel → kitchen → cooks). Without cascade, reveal stops one layer down and
grandchildren never spawn.
**`chain: "door"`** → after spawning, wire consecutive siblings with a `door` edge: a
route graph agents traverse with `move` (a corridor of rooms). **`chain_ring: true`**
closes last→first into a loop. This is how TOPOLOGICAL SPACE (places joined by routes)
is authored as data. **Spawn-into-a-scope** needs no special op — a generator
`on: "room"` with `count: "eq(index,0)"` puts the agent only in room 0.

**`partition: { style, edge, x, y }`** → compute a PARTITION over the spawned children
and wire adjacency edges (kind = `edge`) between neighbors. A partition is "how a set
of things divides a space and who borders whom" — a general family selected by `style`:
- `"voronoi"` (shipping) — nearest-seed organic territory; two children are neighbors
  iff they share a Voronoi cell border (Gabriel-graph test over their `x`,`y` position
  stats). Contiguous soft neighborhoods, biomes, influence zones. Deterministic, O(N³),
  pure arithmetic. Example: `{ "style":"voronoi", "edge":"border", "x":"cx", "y":"cy" }`
  gives each district a `border` edge to every district it touches.
- also shipping: `subdivide` (treemap/masonry — perfect tile, `area`=1.0, sizes via
  `weight`), `grid` (4-neighbor lattice), `cluster` (k-means communities), and
  `relational` (a pure who-connects-to-whom LOGIC MAP with no geometry — a skill
  tree / faction web). Same prim, selected by `style`; see /lab.html side-by-side.
  The ENGINE owns the topology (who borders whom — the reusable, exportable part);
  the renderer draws whatever geometry matches.
The adjacency is REAL data: e.g. a `coarse_rule`/`rule` `heat = heat + 0.05*(edge_mean(border,heat) - heat)`
makes heat DIFFUSE across borders — a coupled system, not cosmetic.

**FRACTAL COORDINATES (how one JSON is terrain-aware at every depth):** a
partition's positions are local 0..1 to its scope, but fields live in world space.
Every scope that gets partitioned-with-clip (or subdivided) has its **world patch**
written as `wx0/wy0/wx1/wy1` stats — and a partition automatically samples its
`where`/`clip`/`coverage` masks THROUGH the parent's patch (identity if the parent
has none, e.g. the city itself). So `"clip": "field(buildable, fx, fy)"` on the
district→block generator means "this district's stretch of the coastline," and the
same line on block→building means "this block's corner of it" — continuity all the
way down, no per-level formulas.

**Mask-aware `subdivide` (a land CARVE, not a nudge):** with a `clip` mask,
subdivide splits the mask's actual valid cells among the parcels — a weighted
axis-aligned KD carve, area ∝ `weight`. Every parcel is a DISJOINT chunk of real
land: no overlaps, no parcel over water, coastline-hugging shapes — so a 6-block
district HAS 6 blocks packed onto its actual land, and the bay stays open **by
construction**, never by the renderer hiding parcels. Each parcel gets: position
= its own land cell nearest its bbox centre (always on land — labels, lane
endpoints, agents), `w`/`h` = bbox size, `area` = its land fraction, `wx0..wy1` =
its exact world patch (hosts should draw the rect from the patch, not centre±size).
Adjacency comes from the cells (two parcels link iff their land actually touches —
never across water). Proven: `cargo run --release --bin packprobe` (all blocks +
building plots across all districts: on buildable land, zero overlaps, none
omitted).

**REGIONS ARE ENGINE DATA — boundary/ownership as world logic.** A carved parcel's
true shape is KEPT, not discarded after layout:
- `region_cells(id)` → `(cell_size, &[(x,y)])` — the parcel's owned cells in the
  parent's local 0..1. Renderers draw THIS (a concave coastal parcel's bounding
  box lies about its shape); WASM: `region_json(id)` → `[cell, x0,y0, x1,y1, …]`.
- `region_at(parent, x, y)` → which child parcel owns that local point (`None` =
  unowned ground). WASM: `region_at(parent,x,y)` → id or −1. This is TOPOLOGICAL
  collision: "the agent crossed into parcel 4" is an engine fact a host or rule
  can react to. Physics-grade collision (hitboxes, sliding) stays the renderer's
  job — the engine owns *ownership*, the renderer owns *geometry*.

**REMEMBER WHAT THESE PRIMS ARE NOT.** Nothing above is a "city." `fields` are not
terrain, `subdivide` parcels are not blocks, `region_at` is not a street map —
those are ONE world's meanings. The same stack is a quantum chessboard (fields =
probability amplitudes, parcels = board zones, region_at = which zone a piece
occupies), a dungeon (mask = carved rock), a galaxy (mask = habitable band,
parcels = sectors), a body (fields = tissue types, parcels = organs). The engine
ships the MECHANISM — masks, carves, ownership, adjacency, patches; every meaning
in this doc's examples came from one JSON file a dev wrote. If you catch yourself
adding a prim that knows what water or a road IS, stop — that's the dev's formula.

**Sub-partition gotchas (read before authoring a new level):**
- `coverage` is measured by the voronoi-style grid pass, which is SKIPPED for
  `subdivide` (its carve is exact; nearest-seed would clobber it). To give a
  subdivided parcel terrain-derived stats, use a RULE instead — a parcel knows its
  own world patch, so `"expr": "field(shore, (wx0+wx1)/2, (wy0+wy1)/2)"` samples
  the world at its own centre on tick 1, no engine change needed.
- `child_stats` run at SPAWN, before the partition wires positions/patches — a
  child-stat formula cannot read `bx`/`wx0`. Anything position-derived goes in a
  rule (they run every tick, after structure exists).
- Hosts draw a carved parcel from `region_json` (preferred) or its `wx0..wy1`
  patch — never from `position ± w/2` (the position stat is its land anchor, not
  its rect centre). Geometry helpers
`sin/cos/sqrt/floor/mod/pi()` in the DSL let positions be computed as data (a district
placed on a ring: `cx = 0.5 + r*cos(index*2*pi()/n)*0.5`).

### `templates` — the composition layer (captured know-how, zero new machinery)
```json
"templates": { "carved_lots": { "partition": { "style": "subdivide", "clip": "field(buildable, fx, fy)" } } },
"generators": [ { "on": "district", "spawn": "block", "count": "4 + density*4",
                  "template": "carved_lots",
                  "partition": { "edge": "adjacent", "x": "bx", "y": "by", "weight": "parcel" } } ]
```
A template is a generator FRAGMENT deep-merged UNDER any generator that names it:
the generator's own keys always win, nested objects merge recursively. Expansion
happens in the LOADER before the engine ever looks — the engine only sees prims;
`templates` is sugar that captures a proven composition so the next author doesn't
rediscover it (the block and building levels of `city.json` share `carved_lots`).
Meaning-agnostic by construction: `urban_block` and `alien_hive` are identical to
this machinery. **Extract templates from known-good wiring; never design them
ahead of a working composition.** Render recipes are the HOST's side of the pair —
a host may key drawing styles off which template a spec's generators use (the spec
JSON is data the host can read); the engine carries no render knowledge.

**Scale-aware rendering (the paired HOST principle, from the same spec):** a
level renders as the right ABSTRACTION for its zoom band, from the SAME field
data — the coastline is a raster heightmap from the "plane" (city/district) and a
smooth marching-squares contour EDGE from the "street" (block view), never a
pixel staircase; rugged ground is a texture, not a black hole. See
`studio/src/city/BlockMap.tsx` (`Coastline`) for the reference implementation.

### `rollups` — children → parent (bottom-up)
```json
{ "parent": "kitchen", "child_stat": "took", "parent_stat": "draw",
  "reduce": "sum", "drain": true }
```
`reduce` ∈ `mean | sum | max | min | frac_above`. **`drain: true`** → after
aggregating, zero `child_stat` on every child. Use for per-tick FLOW variables
(resource drawn this tick, damage dealt this tick) — an action accumulates into the
child stat, the rollup harvests the sum, drain clears it for next tick. Without
drain you cannot reset a flow stat in data (a reset rule runs before the rollup and
wipes it — see §2). Rollups SKIP non-Detailed parents (a folded aggregate is
authoritative; its dormant kids can't clobber it).

### `broadcasts` — parent → children (top-down)
```json
{ "on": "district", "parent_stat": "raining", "child_stat": "raining", "gain": 1.0 }
```
Sets each child's `child_stat = gain * parent.parent_stat`, every tick, reaching even
folded scopes. **`on` (alias `parent_kind`, added 2026-07-20): only broadcast from
parents of that kind.** Omitted = EVERY parent level, which is a footgun:
**Broadcast gotcha (the big one):** an unfiltered same-name broadcast (`raining→
raining`) also runs from the ROOT down — the root has no `raining`, reads 0, and
silently ZEROES the stat on every child each tick, stomping whatever a rule just
set moments earlier in the same tick. The rule visibly "runs but does nothing" and
nothing errors. If parent and child stat share a name, ALWAYS set `on`. (Pre-`on`
workaround, still valid: broadcast into a different child stat name — emberhold's
cooks read `house_rep`, not the hotel's own `reputation`.)

### `convo_moves` — sugar
`{ "name": "...", "effects": [...] }` compiles to a score-0 action on kind `convo`
(player-driven menu moves for a conversation micro-game).

---

## 4.5 Fields, masked partitions & region algebra — LAYERED WORLDS

The substrate for worlds built in layers that read each other (terrain → rivers →
territory → roads), where each layer is authored as DATA and the engine never knows
what any of it MEANS. Four composable prims:

### `fields` — continuous scalar layers over the unit square
```json
"fields": {
  "elevation": "clamp(noise(fx,fy)*0.6 + 0.35 - <bay term>, 0, 1)",
  "water":     "lt(field(elevation,fx,fy), 0.4)",
  "land":      "not(field(water,fx,fy))",
  "buildable": "sub(field(land,fx,fy), field(steep,fx,fy))",
  "coast":     "and(field(land,fx,fy), near(water, 0.06))"
}
```
A field is a formula over `fx`,`fy` (the sample point) — a value at any point in
space. Elevation, moisture, danger, faction-influence: all fields. Sample any field
at any point in a formula with **`field(name, x, y)`**; get organic terrain with
**`noise(x, y)`** (deterministic value-noise). A field can be DEFINED in terms of
other fields (see `water`/`land`/`buildable` above) — that's the algebra below.
Sample from host code via `world.sample_field(name, x, y)`.

### Region algebra — everything spatial is a REGION (≥0.5 = "inside")
Compose fields/masks with set logic, in ANY formula (field or entity):
- `and(a,b)` = ∩ intersect (min) · `or(a,b)` = ∪ union (max) · `not(a)` = ¬ invert
- `sub(a,b)` = A − B (A and not B) · `xor(a,b)` = symmetric difference
- `near(field, radius)` = 1 if `field` is inside anywhere within `radius` (a spatial
  BUFFER — coastlines, blast radii, catchments)

So `buildable = sub(land, steep)`, `contested = and(factionA, factionB)`,
`coast = and(land, near(water,r))`. Proven correct: `land+water = 100%` of the map,
`buildable ⊆ land`, `coast` is a thin shore strip. This is the keystone — a dev
builds ANY layer from the others with set logic, and it works for water, acid seas,
magnetic fields, influence — because the engine only knows the algebra, not the meaning.

### `where`-gated partition — zones SHAPED BY the fields (author's rule)
```json
"partition": { "style":"voronoi", "edge":"border", "x":"cx", "y":"cy",
               "where": "field(buildable, fx, fy)" }
```
The partition relocates any seed whose position fails the `where` formula (≤0.5) to
the nearest valid spot. So districts avoid water — but the ENGINE doesn't know that;
the DEV wrote `field(buildable,fx,fy)`. Flip it to `lt(field(elevation,fx,fy),0.4)`
and districts form ONLY on the seas (an alien world). Proven: earth rule → 10/10 on
land; alien rule → 10/10 on the acid sea; same prim, opposite worlds.

### `routes` — CIRCULATION (roads/paths that route around terrain, bridge crossings)
```json
"routes": [
  { "on":"city", "node":"district", "hub":"eq(ring,0)", "route":"road",
    "x":"cx", "y":"cy", "style":"organic", "redundancy":3,
    "cost":"1 + 8*field(water,fx,fy) + 3*field(steep,fx,fy)",
    "bridge":"field(water,fx,fy)", "bridge_kind":"bridge" }
]
```
When a `on`-scope reveals, build a road network over its `node` children: least-cost
paths from the `hub` (child with max `hub` value), wiring `route` edges. Routing has
DEV-DEFINED SUB-LAWS (the general insight — routing is one prim with parameters):
- **surface / "allowed on"** = the `cost` formula sampled ALONG each hop: cheap on
  allowed terrain, dear on forbidden (water/steep) → roads bend AROUND obstacles.
- **connection style / "efficient vs lax"** = `style`: `efficient` (shortest-path
  tree, minimal roads), `grid`/`redundant` (mesh — every node to k-nearest), `organic`
  (tree + a few loops). `redundancy` = k candidate neighbours.
- **the TRANSITION law** (general — a bridge is just one use): `transition` formula +
  `max_span` + `trans_kind`. Where a hop crosses a region the `transition` formula
  marks (water/lava/void), the hop is SPLIT: `road (node → entry shore)` + a
  `trans_kind` entity spanning ONLY the crossing (entry shore → exit shore) +
  `road (exit shore → node)`. A bridge covers only the water; the approaches are road
  (no bridge over dry land). Shore nodes gate on/off at each water edge. If the
  crossing is WIDER than `max_span`, the hop is REJECTED (unroutable — no fake
  mega-bridge; the network reaches the node another way or it's legitimately islanded).
  Engine-agnostic: bridge/ferry/studio/heat-tunnel — the dev's formula + entity.
Routing builds its OWN k-nearest candidate graph (NOT limited to border-adjacency,
which masking can starve). Verified: 7/7 districts connected, bridges span ONLY water
(mid on water=1.0), shore nodes at the water's edge, wide-water hops rejected.
Deterministic (Dijkstra, id tie-break). ⚠️ Routing spawns `shore`/`trans_kind`
entities as children of the scope. The engine FLAGS them (`Entity.infra`, exposed as
`is_infra(id)` and the `infra` field in the WASM snapshot) — hosts must exclude them
from "navigable sub-scope" lists/counts by filtering on that flag, never by kind
name (else they read as extra districts, and kind names are dev-chosen anyway).
**GATES — the down-flow of circulation (the fractal-connection prim).** Terrain
flows down automatically (fields through patches); before gates, circulation did
NOT — each scope routed blind to where its parent's roads crossed it, so the
levels could only overlay, never join. Now: whenever a routing pass lays a road,
the engine finds every child scope's world patch the segment CROSSES
(Liang–Barsky) and drops a **`gate` child** at each boundary crossing point —
infra-flagged, position stored scope-local as `gx`,`gy` (engine convention: the
parent couldn't know the child's stat names). A route with **`"gates": true`**
includes the scope's gates as network nodes, so its local net CONNECTS to the
artery exactly where it really enters. Recursive for free: the city's roads gate
the districts, each district's lanes gate its blocks, and so on down. Proven:
`packprobe` asserts every gate is wired into its scope's net (28/28 in Veranholm).
This is what makes "detailed streets eventually connect to the highway" TRUE by
construction — one circulation system, resolved finer per zoom.

**PATHFINDING — the general decision prim (NOT a roads feature).**
`world.pathfind(start, goal, cost_expr, mover, patch, n)` = least-cost path
through a COST FIELD: A* over an n×n sampling of any DSL formula (patch-remapped,
diagonal corner-cutting priced in, deterministic tie-breaks), returning local
waypoints. The engine decides the path; the dev's formula decides what "best"
means. Two hooks make it general:
- the cost formula samples fields (`1 + 40*field(ridge,fx,fy)` → the road curves
  AROUND the ridge because around is cheaper — the terrain decides);
- **`mover`**: bare idents in the formula resolve to the mover's own stats
  (`Expr::sample_for`), so `1 + 30*field(danger,fx,fy)*(1-courage)` routes a
  timid soul around the danger and a brave one straight through — same start,
  same goal, same formula, different souls, different paths.
`route_network` uses it for every clean land hop (roads genuinely curve; the
geometry is stored as engine data — `route_path(a,b)`, WASM `route_path_json` —
so renderers draw the decision and agents can walk it; gates read the true
curve). **Worked examples: `cargo run --release --bin pathprobe`** — the
valley-vs-ridge road and the two-souls-one-road personality split, both asserted.

**ROAD CHARACTER — the cost-field cookbook (compose laws, don't add road types).**
A cost formula is not just a penalty map — it's ANY DSL formula, so attraction,
taste, danger, and dynamics all compose into how a path decides. And route costs
evaluate with the ROUTING SCOPE as the mover, so bare idents read the scope's own
stats — a district's personality shapes its own streets. Recipes:
- **Scenic coastal road** — DISCOUNT the view instead of penalising terrain:
  `1 + 6*field(steep,fx,fy) - 0.55*near(water,0.04)*scenic_love`
  (`scenic_love` = the district's stat). A waterfront district's lanes HUG the
  coast; an inland district's cut straight. Same formula, different souls of PLACE.
- **Direct/engineered road** — crank the base so distance dominates:
  `3 + 2*field(steep,fx,fy)` (terrain barely matters → near-straight arterials).
- **Old winding road** — add noise the pather negotiates:
  `1 + 2*noise(fx*3,fy*3)` (organic wander, deterministic per seed).
- **Ridge road / valley road** — attract to a contour band:
  `1 + 5*abs(field(elevation,fx,fy) - 0.62)` (the path FOLLOWS the 0.62 contour).
- **Living streets (dynamics IN the cost)** — cost can read anything rules drift:
  `1 + 2*field(steep,fx,fy) - 0.3*heat` at re-route time makes nightlife districts
  grow shortcut paths toward the noise. (Static networks lay once at reveal;
  agents re-pathing per-tick feel this live.)
- **Agent taste is the same trick with mover = the agent:** the jaywalker's
  `road_adherence`, the tourist's `scenic_love`, the smuggler's
  `-0.4*field(danger,fx,fy)*audacity` (ATTRACTED to danger). One prim, every road
  and every walker — that's the point. Never add a "road type"; author a law.

**The same laws generalise to DYNAMIC per-agent movement** (an NPC IS a router run
per-tick: dest-focused vs wanderer, fast/slow, a jaywalker = low bridge-adherence
taking the forbidden shortcut vs a crosswalk-waiter). The static network is now
pathfound; per-agent routing = the same `pathfind` with `mover` set, at agent
timescale — and gates give agents their cross-scale waypoints: leaving a district
= walking to a gate.

**CONNECTIVITY GUARANTEE — no floaty island zones (the real world isn't contiguous).**
`route_network` lays a shortest-path tree/mesh from the hub over the k-nearest
candidate graph, but it links only what the `max_span` cap lets it reach and used
to SILENTLY DROP the rest — a hamlet across a land gap the tree never threaded, an
island beyond a water span wider than `max_span`. Those dropped nodes are the
"floaty zones": settled places with no road to them. A final pass now closes this:
**every settled node reaches the network.** For each node not in the hub's
connected component, it forces the single cheapest connector to the nearest
already-connected node — Prim-style, growing one link at a time, so a *chain* of
islands is threaded, not just the ones adjacent to shore. The rescue connector
lays exactly like any other route: pathfound around terrain, or split
road→bridge→road if the cheapest way across is water — the ONLY thing lifted for a
rescue is the span cap (reaching a truly-stranded pocket may make a wide crossing
the normal pass refused). So the connector's CHARACTER — short street · long
country road · bridge · ferry — falls out of the cost field + `transition`, never a
rule. This is not new machinery: it reuses the same `hop_cost`, `crossing`, and
road/bridge laying, and it's a no-op on any world that was already fully connected
(so determinism is bit-for-bit unchanged — the whole guard sweep is identical).
Meaning-agnostic; deterministic (nearest by cost, tie-break by id). **Worked
example: `cargo run --release --bin islandprobe`** — a hamlet across a land gap
gets a country road, and an island BEYOND `max_span` (which the normal pass drops)
gets pulled in by a rescue that bridges the sea. Asserted: the island is genuinely
un-crossable by the normal cap, yet ends up reachable from the hub via a `bridge`.
The lesson that produced this: contiguity is the wrong "fix" for fragmented
settlement — real neighborhoods sit across country roads and channels. Don't force
blocks to be one blob; guarantee they're all *reachable*, and let the terrain
decide the connector.

### `river_trace` — geography that obeys the land
`world.river_trace("elevation", steps)` walks DOWNHILL on a field from its highest
seeded point to the low edge/sea, returning a path. Rivers flow because the terrain
says so (verified: source elev 0.81 → mouth 0.33). Exposed to the browser via
`world.river(field, steps)`.

**KNOWN GAP (next):** `where` gates SEED PLACEMENT (centers are on valid land), but a
Voronoi cell's TERRITORY still tessellates the whole plane — so a coastal district's
polygon can spill over water. The fix is clipping the cell to the mask:
`district_land = voronoi_cell ∩ buildable` (the region algebra already expresses it;
the tessellation needs to intersect the mask). Until then, the renderer can clip the
drawn polygon to `buildable` for visual correctness.

---

## 5. Where a spawned entity's stats come from — the three paths

This trips everyone. A new entity gets stats from exactly one of:
1. **`seed.stats`** — for root entities in the spec.
2. **generator `child_stats`** — for children materialized on reveal (+ auto `index`).
3. **`spawn` EFFECT inheritance** — a birth via an action/event copies the ACTOR's
   full stats, then resets `age` to 0 (only if child kind == actor kind).

A `spawn` effect creating a DIFFERENT kind gets **empty stats** (all 0) — you must
have a generator or rules populate it, or it'll fail its needs checks immediately.

---

## 6. Sim-LOD — how fidelity actually works (audited, real)

Three bands, verified by `cargo run --release --bin lodaudit` (all 5 claims pass):

- **Detailed** (foreground) — `is_active` true (whole ancestor chain Detailed).
  Runs actions + rules + events every tick. Full simulation.
- **Hazed** (midground) — structure exists (children spawned, canon written) but the
  node isn't Detailed, so its subtree is **dormant** (frozen bit-exact). Shape
  visible, individuals not live. Set via `reveal_structure` / `set_node_fidelity`.
- **Coarse** (distant) — the node itself drifts via `coarse_rules` as ONE aggregate
  (if on the frontier), its subtree dormant. `fold` sets this.

`reveal(id)` → Detailed + writes canon (once). `fold(id)` → Coarse. `unfold(id)` →
Detailed. `crystallize(parent, pstat, cstat, spread)` → redistribute a drifted
aggregate back onto individuals when you zoom in. **Measured: mostly-folded is ~9×
cheaper than all-Detailed** — LOD is a real cost lever, not cosmetic. Band assignment
is IMPERATIVE (host/camera calls fold/unfold based on where the player looks); the
engine does not auto-assign by distance (correct layering — the renderer decides).

---

## 7. The break-hunt results (what was tested, resolved, and what remains)

A deliberate break-hunt (2026-07-20) took the shapes previously listed as "candidate
gaps" and tested each with a PURE-DATA probe world. Results — most were either
already possible or earned a small prim:

**RESOLVED — already possible (tuning pattern, no prim):**
- **Scheduled / timed events.** Absolute ("day 40") = a counter stat + range gate
  `gt(t,39.5)*lt(t,40.5)`. Periodic ("every 7 ticks") = a rising-edge event whose
  own effect resets its counter — it re-arms each cycle. Proven: `probe_time.json`.
- **Weighted targeting** ("help the neediest most", "hit only the strong"). `affect`
  reads `target.X`, so weight the value by the target's stat. Covers most
  "act on a specific one" needs. Proven: `probe_target.json`.

**RESOLVED — earned a prim (all additive, determinism intact):**
- **Discrete inventory / single-owner resources** → `claim` op (exclusive acquire).
  A key/mate/job-slot held by exactly one owner, handed off via `unlink`+`claim`.
  Proven: `probe_item.json` (0 double-holds; key passes guard→guard→guard).
- **Topological space** (the weakest subset, now fixed) → three coordinated prims:
  generator `chain`/`chain_ring` (author a place-graph), `here_*` aggregators +
  `affect co:stat` (sense/act on who's co-located), and `move` through-parent-door
  with anti-backtrack (walk a corridor). Proven: `probe_space.json` + `spacetrace`
  (courier walks the full ring, delivers only to co-located residents).

**SPATIAL LOD comes free from the tree.** Buildings vs rooms vs furnishings are just
DEPTH: a room's props are its children, materialized by a generator on `reveal` when
you enter and `fold`ed when you leave — the SAME LOD prim as district→citizen (§6),
repointed at furniture. Don't build a bespoke spatial subsystem; use tree depth +
reveal/fold for the tiers, and the `here_*`/`co:` prims work at every tier.

**STILL genuinely open (candidate prims — verify with a probe before trusting):**
- **Coordinate-space / pathfinding** — x/y positions, distance-radius interaction,
  obstacles, line-of-sight. Deliberately NOT built: this is the renderer's job (the
  engine is the brain, not the body). The engine owns TOPOLOGICAL space (places +
  routes + co-location); continuous geometry belongs to your game engine.
- ~~**Strict single-best target**~~ **RESOLVED (2026-07-20)** → the `@max:`/`@min:`
  pick selector on `affect`/`affect_set` (see Effect ops). Proven: `probe_pick.json`.

**SYMBOLIC-STATE PROBE (2026-07-20, `worlds/guild.json` — a crafting economy,
deliberately NOT city-shaped: typed reagents, a recipe consuming one of each,
scarce regrowing stock, one exclusive masters-seat).** Verdict: the vocabulary
HOLDS — multi-type discrete inventory (typed `claim` edges `sack_h:herb` /
`sack_c:crystal`), recipe gating (`ge(edge_count(sack_h),1)*ge(edge_count(sack_c),1)`),
perfect conservation (16 brews = 16 herbs + 16 crystals consumed, zero
double-holds), exclusive win (exactly one master; the runner-up's seat action
gated shut by a parent rollup), and the master mentoring the weakest via `@min`
pick. Three COMPOSITION PATTERNS it surfaced (expressible, so no prim — but know
them):
1. **Consuming another entity** (no "despawn other" effect, by design):
   `affect_set item_edge:used = 1` + an event ON the item kind
   `when gt(used,0.5) → despawn`. The item destroys itself; the chronicle narrates it.
2. **Sensing availability** (`here_*` has no kind filter): items ADVERTISE —
   a rule on the item kind keeps `free_x = 1 - held`, the claimant marks `held`
   right after `claim` (`affect_set edge:held = 1`), sensors read
   `here_sum(free_x)`. Cut wasted claim-attempts 5.6× in the guild.
   (`here_count(kind)` would collapse this to one call — flagged as an ergonomic
   candidate, NOT built: the pattern composes, and we don't add speculative prims.)
3. **Spawned items of a different kind get EMPTY stats** (inheritance is
   same-kind only). Give kind-uniform state via RULES on the kind (`on herb, set
   free_h = 1 - held`), never via child_stats an event-spawn won't run.

**TURN-BASED PROBE (2026-07-20, `worlds/duel.json` — a two-player card duel:
draw typed cards, on your turn play your BEST one, damage = its rank minus half
the foe's guard, that SPECIFIC card is discarded, first to fall loses).**
Verdict: turn-based play COMPOSES, zero new prims — and it surfaced the deepest
timing fact in the engine:
- **The tick is the quantum of observation.** Actions apply sequentially within a
  tick, so a turn-stat passed via `affect at:turn` enforces STRICT alternation —
  but both players can answer within ONE tick, and the stat lands back where it
  started before the event phase runs. Sub-tick state is real and causally
  binding, yet INVISIBLE to events/observers. Not a bug — a property to design
  with.
- **Two turn regimes, both pure data — pick per world:** (a) *turn-stat passing*
  (`eq(edge_max(at,turn), side)`, the play flips it) — fast-forward-friendly,
  turns compress inside ticks; (b) *tick parity* (a table `beat` counter,
  `eq(mod(edge_max(at,beat),2), side)`) — one action per tick, every turn-pass
  observable and narratable (proven: 10 plays → 9 logged passes).
- **"Play THE card" composes from three prims:** read it (`edge_max(hand,rank)`
  in the damage formula), mark it (`affect_set hand:played@max:target.rank`),
  discard it (the card's own `when gt(played,0.5) → despawn` event — which also
  narrates the discard). Conservation held: every play = exactly one card spent.
- **Latch guards with rules, not effect-order:** "am I in a duel" =
  `fought = max(fought, edge_count(foe))` — survives the foe's despawn
  (tombstoned edges drop the count; the latch remembers). Setting the flag as an
  action effect fired it before the link had landed.
- Untested still: hidden information (the engine has no visibility model — hands
  are open; info-hiding is a HOST concern by design).

**CONTESTED-SIMULTANEITY PROBE (2026-07-20, `worlds/market.json` — six traders,
one relic per auction, everyone reaching at once). Found a real pathology AND
earned a prim:**
- **`claim` is 1:1 both ways** (a holder can't claim another until releasing) —
  correct for mates/thrones, now documented; the release-and-recontend loop is
  `affect_set` a banked flag + `unlink` + the item self-despawns.
- **Naive repeated contention = deterministic id-order priority.** With everyone
  reaching every tick, the lowest-id trader won 50/50 relics. Chance-staggered
  reaching spreads it but CANNOT fix the floor (a high-id trader wins only when
  every lower id blinks — after 50 relics someone still had nothing).
- **The prim this earned: `@max:`/`@min:` pick on `link` and `claim`** (the same
  selector `affect` already had). The fair-auction inversion: the CONTESTED THING
  chooses — the relic's own action `link prize:trader@max:target.bid` awards it
  to the argmax of a fresh per-tick bid (`bid = rand(7)` → uniform;
  `keen*rand(7)` → merit-weighted). Verified: id-order sweep → every trader
  winning. Priority, auctions, matchmaking, draft picks — all one formula now.
- **Third sighting of the kind-filter asymmetry:** `child_*` aggregators (like
  `here_*`) have no kind filter — the market's fairness events wanted
  `child_min over TRADERS` and needed sentinel stats on non-traders. The
  candidate prim `child_/here_count(kind, …)` has now been hit by three worlds;
  it clears the "a second world needs it" bar and SHOULD be built next time
  anyone touches expr.rs.
- **Cross-branch interaction** — relating entities in different subtrees (not
  co-located, not edge-linked) still needs design.
- **Edge rewrites in events / declarative canon constraints** — long-noted, additive.

**The discipline:** never add a speculative prim. Author a world that NEEDS the
capability, prove it can't be expressed, THEN add the smallest general prim — additive,
default-off, threaded `owos-core` → loader → (studio) — and RE-RUN the determinism
checks (§ CLAUDE.md) + `lodaudit`. They must stay bit-for-bit identical.

---

## 8. How to author + test a world (the loop that works)

1. Write `worlds/yourworld.json` (start from `emberhold.json` or `hotel.json`).
2. `cargo run --release --bin live -- worlds/yourworld.json 200 <crowd_kind>` — the
   generic driver: builds it, steps it, prints the population curve, the ORACLE
   (which actions/events actually fired), and the chronicle. NO host code.
3. Read the oracle: if one action is ~100%, your scores are lopsided (the #1 bug).
   If an event fired 0 times, its `when` never crossed — check the gate is reachable.
4. Tune the JSON, re-run. Only reach for an engine change when a whole CAPABILITY is
   missing (§7), not when a number is off.
5. If you changed `owos-core`: re-run the determinism checks AND `lodaudit`.

The `live` driver labels everything generically ("colony/food") — it's kind-agnostic.
The real signal is the **oracle tally + chronicle**, which show what your world did.
