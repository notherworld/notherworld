# Memory, canon, and the ledger — how a world remembers

This doc exists so nobody builds a memory feature on assumptions that won't hold.
It covers what the engine's memory actually is, the one design rule that keeps it
fast, the measured limits (with the probe that measured them), and the compaction
design we'd reach for when those limits bite — plus why determinism makes all of
this safer here than in other engines.

## What ships where

The ledger is **inside the engine, not beside it**. `canon.rs` is part of
`owos-core`: facts, claims, and the event log live in the `World` object and
travel wherever the world does — native, WASM, a save file. There is no separate
database or service. A world that never observes anything carries an empty
ledger for free.

Three surfaces:

| surface | what it is | written when |
|---|---|---|
| **facts** (`add_fact`, `facts(id)`) | permanent strings on an entity — its story | on observation (reveal) and by effects |
| **claims** (`record_claim`) | structured `{subject, predicate, object}` triples for consistency checks | as authored |
| **log** (`world.log`) | the notable-event stream (`Notable { tick, message }`) — what hosts narrate from | when an event with a `label` fires |

## THE RULE: feelings are stats, history is the ledger

The engine has **two memory systems with different jobs**, and mixing them up is
the mistake this doc exists to prevent:

- **Stats are feelings** — continuous, decaying, aggregatable, and they DRIVE
  BEHAVIOR. Fast by construction: rules/actions already read them every tick.
- **The ledger is history** — discrete, permanent, narrative. It's for
  storytelling, consistency, and the codex — things a HOST reads. It is
  append-only strings; it is **not queryable state** and nothing in the per-tick
  loop should depend on searching it.

**Never drive behavior from ledger queries.** If a creature should act on a
memory, the memory must exist as a stat (or an edge). The event that writes the
fact should ALSO write the stat; the fact is the story, the stat is the feeling.

### Memory with LOD = the scale tree pointed at feelings

"Reputation" doesn't need a new system — it's rollup/broadcast applied to a
memory stat. The canonical shape (the *kicked pigs* pattern):

```
the wronged one     fear_of_you = 1.0        exact, personal   (set by the effect)
                     ↓ decays per tick        the cooldown      (a rule: fear*0.99)
its herd/block      your_rep = mean(fear)     general wariness  (a rollup)
                     ↓ damped broadcast ×0.4
its neighbours      wary = parent.your_rep    casual avoidance  (a rule reading parent)
the next district   (no rollup wired)         they don't know you
```

Individual grudge, local reputation, regional ignorance — each level is one line
of data, the radius and decay are author-tunable, and gossip is just a slower
broadcast. Zero engine work. This is the intended way to build ANY
"the world remembers how you treated it" mechanic.

## Measured limits (run `cargo run --release --bin logprobe`)

The log and facts serialize into snapshots, so growth is a real cost. Measured
at 50,000 ticks per world (2026-07):

| world shape | log growth | at 1M ticks | finding |
|---|---|---|---|
| **arc** (hotel) | flat at 10 entries forever | ~0 | rising-edge events fire once; when the story ends, the log stops. Arc worlds self-limit. |
| **churn that dies** (emberhold) | flat at 282 after the colony dies | ~0 | a log only grows while there's drama. |
| **persistent ecosystem** (terra + fauna) | **linear: ~120 entries / 7 KB per 1k ticks** | ~6.8 MB | the honest long-lived case. |

Two real walls, both with measured triggers — neither is worth fixing before a
shipped world approaches them:

1. **Log serialization is linear in log length** (0.2 ms → 14 ms across the 50k
   run) and is paid on every snapshot. In a browser heartbeat world that's
   roughly "hurts after ~3 hours of continuous play." First fix is host-side:
   snapshot a log *tail*, fetch the full log on demand. Engine-side compaction
   comes after.
2. **Dead entity slots are never reclaimed** — in a churn world, per-tick cost
   grows with *total ever born*, not living population (measured 595 µs →
   2,148 µs across the same run). This, not the log, is the real "runs forever"
   wall. The fix (a live-entity index) must preserve id determinism: **entity
   ids are canon** — same seed must mean same ids forever, so slots must never
   be reused.

## Compaction — BUILT and measured (`World::compact_log`, wasm `compact_log`)

*Fold, for history.* `compact_log(before_tick, keep)` collapses entries older
than the cutoff into ONE summary per label carrying the **exact count and tick
range** (`⟪×812⟫ a calf is born (t3–t9988)`). Kept verbatim: everything after
the cutoff, each label's **first-ever occurrence** (firsts are canon), and any
entry matching a `keep` pattern — importance is the author's call, as always.

Measured in practice (`cargo run --release --bin compactprobe` — twin terra
ecosystems, same seed, 40k ticks, one compacting at a 1,500-entry threshold):

- **Bounded forever:** the compacting world sawtooths at ~1,100–1,500 entries
  (≈6× shrink per cycle) while its twin grows without limit.
- **Sim untouched:** entity trees bit-for-bit identical after 3 compactions
  (compaction only touches the log — enforced by the
  `compaction_changes_nothing_but_the_log` cargo test).
- **History stays TRUE:** per-label totals reconstructed from the compacted log
  (1,800 births, 1,719 old-age deaths, 92 predator kills) matched ground truth
  **exactly**, and every first-ever moment survived verbatim. What's lost is
  only "which individual, which Tuesday" — the human-memory shape.

Known v1 boundary: summaries from earlier cycles are kept as-is (they don't
re-merge with later ones), so summary count grows by ~labels-per-cycle — a few
hundred entries over dozens of cycles, negligible next to the fold itself.

There is **no hard ledger cap** — the ceiling is platform budget (a native/
console build has orders of magnitude more headroom than the browser, whose
real constraint is per-heartbeat serialization). With a compaction policy wired
to a threshold, both are effectively unbounded.

### Why compaction is SAFE here (the determinism trump card)

In a deterministic engine, the ledger never needs to store what can be
recomputed. The entire world-history derives from:

```
seed + external inputs (player actions, timestamped) + observation ORDER
```

Everything else is a cache. So compaction can be aggressive: throw detail away,
and if you ever need the past at full resolution, **re-simulate it**. The one
invariant to protect: canon is *observation-order-dependent* (revealing A before
B writes different canon than B before A — cross-scope scarcity accumulates in
exploration order). The observation order is therefore part of the minimal
record. Seed + inputs + observation order **is** the replay file — and it's also
what a shared/persistent-universe server actually has to hold: not the world,
just the story of how it was touched.
