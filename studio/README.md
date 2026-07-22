# notherworld studio

The web authoring studio + demos for the notherworld engine. Vite + React 19,
running the engine as WASM (`src/owos/`, generated — see below).

```bash
# from the repo root: build the engine WASM, then run the studio
wasm-pack build engine/owos-wasm --target web --out-dir ../../studio/src/owos --dev
npm --prefix studio install
npm --prefix studio run dev        # http://localhost:5173
```

Pages: `/` author + live preview · `/nother.html` addressable multiverse ·
`/terra.html` land on a living world · `/city.html` dive a living city ·
`/lab.html` partition styles · `/drop.html` proximity-reveal drop.

Optional LLM narrator: `cp .env.example .env`, add an `OPENROUTER_API_KEY`,
restart. The key stays server-side (Vite proxy) — never bundled to the browser.
