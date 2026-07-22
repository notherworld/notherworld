# Embedding otherworldOS — the portable brain, proven

**Claim:** the same authored, deterministic living world runs *identically* underneath any
renderer — Unreal, Godot, Unity, web — because the engine is a plugin (a flat C ABI over an
opaque world handle), not a program. The host owns the frame loop, input, and graphics; the
plugin owns the world's mind.

**Status: PROVEN (2026-07-22).** The engine's simulation was driven from **three independent
language runtimes**, all producing byte-identical results from the *same compiled `owos_ffi.dll`*:

| host runtime | integration mechanism | after 8 steps | after war +14 | leaf citizen discontent |
|---|---|---:|---:|---:|
| Rust (`cargo run --bin ffidemo`) | links the crate | `0.09` | `0.38` | `0.65` |
| **C# / .NET** (`embed/csharp/OwosHost.cs`) | `[DllImport]` P/Invoke — **Unity's exact path** | `0.09` | `0.38` | `0.65` |
| **native C** (`embed/c/host.c`) | `#include "owos.h"` + link the DLL — **Unreal/Godot's path** | `0.09` | `0.38` | `0.65` |

Same seed → same numbers across Rust, .NET, and native C. That *is* "same true game underneath,
any engine on top." Unreal (C++) and Godot GDExtension (C++) `#include owos.h` directly — strictly
easier than the managed C# marshalling that already works.

---

## The integration surface

The entire contract is [`engine/owos-ffi/include/owos.h`](../engine/owos-ffi/include/owos.h):
`create → (build/populate) → loop { push player actions; step; read state to render } → free`.

```c
OwosWorld* w = owos_new_demo(1);          // or owos_new(seed) + build the tree yourself
for (;;) {                                 // YOUR game loop (can step slower than render fps)
    owos_act_set(w, nationId, "at_war", 1.0f);   // player input, at any scale
    owos_step(w);                          // advance the sim one tick
    float tension = owos_get(w, owos_root(w), "tension");   // read state back to render
    uint32_t n = owos_child_count(w, cityId);               // walk the tree you draw
    owos_reveal(w, id); owos_fold(w, id);  // sim-LOD: materialize / collapse detail
}
owos_free(w);
```

Strings returned by the library (`owos_name`, `owos_log_message`) are freed with `owos_free_string`.
Events (`owos_log_len`/`owos_log_message`) are the channel a host drives VFX/quests/subtitles off.

## Reproduce it

```bash
# 1. build the plugin  ->  target/release/owos_ffi.dll  (+ owos_ffi.dll.lib import lib)
cargo build --release -p owos-ffi

# 2a. Rust reference host
cargo run --release --bin ffidemo

# 2b. native C host (any C compiler). Shown with tcc; cl/gcc/clang identical:
tcc embed/c/host.c -I engine/owos-ffi/include target/release/owos_ffi.dll -o host.exe
#   MSVC:  cl embed\c\host.c /I crates\owos-ffi\include /link target\release\owos_ffi.dll.lib
#   gcc :  gcc embed/c/host.c -I engine/owos-ffi/include -L target/release -lowos_ffi -o host
./host.exe            # with owos_ffi.dll on the search path

# 2c. C# / .NET host (Unity's mechanism) — no C compiler needed
#   In Unity: drop owos_ffi.dll into Assets/Plugins/, use the [DllImport] class verbatim.
#   Standalone (Windows PowerShell): Add-Type -Path embed/csharp/OwosHost.cs ; [OwosHost]::Run()
```

## Per-engine wiring

- **Unreal (C++):** add `owos.h` + `owos_ffi.dll` to a module; call the functions from your
  `Tick`. Map entity ids → Actors; read stats each frame to drive materials/animation.
- **Godot (GDExtension, C++):** same header; expose the calls as a `Node` and step in `_process`.
- **Unity (C#):** `owos_ffi.dll` in `Assets/Plugins/`, the `[DllImport]` class from
  `embed/csharp/OwosHost.cs`, step in `Update`.

Each engine builds its **own renderer + input** on top (the "eyes and hands") — but the world,
the systems, the history, and the determinism are identical because they're all the same DLL.

---

## Honest boundary (what is and isn't proven here)

- **Proven:** a native/foreign host creates, steps, sends player actions into, reads state out of,
  and sim-LOD folds/reveals a living world through the compiled cdylib — deterministically, matching
  the engine byte-for-byte, from C, C#, and Rust.
- **Not yet wired:** the FFI can build worlds via `owos_new` + `owos_spawn`/`owos_set`, or via the
  built-in `owos_new_demo` scenario — but there is **no `owos_load_json` yet**. To embed an *authored*
  world (e.g. `worlds/craft.json`, or a nother/terra world), add one exported function that calls
  `owos_author::build(json)` and returns the handle. That's a ~10-line addition, not a redesign — but
  until it lands, "drop any authored JSON into Unreal" is one small function away, not done today.
- **Per-engine renderer/input** is always the host's job by design. This proves the *brain* ports;
  the *eyes* are still built once per game.

*Artifacts: `embed/c/host.c`, `embed/csharp/OwosHost.cs`, `engine/owos-ffi/`, `cli/src/ffidemo.rs`.*
