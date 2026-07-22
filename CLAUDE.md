# notherworld — project guide (for humans and their AI assistants)

This file orients anyone working in this repo — including LLM coding assistants.
If you dropped this repo into Claude/Cursor/etc., this is the context that matters.

## What this is

A **deterministic living-world simulation engine** ("the brain, not the renderer").
Worlds — entities, rules, utility-AI behaviors, events, lazy generation, economies,
cross-scale coupling — are authored as **JSON data** and run through a small fixed
interpreter. Rust core → native + WASM + C ABI: the same world runs identically under
a web page, Unreal, Godot, or Unity. See [README.md](README.md) for the pitch,
[docs/ENGINE.md](docs/ENGINE.md) for the full vocabulary, and
[docs/AUTHORING.md](docs/AUTHORING.md) to build your first world.

## Layout

```
engine/owos-core     the simulation core: world.rs (spine + step()), expr.rs (formula DSL),
                     action.rs (effects), scale.rs (rollup/broadcast), canon.rs (ledger).
                     Deterministic (seeded RNG, BTreeMap, no wall-clock; trig via libm — bit-identical on every platform). Only dep: libm.
engine/owos-author   JSON world loader: WorldSpec + build(json) -> World
engine/owos-wasm     browser bridge (snapshot_json, sample_field, region_json, ...)
engine/owos-ffi      C ABI (owos_ffi.dll + include/owos.h) — see docs/EMBED.md
cli/                 ~30 proof bins. KEY: `live` = generic driver that runs ANY world
                     JSON with zero host logic — the honest way to test a pure-data world.
studio/              Vite + React web studio + demos (nother, terra, city, lab, drop, temple)
worlds/              authored worlds — study these as working examples of every primitive
docs/                ENGINE.md · AUTHORING.md · EMBED.md · TEMPLATE_CATALOG.md · PLANET_TEMPLATES.md
```

## Build & run

```bash
cargo check --workspace                                  # everything type-checks

cargo run --release --bin live -- worlds/hotel.json 220 cook    # run any world, no host code
cargo run --release --bin saga                                  # flagship CLI proof

# WASM for the studio (rebuild after ANY engine change):
wasm-pack build engine/owos-wasm --target web --out-dir ../../studio/src/owos --dev

npm --prefix studio install && npm --prefix studio run dev      # studio at :5173
```

Studio pages: `/` (author + preview), `/nother.html` (addressable multiverse),
`/terra.html` (land on a living world), `/city.html`, `/lab.html`, `/drop.html`.

## If you change the engine: verify determinism

The engine is deterministic by contract. These guards must produce **identical**
output after any `engine/owos-core` change — if they drift, you changed behavior:

- `cargo run --release --bin metro` → Otto **+0.60** / Pax **−0.33**
- `cargo run --release --bin saga` → tension with-truce **0.27** vs counterfactual **0.50**
- `cargo run --release --bin regime` → overthrow year **4.3**
- `cargo run --release --bin lodaudit` → **11 PASS** lines (proves sim-LOD is real, not labels)
- `cargo run --release --bin packprobe` → PASS (carve/partition integrity)
- `cargo test --workspace --release` → 20 pass. CI (.github/workflows/ci.yml) runs this
  on Linux per push — cross-checking Windows-baselined ticks on a second platform.

## Adding tests (where each kind lives)

- **DSL/engine unit tests** → `engine/owos-core/tests/expr.rs` — add a case whenever a
  formula behaves surprisingly (the test documents what the DSL promises). Includes
  bit-exact trig assertions that catch a platform math library leaking back in.
- **Determinism guards** → `engine/owos-author/tests/guards.rs` — canonical numbers
  (hotel star t73/gala t213, craft t94, same-seed identity incl. the geometry stack,
  emberhold cycle, loader-error quality). If you deliberately change engine behavior,
  re-baseline HERE in the same commit, with the why.
- **World rot-proofing** → `engine/owos-author/tests/worlds_build.rs` — every shipped
  pure-data world builds + runs. **Add every new world to this list when you ship it.**
- **FFI contract** → `engine/owos-ffi/src/lib.rs` tests — panic safety + embed numbers.
- **In-browser proofs** → `studio/src/proofs/Proofs.tsx` — the public, explained mirror
  of the guards; add a card when a new proof is worth showing strangers.

## Working principles (learned the hard way — they'll save you time)

1. **Author meaning, never engine code.** If a feature seems to need a change in
   `world.rs`, first ask "which existing primitive composes into this?" Almost
   everything — crafting trees, markets, weather, zoning, quests — is a data file.
   A new primitive is justified only when a pure-data world *verifiably cannot*
   express something (test with `live`, not with a bespoke host bin).
2. **Test pure-data worlds with `cli`'s `live` driver.** Host-driven demo bins can
   hide engine gaps; a world that self-drives from JSON cannot.
3. **Worldgen vs sim timing:** decisions that must be stable once observed
   (land use, capacity) belong in `settle_rules` (run once at reveal, frozen to
   canon), not `rules` (per-tick). Per-tick feedback loops that suppress their own
   cause will oscillate unless damped.
4. **`child_stats` evaluate in author order** — later stats can read earlier ones
   by name. Comment keys (`_note`) are fine anywhere EXCEPT inside `fields`
   (every key in `fields` is parsed as a formula).
5. **The renderer owns pixels; the engine owns structure/topology.** Hosts read
   stats + regions + routes and draw; don't push rendering concepts into data.

## License

AGPL-3.0. Worlds you author with the engine are your own.
