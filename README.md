# notherworld

**A living-world simulation engine.** The brain of a game, not the renderer: you author a
world's entire logic — entities, rules, behaviors, generation, economies, ecologies, history —
as **data**, and the engine runs it deterministically at every scale, whether anyone is
watching or not. Rust core → native, WASM, and a flat C ABI, so the same world runs
identically under a web page, Unreal, Godot, or Unity.

```
multiverse → universe → galaxy → star → planet → city → district → block
→ building → floor → room → one person having a bad day
```

Every rung is a permanent, deterministic **address** — the same coordinates land every
visitor at the same star, the same street, the same farmer, forever.

## What makes it different

- **Worlds are data, not code.** Rules, utility-AI behaviors, events, lazy generators,
  cross-scale rollups/broadcasts, terrain fields, road networks — all JSON through a small
  fixed interpreter. A crafting tree, an economy, a nightlife scene, or a revolution is a
  file, not a feature. See [`worlds/`](worlds) and [docs/AUTHORING.md](docs/AUTHORING.md).
- **Simulation LOD over space *and* time.** Unobserved scopes run coarse for near-zero cost;
  observing *reveals* detail and freezes it to canon (audited real — a measured ~10× lever,
  not labels). Simulate a lifetime coarsely, unfold any moment to full detail.
- **Deterministic.** Seeded RNG, ordered maps, no wall-clock. Same seed → same world,
  bit-for-bit, on every platform. Regression-guarded by CLI proof bins.
- **Embeddable, proven.** One compiled `owos_ffi.dll` driven byte-identically from Rust,
  native C, and C#/.NET (Unity's exact P/Invoke path). See [docs/EMBED.md](docs/EMBED.md).

## Layout

```
engine/     the Rust core (owos-core), JSON world loader (owos-author),
            browser bridge (owos-wasm), C ABI (owos-ffi)
cli/        ~30 proof/demo bins — `live` runs ANY world JSON with zero host code
studio/     the web studio: author worlds, watch them run live, dive the demos
worlds/     authored worlds — colonies, hotels, cities, duels, markets, crafting
embed/      native-host embed proofs (C and C#)
docs/       ENGINE.md (reference) · AUTHORING.md (first world) · EMBED.md (integration) · LEDGER.md (memory/canon)
```

## Quickstart

```bash
# run a pure-data world on the generic driver (no host logic — the honest test)
cargo run --release --bin live -- worlds/hotel.json 220 cook

# the flagship CLI proof: a 40-year settlement saga with a full-stack zoom
cargo run --release --bin saga

# the studio + demos in the browser (http://localhost:5173)
wasm-pack build engine/owos-wasm --target web --out-dir ../../studio/src/owos
npm --prefix studio install
npm --prefix studio run dev
```

Then open `/nother.html` (an addressable multiverse), `/terra.html` (land on a living
world), or the root studio to author your own.

## License — and what it means for your game

[AGPL-3.0](LICENSE). Free forever, including commercially. In plain terms:

- **You can sell a game built on this engine and keep every dollar.** No fees,
  no royalties, no permission needed, ever.
- **Your game's *code* must be open.** If your code links the engine, you must
  offer its source (under AGPL) to your players — including players of a
  server-hosted game.
- **Your *assets* and *worlds* stay yours.** Art, music, story, and the world
  JSON you author are your own works — keep them closed, sell them, whatever
  you like. (Open code + closed assets is the classic id Software model: the
  Doom engine was GPL'd and the game still sold.)
- Want to keep your game code closed too? Ask about a commercial license —
  open an issue.
