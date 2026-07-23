# PACKS — games as composable parts (read this before authoring one)

*Orientation for anyone — human or LLM — building on the pack system. Written after
the first two proofs landed; everything below is demonstrated in this directory, not
aspirational.*

## The claim

**Every part of a game except how rendering presents it can be componentized, shared,
and recombined — on the engine's six base primitives** (entities+stats, rules, actions,
rollups/broadcasts, generators, events). Not just the obvious "systems" (weather,
crafting): *pursuit* is a pack, *temptation* is a pack, *fear* is a pack, *a day that
runs out* is a pack. A game is a manifest that names packs, aliases their vocabulary,
and adds glue.

## The proofs (rerun them, don't trust them)

```
node worlds/packs/compose.mjs worlds/packs/hunt.manifest.json  worlds/hunt2.json
node worlds/packs/compose.mjs worlds/packs/shore.manifest.json worlds/shore.json
cargo run --release --bin live -- worlds/hunt2.json 185 deer
cargo run --release --bin live -- worlds/shore.json 185 fish
```

1. **Regression:** `hunt2.json` (six packs) reproduces the hand-authored hunting game
   **tick-identically** — first blood t23, win t169, same kill ticks. A game IS the sum
   of its packs, bit-exact.
2. **Recombination:** `shore.json` (a fishing game) reuses FIVE hunt packs + one new
   (`pack_lure`). The cast's splash feeds the *same* alarm commons a gunshot does; the
   individuals pack's `affinity` becomes "this fish likes the lure more." Winnable and
   losable across seeds.

## How it works

- **Packs** are world-JSON fragments authored in *generic* vocabulary: `arena` (the
  place), `beast` (the crowd), `actor` (the agent). Arrays only — no seed, no rng.
- **Manifests** instantiate a game: `aliases` rename the kinds (`arena→glade`,
  `beast→fish`), `packs` lists what to merge (order = author order = evaluation
  order), `seed` owns the root scope and starting stats, `extra` holds game-specific
  glue in final vocabulary.
- **compose.mjs** (~80 lines) merges and aliases. The output is a **plain world
  file** — the engine never learns packs exist. Composition is an authoring-layer
  concept, exactly like the template patterns in `docs/TEMPLATE_CATALOG.md`.
- **Contracts** (`_contract.provides` / `requires`) declare the stat and edge names a
  pack emits and expects. The interface between packs — and between packs and shell
  temps — is **just names**. Match names, parts plug.

## The shell side (studio/src/shelltemps/)

Render-layer companions with the same contract discipline: `simLoop` (the game
clock), `smoothPool` (damped portrayal), `reticle` (readiness ring), `statFlash`
(a light that pops when a counting stat ticks up — muzzle from `shots`, splash from
`casts`), `markTarget` (click-to-quarry — requires `pack_stalker`'s retarget), `hud`
(meters/chronicle/banner). The fishing page is composed from these; the reticle
became the bobber's strike ring by changing *inputs*, not code.

## The sorting test (use this every time)

When componentizing a concept, ask: **does it change what is TRUE in the world, or
only how the world is presented/driven?**

- Changes truth → **soul pack** (JSON): hunger, weather, economy, pursuit, extinction,
  a clock, difficulty pressure, victory conditions.
- Presentation/drive only → **shell temp** (host code): cameras, input mapping,
  smoothing, HUD, *pause* (pausing is "the host stops calling step()" — the world
  itself has no pause; time is only ever what the host pumps), save/load (snapshot
  is the engine's job, the button is the shell's).
- Some concepts split: a *day/night cycle* is soul (a stat); *the screen getting
  darker* is shell (reads the stat).

## Authoring rules (learned, not theoretical)

1. **Structural edits only** on world/pack JSON (parse → mutate → dump). A string
   replace on reformatted JSON once no-opped silently and cost an hour.
2. **Tune with the oracle** (`live`), one change at a time. The #1 bug is one action
   outbidding all others — the oracle's percentages point straight at it.
3. **A pack must earn its genericity**: if a behavior only makes sense in one game,
   it's manifest `extra`, not a pack. Promote to a pack on second use, like code.
4. **Every composed world goes in `worlds_build.rs`** like any shipped world.
5. **Shell temps must declare their soul contract** in a header comment — which
   packs/stat-names they need. A temp that silently assumes a soul is a trap.
6. Keep the alias vocabulary small: `arena`/`beast`/`actor` covers a lot. Invent a
   fourth generic kind only when a pack truly needs one (e.g. `rival` for a second
   agent crowd) — and document it here.
