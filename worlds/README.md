# worlds/ — authored worlds, and how to read this folder

Every file here is a complete world: its terrain, people, behaviors, economy, and
history are **data**, interpreted by the engine. Steal liberally — these are the
templates. Run any self-driving world with the generic driver (no host code):

```bash
cargo run --release --bin live -- worlds/<world>.json <ticks> <kind-to-watch>
```

## Showcase — pure-data worlds (start here)

These run entirely from JSON on the `live` driver. They're the honest proof the
engine works, and the best templates to copy for your own logic.

| world | what it demonstrates | try |
|---|---|---|
| `hotel.json` | a living Paris hotel — a kitchen brigade learns, promotes, earns stars, books a gala | `live -- worlds/hotel.json 220 cook` |
| `emberhold.json` | a colony on a depleting commons — boom-bust population cycles | `live -- worlds/emberhold.json 300 colonist` |
| `craft.json` | a crafting/tech tree — gather → smelt → forge → assemble, as data | `live -- worlds/craft.json 140 crafter` |
| `guild.json` | discrete symbolic state — typed reagents, recipes, one exclusive masters-seat | `live -- worlds/guild.json 200 alchemist` |
| `duel.json` | turn-based play — a two-player card duel with strict alternation | `live -- worlds/duel.json 60 duelist` |
| `market.json` | contested simultaneity — a fair auction where the prize picks its buyer | `live -- worlds/market.json 120 trader` |
| `kitchen.json` | "complex sim, barely any JSON" — the minimal-authoring example | `live -- worlds/kitchen.json 100 cook` |
| `trade.json` | two markets, price spreads, a merchant arbitraging them | `live -- worlds/trade.json 150 merchant` |
| `citylife.json` | person + daily schedule template over city blocks | `live -- worlds/citylife.json 96 resident` |
| `verang.json` | **WIP** — every subsystem at once (crews, heat, migration): a GTA-brain stress test | `live -- worlds/verang.json 200 civilian` |

## Engine proofs — worlds paired with a `cli/` bin

Each of these is loaded by a demonstration bin that drives or inspects it
(zoom, A/B counterfactuals, audits). Run the bin, not `live`:

`saga` (a settlement over 40 years — the flagship) · `metropolis`/`metro` (six
nested games in one city) · `city` (Veranholm, the studio's living city) ·
`afterhours` · `lifetime` (LOD over time — a whole life, unfold any year) ·
`regime` · `cosmos` (per-universe physics) · `planet` (multiverse addressing) ·
`ferry` · `tavern` · `pond` · `school` · `block` · `saltmarsh`+`station` (`town`)
· `mood`+`life` (`sim`) · `arena` (`breaktest`, 256k agents / 1M edges).

Some double as determinism guards — see "verify determinism" in
[CLAUDE.md](../CLAUDE.md) before changing the engine.

## probes/ — engine break-tests

Deliberate attempts to break the vocabulary (timed events, discrete inventory,
weighted targeting, topological space, argmax picks). Each probe world documents
the question it answers in its `_note`. Kept because they show the engine's
edges honestly — and they're small, readable examples of single primitives.
